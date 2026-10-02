# -*- coding: utf-8 -*-
"""Collect the facts the micro-architecture page states, straight from the generated RTL, the csynth reports, the exported
parameters and the xsim runs.  Everything the page shows as a number traces back to a file and a line recorded here.

usage: python extract_micro.py   ->  micro_data.json
"""
import collections, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
WT = os.path.normpath(os.path.join(HERE, ".."))
HLS = os.path.normpath(os.path.join(WT, "..", "hls", "work_csynth", "hls", "syn"))
RTL = os.path.join(HLS, "verilog")
RPT = os.path.join(HLS, "report")
SIM = os.path.join(HERE, "sim")
REL = lambda p: os.path.relpath(p, os.path.join(WT, "..")).replace("\\", "/")


def rd(p):
    return open(p, encoding="utf-8", errors="ignore").read()


def line_of(src, pat, nth=0):
    hits = [i + 1 for i, l in enumerate(src.split("\n")) if re.search(pat, l)]
    return hits[nth] if len(hits) > nth else None


def instances(src):
    out = []
    for m in re.finditer(r"(?:\(\*[^*]*\*\)\s*)?topFunction_(\w+)\s+#\(\s*(.*?)\)\s*(\w+)\(", src, re.S):
        typ, params, name = m.groups()
        ns = re.search(r"\.NUM_STAGE\(\s*(\d+)\s*\)", params)
        w = [int(x) for x in re.findall(r"\.(?:din\d|dout)_WIDTH\(\s*(\d+)\s*\)", params)]
        out.append(dict(type=typ, name=name, stages=int(ns.group(1)) if ns else None, widths=w))
    return out


def csynth_total(mod):
    t = rd(os.path.join(RPT, f"{mod}_csynth.rpt"))
    m = re.search(r"^\|Total\s*\|\s*(\d+)\|\s*(\d+)\|\s*(\d+)\|\s*(\d+)\|\s*(\d+)\|", t, re.M)
    lat = re.search(r"\|\s*(\d+)\|\s*(\d+)\|\s*[\d.]+ (?:us|ns)\|", t)
    loop = re.search(r"\|- (\S+)\s*\|\s*(\d+)\|\s*(\d+)\|\s*(\d+)\|\s*(\d+)\|\s*(\d+)\|\s*(\d+)\|\s*(\w+)\|", t)
    clk = re.search(r"\|ap_clk\s*\|\s*[\d.]+ ns\|\s*([\d.]+) ns\|", t)
    d = dict(BRAM=int(m.group(1)), DSP=int(m.group(2)), FF=int(m.group(3)), LUT=int(m.group(4))) if m else {}
    if lat:
        d["latency"] = int(lat.group(1))
    if loop:
        d["loop"] = loop.group(1); d["iterLatency"] = int(loop.group(4)); d["ii"] = int(loop.group(5)); d["trip"] = int(loop.group(6))
    if clk:
        d["estClk"] = float(clk.group(1))
    return d


def ops_of(micro, st):
    f = micro.get("opFields")
    return [dict(zip(f, o)) if isinstance(o, list) else o for o in st["ops"]]


def s24(v):
    return v - (1 << 24) if v >= (1 << 23) else v


# ----------------------------------------------------------------------------------------------- LIF
LIFS = [("lif1", "forward_11", "LIF1", 16, 178, "trunk_lif1"), ("lif2", "forward_10", "LIF2", 16, 87, "trunk_lif2"), ("lif3", "forward_8", "LIF3", 24, 41, "trunk_lif3"),
        ("lifBin", "forward_9", "二分类 LIF", 2, 1, "bin_lif"), ("lif4a", "forward_12", "4 分类 LIF 隐藏层", 128, 1, "multi_lif1"), ("lif4b", "forward_7", "4 分类 LIF 输出层", 4, 1, "multi_lif2")]
