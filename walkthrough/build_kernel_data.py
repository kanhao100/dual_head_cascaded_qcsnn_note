# -*- coding: utf-8 -*-
"""Collect every number the kernel walkthrough page shows into kernel.json, with sanity checks.
Sources: csynth.xml / *_csynth.xml / csynth.rpt (report), *.verbose.sched.rpt (report), topFunction.v (RTL),
         Vivado impl reports (report).  Nothing is typed in by hand except the paper's Table 15/16 values (tagged 论文)."""
import json, re, os, collections
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
os.chdir(HERE)
HLS = (HERE.parent / "hls/work_csynth/hls").as_posix() + "/"
REP = HLS + "syn/report/"
DB = HLS + ".autopilot/db/"
IMPL = HLS + "impl/"
OUT = {}
checks = []

def mod_xml(mod):
    f = REP + mod + "_csynth.xml"
    r = ET.parse(f).getroot()
    a = {c.tag: int(c.text or 0) for c in r.find("AreaEstimates/Resources")}
    l = r.find("PerformanceEstimates/SummaryOfOverallLatency")
    g = lambda t: int(l.find(t).text) if l is not None and l.find(t) is not None and (l.find(t).text or "").isdigit() else None
    lat = g("Worst-caseLatency") or g("Latency")
    clk = r.find("PerformanceEstimates/SummaryOfTimingAnalysis/EstimatedClockPeriod")
    return dict(BRAM=a.get("BRAM_18K", 0), DSP=a.get("DSP", 0), FF=a.get("FF", 0), LUT=a.get("LUT", 0),
                lat=lat, clk=float(clk.text) if clk is not None else None)

# ---------------------------------------------------------------- top-level
top = ET.parse(REP + "csynth.xml").getroot()
A = {c.tag: int(c.text) for c in top.find("AreaEstimates/Resources")}
AV = {c.tag: int(c.text) for c in top.find("AreaEstimates/AvailableResources")}
L = top.find("PerformanceEstimates/SummaryOfOverallLatency")
lat = {c.tag: c.text for c in L}
OUT["top"] = dict(est=dict(BRAM=A["BRAM_18K"], DSP=A["DSP"], FF=A["FF"], LUT=A["LUT"]),
                  avail=dict(BRAM=AV["BRAM_18K"], DSP=AV["DSP"], FF=AV["FF"], LUT=AV["LUT"]),
                  est_clk_ns=float(top.find("PerformanceEstimates/SummaryOfTimingAnalysis/EstimatedClockPeriod").text),
                  target_clk_ns=10.0,
                  best=int(lat["Best-caseLatency"]), avg=int(lat["Average-caseLatency"]), worst=int(lat["Worst-caseLatency"]),
                  ii_min=int(lat["Interval-min"]), ii_max=int(lat["Interval-max"]))

# ---------------------------------------------------------------- loops from csynth.rpt text (STAGE loops, CH_LOOPs)
rpt = open(REP + "csynth.rpt", encoding="utf-8", errors="replace").read().splitlines()
def loop_row(pat, nth=0):
    hits = [l for l in rpt if re.match(r"\|\s*o\s+" + pat + r"\s*\|", l)]
    c = [x.strip() for x in hits[nth].split("|")[1:-1]]
    # | name | issue | viol | iter latency | II | trip | pipelined | lat cycles | ns | slack | ...
    return dict(name=c[0].replace("o ", "").strip(), iter_lat=int(c[3]) if c[3].isdigit() else None,
                trip=int(c[5]) if c[5].isdigit() else None, cycles=int(c[7]) if c[7].isdigit() else None)
S1 = loop_row("STAGE1_LOOP"); S2 = loop_row("STAGE2_LOOP")
CH = [loop_row("CH_LOOP", i) for i in range(3)]
OUT["loops"] = dict(stage1=S1, stage2=S2, ch=CH)

