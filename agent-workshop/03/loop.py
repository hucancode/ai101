"""Lesson 03 — real Chrome + real Facebook + multi-step loop. Replaces fake tools from 02."""
import os, re, json, requests
from pathlib import Path
from playwright.sync_api import sync_playwright

OLLAMA = os.environ.get("OLLAMA_URL", "http://localhost:11434")
MODEL  = os.environ.get("MODEL", "llama3.2:3b")
TARGET = os.environ.get("TARGET", "cat")
SITE   = os.environ.get("SITE", "facebook")   # facebook | instagram
URL    = {"facebook": "https://www.facebook.com/",
          "instagram": "https://www.instagram.com/"}[SITE]
POST_SEL    = 'div[role="article"], article'
LIKE_OFF    = '[aria-label="Like"]'
LIKE_ON_SEL = '[aria-label="Remove like"], [aria-label="Unlike"]'
PROFILE = os.environ.get("USER_DATA_DIR", str(Path.home()/".cache/agent-workshop-chrome"))
MAX_STEPS = 12


def chat(messages):
    r = requests.post(f"{OLLAMA}/api/chat", timeout=180, json={
        "model": MODEL, "messages": messages, "stream": False,
        "options": {"temperature": 0.1}})
    return r.json()["message"]["content"]

# NEW vs lesson 02: real FB tools. Posts identified by text snippet, not by id.
def t_scroll(page, px=900):
    page.evaluate(f"scrollBy(0,{int(px)})"); page.wait_for_timeout(800)
    return f"scrolled {px}"

def t_read(page):
    posts = page.evaluate(f"""() =>
        [...document.querySelectorAll('{POST_SEL}')]
          .filter(a => {{ const r=a.getBoundingClientRect(); return r.bottom>0 && r.top<innerHeight; }})
          .slice(0,5)
          .map(a => (a.innerText||'').replace(/\\s+/g,' ').slice(0,160))
    """)
    return json.dumps(posts)

def t_like(page, snippet):
    for a in page.query_selector_all(POST_SEL):
        if snippet.lower() in (a.inner_text() or "").lower():
            btn = a.query_selector(LIKE_OFF)
            if not btn: return "found post but no Like button (maybe liked)"
            a.scroll_into_view_if_needed()
            btn.click(); page.wait_for_timeout(500)
            return f"liked post containing {snippet!r}"
    return f"ERROR: no post containing {snippet!r}"

def t_done(page, reason): return f"DONE: {reason}"

TOOLS = {
    "scroll": (t_scroll, {"px": "int"}),
    "read":   (t_read,   {}),
    "like":   (t_like,   {"snippet": "string"}),
    "done":   (t_done,   {"reason": "string"}),
}


SYS = (f"Browser agent on {SITE}. Like the first post in the feed about '{TARGET}'. "
       f"Use read to see post texts, scroll if no match, like with a unique snippet from "
       f"the matching post, then done.\nTools:\n"
       + "\n".join(f"- {n}{json.dumps(s)}" for n, (_, s) in TOOLS.items())
       + '\nReply ONLY: {"tool":"...","args":{...}}.')


def launch(pw):
    Path(PROFILE).mkdir(parents=True, exist_ok=True)
    ctx = pw.chromium.launch_persistent_context(PROFILE, channel="chrome", headless=False)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto(URL, timeout=30000); page.wait_for_timeout(2500)
    if page.query_selector('input[name="email"], input[name="username"]'):
        input(f"[manual] log into {SITE}, then press Enter...")
    return ctx, page


# NEW: the loop. Was a single dispatch in lesson 02.
def run():
    print(f"target={TARGET!r}")
    with sync_playwright() as pw:
        ctx, page = launch(pw)
        history = [{"role": "system", "content": SYS},
                   {"role": "user",   "content": f"Find and like a {TARGET} post."}]
        for i in range(1, MAX_STEPS + 1):
            raw = chat(history)
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            call = json.loads(m.group(0))
            name, args = call["tool"], call.get("args") or {}
            fn, _ = TOOLS.get(name, (None, None))
            result = fn(page, **args) if fn else f"ERROR: unknown {name}"
            print(f"[{i}] {name}({args}) -> {result[:150]}")
            history += [{"role": "assistant", "content": raw},
                        {"role": "user", "content": f"tool_result: {result}"}]
            if result.startswith("DONE:"): break
        else:
            print(f"hit MAX_STEPS={MAX_STEPS}")
        input("enter to close..."); ctx.close()


if __name__ == "__main__":
    run()
