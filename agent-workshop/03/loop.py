"""Lesson 03 — bare tool loop (easy). Model picks pickup until `done`."""
import os, json, time, requests, boto3
from collections import deque

ARM        = os.environ.get("ARM_URL", "http://localhost:3000")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL      = os.environ.get("MODEL", "us.amazon.nova-lite-v1:0")
Q          = os.environ.get("Q", "Pick up the red cube.")

client = boto3.client("bedrock-runtime", region_name=AWS_REGION)
WORLD, ACTIONS, DONE = {}, deque(maxlen=12), False

def refresh_world():
    WORLD.update(requests.get(f"{ARM}/api/world").json())

def wait_idle():
    streak = 0
    while streak < 2:
        streak = streak + 1 if requests.get(f"{ARM}/api/world?fields=idle", timeout=5).json().get("idle") else 0
        time.sleep(0.3)

def t_pickup(x, y, z):
    requests.post(f"{ARM}/api/pickup", json={"targets": [{"x": x, "y": y, "z": z}]})

def t_done(reason=""):
    global DONE; DONE = True; print(f"done: {reason}")

def spec(name, desc, props={}, required=[]):
    return {"toolSpec": {"name": name, "description": desc, "inputSchema": {"json":
        {"type": "object", "properties": props, "required": required}}}}

NUM = {"type": "number"}
TOOLS = [
    spec("done",   "Signal task complete.", {"reason": {"type": "string"}}),
    spec("pickup", "Pick cube at (x,y,z), drop on tray.", {"x": NUM, "y": NUM, "z": NUM}, ["x", "y", "z"]),
]
DISPATCH = {"done": t_done, "pickup": t_pickup}
SYS = "Drive a robot arm. Call done when complete. Pick exactly one tool per turn."

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
