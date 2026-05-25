# Agent Loop from First Principles

## Setup

```bash
# Python deps
uv sync
uv run playwright install chromium    # only used as a fallback; we drive real Chrome
# Real Chrome must be installed on the system; Playwright launches it via channel="chrome".

# LLM backend (Ollama)
ollama pull llama3.2:3b
ollama serve
```


## Run

```bash
uv run python agent-workshop/01/model.py
uv run python agent-workshop/02/tools.py
uv run python agent-workshop/03/loop.py
uv run python agent-workshop/04/guardrail.py
uv run python agent-workshop/05/verify.py
```