K = json.load(open(os.path.join(WT, "kernel.json"), encoding="utf-8"))
K.update(json.load(open(os.path.join(WT, "hardware.json"), encoding="utf-8")))
layers = {l["key"]: l for l in K["hardware"]["layers"]}
P = json.load(open(os.path.join(WT, "params.json"), encoding="utf-8"))
lifpar = {"lif1": P["blocks"][0]["lif"], "lif2": P["blocks"][1]["lif"], "lif3": P["blocks"][2]["lif"], "lifBin": P["bin"]["lif"], "lif4a": P["multi"]["lif1"], "lif4b": P["multi"]["lif2"]}
mem_rpt = rd(os.path.join(RPT, "forward_4_csynth.rpt"))


def lif_facts(key, mod, name, ch, ln, bank):
    f = os.path.join(RTL, f"topFunction_{mod}.v")
    src = rd(f)
    inst = instances(src)
    par = lifpar[key]
    d = dict(key=key, mod=mod, name=name, channels=ch, length=ln, neurons=ch * ln, file=REL(f), exported=dict(beta=par["beta"], theta=par["theta"], scale=par["scale"]))
    d["instances"] = [dict(type=i["type"], stages=i["stages"], widths=i["widths"]) for i in inst if re.match(r"(mul|mac|am_)", i["type"])]
    # compare constants: first 24-bit signed compare against a constant is the threshold
    th = re.search(r"\$signed\(24'd(\d+)\)", src)
    d["thetaRtl"] = s24(int(th.group(1))) if th else None
    beta = re.search(r"assign prod_b_fu_\d+_p1 = \d+'d(\d+);", src)
    d["betaMulConst"] = int(beta.group(1)) if beta else None
    d["betaShift"] = bool(re.search(r"assign prod_b_fu_\d+_p3 = \{\{v_prev_q_reg_\d+\}, \{12'd0\}\};", src))
    sc = re.search(r"assign grp_fu_\d+_p1 = (\d+)'d(\d+);", src)
    scale_mac = [m for m in re.finditer(r"mac_muladd_(\w+)_U", src)]
    d["scaleConst"] = int(sc.group(2)) if sc else None
    shifts = re.findall(r"assign tmp_\d+_fu_\d+_p3 = \{\{qi_reg_\d+\}, \{(\d+)'d0\}\};", src)
    d["scaleShifts"] = sorted({len(x) and int(re.match(r"(\d+)", x).group(1)) for x in shifts}) if shifts else []
    d["scaleShiftBits"] = [int(x) for x in re.findall(r"\{qi_reg_\d+\}, \{(\d+)'d0\}", src)]
    ra = re.search(r"icmp_ln74\w*(?:\[0:0\])? == 1'b1\) \? (\d+)'d(\d+) : \d+'d0\)", src)
    d["resetAddend"] = dict(width=int(ra.group(1)), raw=int(ra.group(2))) if ra else None
    if d["resetAddend"]:
        w, raw = d["resetAddend"]["width"], d["resetAddend"]["raw"]
        d["resetAddend"]["signed"] = raw - (1 << w) if raw >= (1 << (w - 1)) else raw
    am = re.search(r"assign grp_fu_\d+_p0 = (\d+)'d(\d+);", src)
    d["addrMulConst"] = int(am.group(2)) if am else None
    d["hasAddressMac"] = any(i["type"].startswith("mac_muladd") and i["widths"][1:2] and i["widths"][1] == 5 for i in inst) or bool(am)
    d["iterEnableRegs"] = len(set(re.findall(r"reg\s+ap_enable_reg_pp0_iter(\d+);", src)))
    d["hls"] = csynth_total(f"topTunction_{mod}".replace("topTunction_", "")) if False else csynth_total(mod)
    d["routed"] = (layers[key].get("routed") or {}) and {k: layers[key]["routed"].get(k) for k in ("DSP", "LUT", "FF", "BRAM")}
    d["refs"] = [dict(label=l, line=line_of(src, p)) for l, p in [
        ("v_prev 选 bank 的多路选择", r"assign v_prev_q_fu_\d+_p3 = "), ("V0 写使能(rd_reg==0)", r"\(rd_reg_\d+ == 1'd0\) & \(ap_enable_reg_pp0_iter\d+ == 1'b1\)"), ("V1 写使能(rd_reg==1)", r"\(rd_reg_\d+ == 1'd1\) & \(ap_enable_reg_pp0_iter\d+ == 1'b1\)"),
        ("bank 翻转 (wr = ~bank_i)", r"assign wr_fu_\d+_p2 = "), ("阈值比较（v_prev）", r"assign icmp_ln74_fu_\d+_p2 = "), ("阈值比较（v_next → 脉冲）", r"assign spk_fu_\d+_p2 = "), ("v_next = v_beta + x_q'", r"assign v_next_q_fu_\d+_p2 = "),
        ("v_beta = 取 [..:12] 位", r"assign v_beta_q_fu_\d+_p[345] = "), ("取整偏置 ±2048", r"assign select_ln78_fu_\d+_p3 = "), ("复位加数选择", r"grp_fu_\d+_p20 = \(\(icmp_ln74"), ("写回地址（延迟寄存器）", r"assign \w+_V0_address0 = "), ("读地址", r"assign \w+_V0_address1 = ")]]
    d["refs"] = [r for r in d["refs"] if r["line"]]
    # membrane RAMs from the parent's report
    rams = []
    for m in re.finditer(r"\|(\S*%s_V[01]\w*_U)\s*\|(\S+)\s*\|\s*(\d+)\|\s*(\d+)\|\s*(\d+)\|\s*(\d+)\|\s*(\d+)\|\s*(\d+)\|\s*(\d+)\|\s*(\d+)\|" % bank, mem_rpt):
        rams.append(dict(name=m.group(1), bram=int(m.group(3)), words=int(m.group(7)), bits=int(m.group(8)), totalBits=int(m.group(10))))
    d["rams"] = rams
    lop = [l for l in K["macro"]["stage1"] + K["macro"]["stage2"] if l["tag"].startswith(mod)] if "macro" in K else []
    micro = K["micro"].get(mod)
    if micro:
        d["stages"] = []
        for st in micro["stages"]:
            c = collections.Counter()
            for o in ops_of(micro, st):
                c[f"{o['opcode']}:{o['binding']}"] += o.get("count", 1) or 1
            d["stages"].append(dict(state=st["state"], index=st["index"], ops=dict(c)))
        d["depth"] = micro["depth"]; d["trip"] = micro["trip"]; d["ii"] = micro["ii"]; d["latency"] = micro["latency"]
    return d


