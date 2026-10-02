# -*- coding: utf-8 -*-
"""Assemble the micro-architecture page: qcsnn_micro_arch.html (standalone) from the body, scripts and extracted data."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
WT = os.path.normpath(os.path.join(HERE, ".."))
sys.path.insert(0, WT)
from assets.assemble import assemble

def load(n):
    return json.load(open(os.path.join(HERE, n), encoding="utf-8"))

MD = load("micro_data.json")
MD["ex"] = load("micro_examples.json")
MD["checks"] = load("micro_checks.json")
scripts = [os.path.join(HERE, f) for f in ("micro_core.js", "micro_lif.js", "micro_conv.js", "micro_verify.js") if os.path.exists(os.path.join(HERE, f))]
page = assemble(
    title="QCSNN 微架构", description="LIF 神经元与卷积引擎在 FPGA 里的实现：生成的 RTL、综合报告和 xsim 仿真",
    body=open(os.path.join(HERE, "micro_body.html"), encoding="utf-8").read(), scripts=scripts, data={}, values={"MD": MD})
out = os.path.join(WT, "qcsnn_micro_arch.html")
open(out, "w", encoding="utf-8").write(page)
print("wrote", out, len(page) // 1024, "KB")
