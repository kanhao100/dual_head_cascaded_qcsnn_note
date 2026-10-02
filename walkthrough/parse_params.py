# -*- coding: utf-8 -*-
"""Parse the kernel's constant headers (weights_sd/*.h) into params.json.
The headers are plain C arrays/scalars, so a small regex parser is enough; parse_params_check.cpp prints checksums
of the very same arrays from C++ and check_params.py compares them (M2 gate)."""
import glob, json, os, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
W = (HERE.parent / "csnn_cpp/include/hls4csnn1d_sd/model24/weights_sd").as_posix() + "/"
ARR = re.compile(r"const\s+[A-Za-z0-9_:<> ]+?\s+(\w+)((?:\[\d+\])+)\s*=\s*\{(.*?)\};", re.S)
SCL = re.compile(r"const\s+(?:int|float|ap_int<\d+>|acc32_t|ap_int8_c)\s+(\w+)\s*=\s*(-?[0-9.]+)f?\s*;")
NUM = re.compile(r"-?\d+\.?\d*(?:e[-+]?\d+)?f?", re.I)

arrays, scalars = {}, {}
for f in sorted(glob.glob(W + "*.h")):
    t = re.sub(r"//.*", "", open(f, encoding="utf-8").read())
    for m in ARR.finditer(t):
        dims = [int(x) for x in re.findall(r"\[(\d+)\]", m.group(2))]
        vals = [float(v.rstrip("fF")) if any(c in v for c in ".eE") else int(v) for v in NUM.findall(m.group(3))]
        n = 1
        for d in dims: n *= d
        assert len(vals) == n, (m.group(1), dims, len(vals))
        arrays[m.group(1)] = dict(dims=dims, vals=vals)
    for m in SCL.finditer(t):
        v = m.group(2)
        scalars[m.group(1)] = float(v) if "." in v else int(v)

def A(n): return arrays[n]["vals"]
def S(n): return scalars[n]

def conv(blk):
    p = "qcsnet24_%s_qconv1d_" % blk
    oc, ic, k = S(p + "OUT_CH"), S(p + "IN_CH"), S(p + "KERNEL_SIZE")
    assert arrays[p + "weights"]["dims"] == [oc, ic, k]
    return dict(oc=oc, ic=ic, k=k, stride=S(p + "STRIDE"), weights=A(p + "weights"), mult=A(p + "scale_multiplier"),
                shift=A(p + "right_shift"), bias=A(p + "bias"), weight_sum=A(p + "weight_sum"), zp=S(p + "input_zero_point"))
def bn(blk):
    p = "qcsnet24_%s_batch_norm_" % blk
    return dict(c=S(p + "C"), weight=A(p + "weight"), bias=A(p + "bias"), mult=A(p + "scale_multiplier"), shift=A(p + "right_shift"))
def lif(pref, name):
    p = "%s_%s_leaky_" % (pref, name)
    return dict(beta=S(p + "beta_int"), theta=S(p + "theta_int"), scale=S(p + "scale_int"), frac_bits=12)
def fc(pref, name):
    p = "%s_%s_qlinear_" % (pref, name)
    out, inn = S(p + "OUTPUT_SIZE"), S(p + "INPUT_SIZE")
    assert arrays[p + "weights"]["dims"] == [out, inn]
    return dict(out=out, inn=inn, weights=A(p + "weights"), mult=A(p + "scale_multiplier"), shift=A(p + "right_shift"),
                bias=A(p + "bias"), weight_sum=A(p + "weight_sum"), zp=S(p + "input_zero_point"))

P = dict(
    frac_bits=12, num_steps=10, signal_len=180, rr_dim=4,
    input_scale_f32=S("qcsnet24_cblk1_input_scale"),
    rr=dict(mean=A("RR_MEAN"), std=A("RR_STD"), std_inv=A("RR_STD_INV")),
    blocks=[dict(name=b, conv=conv(b), bn=bn(b), lif=lif("qcsnet24", b),
                 qi_scale=(S("qcsnet24_%s_input_act_scale_int" % b) if b != "cblk1" else None)) for b in ("cblk1", "cblk2", "cblk3")],
    bin=dict(qi_scale=S("qcsnet2_lblk1_input_act_scale_int"), fc=fc("qcsnet2", "lblk1"), lif=lif("qcsnet2", "lblk1")),
    multi=dict(qi1_scale=S("qcsnet4_lblk1_input_act_scale_int"), fc1=fc("qcsnet4", "lblk1"), lif1=lif("qcsnet4", "lblk1"),
               qi2_scale=S("qcsnet4_lblk2_input_act_scale_int"), fc2=fc("qcsnet4", "lblk2"), lif2=lif("qcsnet4", "lblk2")),
)
# scalar cross-checks against the dimension constants used by the kernel
assert P["bin"]["fc"]["inn"] == 484 and P["multi"]["fc1"]["inn"] == 484 and P["multi"]["fc1"]["out"] == 128 and P["multi"]["fc2"]["out"] == 4
json.dump(P, open(HERE / "params.json", "w"), separators=(",", ":"))
# list of (name, dims, sum, weighted checksum) for the C++ cross-check
chk = {n: dict(dims=a["dims"], sum=sum(a["vals"]), wsum=sum((i + 1) * v for i, v in enumerate(a["vals"]))) for n, a in arrays.items() if all(isinstance(v, int) for v in a["vals"])}
json.dump(chk, open(HERE / "params_checksums_py.json", "w"), indent=0)
print("arrays: %d  scalars: %d  int arrays checksummed: %d" % (len(arrays), len(scalars), len(chk)))
print("params.json: %d KB" % ((HERE / "params.json").stat().st_size // 1024))
