#!/usr/bin/python

from sentence_transformers import SentenceTransformer, util

# 1. Load a lightweight, state-of-the-art embedding model
# 'all-MiniLM-L6-v2' is highly efficient and optimized for semantic search
model = SentenceTransformer('all-MiniLM-L6-v2')

# 2. Define your two pieces of text
text1 = "Artificial intelligence will transform the future of medicine."
text2 = "Machine learning models are changing healthcare diagnostics."

# 3. Generate the vector embeddings for both texts
# convert_to_tensor=True lets the library use PyTorch arrays for rapid math
embedding1 = model.encode(text1, convert_to_tensor=True)
embedding2 = model.encode(text2, convert_to_tensor=True)

# 4. Calculate the Cosine Similarity
similarity_score = util.cos_sim(embedding1, embedding2)

# 5. Extract the scalar score from the tensor array object
score_value = similarity_score.item()

print(f"Text 1: {text1}")
print(f"Text 2: {text2}")
print(f"Cosine Similarity Score: {score_value:.4f}")

