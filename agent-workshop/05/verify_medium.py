"""Lesson 05 — lesson 04 + rule-based verification (medium)."""
import os, json, time, requests, boto3
from collections import deque

ARM        = os.environ.get("ARM_URL", "http://localhost:3000")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
# MODEL      = os.environ.get("MODEL", "us.amazon.nova-pro-v1:0")
MODEL      = os.environ.get("MODEL", "us.anthropic.claude-sonnet-4-6")
Q          = os.environ.get("Q", "Pick up the red cube and put it on the tray.")
MAX_STEPS  = int(os.environ.get("MAX_STEPS", "50"))
ACTION_LOG = int(os.environ.get("ACTION_LOG", "12"))
MOVE_DURATION = 3000  # ms, server-side movement time

client = boto3.client("bedrock-runtime", region_name=AWS_REGION)

WORLD = {"workspace": None, "cubes": None, "trays": None,
         "ee": None, "gripper": None, "holding": None, "tray_contents": None, "hovering": None}
ACTIONS = deque(maxlen=ACTION_LOG)

def refresh_world():
    WORLD["workspace"] = requests.get(f"{ARM}/api/workspace", timeout=10).json()
    cubes = requests.get(f"{ARM}/api/cubes", timeout=10).json()["cubes"]
    WORLD["cubes"] = [{"index": i, "name": c.get("name"), "rgba": c.get("rgba"),
                       "pos": c.get("pos")} for i, c in enumerate(cubes)]
    trays = requests.get(f"{ARM}/api/tray", timeout=10).json().get("trays", [])
    WORLD["trays"] = [{"name": t["name"], "pos": t["pos"], "size": t["size"]} for t in trays]
    WORLD["tray_contents"] = {t["name"]: [c["name"] for c in t["cubes"]] for t in trays}
    g = requests.get(f"{ARM}/api/gripping", timeout=10).json()
    WORLD["ee"], WORLD["gripper"] = g.get("ee"), g.get("gripper")
    WORLD["holding"] = (g.get("gripping") or {}).get("name")
    WORLD["hovering"] = derive_hovering()

XY_TOL = 0.025  # cube half-width ~0.02; within this xy radius counts as "above the cube"
def derive_hovering():
    ee, cubes = WORLD.get("ee"), WORLD.get("cubes") or []
    if not ee or not cubes: return None
    ex, ey, ez = ee[0], ee[1], ee[2]
    best = None
    for c in cubes:
        cx, cy, cz = c["pos"][0], c["pos"][1], c["pos"][2]
        dxy = ((ex - cx) ** 2 + (ey - cy) ** 2) ** 0.5
        if dxy <= XY_TOL and (best is None or dxy < best[0]):
            best = (dxy, c["name"], ez - cz)
    return {"cube": best[1], "dz": round(best[2], 4)} if best else None

def t_set_grip(value): requests.post(f"{ARM}/api/gripper", json={"value": int(value)}, timeout=10)

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

def post_move_to(x, y, z):
    requests.post(f"{ARM}/api/move_to",
        json={"x": x, "y": y, "z": z, "duration": MOVE_DURATION}, timeout=10)

def wait_idle(interval=0.3):
    streak = 0
    while True:
        streak = streak + 1 if requests.get(f"{ARM}/api/state", timeout=5).json()["state"].get("idle") else 0
        if streak >= 2: return
        time.sleep(interval)

GRIP_OPEN, GRIP_CLOSE = 255, 0
HOVER_DZ = 0.12  # hover height above target

def t_move_to(x, y, z):
    x, y, z = clamp_to_workspace(float(x), float(y), float(z))
    post_move_to(x, y, z)
    wait_idle()

def t_pickup():
    h = WORLD.get("hovering")
    if not h:
        return "not hovering over any cube; call move_to above a cube first"
    cube = next((c for c in (WORLD["cubes"] or []) if c["name"] == h["cube"]), None)
    if not cube:
        return f"cube {h['cube']} no longer in WORLD.cubes"
    t_set_grip(GRIP_OPEN); wait_idle()
    x, y, z = cube["pos"]
    post_move_to(x, y, z); wait_idle()
    t_set_grip(GRIP_CLOSE); wait_idle()
    post_move_to(x, y, z + HOVER_DZ); wait_idle()

def t_place(index=0):
    if not WORLD.get("holding"):
        return "not holding any cube; pickup before place"
    trays = WORLD.get("trays") or []
    if not trays:
        return "no trays available"
    t = trays[int(index)]
    x, y, z = t["pos"]
    tx, ty, tz = clamp_to_workspace(x, y, z + HOVER_DZ)
    post_move_to(tx, ty, tz); wait_idle()
    t_set_grip(GRIP_OPEN); wait_idle()

def spec(name, desc, props, required):
    return {"toolSpec": {"name": name, "description": desc, "inputSchema": {"json": {
        "type": "object", "properties": props, "required": required}}}}

NUM = {"type": "number"}
TOOLS = [
    spec("move_to", f"Move end-effector to (x, y, z). To target a cube, pass its pos with z + {HOVER_DZ} to hover above it.",
         {"x": NUM, "y": NUM, "z": NUM}, ["x", "y", "z"]),
    spec("pickup", "Open grip, dip onto the cube in WORLD.hovering, close grip, lift. Requires WORLD.hovering set.",
         {}, []),
    spec("place", "Move above WORLD.trays[index] and release. Requires WORLD.holding. index defaults to 0.",
         {"index": {"type": "integer"}}, []),
]
DISPATCH = {"move_to": t_move_to, "pickup": t_pickup, "place": t_place}

def task_complete():
    return bool(WORLD["tray_contents"] and any(WORLD["tray_contents"].values())) and not WORLD["holding"]

SYS = ("Drive a robot arm. Workflow: move_to (above a cube using its pos + hover) → pickup → place. "
       "Done when a cube is on a tray and gripper is empty. One tool per turn.")

def build_user():
    return f"task: {Q}\n{json.dumps({'WORLD': WORLD, 'RECENT_ACTIONS': list(ACTIONS)})}"

def run():
    print(f"Q: {Q} (max {MAX_STEPS} steps)")
    for step in range(1, MAX_STEPS + 1):
        refresh_world()
        if task_complete(): print("FINISHED ✅"); return
        r = client.converse(modelId=MODEL,
            messages=[{"role": "user", "content": [{"text": build_user()}]}],
            system=[{"text": SYS}],
            toolConfig={"tools": TOOLS, "toolChoice": {"any": {}}},
            inferenceConfig={"maxTokens": 1024})
        tu = next((b["toolUse"] for b in r["output"]["message"]["content"] if "toolUse" in b), None)
        if not tu: print("no tool call"); continue
        name, args = tu["name"], tu["input"]
        print(f"[{name}] {args}")
        if ACTIONS and ACTIONS[-1].get("tool") == name and ACTIONS[-1].get("args") == args:
            print("  (duplicate of last action — not re-executed)")
            ACTIONS.append({"tool": name, "args": args, "note": "ignored: duplicate of prior call, try a different action"})
            continue
        err = DISPATCH[name](**args)
        entry = {"tool": name, "args": args}
        if err:
            print(f"  (error: {err})")
            entry["error"] = err
        ACTIONS.append(entry)
    print(f"STEP LIMIT REACHED ({MAX_STEPS})")

if __name__ == "__main__":
    run()
