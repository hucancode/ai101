"""Lesson 03 — bare tool loop (medium). Model drives move_to + pickup + place primitives."""
import os, json, time, requests, boto3
from collections import deque

ARM        = os.environ.get("ARM_URL", "http://localhost:3000")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL      = os.environ.get("MODEL", "us.amazon.nova-lite-v1:0")
Q          = os.environ.get("Q", "Pick up the red cube and put it on the tray.")
ACTION_LOG = int(os.environ.get("ACTION_LOG", "12"))
MOVE_MS    = int(os.environ.get("MOVE_MS", "3000"))

client = boto3.client("bedrock-runtime", region_name=AWS_REGION)

WORLD = {"workspace": None, "gripper_config": None, "cubes": None, "trays": None,
         "ee": None, "gripper": None, "holding": None}
ACTIONS = deque(maxlen=ACTION_LOG)
DONE = False

def refresh_world():
    ws = requests.get(f"{ARM}/api/workspace", timeout=10).json()
    WORLD["workspace"], WORLD["gripper_config"] = ws.get("workspace"), ws.get("gripper")
    cubes = requests.get(f"{ARM}/api/cubes", timeout=10).json()["cubes"]
    WORLD["cubes"] = [{"index": i, "name": c.get("name"), "rgba": c.get("rgba"),
                       "pos": c.get("pos"), "size": c.get("size")} for i, c in enumerate(cubes)]
    trays = requests.get(f"{ARM}/api/tray", timeout=10).json().get("trays", [])
    WORLD["trays"] = [{"name": t["name"], "pos": t["pos"], "size": t["size"],
                       "cubes": [c["name"] for c in t.get("cubes", [])]} for t in trays]
    g = requests.get(f"{ARM}/api/gripping", timeout=10).json()
    WORLD["ee"], WORLD["gripper"] = g.get("ee"), g.get("gripper")
    WORLD["holding"] = (g.get("gripping") or {}).get("name")

def t_set_grip(value): requests.post(f"{ARM}/api/gripper", json={"value": int(value)}, timeout=10)
def post_move_to(x, y, z): requests.post(f"{ARM}/api/move_to",
    json={"x": float(x), "y": float(y), "z": float(z), "duration": MOVE_MS}, timeout=10)

def wait_idle(interval=0.3):
    streak = 0
    while True:
        streak = streak + 1 if requests.get(f"{ARM}/api/state", timeout=5).json()["state"].get("idle") else 0
        if streak >= 2: return
        time.sleep(interval)

GRIP_OPEN, GRIP_CLOSE = 255, 0
HOVER_DZ = 0.12

def t_move_to(x, y, z):
    post_move_to(x, y, z); wait_idle()

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

def t_done(reason=""):
    global DONE; DONE = True; print(f"done: {reason}")

def spec(name, desc, props, required):
    return {"toolSpec": {"name": name, "description": desc, "inputSchema": {"json": {
        "type": "object", "properties": props, "required": required}}}}

NUM = {"type": "number"}
TOOLS = [
    spec("done",    "Signal task complete.", {"reason": {"type": "string"}}, ["reason"]),
    spec("move_to", f"Move end-effector to (x, y, z). Hover above a cube by passing its pos with z + {HOVER_DZ}.",
         {"x": NUM, "y": NUM, "z": NUM}, ["x", "y", "z"]),
    spec("pickup",  "Open grip, descend to floor, close grip, lift. Call after move_to above a cube.",
         {}, []),
    spec("place",   "Move above WORLD.trays[index] and release. Call while holding a cube. index defaults to 0.",
         {"index": {"type": "integer"}}, []),
]
DISPATCH = {"done": t_done, "move_to": t_move_to, "pickup": t_pickup, "place": t_place}
SYS = ("Drive a robot arm. Workflow: move_to (above a cube) → pickup → place → done. "
       "Pick exactly one tool per turn.")

def build_user():
    return f"task: {Q}\n{json.dumps({'WORLD': WORLD, 'RECENT_ACTIONS': list(ACTIONS)})}"

def run():
    print(f"Q: {Q}")
    while not DONE:
        refresh_world()
        r = client.converse(modelId=MODEL,
            messages=[{"role": "user", "content": [{"text": build_user()}]}],
            system=[{"text": SYS}],
            toolConfig={"tools": TOOLS, "toolChoice": {"any": {}}},
            inferenceConfig={"maxTokens": 1024})
        tu = next((b["toolUse"] for b in r["output"]["message"]["content"] if "toolUse" in b), None)
        if not tu: print("no tool call"); break
        name, args = tu["name"], tu["input"]
        print(f"[{name}] {args}")
        DISPATCH[name](**args)
        ACTIONS.append({"tool": name, "args": args})
    print("FINISHED ✅")

if __name__ == "__main__":
    run()
