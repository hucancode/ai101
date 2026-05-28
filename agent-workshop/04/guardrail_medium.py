"""Lesson 04 — loop + MAX_STEPS + tool-call validation feedback (medium)."""
import os, json, time, requests, boto3
from collections import deque

ARM        = os.environ.get("ARM_URL", "http://localhost:3000")
MODEL      = os.environ.get("MODEL", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
Q          = os.environ.get("Q", "Pick up the red cube and put it on the tray.")
MAX_STEPS  = int(os.environ.get("MAX_STEPS", "50"))

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
SPECS = {t["toolSpec"]["name"]: t["toolSpec"]["inputSchema"]["json"] for t in TOOLS}
SYS = ("Drive a robot arm. Workflow: move_to (above a cube) → pickup → place → done. "
       "RECENT_ACTIONS includes errors if a call was rejected. "
       "Pick exactly one tool per turn.")

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
        if DONE: break
        refresh_world()
        r = client.converse(modelId=MODEL,
            messages=[{"role": "user", "content": [{"text": build_user()}]}],
            system=[{"text": SYS}],
            toolConfig={"tools": TOOLS, "toolChoice": {"any": {}}})
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
            ACTIONS.append({"tool": name, "args": args})
        except Exception as e:
            print(f"[exec-fail] {name}: {e}")
            ACTIONS.append({"tool": name, "args": args, "error": str(e)})
    print("FINISHED ✅" if DONE else f"STEP LIMIT REACHED ({MAX_STEPS})")

if __name__ == "__main__":
    run()
