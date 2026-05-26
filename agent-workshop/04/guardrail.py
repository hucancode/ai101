"""Lesson 04 — lesson 03 + MAX_STEPS guardrail + tool-call validation.
Bad JSON / unknown tool / missing args = feedback to model, loop continues."""
import os, json, time, logging, requests
from collections import deque

ARM        = os.environ.get("ARM_URL", "http://localhost:3000")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
MODEL      = os.environ.get("MODEL", "llama3.2:3b")
Q          = os.environ.get("Q", "Pick up the red cube.")
LOGLEVEL   = os.environ.get("LOGLEVEL", "INFO").upper()
MAX_STEPS  = int(os.environ.get("MAX_STEPS", "30"))
ACTION_LOG = int(os.environ.get("ACTION_LOG", "12"))
MOVE_MS    = int(os.environ.get("MOVE_MS", "3000"))
LOW_LEVEL  = int(os.environ.get("LOW_LEVEL", "0"))  # expose set_grip + move_to primitives

log = logging.getLogger("lesson04")

WORLD = {"workspace": None, "gripper_config": None,
         "cubes": None, "trays": None,
         "ee": None, "gripper": None, "holding": None}
ACTIONS = deque(maxlen=ACTION_LOG)
DONE = False

def chat(system, user):
    log.warning(f"LLM: context size {len(user)}")
    r = requests.post(
        f"{OLLAMA_URL}/api/chat",
        json={
            "model": MODEL,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "format": "json",
            "stream": False,
        },
        timeout=120,
    )
    r.raise_for_status()
    return r.json()["message"]["content"]

def extract_json(text):
    i = text.find("{")
    if i < 0:
        raise ValueError(f"no JSON in: {text!r}")
    obj, _ = json.JSONDecoder().raw_decode(text[i:])
    return obj

def refresh_world():
    ws = requests.get(f"{ARM}/api/workspace", timeout=10).json()
    WORLD["workspace"] = ws.get("workspace")
    WORLD["gripper_config"] = ws.get("gripper")
    cubes = requests.get(f"{ARM}/api/cubes", timeout=10).json()["cubes"]
    WORLD["cubes"] = [{"index": i, "name": c.get("name"), "rgba": c.get("rgba"),
                       "pos": c.get("pos"), "size": c.get("size")}
                      for i, c in enumerate(cubes)]
    trays = requests.get(f"{ARM}/api/tray", timeout=10).json().get("trays", [])
    WORLD["trays"] = [{"name": t["name"], "pos": t["pos"], "size": t["size"],
                       "cubes": [c["name"] for c in t.get("cubes", [])]}
                      for t in trays]
    g = requests.get(f"{ARM}/api/gripping", timeout=10).json()
    WORLD["ee"] = g.get("ee")
    WORLD["gripper"] = g.get("gripper")
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

def t_done(reason=""):
    global DONE
    DONE = True
    log.info(f"done: {reason}")

def wait_idle(timeout=MOVE_MS, interval=0.2):
    """Poll /api/state until the arm finishes the queued action."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = requests.get(f"{ARM}/api/state", timeout=5).json()
        if s.get("pending", 0) == 0 and not (s.get("state") or {}).get("sequenceRunning", False):
            return
        time.sleep(interval)
    log.warning("wait_idle timeout")

TOOLS = {
    "done": (t_done,
             {"reason": {"type": "string", "desc": "why task is complete"}},
             "Signal task complete. Loop exits."),
}
if LOW_LEVEL:
    TOOLS["set_grip"] = (
        t_set_grip,
        {"value": {"type": "int", "desc": "aperture 0..255 (0=closed, 255=open)"}},
        "Set gripper aperture.")
    TOOLS["move_to"] = (
        t_move_to,
        {"x": {"type": "float", "desc": "world x meters; inside workspace.x bounds"},
         "y": {"type": "float", "desc": "world y meters; inside workspace.y bounds"},
         "z": {"type": "float", "desc": "world z meters; table_z is floor"}},
        "Move end-effector to world position.")
else:
    TOOLS["pickup"] = (
        t_pickup,
        {"x": {"type": "float", "desc": "target cube center x in meters"},
         "y": {"type": "float", "desc": "target cube center y in meters"},
         "z": {"type": "float", "desc": "target cube center z in meters"}},
        "Pick cube at (x,y,z), drop on tray automatically.")

def render_tool(name, schema, desc):
    args = ", ".join(f'{a}:{s["type"]} ({s["desc"]})' for a, s in schema.items())
    return f"- {name}({args}) — {desc}"

SYS = ("Drive robot arm. RECENT_ACTIONS includes errors if a call was rejected. "
       "Call done when task complete.\n"
       "Tools:\n"
       + "\n".join(render_tool(n, s, d) for n, (_, s, d) in TOOLS.items()) +
       '\nReply JSON only: {"tool":"...","args":{...}}.')

def build_user():
    ctx = {"WORLD": WORLD, "RECENT_ACTIONS": list(ACTIONS)}
    return f"task: {Q}\n{json.dumps(ctx)}"

def validate(call):
    """Return (name, args) or raise ValueError with model-facing reason."""
    if not isinstance(call, dict):
        raise ValueError(f"reply not object: {call!r}")
    name = call.get("tool")
    if name not in TOOLS:
        raise ValueError(f"unknown tool {name!r}; allowed: {list(TOOLS)}")
    args = call.get("args") or {}
    if not isinstance(args, dict):
        raise ValueError(f"args not object: {args!r}")
    schema = TOOLS[name][1]
    required = [k for k in schema if k != "reason"]
    missing = [k for k in required if k not in args]
    if missing:
        raise ValueError(f"tool {name} missing args {missing}; schema={schema}")
    extra = [k for k in args if k not in schema]
    if extra:
        raise ValueError(f"tool {name} got unknown args {extra}; schema={schema}")
    return name, args

def run():
    log.warning(f"Q: {Q} (max {MAX_STEPS} steps)")
    for step in range(1, MAX_STEPS + 1):
        if DONE:
            break
        refresh_world()
        raw = chat(SYS, build_user())
        try:
            call = extract_json(raw)
            name, args = validate(call)
        except (ValueError, KeyError) as e:
            log.error(f"[bad-call] {e}")
            ACTIONS.append({"error": str(e), "raw": raw[:200]})
            continue
        log.warning(f"[{name}] {args}")
        fn, _, _ = TOOLS[name]
        try:
            fn(**args)
            if name != "done":
                wait_idle()
            ACTIONS.append({"tool": name, "args": args})
        except Exception as e:
            log.error(f"[exec-fail] {name}: {e}")
            ACTIONS.append({"tool": name, "args": args, "error": str(e)})
    if DONE:
        log.info("FINISHED ✅")
    else:
        log.error(f"STEP LIMIT REACHED ({MAX_STEPS})")

if __name__ == "__main__":
    run()
