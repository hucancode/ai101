import os, re, json, requests

OLLAMA = os.environ.get("OLLAMA_URL", "http://localhost:11434")
MODEL  = os.environ.get("MODEL", "llama3.2:3b")


def chat(messages):
    r = requests.post(f"{OLLAMA}/api/chat", timeout=120, json={
        "model": MODEL, "messages": messages, "stream": False})
    return r.json()["message"]["content"]


def say_hi(name): return f"Hello, {name}!"

def weather(city):
    print(f"Fetching weather for {city}...")
    r = requests.get(f"https://wttr.in/{city}", params={"format": 4},
                     headers={"User-Agent": "curl/8"}, timeout=10)
    return r.text.strip()

TOOLS = {
    "say_hi":  (say_hi,  {"name": "string"}),
    "weather": (weather, {"city": "string"}),
}

def run(user_msg):
    tools = "\n".join(f"- {n}{json.dumps(s)}" for n, (_, s) in TOOLS.items())
    sys = f'Tools:\n{tools}\nReply ONLY: {{"tool":"...","args":{{...}}}}.'
    raw = chat([{"role": "system", "content": sys},
                {"role": "user",   "content": user_msg}])
    print(f"USER: {user_msg}\nMODEL: {raw}")
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    call = json.loads(m.group(0))
    fn, _ = TOOLS[call["tool"]]
    print(f"RESULT: {fn(**call.get('args', {}))}\n")


if __name__ == "__main__":
    run("What's the weather?")
    # run("I live in Hanoi. What's the weather?")
