from z3 import Bool, Int, Implies, And, Or, Not, ForAll, Solver, unsat

def prove(claim, label):
    s = Solver()
    s.add(Not(claim))
    r = s.check()
    print(f"{label}: {'PROVED' if r == unsat else 'DISPROVED'}")

# propositional: modus ponens  (a -> b) /\ a  =>  b
a, b = Bool("a"), Bool("b")
prove(Implies(And(Implies(a, b), a), b), "modus ponens")

# propositional: De Morgan  not(a /\ b) <-> (not a) \/ (not b)
prove((Not(And(a, b))) == Or(Not(a), Not(b)), "De Morgan")

# first-order: forall x. x + 0 == x
x = Int("x")
prove(ForAll([x], x + 0 == x), "additive identity")

# first-order: forall x y. x + y == y + x
y = Int("y")
prove(ForAll([x, y], x + y == y + x), "commutativity")

# false claim → disproved
prove(ForAll([x, y], x * y == x + y), "x*y == x+y (false)")
