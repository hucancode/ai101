import numpy as np
from datasets import load_from_disk
from sentence_transformers import SentenceTransformer, util

model = SentenceTransformer("all-MiniLM-L6-v2")

# 1. raw cosine similarity — close meaning = high score
texts = [
    "AI will transform medicine.",
    "ML changes healthcare diagnostics.",
    "I had pizza for lunch.",
]
emb = model.encode(texts, convert_to_tensor=True)
sim = util.cos_sim(emb, emb)
print("pairwise cosine:")
for i, a in enumerate(texts):
    for j, b in enumerate(texts):
        if i < j:
            print(f"  {sim[i][j].item():+.3f}  {a!r} <-> {b!r}")

# 2. zero-shot classification — nearest label embedding wins
ds = load_from_disk("foundation/data/ag_news")["test"].select(range(200))
labels = ["World", "Sports", "Business", "Sci/Tech"]
gold = np.array(ds["label"])

label_emb = model.encode(labels, convert_to_tensor=True)
text_emb  = model.encode(ds["text"], convert_to_tensor=True)
pred = util.cos_sim(text_emb, label_emb).argmax(dim=1).cpu().numpy()

print(f"\nzero-shot accuracy: {(pred == gold).mean():.3f}  (n={len(gold)})")
for i, name in enumerate(labels):
    mask = gold == i
    if mask.any():
        print(f"  {name:10s} n={mask.sum():3d} acc={(pred[mask] == gold[mask]).mean():.3f}")
