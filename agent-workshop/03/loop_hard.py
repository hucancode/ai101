"""Lesson 03 — bare tool loop (hard). Model drives open/close_grip + dip + move_to_cube/tray."""
import os, json, time, requests, boto3
from collections import deque

ARM        = os.environ.get("ARM_URL", "http://localhost:3000")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL      = os.environ.get("MODEL", "us.amazon.nova-lite-v1:0")
Q          = os.environ.get("Q", "Pick up the red cube and put it on the tray.")

client = boto3.client("bedrock-runtime", region_name=AWS_REGION)
WORLD, ACTIONS, DONE = {}, deque(maxlen=12), False

MOVE_MS = 3000
GRIP_OPEN, GRIP_CLOSE = 255, 0
HOVER_DZ = 0.12

def refresh_world():
    WORLD.update(requests.get(f"{ARM}/api/world").json())

def wait_idle(timeout=None):
    deadline = time.time() + (timeout if timeout is not None else MOVE_MS / 1000 + 3.0)
    streak = 0
    while streak < 2:
        if time.time() > deadline: return
        streak = streak + 1 if requests.get(f"{ARM}/api/world?fields=idle", timeout=5).json().get("idle") else 0
        time.sleep(0.3)

def t_set_grip(value): requests.post(f"{ARM}/api/gripper", json={"value": int(value)})

def t_move_to(x, y, z):
    requests.post(f"{ARM}/api/move_to",
        json={"x": float(x), "y": float(y), "z": float(z), "duration": MOVE_MS})

def t_move_to_cube(i):
    c = WORLD["cubes"][int(i)]
    x, y, z = c["pos"]
    t_move_to(x, y, z + HOVER_DZ)

def t_move_to_tray(index=0):
    t = WORLD["trays"][int(index)]
    x, y, z = t["pos"]
    t_move_to(x, y, z + HOVER_DZ)

def t_open_grip():  t_set_grip(GRIP_OPEN)
def t_close_grip(): t_set_grip(GRIP_CLOSE)

def t_dip():
    x, y, z = WORLD["ee"]
    t_move_to(x, y, z - HOVER_DZ)

def t_done(reason=""):
    global DONE; DONE = True; print(f"done: {reason}")

def spec(name, desc, props={}, required=[]):
    return {"toolSpec": {"name": name, "description": desc, "inputSchema": {"json": {
        "type": "object", "properties": props, "required": required}}}}

TOOLS = [
    spec("done",         "Signal task complete.", {"reason": {"type": "string"}}),
    spec("move_to_cube", f"Hover above WORLD.cubes[i] (z + {HOVER_DZ}).",
         {"i": {"type": "integer"}}, ["i"]),
    spec("move_to_tray", f"Hover above WORLD.trays[index] (z + {HOVER_DZ}). index defaults to 0.",
         {"index": {"type": "integer"}}),
    spec("open_grip",  "Open gripper."),
    spec("close_grip", "Close gripper."),
    spec("dip", f"Descend by {HOVER_DZ}m from current ee position."),
]
DISPATCH = {"done": t_done, "move_to_cube": t_move_to_cube, "move_to_tray": t_move_to_tray,
            "open_grip": t_open_grip, "close_grip": t_close_grip, "dip": t_dip}
SYS = ("Drive a robot arm. Pickup: open_grip → move_to_cube → dip → close_grip → move_to_tray → "
       "open_grip → done. Pick exactly one tool per turn.")

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
        if name != "done": wait_idle()
        ACTIONS.append({"tool": name, "args": args})
    print("FINISHED ✅")

if __name__ == "__main__":
    run()
