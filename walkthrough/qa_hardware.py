"""Read-only, independent evidence gates for the hardware teaching bundle.

Usage: python -X utf8 walkthrough/qa_hardware.py
This reads hardware.json and saved XML/schedule/RTL/routed reports. It does not
regenerate data, synthesize anything, or write a QA report.
"""
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REPORT = ROOT / "hls/work_csynth/hls/syn/report"
DB = ROOT / "hls/work_csynth/hls/.autopilot/db"
DATA = json.loads((HERE / "hardware.json").read_text(encoding="utf-8"))
H, MICRO = DATA["hardware"], DATA["micro"]
checks = 0


def require(condition, message):
    global checks
    assert condition, message
    checks += 1


def unpack(schedule, row):
    return dict(zip(schedule["opFields"], row)) if isinstance(row, list) else row


files = {ident: (ROOT / path).read_text(encoding="utf-8", errors="replace").splitlines()
         for ident, path in H["sourceFiles"].items()}
for ident, path in H["sourceFiles"].items():
    require(not Path(path).is_absolute() and ".." not in Path(path).parts, f"source escaped root: {path}")


def verify_source(ref):
    require(isinstance(ref, list) and len(ref) == 2, f"malformed source {ref}")
    ident, line = ref
    require(ident in files and isinstance(line, int) and 1 <= line <= len(files[ident]), f"invalid source {ref}")


def visit(obj):
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key == "source":
                verify_source(value)
            elif key == "sources":
                for ref in value:
                    verify_source(ref)
            else:
                visit(value)
    elif isinstance(obj, list):
        for value in obj:
            visit(value)


visit(DATA)
require(len(H["layers"]) == 26, "26 logical blocks")
require(len({x["key"] for x in H["layers"]}) == 26, "unique logical keys")
legacy = {x["key"]: x for x in json.loads((HERE / "kernel.json").read_text(encoding="utf-8"))["layers"]}
for layer in H["layers"] + H["controls"]:
    if not layer.get("hls"):
        continue
    sums = {k: 0 for k in ("DSP", "BRAM", "LUT", "FF")}
    if layer["key"] == "sharedArithmetic":
        # Independent saved report rows, not the build script's structure.json.
        lines = (REPORT / "forward_4_csynth.rpt").read_text(encoding="utf-8").splitlines()
        for line in lines:
            cells = [x.strip() for x in line.split("|")[1:-1]]
            if len(cells) == 7 and cells[1] in layer["modules"] and cells[2].isdigit():
                for key, index in (("BRAM", 2), ("DSP", 3), ("FF", 4), ("LUT", 5)):
                    sums[key] += int(cells[index])
    else:
        for module in layer["modules"]:
            root = ET.parse(REPORT / (module + "_csynth.xml")).getroot()
            for key, tag in (("DSP", "DSP"), ("BRAM", "BRAM_18K"), ("LUT", "LUT"), ("FF", "FF")):
                sums[key] += int(root.findtext("AreaEstimates/Resources/" + tag) or 0)
    for key in sums:
        require(layer["hls"][key] == sums[key], f"{layer['key']} HLS {key}: {layer['hls'][key]} vs {sums[key]}")
    if layer.get("legacyKey") and layer["kind"] != "headInput":
        for key in sums:
            require(sums[key] == legacy[layer["legacyKey"]][key], f"legacy mismatch {layer['key']} {key}")