lif = [lif_facts(*x) for x in LIFS]

# ----------------------------------------------------------------------------------------------- conv
SM = re.compile(r"topFunction_sparsemux_(\d+)_(\d+)_(\d+)_1_1(_x)?\s+#\(.*?\)\s*(\w+)\(\s*((?:\.din\d+\([^)]*\),\s*)+)\.def\([^)]*\),\s*\.sel\((\w+)\)", re.S)


def conv_facts(label, par, bi, mod_load, mod_comp, ic, oc, inlen, outlen):
    cf = os.path.join(RTL, f"topFunction_{mod_comp}.v")
    lf = os.path.join(RTL, f"topFunction_{mod_load}.v")
    src, lsrc = rd(cf), rd(lf)
    rpt = rd(os.path.join(RPT, f"{mod_comp}_csynth.rpt"))
    insts = collections.Counter(); lut = collections.Counter(); dsp = collections.Counter()
    for m in re.finditer(r"^\s*\|(\S+_U\d+)\s*\|(\S+)\s*\|\s*(\d+)\|\s*(\d+)\|\s*(\d+)\|\s*(\d+)\|\s*(\d+)\|", rpt, re.M):
        insts[m.group(2)] += 1; dsp[m.group(2)] += int(m.group(4)); lut[m.group(2)] += int(m.group(6))
    cat = lambda pat: sum(n for k, n in insts.items() if re.match(pat, k))
    lcat = lambda pat: sum(n for k, n in lut.items() if re.match(pat, k))
    d = dict(label=label, ic=ic, oc=oc, inLen=inlen, outLen=outlen, compFile=REL(cf), loadFile=REL(lf), hls=csynth_total(mod_comp), hlsLoad=csynth_total(mod_load))
    d["instances"] = dict(macDsp=cat(r"mac_muladd|am_addmul") if False else len(re.findall(r"^topFunction_mac_muladd", src, re.M)), amAddmul=len(re.findall(r"^topFunction_am_addmul", src, re.M)), lutMul8=cat(r"mul_8s_[78]s"), lutMulAddr=cat(r"mul_\d+ns_\d+ns"), weightMux=cat(r"sparsemux_(33|49)_[45]_[78]_"), tableMux=cat(r"sparsemux_(33|49)_[45]_(6|3\d)_"), dataMux=cat(r"sparsemux_7_2_8_"), urem=cat(r"urem"), ownRequantMul=cat(r"mul_31ns"))
    d["lutBreakdown"] = dict(weightMux=lcat(r"sparsemux_(33|49)_[45]_[78]_"), tableMux=lcat(r"sparsemux_(33|49)_[45]_(6|3\d)_"), dataMux=lcat(r"sparsemux_7_2_8_"), lutMul=lcat(r"mul_8s_[78]s"), addr=lcat(r"mul_\d+ns_\d+ns|urem"), instanceTotal=sum(lut.values()))
    d["instanceTable"] = {k: dict(n=insts[k], lut=lut[k], dsp=dsp[k]) for k in sorted(insts)}
    util = {}
    for nm in ("DSP", "Expression", "Instance", "Multiplexer", "Register"):
        mm = re.search(r"^\|%s\s*\|([^\n]*)" % nm, rpt, re.M)
        if mm:
            cells = [c.strip() for c in mm.group(1).split("|")]
            num = lambda x: int(x) if x.isdigit() else 0
            util[nm] = dict(BRAM=num(cells[0]), DSP=num(cells[1]), FF=num(cells[2]), LUT=num(cells[3]))
    d["utilization"] = util
    sm = []
    for g in SM.finditer(src):
        _n, selw, dw, _x, nm_, ports, _sel = g.groups()
        sm.append((nm_, int(selw), int(dw), [int(v) for v in re.findall(r"\.din\d+\(\d+'d(\d+)\)", ports)]))
    conv = P["blocks"][bi]["conv"] if bi is not None else None
    if conv:
        W = conv["weights"]; k = conv["k"]
        cols = collections.Counter(tuple(W[(o * ic + q) * k + j] for o in range(oc)) for q in range(ic) for j in range(k))
        sgn = lambda v, b: v - (1 << b) if v >= (1 << (b - 1)) else v
        rt = collections.Counter(tuple(sgn(v, dw) for v in vals[:oc]) for n, selw, dw, vals in sm if dw in (7, 8) and len(vals) >= oc)
        d["weightTableCheck"] = dict(columns=ic * k, rtlTables=sum(rt.values()), identical=(cols == rt), widthHist={str(w): sum(1 for n, s, dw, v in sm if dw == w and len(v) >= oc) for w in (7, 8)})
        mt = [x for x in sm if x[2] >= 30]
        d["multTable"] = dict(rtlLow=mt[0][3][0] if mt else None, rtlBits=mt[0][2] if mt else None, exported=conv["mult"][0], allSame=len(set(conv["mult"])) == 1, topBitImplied=(mt and conv["mult"][0] == mt[0][3][0] + (1 << mt[0][2])))
        d["shiftExported"] = conv["shift"][0]; d["shiftAllSame"] = len(set(conv["shift"])) == 1
        d["weightRange"] = [min(W), max(W)]
        # per tap: the RTL table width (7 or 8 bits) and the 16/24 signed constants it holds
        pool = [(dw, tuple(sgn(v, dw) for v in vals[:oc])) for n, selw, dw, vals in sm if dw in (7, 8) and len(vals) >= oc]
        wc = []
        for q in range(ic):
            for j in range(k):
                col = tuple(W[(o * ic + q) * k + j] for o in range(oc))
                hit = next((x for x in pool if x[1] == col), None)
                if hit:
                    pool.remove(hit)
                wc.append(dict(ic=q, k=j, width=hit[0] if hit else None, vals=list(col)))
        d["weightCols"] = wc
        d["mult"] = list(conv["mult"]); d["shift"] = list(conv["shift"])
    d["ports"] = dict(sharedMul=bool(re.search(r"grp_fu_394_p_din0", src)))
    d["refs"] = [dict(label=l, line=line_of(src, p)) for l, p in [
        ("bank 地址按 w mod 3 选择", r"input_buffer_address0_local = zext_ln69_4"), ("w mod 3：11 级流水除法器", r"topFunction_urem_"), ("⌊w/3⌋ = w×171>>9", r"mul_ln59_fu_\d+_p1 = 15'd171"), ("乘积缩放（共享乘法器）", r"scaled_product_reg_\d+ <= grp_fu"),
        ("取整偏置 1<<(shift-1)", r"assign rounding_offset_fu"), ("加偏置", r"assign rounded_value_fu"), ("算术右移", r"assign value_fu_\d+_p2 = "), ("饱和：上溢", r"assign icmp_ln114_fu"), ("饱和：下溢", r"assign icmp_ln115_fu"), ("输出选择", r"assign s\d+_din = ")]]
    d["refs"] = [r for r in d["refs"] if r["line"]]
    micro = K["micro"].get(mod_comp)
    if micro:
        d["depth"] = micro["depth"]; d["trip"] = micro["trip"]; d["ii"] = micro["ii"]; d["latency"] = micro["latency"]
        d["stages"] = []
        for st in micro["stages"]:
            c = collections.Counter()
            for o in ops_of(micro, st):
                c[f"{o['opcode']}:{o['binding']}"] += o.get("count", 1) or 1
            d["stages"].append(dict(state=st["state"], index=st["index"], ops=dict(c)))
    lmic = K["micro"].get(mod_load)
    if lmic:
        d["load"] = dict(depth=lmic["depth"], trip=lmic["trip"], latency=lmic["latency"], ii=lmic["ii"])
    d["load"] = dict(d.get("load", {}), urem=bool(re.search(r"topFunction_urem", lsrc)), mul171=bool(re.search(r"15'd171|9'd171", lsrc)))
    ln = [l for l in K["hardware"]["layers"] if l["key"] == {"conv1": "conv1", "conv2": "conv2", "conv3": "conv3"}[label]]
    if ln:
        d["routed"] = {k: ln[0]["routed"].get(k) for k in ("DSP", "LUT", "FF", "BRAM")} if ln[0].get("routed") else None
    return d