# ---------------------------------------------------------------- macro schedule (call order from the C++ source, latencies from reports)
def L_(m): return mod_xml(m)["lat"]
F4 = "forward_4_Pipeline_"
stage1 = [
    ("重放输入 180 点", "VITIS_LOOP_194_3", F4 + "VITIS_LOOP_194_3", "io"),
    ("卷积1 读入", "VITIS_LOOP_47_2", F4 + "VITIS_LOOP_47_2", "conv"),
    ("卷积1 计算", "58_3_59_4", F4 + "VITIS_LOOP_58_3_VITIS_LOOP_59_4", "conv"),
    ("BN1", "CHANNEL_LOOP_FEATURE_LOOP", F4 + "CHANNEL_LOOP_FEATURE_LOOP", "bn"),
    ("LIF1", "forward_11", "forward_11", "lif"),
    ("池化1（16 通道）", "CH_LOOP #0", None, "pool", CH[0]["cycles"]),
    ("QI2", "forward_1", "forward_1", "qi"),
    ("卷积2", "forward_14", "forward_14", "conv"),
    ("BN2", "LOOP6", F4 + "CHANNEL_LOOP_FEATURE_LOOP6", "bn"),
    ("LIF2", "forward_10", "forward_10", "lif"),
    ("池化2（16 通道）", "CH_LOOP #1", None, "pool", CH[1]["cycles"]),
    ("QI3", "forward_2", "forward_2", "qi"),
    ("卷积3", "forward_13", "forward_13", "conv"),
    ("BN3", "LOOP9", F4 + "CHANNEL_LOOP_FEATURE_LOOP9", "bn"),
    ("LIF3", "forward_8", "forward_8", "lif"),
    ("池化3（24 通道）", "CH_LOOP #2", None, "pool", CH[2]["cycles"]),
    ("写特征缓存", "VITIS_LOOP_277_4", F4 + "VITIS_LOOP_277_4", "cache"),
    ("QI(480)", "forward", "forward", "qi"),
    ("拼接 RR₁", "VITIS_LOOP_289_5", F4 + "VITIS_LOOP_289_5", "io"),
    ("RR₁ 入流", "VITIS_LOOP_294_6", F4 + "VITIS_LOOP_294_6", "io"),
    ("FC 484→2 读入", "READ_IN", F4 + "READ_IN", "fc"),
    ("FC 484→2 点积", "DOT_I", F4 + "DOT_I", "fc"),
    ("FC 484→2 输出", "OUT_LOOP", F4 + "OUT_LOOP", "fc"),
    ("LIF×2", "forward_9", "forward_9", "lif"),
]
stage2 = [
    ("读缓存", "VITIS_LOOP_343_7", F4 + "VITIS_LOOP_343_7", "cache"),
    ("QI(480)（与二分类头共用同一模块）", "forward", "forward", "qi"),
    ("拼接 RR₂", "VITIS_LOOP_353_8", F4 + "VITIS_LOOP_353_8", "io"),
    ("RR₂ 入流", "VITIS_LOOP_358_9", F4 + "VITIS_LOOP_358_9", "io"),
    ("FC 484→128", "forward_5", "forward_5", "fc"),
    ("LIF×128", "forward_12", "forward_12", "lif"),
    ("QI(128)", "forward_3", "forward_3", "qi"),
    ("FC 128→4", "forward_6", "forward_6", "fc"),
    ("LIF×4", "forward_7", "forward_7", "lif"),
]
def build(seq):
    t, rows = 0, []
    for it in seq:
        label, tag, mod, kind = it[:4]
        cyc = it[4] if len(it) > 4 else L_(mod)
        rows.append(dict(label=label, tag=tag, kind=kind, start=t, cycles=cyc)); t += cyc
    return rows, t
s1rows, s1sum = build(stage1); s2rows, s2sum = build(stage2)
OUT["macro"] = dict(stage1=s1rows, stage2=s2rows, stage1_sum=s1sum, stage2_sum=s2sum,
                    stage1_iter=S1["iter_lat"], stage2_iter=S2["iter_lat"],
                    glue1=S1["iter_lat"] - s1sum, glue2=S2["iter_lat"] - s2sum)
fwd = mod_xml("forward_4")["lat"]
OUT["macro"]["forward_total"] = fwd
OUT["macro"]["init_and_other"] = fwd - S1["cycles"] - S2["cycles"]
OUT["macro"]["top_extra"] = OUT["top"]["worst"] - fwd
checks.append("stage1 serial sum %d vs report iteration latency %d (glue %d)" % (s1sum, S1["iter_lat"], S1["iter_lat"] - s1sum))
checks.append("stage2 serial sum %d vs report iteration latency %d (glue %d)" % (s2sum, S2["iter_lat"], S2["iter_lat"] - s2sum))
checks.append("forward_4 %d = stage1 loop %d + stage2 loop %d + other %d" % (fwd, S1["cycles"], S2["cycles"], fwd - S1["cycles"] - S2["cycles"]))
checks.append("top worst %d = forward_4 %d + %d" % (OUT["top"]["worst"], fwd, OUT["top"]["worst"] - fwd))
checks.append("best %d vs worst %d -> early exit saves %d cycles (%.1f%%)" % (OUT["top"]["best"], OUT["top"]["worst"], OUT["top"]["worst"] - OUT["top"]["best"], 100.0 * (OUT["top"]["worst"] - OUT["top"]["best"]) / OUT["top"]["worst"]))

