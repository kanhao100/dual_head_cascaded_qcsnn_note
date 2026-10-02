# Run every exported LIF module-case through xsim and compare with the verified model.
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen_tb_lif as G
idx = json.load(open(os.path.join(HERE, "sim", "vec", "index.json")))
res = []
for c in idx["cases"]:
    rc, so, se = G.run(c["mod"], c["label"], c["calls"], c["n"])
    out = subprocess.run(["node", os.path.join(HERE, "compare_lif.js"), c["mod"], c["label"]], capture_output=True, text=True, encoding="utf-8").stdout.strip()
    try:
        r = json.loads(out)
    except Exception:
        r = {"mod": c["mod"], "label": c["label"], "error": out[-200:] or so[-300:]}
    res.append(r); print(json.dumps(r), flush=True)
json.dump(res, open(os.path.join(HERE, "sim", "lif_results.json"), "w"))
print("done", len(res))