conv = [conv_facts("conv2", "forward_14", 1, "forward_14_Pipeline_VITIS_LOOP_46_1_VITIS_LOOP_47_2", "forward_14_Pipeline_VITIS_LOOP_58_3_VITIS_LOOP_59_4", 16, 16, 89, 87),
        conv_facts("conv3", "forward_13", 2, "forward_13_Pipeline_VITIS_LOOP_46_1_VITIS_LOOP_47_2", "forward_13_Pipeline_VITIS_LOOP_58_3_VITIS_LOOP_59_4", 16, 24, 43, 41)]
# conv1 lives inside forward_4; its compute module has an own requant multiplier and 3 banks
c1 = conv_facts("conv1", "forward_4", 0, "forward_4_Pipeline_VITIS_LOOP_47_2", "forward_4_Pipeline_VITIS_LOOP_58_3_VITIS_LOOP_59_4", 1, 16, 180, 178)
conv = [c1] + conv

# ----------------------------------------------------------------------------------------------- simulation results + traces
def load_json(name):
    p = os.path.join(SIM, name)
    return json.load(open(p)) if os.path.exists(p) else None


def parse_trace(path, limit=None):
    rows = []
    if not os.path.exists(path):
        return rows
    for l in rd(path).split("\n"):
        if not l.strip():
            continue
        parts = l.split()
        r = {"cyc": int(parts[0])}
        for p in parts[1:]:
            if "=" in p:
                k, v = p.split("=", 1)
                r[k] = v
        rows.append(r)
        if limit and len(rows) >= limit:
            break
    return rows



