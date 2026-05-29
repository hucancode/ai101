import numpy as np

# Baby language model: 2-layer MLP predicts next character from previous 3.
# Manual backprop, no autograd. Same shape as Bengio 2003 / Karpathy makemore.
names = ["emma","olivia","ava","sophia","mia","amelia","luna","aria",
         "ella","leo","liam","noah","lucas","ethan","mason","logan",
         "ryan","ben","max","kai","zoe","ivy","nora","owen"]

chars = ["."] + sorted(set("".join(names)))
c2i = {c: i for i, c in enumerate(chars)}
i2c = {i: c for c, i in c2i.items()}
V, N = len(chars), 3

X, Y = [], []
for w in names:
    ctx = [0] * N
    for ch in w + ".":
        X.append(ctx)
        Y.append(c2i[ch])
        ctx = ctx[1:] + [c2i[ch]]
X, Y = np.array(X), np.array(Y)
B = len(X)

rng = np.random.default_rng(0)
E, H = 8, 64
C  = rng.standard_normal((V, E))   * 0.1
W1 = rng.standard_normal((N*E, H)) * 0.1
b1 = np.zeros(H)
W2 = rng.standard_normal((H, V))   * 0.1
b2 = np.zeros(V)

def softmax(z):
    z = z - z.max(1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(1, keepdims=True)

lr = 0.3
for step in range(4000):
    # forward
    emb = C[X].reshape(B, N*E)
    h = np.tanh(emb @ W1 + b1)
    logits = h @ W2 + b2
    p = softmax(logits)
    loss = -np.log(p[np.arange(B), Y] + 1e-12).mean()

    # backward (hand-derived chain rule)
    dlogits = p
    dlogits[np.arange(B), Y] -= 1
    dlogits /= B
    dW2 = h.T @ dlogits
    db2 = dlogits.sum(0)
    dh  = dlogits @ W2.T
    dz1 = dh * (1 - h*h)
    dW1 = emb.T @ dz1
    db1 = dz1.sum(0)
    demb = (dz1 @ W1.T).reshape(B, N, E)
    dC = np.zeros_like(C)
    np.add.at(dC, X.reshape(-1), demb.reshape(-1, E))

    C  -= lr * dC
    W1 -= lr * dW1; b1 -= lr * db1
    W2 -= lr * dW2; b2 -= lr * db2

    if step % 500 == 0:
        print(f"step {step:4d}  loss {loss:.4f}")

# sample new names from trained model
print("\ngenerated names:")
for _ in range(10):
    ctx, out = [0]*N, ""
    while True:
        emb = C[ctx].reshape(1, N*E)
        h = np.tanh(emb @ W1 + b1)
        p = softmax(h @ W2 + b2)[0]
        nxt = rng.choice(V, p=p)
        if nxt == 0:
            break
        out += i2c[nxt]
        ctx = ctx[1:] + [nxt]
    print(f"  {out}")
