"""Lesson 05 — loop + guardrails + rule-based verifier (easy)."""
import os, json, time, requests, boto3
from collections import deque

ARM        = os.environ.get("ARM_URL", "http://localhost:3000")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
# MODEL      = os.environ.get("MODEL", "us.amazon.nova-pro-v1:0")
MODEL      = os.environ.get("MODEL", "us.anthropic.claude-sonnet-4-6")
Q          = os.environ.get("Q", "Pick up the red cube and put it on the tray.")
MAX_STEPS  = int(os.environ.get("MAX_STEPS", "30"))

client = boto3.client("bedrock-runtime", region_name=AWS_REGION)
WORLD, ACTIONS = {}, deque(maxlen=12)

def refresh_world():
    WORLD.update(requests.get(f"{ARM}/api/world").json())

def wait_idle():
    streak = 0
    while streak < 2:
        streak = streak + 1 if requests.get(f"{ARM}/api/world?fields=idle", timeout=5).json().get("idle") else 0
        time.sleep(0.3)

def t_pickup(x, y, z):
    requests.post(f"{ARM}/api/pickup", json={"targets": [{"x": x, "y": y, "z": z}]})

def spec(name, desc, props={}, required=[]):
    return {"toolSpec": {"name": name, "description": desc, "inputSchema": {"json":
        {"type": "object", "properties": props, "required": required}}}}

NUM = {"type": "number"}
TOOLS = [
    spec("pickup", "Pick cube at (x,y,z), drop on tray.", {"x": NUM, "y": NUM, "z": NUM}, ["x", "y", "z"]),
]
DISPATCH = {"pickup": t_pickup}
SPECS = {t["toolSpec"]["name"]: t["toolSpec"]["inputSchema"]["json"] for t in TOOLS}
SYS = ("Drive a robot arm. Verifier ends the task when a cube is on a tray. "
       "RECENT_ACTIONS includes errors if a call was rejected. "
       "Repeating the previous successful call is rejected as duplicate — vary args or pick a different tool. "
       "Pick exactly one tool per turn.")

def task_complete():
    return any(t["cubes"] for t in WORLD.get("trays", [])) and not WORLD.get("holding")

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
        refresh_world()
        if task_complete(): print("FINISHED ✅"); return
        r = client.converse(modelId=MODEL,
            messages=[{"role": "user", "content": [{"text": build_user()}]}],
            system=[{"text": SYS}],
            toolConfig={"tools": TOOLS, "toolChoice": {"any": {}}},
            inferenceConfig={"maxTokens": 1024})
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
            wait_idle()
            ACTIONS.append({"tool": name, "args": args})
        except Exception as e:
            print(f"[exec-fail] {name}: {e}")
            ACTIONS.append({"tool": name, "args": args, "error": str(e)})
    print(f"STEP LIMIT REACHED ({MAX_STEPS})")

if __name__ == "__main__":
    run()
