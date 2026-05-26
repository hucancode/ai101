"""Lesson 05 — lesson 04 + rule-based verfication."""
import os, json, time, logging, requests
from collections import deque
from anthropic import AnthropicBedrock

ARM        = os.environ.get("ARM_URL", "http://localhost:3000")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL      = os.environ.get("MODEL", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
Q          = os.environ.get("Q", "Pick up the red cube and put it on the tray.")
LOGLEVEL   = os.environ.get("LOGLEVEL", "INFO").upper()
MAX_STEPS  = int(os.environ.get("MAX_STEPS", "50"))
ACTION_LOG = int(os.environ.get("ACTION_LOG", "12"))
MOVE_MS    = int(os.environ.get("MOVE_MS", "3000"))
LOW_LEVEL  = int(os.environ.get("LOW_LEVEL", "0"))  # expose set_grip + move_to primitives

log = logging.getLogger("lesson05")

WORLD = {"workspace": None, "cubes": None, "trays": None,
         "ee": None, "grip": None, "holding": None, "tray_contents": None}
ACTIONS = deque(maxlen=ACTION_LOG)
client = AnthropicBedrock(aws_region=AWS_REGION)

def chat(system, user):
    log.info(f"chat: context size {len(user)}")
    msg = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return msg.content[0].text

def extract_json(text):
    i = text.find("{")
    if i < 0:
        raise ValueError(f"no JSON in: {text!r}")
    obj, _ = json.JSONDecoder().raw_decode(text[i:])
    return obj

def refresh_world():
    WORLD["workspace"] = requests.get(f"{ARM}/api/workspace", timeout=10).json()
    cubes = requests.get(f"{ARM}/api/cubes", timeout=10).json()["cubes"]
    WORLD["cubes"] = [{"index": i, "name": c.get("name"), "rgba": c.get("rgba"),
                       "pos": c.get("pos")} for i, c in enumerate(cubes)]
    tray = requests.get(f"{ARM}/api/tray", timeout=10).json()
    trays = tray.get("trays", [])
    WORLD["trays"] = [{"name": t["name"], "pos": t["pos"], "size": t["size"]} for t in trays]
    WORLD["tray_contents"] = {t["name"]: [c["name"] for c in t["cubes"]] for t in trays}
    g = requests.get(f"{ARM}/api/gripping", timeout=10).json()
    WORLD["ee"] = g.get("ee")
    WORLD["grip"] = g.get("gripper")
    held = g.get("gripping")
    WORLD["holding"] = held.get("name") if held else None

def t_set_grip(value):
    v = int(value)
    requests.post(f"{ARM}/api/gripper", json={"value": v}, timeout=10)

def t_move_to(x, y, z):
    x, y, z = float(x), float(y), float(z)
    requests.post(f"{ARM}/api/move_to",
                  json={"x": x, "y": y, "z": z, "duration": MOVE_MS}, timeout=10)

def t_pickup(x, y, z):
    x, y, z = float(x), float(y), float(z)
    requests.post(f"{ARM}/api/pickup",
                  json={"targets": [{"x": x, "y": y, "z": z}]}, timeout=10)

def wait_idle(timeout=MOVE_MS*0.001, interval=0.2):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = requests.get(f"{ARM}/api/state", timeout=5).json()
        if s.get("pending", 0) == 0 and not (s.get("state") or {}).get("sequenceRunning", False):
            return
        time.sleep(interval)
    log.warning(f"waited {timeout}s")

if LOW_LEVEL:
    TOOLS = {
        "set_grip": (t_set_grip, {"value": "int"},
                     "Set gripper aperture. 0=closed, 255=open."),
        "move_to":  (t_move_to,  {"x": "float", "y": "float", "z": "float"},
                     "Move end-effector to world position (meters)."),
    }
else:
    TOOLS = {
        "pickup": (t_pickup, {"x": "float", "y": "float", "z": "float"},
                   "Pick the cube at (x,y,z) and drop it on the tray."),
    }

def task_complete():
    return (any(WORLD["tray_contents"].values()) if WORLD["tray_contents"] else False) \
        and not WORLD["holding"]

SYS = ("Drive robot arm. Task ends when verifier sees the cube on a tray.\n"
       "Tools:\n"
       + "\n".join(f"- {n}{json.dumps(s)} — {d}" for n, (_, s, d) in TOOLS.items()) +
       '\nReply JSON only: {"tool":"...","args":{...}}.')

def build_user():
    ctx = {"WORLD": WORLD, "RECENT_ACTIONS": list(ACTIONS)}
    return f"task: {Q}\n{json.dumps(ctx)}"

def run():
    log.warning(f"Q: {Q} (max {MAX_STEPS} steps)")
    for step in range(1, MAX_STEPS + 1):
        refresh_world()
        if task_complete():
            print("FINISHED ✅")
            return
        raw = chat(SYS, build_user())
        call = extract_json(raw)
        name, args = call["tool"], call.get("args") or {}
        log.warning(f"[{name}] {args}")
        fn, _, _ = TOOLS[name]
        fn(**args)
        wait_idle()
        ACTIONS.append({"tool": name, "args": args})
    log.error(f"STEP LIMIT REACHED ({MAX_STEPS})")

if __name__ == "__main__":
    run()
