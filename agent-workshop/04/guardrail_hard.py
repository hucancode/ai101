"""Lesson 04 — lesson 03 + MAX_STEPS + tool-call validation feedback loop (hard)."""
import os, json, time, logging, requests, boto3
from collections import deque

ARM        = os.environ.get("ARM_URL", "http://localhost:3000")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL      = os.environ.get("MODEL", "us.amazon.nova-lite-v1:0")
Q          = os.environ.get("Q", "Pick up the red cube.")
LOGLEVEL   = os.environ.get("LOGLEVEL", "INFO").upper()
MAX_STEPS  = int(os.environ.get("MAX_STEPS", "30"))
ACTION_LOG = int(os.environ.get("ACTION_LOG", "12"))
MOVE_DURATION = 3000  # ms, server-side movement time

log = logging.getLogger("lesson04_hard")
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
def t_move_to(x, y, z): requests.post(f"{ARM}/api/move_to",
    json={"x": float(x), "y": float(y), "z": float(z), "duration": MOVE_DURATION}, timeout=10)
def t_done(reason=""):
    global DONE; DONE = True; log.info(f"done: {reason}")

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
    spec("done",     "Signal task complete.", {"reason": {"type": "string"}}, ["reason"]),
    spec("set_grip", "Set gripper aperture. 0=closed, 255=open.",
         {"value": {"type": "integer"}}, ["value"]),
    spec("move_to",  "Move end-effector to world position (meters).",
         {"x": NUM, "y": NUM, "z": NUM}, ["x", "y", "z"]),
]
DISPATCH = {"done": t_done, "set_grip": t_set_grip, "move_to": t_move_to}
SPECS = {t["toolSpec"]["name"]: t["toolSpec"]["inputSchema"]["json"] for t in TOOLS}
SYS = ("Drive a robot arm. RECENT_ACTIONS includes errors if a call was rejected. "
       "Call done when complete. Pick exactly one tool per turn.")

def build_user():
    return f"task: {Q}\n{json.dumps({'WORLD': WORLD, 'RECENT_ACTIONS': list(ACTIONS)})}"

def validate(name, args):
    if name not in SPECS: raise ValueError(f"unknown tool {name!r}")
    s = SPECS[name]
    missing = [k for k in s.get("required", []) if k not in args]
    if missing: raise ValueError(f"{name} missing {missing}")
    extra = [k for k in args if k not in s.get("properties", {})]
    if extra: raise ValueError(f"{name} unknown args {extra}")

def run():
    log.warning(f"Q: {Q} (max {MAX_STEPS} steps)")
    for step in range(1, MAX_STEPS + 1):
        if DONE: break
        refresh_world()
        r = client.converse(modelId=MODEL,
            messages=[{"role": "user", "content": [{"text": build_user()}]}],
            system=[{"text": SYS}],
            toolConfig={"tools": TOOLS, "toolChoice": {"any": {}}},
            inferenceConfig={"maxTokens": 1024})
        tu = next((b["toolUse"] for b in r["output"]["message"]["content"] if "toolUse" in b), None)
        if not tu:
            log.error("no tool call"); ACTIONS.append({"error": "no tool call"}); continue
        name, args = tu["name"], tu["input"]
        try: validate(name, args)
        except ValueError as e:
            log.error(f"[bad-call] {e}"); ACTIONS.append({"tool": name, "args": args, "error": str(e)}); continue
        log.warning(f"[{name}] {args}")
        try:
            DISPATCH[name](**args)
            if name != "done": wait_idle()
            ACTIONS.append({"tool": name, "args": args})
        except Exception as e:
            log.error(f"[exec-fail] {name}: {e}")
            ACTIONS.append({"tool": name, "args": args, "error": str(e)})
    log.info("FINISHED ✅") if DONE else log.error(f"STEP LIMIT REACHED ({MAX_STEPS})")

if __name__ == "__main__":
    run()
