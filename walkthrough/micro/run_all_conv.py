# Run every exported conv2 / conv3 case through xsim: normal, with garbage preloaded in the bank RAMs, and (subset) with random FIFO stalls.
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen_tb_conv as G
idx = json.load(open(os.path.join(HERE, "sim", "vec", "index.json")))
res = []
STALL_SET = {"b8", "b12", "s1", "s2", "s40"}
for c in idx["conv"]:
    for poison, stall in [(False, False), (True, False)] + ([(False, True)] if c["label"] in STALL_SET else []):
        if "--only" in sys.argv and (c["mod"], c["label"]) not in {("forward_14", "b8"), ("forward_13", "b8")}:
            continue
        ol = c["label"] + ("_poison" if poison else "") + ("_stall" if stall else "")
        rc, so, se = G.run(c["mod"], c["label"], c["nin"], c["nout"], c["steps"], poison, stall)
        out = subprocess.run(["node", os.path.join(HERE, "compare_conv.js"), c["mod"], c["label"], ol], capture_output=True, text=True, encoding="utf-8").stdout.strip()
        try:
            r = json.loads(out)
        except Exception:
            r = {"mod": c["mod"], "label": c["label"], "olabel": ol, "error": (out or so)[-300:]}
        r["poison"], r["stall"] = poison, stall
        res.append(r); print(json.dumps(r), flush=True)
json.dump(res, open(os.path.join(HERE, "sim", "conv_results.json"), "w"))
print("done", len(res))
