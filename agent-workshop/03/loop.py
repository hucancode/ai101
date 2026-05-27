"""Lesson 03 — bare tool loop (easy). Model picks pickup until `done`."""
import os, json, time, logging, requests, boto3
from collections import deque

ARM        = os.environ.get("ARM_URL", "http://localhost:3000")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL      = os.environ.get("MODEL", "us.amazon.nova-lite-v1:0")
Q          = os.environ.get("Q", "Pick up the red cube.")
ACTION_LOG = int(os.environ.get("ACTION_LOG", "12"))
MOVE_MS    = int(os.environ.get("MOVE_MS", "3000"))

log = logging.getLogger("lesson03")
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

def t_pickup(x, y, z): requests.post(f"{ARM}/api/pickup",
    json={"targets": [{"x": float(x), "y": float(y), "z": float(z)}]}, timeout=10)
def t_done(reason=""):
    global DONE; DONE = True; log.info(f"done: {reason}")

def wait_idle(timeout=MOVE_MS*0.001, interval=0.2):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = requests.get(f"{ARM}/api/state", timeout=5).json()
        if s.get("pending", 0) == 0 and not (s.get("state") or {}).get("sequenceRunning", False): return
        time.sleep(interval)
    log.warning("wait_idle timeout")

def spec(name, desc, props, required):
    return {"toolSpec": {"name": name, "description": desc, "inputSchema": {"json": {
        "type": "object", "properties": props, "required": required}}}}

NUM = {"type": "number"}
TOOLS = [
    spec("done",   "Signal task complete.", {"reason": {"type": "string"}}, ["reason"]),
    spec("pickup", "Pick cube at (x,y,z), drop on tray.",
         {"x": NUM, "y": NUM, "z": NUM}, ["x", "y", "z"]),
]
DISPATCH = {"done": t_done, "pickup": t_pickup}
SYS = "Drive a robot arm. Call done when complete. Pick exactly one tool per turn."

def build_user():
    return f"task: {Q}\n{json.dumps({'WORLD': WORLD, 'RECENT_ACTIONS': list(ACTIONS)})}"

def run():
    log.warning(f"Q: {Q}")
    while not DONE:
        refresh_world()
        r = client.converse(modelId=MODEL,
            messages=[{"role": "user", "content": [{"text": build_user()}]}],
            system=[{"text": SYS}],
            toolConfig={"tools": TOOLS, "toolChoice": {"any": {}}},
            inferenceConfig={"maxTokens": 1024})
        tu = next((b["toolUse"] for b in r["output"]["message"]["content"] if "toolUse" in b), None)
        if not tu: log.error("no tool call"); break
        name, args = tu["name"], tu["input"]
        log.warning(f"[{name}] {args}")
        DISPATCH[name](**args)
        if name != "done": wait_idle()
        ACTIONS.append({"tool": name, "args": args})
    log.info("FINISHED ✅")

if __name__ == "__main__":
    run()
