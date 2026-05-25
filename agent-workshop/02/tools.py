import os, re, json, requests

OLLAMA = os.environ.get("OLLAMA_URL", "http://localhost:11434")
MODEL  = os.environ.get("MODEL", "llama3.2:3b")


def chat(messages):
    r = requests.post(f"{OLLAMA}/api/chat", timeout=120, json={
        "model": MODEL, "messages": messages, "stream": False})
    return r.json()["message"]["content"]


# NEW: parse JSON out of the model reply
def extract_json(text):
    m = re.search(r"\{.*\}", text, re.DOTALL)
    return json.loads(m.group(0))

# NEW: tools = dict of name -> (callable, arg schema)
def fetch(url):
    html = requests.get(url, timeout=10).text
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    return f"{url} -> title={(m.group(1).strip() if m else '(none)')}, {len(html)} bytes"

def say_hi(name): return f"Hello, {name}!"

TOOLS = {
    "fetch":  (fetch,  {"url": "string"}),
    "say_hi": (say_hi, {"name": "string"}),
}


def run(user_msg):
    tools = "\n".join(f"- {n}{json.dumps(s)}" for n, (_, s) in TOOLS.items())
    sys = f'Tools:\n{tools}\nReply ONLY: {{"tool":"...","args":{{...}}}}.'
    raw = chat([{"role": "system", "content": sys},
                {"role": "user",   "content": user_msg}])
    print(f"USER: {user_msg}\nMODEL: {raw}")
    call = extract_json(raw)
    fn, _ = TOOLS[call["tool"]]
    print(f"RESULT: {fn(**call.get('args', {}))}\n")


if __name__ == "__main__":
    run("Fetch https://example.com and tell me the title")
    run("Greet someone named Ada")
