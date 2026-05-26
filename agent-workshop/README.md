# Agent Loop from First Principles

## Setup

```bash
uv sync
uv run playwright install chromium
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