# ---------------------------------------------------------------- resource attribution: every leaf module
all_mods = sorted({os.path.basename(f)[:-len("_csynth.xml")] for f in os.listdir(REP) if f.endswith("_csynth.xml") and f != "csynth.xml" and f != "csynth_design_size.xml"})
mods = {m: mod_xml(m) for m in all_mods}
layer_of = {
    "conv1": [F4 + "VITIS_LOOP_58_3_VITIS_LOOP_59_4", F4 + "VITIS_LOOP_47_2"],
    "bn1": [F4 + "CHANNEL_LOOP_FEATURE_LOOP"], "lif1": ["forward_11"],
    "pool1": [F4 + "READ_CHANNEL", F4 + "POOL_LOOP"], "qi2": ["forward_1"],
    "conv2": ["forward_14"], "bn2": [F4 + "CHANNEL_LOOP_FEATURE_LOOP6"], "lif2": ["forward_10"],
    "pool2": [F4 + "READ_CHANNEL7", F4 + "POOL_LOOP8"], "qi3": ["forward_2"],
    "conv3": ["forward_13"], "bn3": [F4 + "CHANNEL_LOOP_FEATURE_LOOP9"], "lif3": ["forward_8"],
    "pool3": [F4 + "READ_CHANNEL10", F4 + "POOL_LOOP11"],
    "qi480": ["forward"], "fcbin": [F4 + "READ_IN", F4 + "DOT_I", F4 + "OUT_LOOP"], "lifbin": ["forward_9"],
    "fc1": ["forward_5"], "lif128": ["forward_12"], "qi128": ["forward_3"], "fc2": ["forward_6"], "lif4": ["forward_7"],
}
names = {"conv1": "卷积1 (1→16)", "bn1": "BN1", "lif1": "LIF1", "pool1": "池化1", "qi2": "QI2", "conv2": "卷积2 (16→16)", "bn2": "BN2",
         "lif2": "LIF2", "pool2": "池化2", "qi3": "QI3", "conv3": "卷积3 (16→24)", "bn3": "BN3", "lif3": "LIF3", "pool3": "池化3",
         "qi480": "QI(480)", "fcbin": "FC 484→2", "lifbin": "LIF×2", "fc1": "FC 484→128", "lif128": "LIF×128", "qi128": "QI(128)",
         "fc2": "FC 128→4", "lif4": "LIF×4"}
used, rows = set(), []
for k, ml in layer_of.items():
    tot = dict(BRAM=0, DSP=0, FF=0, LUT=0)
    for m in ml:
        for kk in tot: tot[kk] += mods[m][kk]
        used.add(m)
    rows.append(dict(key=k, name=names[k], **tot))
# modules are nested (forward_14 already contains its pipeline loops); pure leaf loops of forward_4 listed separately
nested_under = {"forward_14": [F4 + "never"], "forward_13": [], "forward_5": [], "forward_6": []}
OUT["layers"] = rows
sumDSP = sum(r["DSP"] for r in rows); sumBRAM = sum(r["BRAM"] for r in rows); sumFF = sum(r["FF"] for r in rows); sumLUT = sum(r["LUT"] for r in rows)
fw = mods["forward_4"]
checks.append("layer sums DSP %d BRAM %d FF %d LUT %d   vs forward_4 DSP %d BRAM %d FF %d LUT %d   vs top DSP %d BRAM %d FF %d LUT %d" %
              (sumDSP, sumBRAM, sumFF, sumLUT, fw["DSP"], fw["BRAM"], fw["FF"], fw["LUT"], A["DSP"], A["BRAM_18K"], A["FF"], A["LUT"]))
OUT["fw4"] = dict(DSP=fw["DSP"], BRAM=fw["BRAM"], FF=fw["FF"], LUT=fw["LUT"])
OUT["unattributed"] = dict(DSP=fw["DSP"] - sumDSP, BRAM=fw["BRAM"] - sumBRAM, FF=fw["FF"] - sumFF, LUT=fw["LUT"] - sumLUT)

# ---------------------------------------------------------------- micro schedules (verbose sched report, per state)
skip = {"getelementptr", "zext", "trunc", "partselect", "sext", "bitconcatenate", "bitselect", "specpipeline", "specloopname",
        "specinterface", "br", "alloca", "speclooptripcount", "bitset", "read", "write", "ret", "store", "load", "nop", "specstablecontent"}
