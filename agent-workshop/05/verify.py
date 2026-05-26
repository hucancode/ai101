"""Lesson 05 — lesson 04 + tool param validation + final weather verification."""
import os, re, json, logging, requests
from datetime import date, datetime, timedelta
from urllib.parse import urlencode
from pathlib import Path
from playwright.sync_api import sync_playwright

OLLAMA  = os.environ.get("OLLAMA_URL", "http://localhost:11434")
MODEL   = os.environ.get("MODEL", "llama3.2:3b")
Q       = os.environ.get("Q", "Find me a cheap hotel in a hot place.")
MAX_STEPS = int(os.environ.get("MAX_STEPS", 25))
LOGLEVEL = os.environ.get("LOGLEVEL", "INFO").upper()

PROFILE    = str(Path.home()/".cache/agent-workshop-chrome")

class AnsiColorFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord):
        no_style = '\033[0m'
        bold = '\033[91m'
        grey = '\033[90m'
        yellow = '\033[93m'
        red = '\033[31m'
        red_light = '\033[91m'
        start_style = {
            'DEBUG':    grey,
            'INFO':     no_style,
            'WARNING':  yellow,
            'ERROR':    red,
            'CRITICAL': red_light + bold,
        }.get(record.levelname, no_style)
        end_style = no_style
        return f'{start_style}{super().format(record)}{end_style}'

_handler = logging.StreamHandler()
_handler.setFormatter(AnsiColorFormatter("%(asctime)s %(levelname)s %(message)s",
                                          datefmt="%H:%M:%S"))
logging.basicConfig(level=LOGLEVEL, handlers=[_handler])
log = logging.getLogger("lesson05")

CARD_SEL   = '[data-testid="property-card"]'
NAME_SEL   = '[data-testid="title"]'
PRICE_SEL  = '[data-testid="price-and-discounted-price"]'
SCORE_SEL  = '[data-testid="review-score"] div[aria-hidden="true"]'
DEST_SEL   = 'input[name="ss"]'
SUBMIT_SEL = 'form button[type="submit"]'

def chat(messages):
    payload = {"model": MODEL, "messages": messages, "stream": False, "format": "json"}
    r = requests.post(f"{OLLAMA}/api/chat", timeout=180, json=payload)
    return r.json()["message"]["content"]

def t_weather(page, city=""):
    log.warning(f"[GET_WEATHER] {city}")
    r = requests.get(f"https://wttr.in/{city}?format=j1", timeout=15)
    cur = r.json()["current_condition"][0]
    return json.dumps({
        "city":   city,
        "temp_c": int(cur["temp_C"]),
        "desc":   cur["weatherDesc"][0]["value"],
    })

def t_search(page, city="", checkin="", checkout="", nights=1, adults=2):
    log.warning(f"[SEARCH] {city}, {checkin}, {checkout}, {nights} nights, {adults} persons")
    ci = checkin or (date.today() + timedelta(days=14)).isoformat()
    co = checkout or (date.fromisoformat(ci) + timedelta(days=int(nights or 1))).isoformat()
    params = {"ss": city, "checkin": ci, "checkout": co, "group_adults": int(adults or 2)}
    page.goto(f"https://www.booking.com/searchresults.html?{urlencode(params)}", timeout=30000)
    page.wait_for_selector(CARD_SEL, timeout=20000)
    page.wait_for_timeout(2000)
    cards = page.query_selector_all(CARD_SEL)
    out = []
    for c in cards[:10]:
        name  = c.query_selector(NAME_SEL)
        price = c.query_selector(PRICE_SEL)
        score = c.query_selector(SCORE_SEL)
        out.append({
            "name":  (name.inner_text().strip()  if name  else "")[:80],
            "price": (price.inner_text().strip() if price else ""),
            "score": (score.inner_text().strip() if score else ""),
        })
    log.info(f"Found {out}")
    return {"city": city, "hotels": out}

