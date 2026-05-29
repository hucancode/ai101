# AI Foundation

| # | Topic | Idea |
|---|---|---|
| 01 | embeddings | cosine sim -> zero-shot classification on `ag_news` |
| 02 | semantic search | embed corpus, top-k query |
| 03 | backprop | 2-layer MLP next-char LM on names, manual chain rule |
| 04 | tokenization | BPE: text -> token ids |
| 05 | smt / constraint | Z3 solver, cryptarithmetic puzzle |
| 06 | proof reasoning | Z3 theorem prover: modus ponens, De Morgan, FOL |

## Setup
```bash
uv sync
ollama pull llama3.2:1b
```

## Run

```bash
uv run 01/embedding.py
# same for other lessons
```
