import os, requests

OLLAMA = os.environ.get("OLLAMA_URL", "http://localhost:11434")
MODEL  = os.environ.get("MODEL", "llama3.2:3b")
Q      = os.environ.get("Q", "How to buy Fujifilm X-E5 for cheap")

def chat(messages):
    r = requests.post(f"{OLLAMA}/api/chat", timeout=120, json={
        "model": MODEL, "messages": messages, "stream": False})
    return r.json()["message"]["content"]

if __name__ == "__main__":
    print(chat([{"role": "user", "content": Q}]))

    # with system prompt
    # print(chat([
    #     {"role": "system", "content": "Reply with a numbered list of browser steps. No prose."},
    #     {"role": "user",   "content": Q},
    # ]))

    # with format hint (JSON)
    # print(chat([
    #     {"role": "system", "content": 'Reply ONLY valid JSON: {"steps":[...]}. No fences.'},
    #     {"role": "user",   "content": Q},
    # ]))
