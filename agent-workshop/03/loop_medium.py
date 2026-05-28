"""Lesson 03 — bare tool loop (medium). Model drives move_to + pickup + place primitives."""
import os, json, time, requests, boto3
from collections import deque

ARM        = os.environ.get("ARM_URL", "http://localhost:3000")
MODEL      = os.environ.get("MODEL", "us.amazon.nova-lite-v1:0")
Q          = os.environ.get("Q", "Pick up the red cube and put it on the tray.")

client = boto3.client("bedrock-runtime")
WORLD, ACTIONS, DONE = {}, deque(maxlen=12), False

MOVE_MS = 3000
GRIP_OPEN, GRIP_CLOSE = 255, 0
HOVER_DZ = 0.12

def refresh_world():
    WORLD.update(requests.get(f"{ARM}/api/world").json())

def wait_idle(timeout=5.0):
    deadline = time.time() + timeout
    streak = 0
    while streak < 2:
        if time.time() > deadline: return
        streak = streak + 1 if requests.get(f"{ARM}/api/world?fields=idle", timeout=5).json().get("idle") else 0
        time.sleep(0.3)

def post_set_grip(value): requests.post(f"{ARM}/api/gripper", json={"aperture": int(value)})

def post_move_to(x, y, z): requests.post(f"{ARM}/api/move_to",
    json={"x": float(x), "y": float(y), "z": float(z), "duration": MOVE_MS})

def t_move_to(x, y, z):
    post_move_to(x, y, z); wait_idle()

def t_pickup():
    x, y, _ = WORLD["ee"]
    post_set_grip(GRIP_OPEN); wait_idle()
    post_move_to(x, y, 0.0); wait_idle()
    post_set_grip(GRIP_CLOSE); wait_idle()
    post_move_to(x, y, HOVER_DZ); wait_idle()

def t_place(index=0):
    t = WORLD["trays"][int(index)]
    x, y, z = t["pos"]
    post_move_to(x, y, z + HOVER_DZ); wait_idle()
    post_set_grip(GRIP_OPEN); wait_idle()

def t_done(reason=""):
    global DONE; DONE = True; print(f"done: {reason}")

def spec(name, desc, props={}, required=[]):
    return {"toolSpec": {"name": name, "description": desc, "inputSchema": {"json": {
        "type": "object", "properties": props, "required": required}}}}

NUM = {"type": "number"}
TOOLS = [
    spec("done",    "Signal task complete.", {"reason": {"type": "string"}}),
    spec("move_to", f"Move end-effector to (x, y, z). Hover above a cube by passing its pos with z + {HOVER_DZ}.",
         {"x": NUM, "y": NUM, "z": NUM}, ["x", "y", "z"]),
    spec("pickup",  "Open grip, descend to floor, close grip, lift. Call after move_to above a cube."),
    spec("place",   "Move above WORLD.trays[index] and release. Call while holding a cube. index defaults to 0.",
         {"index": {"type": "integer"}}),
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
            toolConfig={"tools": TOOLS, "toolChoice": {"any": {}}})
        tu = next((b["toolUse"] for b in r["output"]["message"]["content"] if "toolUse" in b), None)
        if not tu: print("no tool call"); break
        name, args = tu["name"], tu["input"]
        print(f"[{name}] {args}")
        DISPATCH[name](**args)
        ACTIONS.append({"tool": name, "args": args})
    print("FINISHED ✅")

if __name__ == "__main__":
    run()