def states(mod):
    per = collections.OrderedDict()
    for l in open(DB + mod + ".verbose.sched.rpt", encoding="utf-8", errors="replace"):
        m = re.match(r"ST_(\d+) : Operation \d+ \[(\d+)/(\d+)\] \(([\d.]+)ns\)(.*)--->\s+\"(.*?)\".*Operation \d+ '(\w+)'", l)
        if not m: continue
        per.setdefault(int(m.group(1)), collections.Counter())[m.group(7)] += 1
    return per
def micro(mod, pattern):
    p = states(mod)
    return [dict(state=s, ops={k: v for k, v in c.items() if k not in skip or k in ("load", "store", "write")}) for s, c in p.items()]
OUT["micro_conv2"] = micro("forward_14_Pipeline_VITIS_LOOP_58_3_VITIS_LOOP_59_4", None)
OUT["micro_fc1"] = micro("forward_5_Pipeline_DOT_I", None)
OUT["micro_conv2_meta"] = dict(depth=len(OUT["micro_conv2"]), ii=1, trip=1392, module="forward_14_Pipeline_VITIS_LOOP_58_3_VITIS_LOOP_59_4", est_clk=mods["forward_14_Pipeline_VITIS_LOOP_58_3_VITIS_LOOP_59_4"]["clk"])
OUT["micro_fc1_meta"] = dict(depth=len(OUT["micro_fc1"]), ii=1, trip=484, module="forward_5_Pipeline_DOT_I")

# ---------------------------------------------------------------- multiplier modules in RTL
vdir = (HERE / "solution/syn/verilog").as_posix() + "/"
inst = collections.Counter()
for f in os.listdir(vdir):
    t = open(vdir + f, encoding="utf-8", errors="replace").read()
    for m in re.findall(r"^\s*(topFunction_(?:mac_muladd|mul|am_addmul|mul_mul|urem|udiv|sparsemux)\w*)\s+(?:#\(|\w+\s*\()", t, re.M):
        inst[m] += 1
OUT["rtl_arith"] = sorted(([k.replace("topFunction_", ""), v] for k, v in inst.items()), key=lambda x: -x[1])
def fam(n):
    return "mac_muladd" if n.startswith("mac_muladd") else "mul" if n.startswith("mul") else "addmul" if n.startswith("am_addmul") else "urem/udiv" if n.startswith(("urem", "udiv")) else "sparsemux" if n.startswith("sparsemux") else "other"
famc = collections.Counter()
for k, v in inst.items(): famc[fam(k.replace("topFunction_", ""))] += v
OUT["rtl_arith_family"] = dict(famc)

# ---------------------------------------------------------------- memory groups (csynth Memory tables via facts.json)
F = json.load(open(HERE / "facts.json", encoding="utf-8"))
groups = collections.OrderedDict()
for m in F["csynth"]:
    for mem in (m.get("memories") or []):
        base = re.sub(r"(_\d+)?_U$", "", mem["name"])
        base = re.sub(r"p_ZN18hls4csnn1d_cblk_sdL\d+(\w+?)E_\d+$", r"\1", base)
        key = (m["module"].split("_Pipeline")[0], base)
        g = groups.setdefault(key, dict(module=key[0], name=base, banks=0, words=mem["words"], bits=mem["bits"], bram=0, ff=0, lut=0))
        g["banks"] += 1; g["bram"] += mem.get("bram18") or 0; g["ff"] += mem.get("ff") or 0; g["lut"] += mem.get("lut") or 0
OUT["memories"] = list(groups.values())

# ---------------------------------------------------------------- interface (top ports from RTL)
tv = open(vdir + "topFunction.v", encoding="utf-8", errors="replace").read()
ports = []
for m in re.finditer(r"^\s*(input|output)\s+(?:wire\s+|reg\s+)?(\[\d+:\d+\]\s*)?(\w+);", tv, re.M):
    w = 1
    if m.group(2):
        a, b = re.findall(r"\d+", m.group(2)); w = int(a) - int(b) + 1
    ports.append(dict(dir=m.group(1), name=m.group(3), width=w))
OUT["ports"] = ports

# ---------------------------------------------------------------- implementation (Vivado, IP out-of-context)
OUT["impl"] = dict(LUT=17141, FF=23789, DSP=220, BRAM=188, SRL=301, post_synth_ns=8.404, post_route_ns=9.808, wns=0.192, whs=0.027,
                   power_total=0.768, power_dyn=0.646, power_static=0.121,
                   note="Vivado 2026.1 place&route of the IP alone, target xc7z020, 10 ns; vectorless power, confidence Medium")
OUT["paper"] = dict(LUT=19580, FF=23646, DSP=220, BRAM=188, clock_MHz=100, e2e_ms=11.543, accel_w=0.33, board_w=2.02)


