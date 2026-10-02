# -*- coding: utf-8 -*-
"""Build (1) the tensor-level verification subset (incl. the 24 beats shown on the page) from the verification set and
(2) a stress set of synthetic INT8 input words (edge cases + random). Both are written as raw 188-byte words files that
feed golden_top / golden_layers directly."""
import json, random
from pathlib import Path
import numpy as np

D = (Path(__file__).resolve().parent / "data").as_posix() + "/"
words = np.fromfile(D + "words_verify.bin", dtype=np.int8).reshape(-1, 188)
meta = json.load(open(D + "verify_meta.json"))
labels = np.array([m["label"] for m in meta])
p = np.loadtxt(D + "preds_top.txt", dtype=int)
final = np.where(p[:, 0] == 1, p[:, 1], 0)
rng = random.Random(7)
CL = ["normal", "sveb", "veb", "f"]

show = []
for c in range(4):
    idx = [i for i in range(len(labels)) if labels[i] == c]
    wrong = [i for i in idx if final[i] != c]
    right = [i for i in idx if final[i] == c]
    pick = rng.sample(wrong, min(2, len(wrong)))
    seen = {meta[i]["record"] for i in pick}
    rng.shuffle(right)
    for i in right:                      # prefer different records for variety
        if len(pick) >= 6: break
        if meta[i]["record"] not in seen: pick.append(i); seen.add(meta[i]["record"])
    for i in right:
        if len(pick) >= 6: break
        if i not in pick: pick.append(i)
    show += pick
rest = [i for i in range(len(labels)) if i not in set(show)]
extra = []
for c in range(4):
    cand = [i for i in rest if labels[i] == c]
    extra += rng.sample(cand, 44)
sel = show + extra
assert len(sel) == 200 and len(set(sel)) == 200
words[sel].tofile(D + "words_tensor.bin")
json.dump(dict(indices=sel, show=list(range(24)), note="first 24 entries are the beats shown on the page"), open(D + "tensor_subset.json", "w"))
print("tensor subset: 200 beats; show beats per class:", [sum(1 for i in show if labels[i] == c) for c in range(4)],
      "| show beats misclassified:", int(sum(final[i] != labels[i] for i in show)))

# ---------------------------------------------------------------- stress words
r = np.random.RandomState(20260930)
S = []
def word(sig, rr1=None, rr2=None):
    w = np.zeros(188, dtype=np.int8); w[:180] = np.asarray(sig, dtype=np.int64).clip(-128, 127)
    w[180:184] = np.zeros(4) if rr1 is None else rr1; w[184:188] = np.zeros(4) if rr2 is None else rr2
    return w
S.append(word(np.zeros(180)))
S.append(word(np.full(180, 127), np.full(4, 127), np.full(4, 127)))
S.append(word(np.full(180, -128), np.full(4, -128), np.full(4, -128)))
S.append(word(np.where(np.arange(180) % 2 == 0, 127, -128), np.array([127, -128, 127, -128]), np.array([-128, 127, -128, 127])))
S.append(word((np.arange(180) * 256 // 180) - 128, np.array([-128, -42, 42, 127]), np.array([127, 42, -42, -128])))
imp = np.zeros(180); imp[90] = 127; S.append(word(imp))
for _ in range(60): S.append(word(r.randint(-128, 128, 180), r.randint(-128, 128, 4), r.randint(-128, 128, 4)))
for _ in range(30): S.append(word(r.randint(-40, 41, 180), r.randint(-60, 61, 4), r.randint(-60, 61, 4)))
for _ in range(30): S.append(word(np.round(r.normal(0, 25, 180)), r.randint(-128, 128, 4), r.randint(-128, 128, 4)))
S = np.stack(S); assert S.shape == (126, 188)
S.tofile(D + "words_stress.bin")
print("stress words:", S.shape[0])
