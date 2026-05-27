"""Lesson 04 — high-level pickup/place/move_to tools without verification (medium)."""
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
         "ee": None, "gripper": None, "holding": None, "tray_contents": None}
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

def t_set_grip(value): requests.post(f"{ARM}/api/gripper", json={"value": int(value)}, timeout=10)

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
    post_move_to(float(x), float(y), float(z))
    wait_idle()

def t_pickup():
    x, y, _ = WORLD["ee"]
    t_set_grip(GRIP_OPEN); wait_idle()
    post_move_to(x, y, 0.0); wait_idle()
    t_set_grip(GRIP_CLOSE); wait_idle()
    post_move_to(x, y, HOVER_DZ); wait_idle()

def t_place(index=0):
    t = WORLD["trays"][int(index)]
    x, y, z = t["pos"]
    post_move_to(x, y, z + HOVER_DZ); wait_idle()
    t_set_grip(GRIP_OPEN); wait_idle()

def spec(name, desc, props, required):
    return {"toolSpec": {"name": name, "description": desc, "inputSchema": {"json": {
        "type": "object", "properties": props, "required": required}}}}

NUM = {"type": "number"}
TOOLS = [
    spec("move_to", f"Move end-effector to (x, y, z). To target a cube, pass its pos with z + {HOVER_DZ} to hover above it.",
         {"x": NUM, "y": NUM, "z": NUM}, ["x", "y", "z"]),
    spec("pickup", "Open grip, descend to floor, close grip, lift. Call after move_to above a cube.",
         {}, []),
    spec("place", "Move above WORLD.trays[index] and release. Call while holding a cube. index defaults to 0.",
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
        DISPATCH[name](**args)
        ACTIONS.append({"tool": name, "args": args})
    print(f"STEP LIMIT REACHED ({MAX_STEPS})")

if __name__ == "__main__":
    run()
