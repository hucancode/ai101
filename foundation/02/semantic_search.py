from sentence_transformers import SentenceTransformer, util

model = SentenceTransformer("all-MiniLM-L6-v2")
docs = [
    "Python is a high-level programming language.",
    "The mitochondria is the powerhouse of the cell.",
    "FastAPI is a modern Python web framework.",
    "Photosynthesis converts light to chemical energy.",
    "Rust prevents data races at compile time.",
    "DNA encodes genetic instructions.",
]
doc_emb = model.encode(docs, convert_to_tensor=True)

while q := input("query> ").strip():
    q_emb = model.encode(q, convert_to_tensor=True)
    scores = util.cos_sim(q_emb, doc_emb)[0]
    top = scores.topk(3)
    for s, i in zip(top.values, top.indices):
        print(f"  {s.item():.3f}  {docs[i]}")