for ident, schedule in MICRO.items():
    path = DB / (schedule["module"] + ".verbose.sched.rpt")
    text = path.read_text(encoding="utf-8")
    if schedule["kind"] == "pipeline":
        match = re.search(r"Pipeline-0 : II = (\d+), D = (\d+), States = \{([^}]+)\}", text)
        require(match is not None, ident + " lacks Pipeline-0 evidence")
        expected = [int(x) for x in match[3].split()]
        require([stage["state"] for stage in schedule["stages"]] == expected, ident + " selected pipeline states")
        require((schedule["ii"], schedule["depth"]) == (int(match[1]), int(match[2])), ident + " II/depth")
        require(schedule["depth"] == len(schedule["stages"]), ident + " stage count")
    else:
        require(schedule["ii"] is None and schedule["depth"] is None, ident + " FSM mislabeled pipeline")
    for stage in schedule["stages"]:
        require(stage["label"] == f"S{stage['state']}", ident + " stage label")
        indices = [i for lane in stage["lanes"].values() for i in lane]
        require(sorted(indices) == list(range(len(stage["ops"]))), ident + " lane coverage")
        for row in stage["ops"]:
            op = unpack(schedule, row)
            verify_source(op["source"])
            line = files[op["source"][0]][op["source"][1]-1]
            require(line.startswith(f"ST_{stage['state']} : Operation "), ident + " operation has wrong cycle")
            require(f"'{op['opcode']}'" in line, ident + " operation opcode")
            require(op["binding"] in ("DSP", "logic", "memory", "fifo", "wire", "control", "unresolved"), ident + " binding enum")
            if op.get("bindingSource"):
                verify_source(op["bindingSource"])
                bind_row = files[op["bindingSource"][0]][op["bindingSource"][1]-1]
                bind_cells = [x.strip() for x in bind_row.split("|")[1:-1]]
                require(len(bind_cells) == 5 and bind_cells[2].isdigit(), ident + " binding table row")
                require(op["binding"] == ("DSP" if int(bind_cells[2]) else "logic"), ident + " final HLS unit allocation")
            elif op["core"] == "Multiplier":
                require(op["binding"] == "unresolved", ident + " generic multiplier must not be guessed")
            if "lif" in schedule:
                require(f"'{op['name']}'" in line, ident + " LIF variable identity")
                require(op["sourceLine"] is None or f":{op['sourceLine']}" in line, ident + " LIF C++ line")
                require(op["width"] is None or op["width"] > 0, ident + " LIF width")
                if op["name"] == "prod_b" and op["opcode"] == "mul":
                    report_text = (REPORT / (schedule["module"] + "_csynth.rpt")).read_text(encoding="utf-8")
                    require("|mul_24s_" in report_text and op["binding"] == "DSP", ident + " beta DSP evidence")

lif_layers = [layer for layer in H["layers"] if layer["kind"] == "lif"]
require(len(lif_layers) == 6, "six LIF instances")
for layer in lif_layers:
    params = layer["lif"]
    require(layer["hls"]["BRAM"] == 0, layer["key"] + " datapath excludes parent RAM")
    require(sum(memory["banks"] for memory in layer["storage"]) == 2, layer["key"] + " two banks")
    require(params["betaClamped"] == max(0, min(4096, params["beta"])), layer["key"] + " clamped beta")
    require(params["stateKey"] == params["traceKey"] + ".state", layer["key"] + " functional snapshot key")
    for memory in layer["storage"]:
        require((memory["owner"], memory["bits"], memory["words"], memory["readLatency"]) ==
                ("forward_4", 24, params["channels"]*params["length"], 1), layer["key"] + " membrane RAM geometry")
        rtl_evidence = [ref for ref in memory["sources"] if H["sourceFiles"][ref[0]].endswith(".v")]
        require(bool(rtl_evidence), layer["key"] + " synchronous RAM RTL evidence")
        require("q1 <= ram[address1]" in files[rtl_evidence[0][0]][rtl_evidence[0][1]-1], layer["key"] + " synchronous RAM read")
    schedule = MICRO[layer["microIds"][0]]
    ops = [unpack(schedule, op) for stage in schedule["stages"] for op in stage["ops"]]
    if params["betaClamped"] == 4096:
        require(not any(op["name"] == "prod_b" and op["opcode"] == "mul" for op in ops), layer["key"] + " beta constant optimized")
        require(any(op["name"].startswith("prod_b_") and op["opcode"] == "add" for op in ops), layer["key"] + " negative rounding retained")
    if params["scale"] == 20:
        require(any(op["core"] == "TAddSub" for op in ops), "scale20 shift/add mapped to logic")

forward11 = (ROOT / "hls/work_csynth/hls/syn/verilog/topFunction_forward_11.v").read_text(encoding="utf-8")
require("rd_reg_382 == 1'd0" in forward11 and "topClass24_qcsnn24_trunk_lif1_V0_we0_local = 1'b1" in forward11, "same-bank V0 write")
require("rd_reg_382 == 1'd1" in forward11 and "topClass24_qcsnn24_trunk_lif1_V1_we0_local = 1'b1" in forward11, "same-bank V1 write")
require("s2_full_n == 1'b0" in forward11 and "s1_empty_n" in forward11, "backpressure/empty input control")
require(H["accounting"]["hlsLayerDSP"] + H["accounting"]["hlsResetDSP"] + H["accounting"]["hlsSharedDSP"] == 227, "HLS DSP accounting")
require(H["accounting"]["routed"]["visibleLayers"]["DSP"] + H["accounting"]["routedUnresolvedDSP"] == 220, "routed DSP accounting")
require(sum(fifo["BRAM"] for fifo in H["fifos"]) == 24, "layer FIFO BRAM map")
require((HERE / "hardware.json").stat().st_size < 170000, "compact hardware bundle")
print(f"hardware evidence gates: {checks:,} passed; 26 blocks, {len(MICRO)} schedules, six LIFs")
