import os, requests

OLLAMA = os.environ.get("OLLAMA_URL", "http://localhost:11434")
MODEL  = os.environ.get("MODEL", "llama3.2:3b")


def chat(messages):
    r = requests.post(f"{OLLAMA}/api/chat", timeout=120, json={
        "model": MODEL, "messages": messages, "stream": False})
    return r.json()["message"]["content"]


if __name__ == "__main__":
    q = "I want to like a cat picture on Facebook."

    print("--- raw ---")
    print(chat([{"role": "user", "content": q}]))

    print("\n--- nudged (system prompt) ---")
    print(chat([
        {"role": "system", "content": "Reply with a numbered list of browser steps. No prose."},
        {"role": "user",   "content": q},
    ]))

    print("\n--- format nudge (JSON) ---")
    print(chat([
        {"role": "system", "content": 'Reply ONLY valid JSON: {"steps":[...]}. No fences.'},
        {"role": "user",   "content": q},
    ]))
