# -*- coding: utf-8 -*-
"""Pick the verification beats from the author-preprocessed TEST split (data/rr_dataset/test).
Each class gets ONE csv (one row per beat, 184 floats) so that FileReader (which reads rows in file order) keeps my order.
Output: data/verify/{normal,sveb,veb,f}/beats.csv  +  data/verify_meta.json (row -> record, centre, class)."""
import json, os, random
from pathlib import Path

ROOT = (Path(__file__).resolve().parent / "data").as_posix() + "/"
SRC = ROOT + "rr_dataset/test/"
OUT = ROOT + "verify/"
CLASSES = ["normal", "sveb", "veb", "f"]
TAKE = {"normal": 600, "sveb": 400, "veb": 400, "f": 10 ** 9}   # f: all of them (rare class)
rng = random.Random(20260930)

meta = []
for ci, c in enumerate(CLASSES):
    files = sorted(os.listdir(SRC + c))
    chosen = files if TAKE[c] >= len(files) else sorted(rng.sample(files, TAKE[c]))
    os.makedirs(OUT + c, exist_ok=True)
    with open(OUT + c + "/beats.csv", "w", newline="\n") as out:
        for fn in chosen:
            line = open(SRC + c + "/" + fn).read().strip()
            assert line.count(",") == 183, fn
            out.write(line + "\n")
            rec, cen = fn[:-4].split("_")
            meta.append(dict(cls=c, label=ci, record=rec, center=int(cen)))
    print("%-6s %5d of %5d" % (c, len(chosen), len(files)))
json.dump(meta, open(ROOT + "verify_meta.json", "w"))
print("total verification beats:", len(meta))
