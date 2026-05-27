"""Lesson 05 — loop + guardrails + rule-based verifier (hard)."""
import os, json, time, requests, boto3
from collections import deque

ARM        = os.environ.get("ARM_URL", "http://localhost:3000")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
# MODEL      = os.environ.get("MODEL", "us.amazon.nova-pro-v1:0")
MODEL      = os.environ.get("MODEL", "us.anthropic.claude-sonnet-4-6")
Q          = os.environ.get("Q", "Pick up the red cube and put it on the tray.")
MAX_STEPS  = int(os.environ.get("MAX_STEPS", "30"))

client = boto3.client("bedrock-runtime", region_name=AWS_REGION)
WORLD, ACTIONS = {}, deque(maxlen=12)

MOVE_MS = 3000
GRIP_OPEN, GRIP_CLOSE, GRIP_MIN_FOR_DIP = 255, 0, 130
HOVER_DZ = 0.12
XY_TOL = 0.025  # cube half-width ~0.02; within this xy radius counts as "above the cube"
CLOSE_GRIP_MAX_DZ = 0.05  # ee must be within this height above a cube to actually grab it

def refresh_world():
    WORLD.update(requests.get(f"{ARM}/api/world").json())
    WORLD["hovering"] = derive_hovering()

def derive_hovering():
    ee, cubes = WORLD.get("ee"), WORLD.get("cubes") or []
    if not ee or not cubes: return None
    ex, ey, ez = ee
    best = None
    for c in cubes:
        cx, cy, cz = c["pos"]
        dxy = ((ex - cx) ** 2 + (ey - cy) ** 2) ** 0.5
        if dxy <= XY_TOL and (best is None or dxy < best[0]):
            best = (dxy, c["name"], ez - cz)
    return {"cube": best[1], "dz": round(best[2], 4)} if best else None

def clamp_to_workspace(x, y, z):
    items = [c["pos"] for c in (WORLD["cubes"] or [])] + [t["pos"] for t in (WORLD["trays"] or [])]
    if not items: return x, y, z
    xs, ys, zs = [p[0] for p in items], [p[1] for p in items], [p[2] for p in items]
    cx = max(min(xs), min(max(xs), x))
    cy = max(min(ys), min(max(ys), y))
    z_floor = max(zs) + 0.1 if WORLD["holding"] else 0.0
    cz = max(z_floor, min(max(zs) + 0.25, z))
    if (cx, cy, cz) != (x, y, z):
        print(f"  (clamped {(x, y, z)} -> {(cx, cy, cz)})")
    return cx, cy, cz

def wait_idle():
    streak = 0
    while streak < 2:
        streak = streak + 1 if requests.get(f"{ARM}/api/world?fields=idle", timeout=5).json().get("idle") else 0
        time.sleep(0.3)

def t_set_grip(value): requests.post(f"{ARM}/api/gripper", json={"value": int(value)})

def t_move_to(x, y, z):
    x, y, z = clamp_to_workspace(float(x), float(y), float(z))
    requests.post(f"{ARM}/api/move_to",
        json={"x": x, "y": y, "z": z, "duration": MOVE_MS})

def t_move_to_cube(i):
    c = WORLD["cubes"][int(i)]
    x, y, z = c["pos"]
    t_move_to(x, y, z + HOVER_DZ)

def t_move_to_tray(index=0):
    if not WORLD.get("holding"): raise ValueError("not holding any cube; pick one up before moving to the tray")
    t = WORLD["trays"][int(index)]
    x, y, z = t["pos"]
    t_move_to(x, y, z + HOVER_DZ)

def t_open_grip():  t_set_grip(GRIP_OPEN)
def t_close_grip():
    t_set_grip(GRIP_CLOSE)
    h = WORLD.get("hovering")
    if not h: raise ValueError("closed grip but not above any cube; nothing grabbed")
    if h["dz"] > CLOSE_GRIP_MAX_DZ:
        raise ValueError(f"closed grip with ee {h['dz']}m above {h['cube']}; dip first to grab")

