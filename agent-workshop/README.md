# Agent Loop from First Principles

## Setup

```bash
uv sync
cd robot-arm && npm install
```

## Run

On lesson 3 onward, we need to start `robot-arm` server

```bash
cd robot-arm && npm run dev

```

```bash
uv run agent-workshop/01/model.py
uv run agent-workshop/02/tools.py
uv run agent-workshop/03/loop.py
uv run agent-workshop/04/guardrail.py
uv run agent-workshop/05/verify.py
```

Promising model on Bedrock to try on

```
us.amazon.nova-lite-v1:0
us.amazon.nova-pro-v1:0
us.anthropic.claude-haiku-4-5-20251001-v1:0
us.anthropic.claude-sonnet-4-6
```
