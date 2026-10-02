# LIF modules again, with random FIFO stalls on both sides (empty_n / full_n gated by an LFSR): the results must not change.
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen_tb_lif as G
idx = json.load(open(os.path.join(HERE, "sim", "vec", "index.json")))
res = []
for c in idx["cases"]:
    if c["label"] not in ("b8", "s1", "s40"):
        continue
    rc, so, se = G.run(c["mod"], c["label"], c["calls"], c["n"], True)
    out = subprocess.run(["node", os.path.join(HERE, "compare_lif.js"), c["mod"], c["label"], c["label"] + "_stall"], capture_output=True, text=True, encoding="utf-8").stdout.strip()
    try:
        r = json.loads(out)
    except Exception:
        r = {"mod": c["mod"], "label": c["label"], "error": (out or so)[-300:]}
    res.append(r); print(json.dumps(r), flush=True)
json.dump(res, open(os.path.join(HERE, "sim", "lif_stall_results.json"), "w"))
print("done", len(res))