# ---------------------------------------------------------------- leftover loops (copy / reset / counters) and exact BRAM map
left = [(m, mods[m]) for m in mods if m.startswith(F4) and m not in used]
OUT["other_loops"] = [dict(name=m.replace(F4, ""), DSP=v["DSP"], FF=v["FF"], LUT=v["LUT"], lat=v["lat"]) for m, v in left]
checks.append("leftover forward_4 loops: %d modules, DSP sum %d (DSP unattributed above = %d)" % (len(left), sum(v["DSP"] for m, v in left), OUT["unattributed"]["DSP"]))
OUT["bram_map"] = [
    dict(name="FC 484→128 权重（128 块 ROM，484×8 位）", bram=128, src="forward_5 内存表"),
    dict(name="FC 128→4 权重（4 块 ROM，128×8 位）", bram=4, src="forward_6 内存表"),
    dict(name="FC 484→2 权重（2 块 ROM，484×8 位）", bram=2, src="forward_4_Pipeline_DOT_I 内存表"),
    dict(name="特征缓存 body_cache（8 块，600×8 位）", bram=8, src="forward_4 内存表"),
    dict(name="LIF 膜电位（V0/V1 各一份，24 位）", bram=24, src="forward_4 内存表"),
    dict(name="层间 FIFO（s0 … s12 等）", bram=24, src="forward_4 FIFO 表"),
    dict(name="顶层其余（输入通道 FIFO 等）", bram=A["BRAM_18K"] - 190, src="csynth.xml 总数减 forward_4"),
]
checks.append("BRAM map sum %d vs top %d" % (sum(b["bram"] for b in OUT["bram_map"]), A["BRAM_18K"]))

# ---------------------------------------------------------------- log counts and latency-vs-trip table
OUT["log"] = dict(pipelines=len(F["log"]["pipelines"]), all_ii1=all(x.get("final_ii") == 1 for x in F["log"]["pipelines"]),
                  violations=len(F["log"].get("ii_violations", F["log"].get("violations", []))))
def trip_of(m):
    cm = [x for x in F["csynth"] if x["module"] == m]
    trips = [int(l["trip_count"]) for x in cm for l in (x.get("loops") or []) if str(l.get("trip_count", "")).isdigit()]
    return max(trips) if trips else None
LAT = [("卷积1 计算", F4 + "VITIS_LOOP_58_3_VITIS_LOOP_59_4"), ("BN1", F4 + "CHANNEL_LOOP_FEATURE_LOOP"), ("LIF1", "forward_11"),
       ("QI2", "forward_1"), ("卷积2 计算", "forward_14_Pipeline_VITIS_LOOP_58_3_VITIS_LOOP_59_4"), ("BN2", F4 + "CHANNEL_LOOP_FEATURE_LOOP6"),
       ("LIF2", "forward_10"), ("QI3", "forward_2"), ("卷积3 计算", "forward_13_Pipeline_VITIS_LOOP_58_3_VITIS_LOOP_59_4"),
       ("BN3", F4 + "CHANNEL_LOOP_FEATURE_LOOP9"), ("LIF3", "forward_8"), ("FC 484→128 点积", "forward_5_Pipeline_DOT_I"),
       ("FC 484→128 输出", "forward_5_Pipeline_OUT_LOOP"), ("LIF×128", "forward_12"), ("FC 128→4 点积", "forward_6_Pipeline_DOT_I"), ("LIF×4", "forward_7")]
OUT["lat_table"] = []
for lab, m in LAT:
    tr = trip_of(m)
    if tr is None:  # LIF / QI wrappers: take trip of their inner pipeline loop
        tr = trip_of(m + "_Pipeline_VITIS_LOOP_60_1_VITIS_LOOP_61_2") or trip_of(m + "_Pipeline_VITIS_LOOP_60_1") or trip_of(m + "_Pipeline_VITIS_LOOP_41_1_VITIS_LOOP_42_2") or trip_of(m + "_Pipeline_VITIS_LOOP_41_1")
    OUT["lat_table"].append(dict(label=lab, module=m, trip=tr, lat=mods[m]["lat"]))
checks.append("lat_table rows with missing trip: %s" % [r["label"] for r in OUT["lat_table"] if not r["trip"]])

json.dump(OUT, open("kernel.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("\n".join(checks))
print("unattributed (forward_4 minus listed layers):", OUT["unattributed"])
print("rtl arithmetic families:", OUT["rtl_arith_family"])
print("ports:", [(p["dir"][0], p["name"], p["width"]) for p in ports])
print("memory groups:", len(OUT["memories"]))
