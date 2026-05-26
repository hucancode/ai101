"""Lesson 03 — bare tool loop. Model picks next tool until it calls `done`."""
import os, json, logging, requests
from collections import deque

OLLAMA     = os.environ.get("OLLAMA_URL", "http://localhost:11434")
ARM        = os.environ.get("ARM_URL", "http://localhost:3000")
MODEL      = os.environ.get("MODEL", "llama3.2:3b")
Q          = os.environ.get("Q", "Pick up the red cube.")
LOGLEVEL   = os.environ.get("LOGLEVEL", "INFO").upper()
ACTION_LOG = int(os.environ.get("ACTION_LOG", "12"))

class AnsiColorFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord):
        no_style = '\033[0m'; bold = '\033[91m'; grey = '\033[90m'
        yellow = '\033[93m'; red = '\033[31m'; red_light = '\033[91m'
        start_style = {
            'DEBUG':    grey,
            'INFO':     no_style,
            'WARNING':  yellow,
            'ERROR':    red,
            'CRITICAL': red_light + bold,
        }.get(record.levelname, no_style)
        return f'{start_style}{super().format(record)}{no_style}'

_handler = logging.StreamHandler()
_handler.setFormatter(AnsiColorFormatter("%(asctime)s %(levelname)s %(message)s",
                                          datefmt="%H:%M:%S"))
logging.basicConfig(level=LOGLEVEL, handlers=[_handler])
log = logging.getLogger("lesson03")

WORLD = {"workspace": None, "cubes": None, "ee": None, "grip": None}
ACTIONS = deque(maxlen=ACTION_LOG)
DONE = False

def chat(messages):
    payload = {"model": MODEL, "messages": messages, "stream": False, "format": "json"}
    r = requests.post(f"{OLLAMA}/api/chat", timeout=180, json=payload)
    return r.json()["message"]["content"]

def t_get_workspace():
    WORLD["workspace"] = requests.get(f"{ARM}/api/workspace", timeout=10).json()

def t_list_cubes():
    cubes = requests.get(f"{ARM}/api/cubes", timeout=10).json()["cubes"]
    WORLD["cubes"] = [{"index": i, "name": c.get("name"), "rgba": c.get("rgba"),
                       "pos": c.get("pos")} for i, c in enumerate(cubes)]

def t_set_grip(value):
    v = int(value)
    requests.post(f"{ARM}/api/gripper", json={"value": v}, timeout=10)
    WORLD["grip"] = v

def t_move_to(x, y, z):
    x, y, z = float(x), float(y), float(z)
    requests.post(f"{ARM}/api/move_to",
                  json={"x": x, "y": y, "z": z, "duration": 1500}, timeout=10)
    WORLD["ee"] = [x, y, z]

def t_get_ee_pos():
    r = requests.get(f"{ARM}/api/state", timeout=10).json()
    WORLD["ee"] = r["state"]["ee"]["pos"]

def t_done(reason=""):
    global DONE
    DONE = True
    log.info(f"done: {reason}")

TOOLS = {
    "get_workspace": (t_get_workspace, {}),
    "list_cubes":    (t_list_cubes,    {}),
    "set_grip":      (t_set_grip,      {"value": "int"}),
    "move_to":       (t_move_to,       {"x": "float", "y": "float", "z": "float"}),
    "get_ee_pos":    (t_get_ee_pos,    {}),
    "done":          (t_done,          {"reason": "string"}),
}

SYS = ("Drive a robot arm. Read WORLD for current state (null=unknown, fetch via tools).\n"
       "RECENT_ACTIONS shows your last calls. Call done when task complete.\n"
       "Tools:\n"
       + "\n".join(f"- {n}{json.dumps(s)}" for n, (_, s) in TOOLS.items()) +
       '\nReply JSON only: {"tool":"...","args":{...}}.')

def build_messages():
    ctx = {"WORLD": WORLD, "RECENT_ACTIONS": list(ACTIONS)}
    return [{"role": "system", "content": SYS},
            {"role": "user", "content": f"task: {Q}\n{json.dumps(ctx)}"}]

def run():
    log.warning(f"Q: {Q}")
    while not DONE:
        raw = chat(build_messages())
        call = json.loads(raw)
        name, args = call["tool"], call.get("args") or {}
        log.warning(f"[{name}] {args}")
        fn, _ = TOOLS[name]
        fn(**args)
        ACTIONS.append({"tool": name, "args": args})
    log.info("FINISHED ✅")

if __name__ == "__main__":
    run()
