"""Lesson 05 — lesson 04 + rule-based verification (hard)."""
import os, json, time, logging, requests, boto3
from collections import deque

ARM        = os.environ.get("ARM_URL", "http://localhost:3000")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL      = os.environ.get("MODEL", "us.amazon.nova-lite-v1:0")
Q          = os.environ.get("Q", "Pick up the red cube and put it on the tray.")
LOGLEVEL   = os.environ.get("LOGLEVEL", "INFO").upper()
MAX_STEPS  = int(os.environ.get("MAX_STEPS", "50"))
ACTION_LOG = int(os.environ.get("ACTION_LOG", "12"))
MOVE_DURATION = 3000  # ms, server-side movement time

log = logging.getLogger("lesson05_hard")
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
        log.warning(f"  (clamped {(x, y, z)} -> {(cx, cy, cz)})")
    return cx, cy, cz

def t_move_to(x, y, z):
    x, y, z = clamp_to_workspace(float(x), float(y), float(z))
    requests.post(f"{ARM}/api/move_to",
        json={"x": x, "y": y, "z": z, "duration": MOVE_DURATION}, timeout=10)

HOVER_DZ = 0.12  # hover height above target

def t_move_to_cube(i):
    c = WORLD["cubes"][int(i)]
    x, y, z = c["pos"]
    t_move_to(x, y, z + HOVER_DZ)

def t_move_to_tray(index=0):
    t = WORLD["trays"][int(index)]
    x, y, z = t["pos"]
    t_move_to(x, y, z + HOVER_DZ)

GRIP_OPEN, GRIP_CLOSE, GRIP_MIN_FOR_DIP = 255, 0, 130

def t_open_grip():  t_set_grip(GRIP_OPEN)
def t_close_grip(): t_set_grip(GRIP_CLOSE)

def t_dip():
    g = WORLD.get("gripper") or 0
    if g < GRIP_MIN_FOR_DIP:
        return f"gripper aperture {g} < {GRIP_MIN_FOR_DIP}; call open_grip before dip"
    h = WORLD.get("hovering")
    if not h:
        return "not hovering over any cube; call move_to_cube first"
    cube = next((c for c in (WORLD["cubes"] or []) if c["name"] == h["cube"]), None)
    if not cube:
        return f"cube {h['cube']} no longer in WORLD.cubes"
    x, y, z = cube["pos"]
    t_move_to(x, y, z)

def wait_idle(interval=0.3):
    streak = 0
    while True:
        streak = streak + 1 if requests.get(f"{ARM}/api/state", timeout=5).json()["state"].get("idle") else 0
        if streak >= 2: return
        time.sleep(interval)

def spec(name, desc, props, required):
    return {"toolSpec": {"name": name, "description": desc, "inputSchema": {"json": {
        "type": "object", "properties": props, "required": required}}}}

NUM = {"type": "number"}
TOOLS = [
    spec("set_grip", "Set gripper aperture (persists until changed). 0=closed, 255=open. "
         "Repeating the same value is a no-op; read WORLD.gripper to see the current value.",
         {"value": {"type": "integer"}}, ["value"]),
    spec("move_to",  "Move end-effector to world position (meters). Read WORLD.ee for current pose.",
         {"x": NUM, "y": NUM, "z": NUM}, ["x", "y", "z"]),
    spec("move_to_cube", "Alias of move_to that hovers above WORLD.cubes[i] (xy from cube, z = cube.z + "
         f"{HOVER_DZ}). Use before descending to grip.",
         {"i": {"type": "integer"}}, ["i"]),
    spec("move_to_tray", "Alias of move_to that hovers above WORLD.trays[index] (xy from tray, z = tray.z + "
         f"{HOVER_DZ}). index defaults to 0. Use before releasing.",
         {"index": {"type": "integer"}}, []),
    spec("open_grip",  f"Alias of set_grip({GRIP_OPEN}). Open gripper fully.", {}, []),
    spec("close_grip", f"Alias of set_grip({GRIP_CLOSE}). Close gripper fully.", {}, []),
    spec("dip", "Descend onto the cube currently under the end-effector (uses WORLD.hovering). "
         f"Errors if gripper aperture < {GRIP_MIN_FOR_DIP} or nothing is being hovered.", {}, []),
]
DISPATCH = {"set_grip": t_set_grip, "move_to": t_move_to,
            "move_to_cube": t_move_to_cube, "move_to_tray": t_move_to_tray,
            "open_grip": t_open_grip, "close_grip": t_close_grip, "dip": t_dip}

def task_complete():
    return bool(WORLD["tray_contents"] and any(WORLD["tray_contents"].values())) and not WORLD["holding"]

SYS = ("Drive a robot arm. Pickup sequence: open_grip → move_to_cube(i) → dip → close_grip → "
       "verify WORLD.holding → move_to_tray → open_grip. Verifier ends only when a cube is on a "
       "tray AND gripper is empty. One tool per turn. If a tool returns an error in RECENT_ACTIONS, "
       "fix the precondition before retrying.")

def build_user():
    return f"task: {Q}\n{json.dumps({'WORLD': WORLD, 'RECENT_ACTIONS': list(ACTIONS)})}"

def run():
    log.warning(f"Q: {Q} (max {MAX_STEPS} steps)")
    for step in range(1, MAX_STEPS + 1):
        refresh_world()
        if task_complete(): print("FINISHED ✅"); return
        r = client.converse(modelId=MODEL,
            messages=[{"role": "user", "content": [{"text": build_user()}]}],
            system=[{"text": SYS}],
            toolConfig={"tools": TOOLS, "toolChoice": {"any": {}}},
            inferenceConfig={"maxTokens": 1024})
        tu = next((b["toolUse"] for b in r["output"]["message"]["content"] if "toolUse" in b), None)
        if not tu: log.error("no tool call"); continue
        name, args = tu["name"], tu["input"]
        log.warning(f"[{name}] {args}")
        if ACTIONS and ACTIONS[-1].get("tool") == name and ACTIONS[-1].get("args") == args:
            log.warning("  (duplicate of last action — not re-executed)")
            ACTIONS.append({"tool": name, "args": args, "note": "ignored: duplicate of prior call, try a different action"})
            continue
        err = DISPATCH[name](**args)
        entry = {"tool": name, "args": args}
        if err:
            log.warning(f"  (error: {err})")
            entry["error"] = err
        else:
            wait_idle()
        ACTIONS.append(entry)
    log.error(f"STEP LIMIT REACHED ({MAX_STEPS})")

if __name__ == "__main__":
    run()
