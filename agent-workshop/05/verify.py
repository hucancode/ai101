"""Lesson 05 — copy of lesson 04 + rule-based oracle that re-checks the like stuck."""
import os, re, json, requests
from pathlib import Path
from collections import deque
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
MAX_STEPS = 18
STAGNATION = 3
SCROLL_BUDGET = 10000
MAX_RETRIES = 2   # NEW
SETTLE_MS = 1500  # NEW: wait for any rebound before re-checking


def chat(messages):
    r = requests.post(f"{OLLAMA}/api/chat", timeout=180, json={
        "model": MODEL, "messages": messages, "stream": False,
        "options": {"temperature": 0.1}})
    return r.json()["message"]["content"]


def extract_json(text):
    m = re.search(r"\{.*\}", text, re.DOTALL)
    return json.loads(m.group(0))


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


SYS = (f"Browser agent on {SITE}. Like the first post about '{TARGET}'. "
       f"After like, an external verifier checks reality. If VERIFY_FAILED, retry. "
       f"Only call done when sure.\nTools:\n"
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


# NEW vs lesson 04: rule-based oracle. Re-find the post by snippet, check the
# like actually stuck AND the post text mentions TARGET.
def verify(page, snippet):
    if not snippet:
        return False, "agent never called like"
    page.wait_for_timeout(SETTLE_MS)
    for a in page.query_selector_all(POST_SEL):
        text = (a.inner_text() or "").lower()
        if snippet.lower() not in text: continue
        btn = a.query_selector(LIKE_ON_SEL)
        if not btn: return False, f"post not liked (rebound or wrong post). snippet={snippet!r}"
        if TARGET.lower() not in text:
            return False, f"liked post does not mention '{TARGET}'. wrong post."
        return True, f"verified: post containing {snippet!r} is liked and mentions '{TARGET}'"
    return False, f"post containing {snippet!r} no longer in DOM. scroll back."


def run():
    print(f"target={TARGET!r}")
    recent: deque[str] = deque(maxlen=STAGNATION)
    scrolled = 0
    last_snippet = None   # NEW
    retries = 0           # NEW

    with sync_playwright() as pw:
        ctx, page = launch(pw)
        history = [{"role": "system", "content": SYS},
                   {"role": "user",   "content": f"Find and like a {TARGET} post."}]

        abort = None
        for i in range(1, MAX_STEPS + 1):
            raw = chat(history)
            call = extract_json(raw)
            name, args = call["tool"], call.get("args") or {}
            sig = f"{name}:{json.dumps(args, sort_keys=True)}"

            recent.append(sig)
            if len(recent) == recent.maxlen and len(set(recent)) == 1:
                abort = f"stagnation: {sig} x{recent.maxlen}"; break
            if name == "scroll":
                scrolled += int(args.get("px", 900))
                if scrolled > SCROLL_BUDGET:
                    abort = f"scroll budget exhausted ({scrolled}px)"; break

            fn, _ = TOOLS.get(name, (None, None))
            result = fn(page, **args) if fn else f"ERROR: unknown {name}"
            if name == "like" and "ERROR" not in result:    # NEW: remember for verify
                last_snippet = args.get("snippet")
            print(f"[{i}] {sig} -> {result[:150]}")
            history += [{"role": "assistant", "content": raw},
                        {"role": "user", "content": f"tool_result: {result}"}]

            # NEW: oracle vetoes `done`
            if result.startswith("DONE:"):
                ok, msg = verify(page, last_snippet)
                print(f"  verify: ok={ok} {msg}")
                if ok: break
                retries += 1
                if retries > MAX_RETRIES:
                    abort = f"verify failed {retries}x: {msg}"; break
                history.append({"role": "user",
                    "content": f"VERIFY_FAILED: {msg} Do not call done again until fixed."})
        else:
            abort = f"hit MAX_STEPS={MAX_STEPS}"

        if abort: print(f"ABORT: {abort}")
        input("enter to close..."); ctx.close()


if __name__ == "__main__":
    run()