def t_dip():
    g = WORLD.get("gripper") or 0
    if g < GRIP_MIN_FOR_DIP: raise ValueError(f"gripper aperture {g} < {GRIP_MIN_FOR_DIP}; call open_grip before dip")
    h = WORLD.get("hovering")
    if not h: raise ValueError("not hovering over any cube; call move_to_cube first")
    cube = next((c for c in (WORLD["cubes"] or []) if c["name"] == h["cube"]), None)
    if not cube: raise ValueError(f"cube {h['cube']} no longer in WORLD.cubes")
    x, y, z = cube["pos"]
    t_move_to(x, y, z)

def spec(name, desc, props={}, required=[]):
    return {"toolSpec": {"name": name, "description": desc, "inputSchema": {"json": {
        "type": "object", "properties": props, "required": required}}}}

TOOLS = [
    spec("move_to_cube", f"Hover above WORLD.cubes[i] (z + {HOVER_DZ}).",
         {"i": {"type": "integer"}}, ["i"]),
    spec("move_to_tray", f"Hover above WORLD.trays[index] (z + {HOVER_DZ}). index defaults to 0.",
         {"index": {"type": "integer"}}),
    spec("open_grip",  "Open gripper."),
    spec("close_grip", "Close gripper."),
    spec("dip", f"Descend onto the cube in WORLD.hovering. Requires gripper >= {GRIP_MIN_FOR_DIP}."),
]
DISPATCH = {"move_to_cube": t_move_to_cube, "move_to_tray": t_move_to_tray,
            "open_grip": t_open_grip, "close_grip": t_close_grip, "dip": t_dip}
SPECS = {t["toolSpec"]["name"]: t["toolSpec"]["inputSchema"]["json"] for t in TOOLS}
SYS = ("Drive a robot arm. Pickup: open_grip → move_to_cube → dip → close_grip → move_to_tray → "
       "open_grip. Verifier ends the task when a cube is on a tray. "
       "RECENT_ACTIONS includes errors if a call was rejected. "
       "Repeating the previous successful call is rejected as duplicate — vary args or pick a different tool. "
       "Pick exactly one tool per turn.")

def task_complete():
    return any(t["cubes"] for t in WORLD.get("trays", [])) and not WORLD.get("holding")

def validate(name, args):
    if name not in SPECS: raise ValueError(f"unknown tool {name!r}")
    s = SPECS[name]
    missing = [k for k in s["required"] if k not in args]
    if missing: raise ValueError(f"{name} missing {missing}")
    extra = [k for k in args if k not in s["properties"]]
    if extra: raise ValueError(f"{name} unknown args {extra}")

def is_dup(name, args):
    for a in reversed(ACTIONS):
        if a.get("error"): continue
        return a.get("tool") == name and a.get("args") == args
    return False

def build_user():
    return f"task: {Q}\n{json.dumps({'WORLD': WORLD, 'RECENT_ACTIONS': list(ACTIONS)})}"

def run():
    print(f"Q: {Q} (max {MAX_STEPS} steps)")
    for _ in range(MAX_STEPS):
        refresh_world()
        if task_complete(): print("FINISHED ✅"); return
        r = client.converse(modelId=MODEL,
            messages=[{"role": "user", "content": [{"text": build_user()}]}],
            system=[{"text": SYS}],
            toolConfig={"tools": TOOLS, "toolChoice": {"any": {}}},
            inferenceConfig={"maxTokens": 1024})
        tu = next((b["toolUse"] for b in r["output"]["message"]["content"] if "toolUse" in b), None)
        if not tu: print("no tool call"); ACTIONS.append({"error": "no tool call"}); continue
        name, args = tu["name"], tu["input"]
        try: validate(name, args)
        except ValueError as e:
            print(f"[bad-call] {e}"); ACTIONS.append({"tool": name, "args": args, "error": str(e)}); continue
        if is_dup(name, args):
            err = f"duplicate of previous {name} call — vary args or change tool"
            print(f"[dup] {err}"); ACTIONS.append({"tool": name, "args": args, "error": err}); continue
        print(f"[{name}] {args}")
        try:
            DISPATCH[name](**args)
            wait_idle()
            ACTIONS.append({"tool": name, "args": args})
        except Exception as e:
            print(f"[exec-fail] {name}: {e}")
            ACTIONS.append({"tool": name, "args": args, "error": str(e)})
    print(f"STEP LIMIT REACHED ({MAX_STEPS})")

if __name__ == "__main__":
    run()
