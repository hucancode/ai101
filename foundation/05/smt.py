from z3 import Int, Bool, Solver, Distinct, And, Or, Implies, Abs, If, sat

def cryptarithmetic():
    s, e, n, d, m, o, r, y = [Int(c) for c in "sendmory"]
    ds = [s, e, n, d, m, o, r, y]
    z = Solver()
    z.add(Distinct(ds), *[And(v >= 0, v <= 9) for v in ds], s != 0, m != 0)
    z.add(1000*s+100*e+10*n+d + 1000*m+100*o+10*r+e == 10000*m+1000*o+100*n+10*e+y)
    z.check()
    m_ = z.model()
    print("SEND + MORE = MONEY ->", "".join(str(m_[v]) for v in ds))

def n_queens(n=8):
    q = [Int(f"q{i}") for i in range(n)]
    z = Solver()
    for i in range(n):
        z.add(q[i] >= 0, q[i] < n)
    z.add(Distinct(q))
    for i in range(n):
        for j in range(i+1, n):
            z.add(Abs(q[i] - q[j]) != j - i)
    z.check()
    m = z.model()
    cols = [m[v].as_long() for v in q]
    print(f"{n}-queens cols:", cols)
    for r in range(n):
        print("  " + "".join("Q" if cols[r] == c else "." for c in range(n)))

def graph_coloring():
    # vertices A-E, edges form a small graph; color with 3 colors {0,1,2}
    edges = [("A","B"),("A","C"),("B","C"),("B","D"),("C","D"),("D","E")]
    V = {v: Int(v) for v in "ABCDE"}
    z = Solver()
    for v in V.values():
        z.add(v >= 0, v <= 2)
    for u, w in edges:
        z.add(V[u] != V[w])
    z.check()
    m = z.model()
    print("3-coloring:", {v: m[V[v]].as_long() for v in V})

def scheduling():
    # 3 jobs with durations, must finish by deadline 10, no two overlap on 1 machine
    durs = [3, 4, 2]
    start = [Int(f"s{i}") for i in range(3)]
    z = Solver()
    for i, d in enumerate(durs):
        z.add(start[i] >= 0, start[i] + d <= 10)
    for i in range(3):
        for j in range(i+1, 3):
            z.add(Or(start[i] + durs[i] <= start[j], start[j] + durs[j] <= start[i]))
    z.check()
    m = z.model()
    print("schedule:", [(m[start[i]].as_long(), m[start[i]].as_long() + durs[i]) for i in range(3)])

for fn in [cryptarithmetic, n_queens, graph_coloring, scheduling]:
    print(f"\n=== {fn.__name__} ===")
    fn()