def snippet(fname, ranges, hl=()):
    lines = rd(os.path.join(RTL, fname)).split(chr(10))
    out = []
    for lo, hi in ranges:
        for n in range(lo, hi + 1):
            out.append(dict(n=n, t=lines[n - 1], hl=n in hl))
        out.append(dict(n=None, t="..."))
    return out[:-1]


snippets = dict(
    lif1_rw=snippet("topFunction_forward_11.v", [(384, 389), (512, 518), (536, 542), (544, 550), (701, 703)], hl=(386, 387, 513, 537, 546, 701, 703)),
    lif1_reset=snippet("topFunction_forward_11.v", [(641, 645), (651, 651), (661, 661), (695, 699)], hl=(645, 661)),
    lif3_shift=snippet("topFunction_forward_8.v", [(599, 607), (617, 619), (649, 649)], hl=(607, 617, 619, 649)),
    conv_addr=snippet("topFunction_forward_14_Pipeline_VITIS_LOOP_58_3_VITIS_LOOP_59_4.v", [(8806, 8819)], hl=(8812, 8814, 8816)),
    conv_requant=snippet("topFunction_forward_14_Pipeline_VITIS_LOOP_58_3_VITIS_LOOP_59_4.v", [(8952, 8954), (9168, 9176), (9440, 9440)], hl=(8952, 8954, 9170, 9440)),
)
sim = dict(lif=load_json("lif_results.json"), lifStall=load_json("lif_stall_results.json"), conv=load_json("conv_results.json"))
traces = dict(lif1=parse_trace(os.path.join(SIM, "out", "forward_11_b8_trace.txt")), lif1Stall=parse_trace(os.path.join(SIM, "out", "forward_11_b8_stall_trace.txt")),
              conv2=parse_trace(os.path.join(SIM, "out", "forward_14_b8_trace.txt")), conv2Stall=parse_trace(os.path.join(SIM, "out", "forward_14_b8_stall_trace.txt")))
data = dict(lif=lif, conv=conv, sim=sim, traces=traces, snippets=snippets, device=dict(DSP=220, BRAM18K=280, LUT=53200, FF=106400),
            tool="Vitis HLS 2026.1", rtlDir=REL(RTL))
json.dump(data, open(os.path.join(HERE, "micro_data.json"), "w", encoding="utf-8"), ensure_ascii=False)
print("micro_data.json", os.path.getsize(os.path.join(HERE, "micro_data.json")) // 1024, "KB")
for x in lif:
    print(x["key"], "theta", x["thetaRtl"], "beta*", x["betaMulConst"], "betaShift", x["betaShift"], "scale", x["scaleConst"], x["scaleShiftBits"], "reset", x["resetAddend"], "addrMul", x["addrMulConst"], "dsp", x["hls"].get("DSP"), "rams", [(r["bram"], r["words"]) for r in x["rams"]])
for c in conv:
    print(c["label"], c["instances"], c.get("weightTableCheck"), c.get("multTable"), c["lutBreakdown"])