def t_extract_good_deal(page, hotels=None):
    hotels = hotels or []
    for h in hotels:
        name  = h.get("name", "")
        price = h.get("price", "")
        score = h.get("score", "")
        log.warning(f"[EXTRACT] {name}, {price}, {score}")
        verdict = chat([
            {"role": "system", "content":
             "Judge if hotel is a good deal. Reply ONLY one word: good or skip."},
            {"role": "user", "content": f"{name} | price={price} | score={score}"},
        ]).strip()
        log.info(f"VERDICT: {verdict}")
        if "good" in verdict: return h
    return None

TOOLS = {
    "weather":  (t_weather,  {"city": "string"}, ["city"]),
    "search":   (t_search,   {"city": "string",
                              "checkin":  "YYYY-MM-DD (optional)",
                              "checkout": "YYYY-MM-DD (optional)",
                              "nights":   "int (optional, default 1)"},
                              ["city"]),
    "extract_good_deal": (t_extract_good_deal, {"hotels": "list of hotels [{name, price, score}]"}),
                          ["hotels"]),
}

def validate(name, args):
    """Tool param validation. Returns error str or None."""
    entry = TOOLS.get(name)
    if entry is None:
        return f"unknown tool {name!r}. Allowed: {sorted(TOOLS)}"
    _, schema, required = entry
    diff = set(args) - set(schema)
    if diff:
        return f"unknown args {sorted(diff)} for {name!r}. Allowed: {sorted(schema)}"
    missing = [k for k in required if not args.get(k)]
    if missing:
        return f"missing required args {missing} for {name!r}"
    return None


SYS = (f"Current time: {datetime.now().isoformat(timespec='hours')}.\n"
       "1. Search candidate city that fits the user's vibe\n"
       "2. Check weather to confirm it matches\n"
       "3. Search booking.com to get a list of hotels\n"
       "4. Extract good deal from list hotels\n"
       "5. Repeat\n"
       "Tools:\n"
       + "\n".join(f"- {n}{json.dumps(s)}" for n, (_, s, _r) in TOOLS.items()) +
       "\n"
       'Reply ONLY: {"tool":"...","args":{...}}.')

def launch(pw):
    Path(PROFILE).mkdir(parents=True, exist_ok=True)
    ctx = pw.chromium.launch_persistent_context(PROFILE, headless=False)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto("https://www.booking.com/", timeout=30000)
    page.wait_for_timeout(2000)
    return ctx, page

def run():
    with sync_playwright() as pw:
        ctx, page = launch(pw)
        history = [{"role": "system", "content": SYS},
                   {"role": "user",   "content": Q}]
        last_city = None
        i = 0
        while i < MAX_STEPS:
            raw = chat(history)
            try:
                call = json.loads(raw)
            except (AttributeError, json.JSONDecodeError):
                log.error("could not decode: %s", raw)
                continue
            i += 1
            name, args = call["tool"], call.get("args") or {}
            err = validate(name, args)
            if err:
                log.warning("[%d/%d] VALIDATE_FAIL %s", i, MAX_STEPS, err)
                history += [{"role": "assistant", "content": raw},
                            {"role": "user", "content": f"tool_result: ERROR: {err}"}]
                continue
            fn, _, _ = TOOLS[name]
            try:
                result = fn(page, **args)
            except Exception as e:
                result = f"Error while calling {name}({args}): {type(e).__name__}: {e}"
                log.error(result)
            log.info("[%d/%d] %s(%s)", i, MAX_STEPS, name, args)
            if name == "search" and isinstance(result, dict):
                last_city = result.get("city")
                payload = json.dumps(result.get("hotels", []))
            else:
                payload = result if isinstance(result, str) else json.dumps(result)
            history += [{"role": "assistant", "content": raw},
                        {"role": "user", "content": f"tool_result: {payload}"}]
            if name != "extract_good_deal" or not isinstance(result, dict):
                continue
            ok, msg = verify_final(page, climate, last_city)
            if not ok:
                log.warning("VERIFY_FAIL: %s — retry", msg)
                history.append({"role": "user",
                    "content": f"VERIFY_FAILED: {msg}. Try another city."})
                continue
            log.info("__________________________")
            log.info("FOUND A GOOD DEAL 💰! %s - %s", result["name"], result["price"])
            log.info("VERIFY_OK: %s", msg)
            return
        log.error("abort: hit MAX_STEPS=%d", MAX_STEPS)

if __name__ == "__main__":
    run()
