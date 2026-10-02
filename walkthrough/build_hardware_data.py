"""Build auditable, compact hardware teaching data from saved reports only.

The output contains HLS schedules, not simulated RTL waveforms. Resource totals
are kept separate for HLS and routed Vivado, and parent/child totals are never
added together. Run from any directory; no toolchain or third-party modules are
required. Only hardware.json is written.
"""
from __future__ import annotations

import collections
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
HLS = ROOT / "hls/work_csynth/hls"
REPORT = HLS / "syn/report"
DB = HLS / ".autopilot/db"
RTL = HLS / "syn/verilog"
ROUTED = HLS / "impl/verilog/report/topFunction_utilization_hierarchical_routed.rpt"
F4 = "forward_4_Pipeline_"
MODEL = "csnn_cpp/include/hls4csnn1d_sd/model24/cblk_sd/"
SOURCE_FILES: dict[str, str] = {}
SOURCE_IDS: dict[str, str] = {}
CACHE: dict[str, dict] = {}


def read(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8", errors="replace").splitlines()


def source(path: Path | str, line: int = 1) -> list:
    path = str(path).replace("\\", "/")
    if Path(path).is_absolute():
        path = Path(path).relative_to(ROOT).as_posix()
    while path.startswith("../"):
        path = path[3:]
    path = (ROOT / path).resolve().relative_to(ROOT).as_posix()
    if path not in SOURCE_IDS:
        ident = str(len(SOURCE_IDS))
        SOURCE_IDS[path] = ident
        SOURCE_FILES[ident] = path
    return [SOURCE_IDS[path], line]


def find_line(path: Path, pattern: str) -> int:
    for i, line in enumerate(read(path), 1):
        if re.search(pattern, line):
            return i
    raise ValueError(f"Evidence not found: {path}: {pattern}")


def resources(items) -> dict:
    items = list(items)
    return {key: sum(it.get(key, 0) or 0 for it in items)
            for key in ("DSP", "BRAM", "LUT", "FF")}


def module_info(name: str) -> dict:
    if name in CACHE:
        return CACHE[name]
    path = REPORT / (name + "_csynth.xml")
    root = ET.parse(path).getroot()
    area = root.find("AreaEstimates/Resources")
    perf = root.find("PerformanceEstimates/SummaryOfOverallLatency")
    integer = lambda element, key: int(element.findtext(key)) if element is not None and str(element.findtext(key)).isdigit() else None
    loops = []
    for node in root.findall("PerformanceEstimates/SummaryOfLoopLatency/*"):
        loops.append({"name": node.tag, "trip": integer(node, "TripCount"),
                      "ii": integer(node, "PipelineII"), "depth": integer(node, "PipelineDepth"),
                      "latency": integer(node, "Latency")})
    ret = {"DSP": integer(area, "DSP") or 0, "BRAM": integer(area, "BRAM_18K") or 0,
           "FF": integer(area, "FF") or 0, "LUT": integer(area, "LUT") or 0,
           "latency": integer(perf, "Worst-caseLatency"), "loops": loops,
           "clock": float(root.findtext("PerformanceEstimates/SummaryOfTimingAnalysis/EstimatedClockPeriod")),
           "source": source(path, find_line(path, r"<Resources>"))}
    CACHE[name] = ret
    return ret


def routed_rows() -> list[dict]:
    rows = []
    for number, line in enumerate(read(ROUTED), 1):
        cells = line.split("|")[1:-1]
        if len(cells) != 10 or not cells[2].strip().isdigit():
            continue
        label = cells[0].strip().strip("()")
        rows.append({"instance": label, "module": cells[1].strip().replace("bd_0_hls_inst_0_topFunction_", ""),
                     "indent": len(cells[0]) - len(cells[0].lstrip()),
                     "DSP": int(cells[9]), "LUT": int(cells[2]), "FF": int(cells[6]),
                     "BRAM": int(cells[7]) * 2 + int(cells[8]), "SRL": int(cells[5]),
                     "source": source(ROUTED, number)})
    return rows


def routed_layer(names: list[str], rows: list[dict]) -> dict:
    found = [row for row in rows if row["module"] in names and row["indent"] == 11]
    present = {row["module"] for row in found}
    counts = resources(found) if found else {key: None for key in ("DSP", "BRAM", "LUT", "FF")}
    return {**counts, "sources": [row["source"] for row in found],
            "missingModules": [name for name in names if name not in present],
            "attribution": "已保留的模块层级" if len(present) == len(names) else "部分模块已展开到父层，所列仅为仍可归属的层级"}


SKIP = {"specpipeline", "specloopname", "specinterface", "speclooptripcount", "specstablecontent", "alloca", "br", "ret", "nop", "getelementptr"}
WIRES = {"zext", "sext", "trunc", "partselect", "bitselect", "bitconcatenate", "bitset"}
OP_PATTERN = re.compile(r'^ST_(\d+) : Operation \d+ \[(\d+)/(\d+)\].*?--->\s+"(.*?)".*?Operation \d+ \'(\w+)\' \'([^\']*)\'')


def binding_for(line: str, opcode: str, core: str) -> str:
    # A generic HLS Multiplier core is not proof of DSP binding; the csynth
    # expression/instance table below resolves those explicitly.
    if "grouped into DSP" in line or "root node of the DSP" in line or core == "DSP48":
        return "DSP"
    if core.startswith("FIFO") or opcode in ("read", "write"):
        return "fifo"
    if core in ("RAM", "ROM"):
        return "memory"
    if opcode in WIRES:
        return "wire"
    if opcode in ("load", "store"):
        return "control"
    if core == "Multiplier":
        return "unresolved"
    return "logic"


def lane_for(name: str, source_line: int | None, binding: str, lif: bool) -> str:
    if not lif:
        return "memory" if binding == "memory" else "input" if binding == "fifo" else "control" if binding == "control" else "neuron"
    if "_V0" in name or "_V1" in name:
        return "memory"
    if source_line in (25, 26, 53, 54, 60, 61, 112) or name.startswith(("c_", "t_", "indvar", "wr", "rd")):
        return "control"
    if source_line in (64, 65, 74, 82) or name.startswith(("select_ln82", "add_ln82", "icmp_ln74")):
        return "input"
    return "neuron"


def multiplier_dsp_names(module: str) -> set[str]:
    # Real per-expression final HLS allocation: prod_b is an Instance (one
    # DSP + glue LUTs) even though the scheduler names its core Multiplier.
    names = set()
    path = REPORT / (module + "_csynth.rpt")
    for line in read(path):
        if re.search(r"\|mul_24s_(?:12|13)ns_\d+_1_1_U\d+\s*\|", line):
            names.add("prod_b")
    return names


def bound_allocations(module: str) -> dict[str, dict]:
    """Resolve schedule variable -> final HLS functional unit -> DSP count.

    This also resolves externally shared multiplication units: a leaf module's
    csynth total can omit a two-DSP unit allocated at forward_4, while its bind
    report still identifies the exact functional unit and operation.
    """
    path = DB / (module + ".verbose.bind.rpt")
    if not path.exists():
        return {}
    lines = read(path)
    units = {}
    for number, line in enumerate(lines, 1):
        cells = [part.strip() for part in line.split("|")[1:-1]]
        if len(cells) == 5 and cells[2].isdigit() and cells[3].isdigit() and cells[4].isdigit():
            units[cells[1]] = {"binding": "DSP" if int(cells[2]) else "logic", "dsp": int(cells[2]), "source": source(path, number), "unit": cells[1]}
    operations = {}
    for match in re.finditer(r'<comp id="\d+" class="1004" name="([^"]+)">(.*?)</comp>', "\n".join(lines), re.S):
        if match[1] not in units:
            continue
        opset = re.search(r'<opset="([^"]+)"', match[2])
        if not opset:
            continue
        for op in opset[1].split():
            name = op.split("/")[0]
            allocation = units[match[1]]
            # Prefer the proven DSP binding if a fused op also has an intermediate
            # LUT representation. The schedule's explicit DSP grouping is retained.
            if name not in operations or allocation["dsp"] > operations[name]["dsp"]:
                operations[name] = allocation
    return operations


def parse_schedule(module: str, *, lif: bool = False, filter_lines: set[int] | None = None, micro_id: str | None = None) -> dict:
    path = DB / (module + ".verbose.sched.rpt")
    lines = read(path)
    info = module_info(module)
    pipeline = []
    pipeline_source = None
    for number, line in enumerate(lines, 1):
        match = re.search(r"Pipeline-(\d+) : II = (\d+), D = (\d+), States = \{([^}]+)\}", line)
        if match:
            pipeline.append({"id": int(match[1]), "ii": int(match[2]), "depth": int(match[3]),
                             "states": [int(s) for s in match[4].split()]})
            pipeline_source = source(path, number)
    states = collections.OrderedDict()
    multiplier_dsp = multiplier_dsp_names(module)
    allocations = bound_allocations(module)
    for number, line in enumerate(lines, 1):
        state_match = re.match(r"State (\d+) <SV = (\d+)>", line)
        if state_match:
            states.setdefault(int(state_match[1]), [])
        match = OP_PATTERN.match(line)
        if not match:
            continue
        state, fraction, duration, expression, opcode, name = match.groups()
        if opcode in SKIP:
            continue
        cpp = re.search(r"\[(?:\.\./)?(csnn_cpp/[^\]:]+):(\d+)", line)
        source_line = int(cpp[2]) if cpp else None
        if filter_lines is not None and source_line not in filter_lines:
            continue
        core_match = re.search(r'<CoreInst = "([^"]+)"', line)
        core = core_match[1] if core_match else "wire" if opcode in WIRES else "register"
        widths = [int(x) for x in re.findall(r"\bi(\d+)\b", expression)]
        memory_width = re.search(r"<Width = (\d+)>", line)
        width = int(memory_width[1]) if memory_width else 1 if opcode == "icmp" else widths[0] if widths else None
        allocation = allocations.get(name) if core == "Multiplier" else None
        binding = allocation["binding"] if allocation else "DSP" if name in multiplier_dsp else binding_for(line, opcode, core)
        op = {"name": name, "opcode": opcode, "width": width, "core": core,
              "binding": binding, "source": source(path, number), "sourceLine": source_line}
        if cpp:
            op["cppSource"] = source(cpp[1], source_line)
        if allocation:
            op["bindingSource"] = allocation["source"]
            op["bindingUnit"] = allocation["unit"]
        if lif:
            # Keep source semantics alongside the optimizer's operand/result
            # widths; memory load's textual iN is its address, not data width.
            op["widths"] = list(dict.fromkeys(widths))
            op["part"] = [int(fraction), int(duration)]
            op["lane"] = lane_for(name, source_line, binding, True)
            if "grouped into DSP" in line or "root node of the DSP" in line:
                group = re.search(r"(?:root node |root node of the DSP|grouped into DSP with root node)\s*(\w+)?", line)
                op["group"] = "address-mac" if source_line in (61, 70) else "input-reset-mac"
        else:
            if opcode in WIRES:
                continue
            op["lane"] = lane_for(name, source_line, binding, False)
        states.setdefault(int(state), []).append(op)
    if filter_lines is not None:
        states = collections.OrderedDict((s, ops) for s, ops in states.items() if ops)
        pipeline = []
    selected_states = pipeline[0]["states"] if pipeline else list(states)
    stages = []
    for index, state in enumerate(selected_states):
        ops = states.get(state, [])
        if not lif:
            groups = collections.OrderedDict()
            for op in ops:
                group_key = (op["opcode"], op["core"], op["binding"], op["lane"])
                if group_key not in groups:
                    groups[group_key] = {key: op[key] for key in ("opcode", "core", "binding", "source", "sourceLine", "lane")}
                    if "bindingSource" in op:
                        groups[group_key]["bindingSource"] = op["bindingSource"]
                    groups[group_key].update(count=0, widths=[])
                groups[group_key]["count"] += 1
                if op["width"] is not None and op["width"] not in groups[group_key]["widths"]:
                    groups[group_key]["widths"].append(op["width"])
            ops = list(groups.values())
            for op in ops:
                op["widths"].sort()
                op["width"] = max(op["widths"], default=0) or None
        lanes = {key: [i for i, op in enumerate(ops) if op["lane"] == key]
                 for key in ("control", "memory", "input", "neuron")}
        if not lif:
            for op in ops:
                op.pop("lane", None)
        stages.append({"state": state, "index": index, "label": f"S{state}", "lanes": lanes, "ops": ops})
    transitions = []
    for line in lines:
        match = re.match(r"(\d+) -->\s*(.*)", line)
        if match and int(match[1]) in selected_states:
            transitions.append([int(match[1]), [int(x) for x in match[2].split()]])
    trip = max((loop["trip"] or 0 for loop in info["loops"]), default=0) or None
    ret = {"module": module, "kind": "pipeline" if pipeline else "fsm", "ii": pipeline[0]["ii"] if pipeline else None,
           "depth": pipeline[0]["depth"] if pipeline else None, "trip": trip,
           "latency": None if filter_lines is not None else info["latency"],
           "stateRange": [min(selected_states), max(selected_states)] if selected_states else [],
           "entryStates": [s for s in states if selected_states and s < min(selected_states)],
           "exitStates": [s for s in states if selected_states and s > max(selected_states)],
           "stages": stages, "sources": [pipeline_source or source(path, 77), info["source"]]}
    if not pipeline:
        ret["transitions"] = transitions
        ret["note"] = "FSM状态，不能将总延迟或状态数当作流水线深度"
    if filter_lines is not None:
        ret["note"] = "父模块内联运算的真实FSM状态；资源和延迟未单独报告"
    if lif:
        ret["sourceWidths"] = {"qi": 8, "beta": 16, "theta": 16, "scale": 16, "x_q": 24,
                               "v_prev": 24, "prod_b": 40, "v_beta": 24, "base": 24, "prod_r": 40, "v_next": 24, "spikeContainer": 8}
    return ret


def memory_groups(module: str, match: str = "") -> list[dict]:
    path = REPORT / (module + "_csynth.rpt")
    groups = collections.OrderedDict()
    in_memory = False
    for number, line in enumerate(read(path), 1):
        if "* Memory:" in line:
            in_memory = True
        elif in_memory and re.search(r"\* (?:FIFO|Expression|Multiplexer|Register):", line):
            in_memory = False
        if not in_memory or not line.lstrip().startswith("|"):
            continue
        cells = [x.strip() for x in line.split("|")[1:-1]]
        if len(cells) != 10 or not cells[2].isdigit() or (match and match not in cells[0]):
            continue
        name = cells[0]
        base = re.sub(r"_(?:\d+_)?U$", "", name)
        if "qlinear_weights" in name:
            base = "weight ROM"
        if "_V0" in name or "_V1" in name:
            base = re.sub(r"_V[01](?:_\d+)?_U$", "_V0/V1", name)
        key = (base, int(cells[6]), int(cells[7]))
        group = groups.setdefault(key, {"name": base, "owner": module, "words": int(cells[6]), "bits": int(cells[7]),
                                       "banks": 0, "BRAM": 0, "FF": 0, "LUT": 0,
                                       "readLatency": 1, "ports": {"read": 1, "write": 1}, "sources": []})
        group["banks"] += int(cells[8])
        group["BRAM"] += int(cells[2]); group["FF"] += int(cells[3]); group["LUT"] += int(cells[4])
        group["sources"].append(source(path, number))
        if base == "weight ROM":
            group["ports"]["write"] = 0
    return list(groups.values())


def fifo_catalog() -> list[dict]:
    path = REPORT / "forward_4_csynth.rpt"
    result = []
    in_fifo = False
    for number, line in enumerate(read(path), 1):
        if "* FIFO:" in line:
            in_fifo = True
        elif in_fifo and "* Expression:" in line:
            break
        cells = [x.strip() for x in line.split("|")[1:-1]]
        if in_fifo and len(cells) == 8 and cells[1].isdigit() and cells[0] != "Total":
            result.append({"name": cells[0].replace("_fifo_U", ""), "owner": "forward_4",
                           "BRAM": int(cells[1]), "FF": int(cells[2]), "LUT": int(cells[3]),
                           "words": int(cells[5]), "bits": int(cells[6]), "banks": 1,
                           "source": source(path, number)})
    return result


def compact_ops(micro: dict) -> None:
    for schedule in micro.values():
        fields = ["name", "opcode", "width", "core", "binding", "source", "sourceLine", "widths", "part", "group", "bindingSource"] if "lif" in schedule else ["opcode", "core", "binding", "source", "sourceLine", "count", "width", "widths", "bindingSource"]
        schedule["opFields"] = fields
        if "lif" in schedule:
            schedule["cppFile"] = source(MODEL + "lif1d_integer.h")[0]
        for stage in schedule["stages"]:
            encoded = []
            for op in stage["ops"]:
                if "lif" not in schedule and len(op.get("widths", [])) <= 1:
                    op["widths"] = None  # width itself is exact for singleton groups.
                row = [op.get(key) for key in fields]
                while row and row[-1] is None:
                    row.pop()
                encoded.append(row)
            stage["ops"] = encoded


def nodes(kind: str, lif_params: dict | None = None) -> list[dict]:
    templates = {
        "conv": [("输入缓冲/窗口", "memory", 8), ("权重选择", "memory", 8), ("并行乘加/加法树", "DSP", 32), ("再量化、饱和", "logic", 8)],
        "bn": [("通道参数", "memory", 32), ("仿射乘加", "DSP", 32), ("绝对值RNE、符号恢复", "logic", 64), ("INT8饱和", "logic", 8)],
        "pool": [("先收完整通道", "memory", 8), ("两点比较/选择", "logic", 8), ("脉冲输出", "fifo", 8)],
        "qi": [("接收脉冲", "fifo", 8), ("非零比较", "logic", 1), ("常量0/127选择", "logic", 8)],
        "fc": [("完整输入向量", "memory", 8), ("权重ROM", "memory", 8), ("输出神经元并行累加", "DSP", 32), ("再量化、饱和", "logic", 8)],
        "input": [("180点INT8信号缓存", "memory", 8), ("8路循环分块", "control", None), ("10次输入重放", "fifo", 8)],
        "headInput": [("480路脉冲QI（物理共享）", "logic", 8), ("拼接4个RR整数", "fifo", 8)],
        "gate": [("两个脉冲计数", "logic", 16), ("异常>正常", "logic", 1), ("退出/第二阶段选择", "control", 1)],
        "argmax": [("4个脉冲计数", "logic", 16), ("严格>比较/选择链", "logic", 2), ("索引输出", "fifo", 8)],
    }
    if kind == "lif":
        templates[kind] = [("坐标地址与bank控制", "control", None), ("V0/V1同bank读写", "memory", 24),
                           ("输入scale与延迟reset", "logic" if lif_params["scale"] == 20 else "DSP", 24),
                           ("β泄漏", "wire" if lif_params["betaClamped"] == 4096 else "DSP", 40),
                           ("符号舍入/24位积分", "logic", 24), ("严格>阈值与spike", "logic", 1)]
    return [{"label": label, "kind": typ, "bits": bits} for label, typ, bits in templates[kind]]


def main() -> None:
    parameters = json.loads((HERE / "params.json").read_text(encoding="utf-8"))
    rows = routed_rows()
    definitions = [
        ("input", "输入与重放", "input", "in", None, [F4+"VITIS_LOOP_88_1", F4+"VITIS_LOOP_194_3"]),
        ("conv1", "卷积1", "conv", "conv1", "conv1", [F4+"VITIS_LOOP_58_3_VITIS_LOOP_59_4", F4+"VITIS_LOOP_47_2"]),
        ("bn1", "BN1", "bn", "bn1", "bn1", [F4+"CHANNEL_LOOP_FEATURE_LOOP"]),
        ("lif1", "LIF1", "lif", "lif1", "lif1", ["forward_11"]),
        ("pool1", "池化1", "pool", "pool1", "pool1", [F4+"READ_CHANNEL", F4+"POOL_LOOP"]),
        ("qi1", "QI1：16×89", "qi", "qi2", "qi2", ["forward_1"]),
        ("conv2", "卷积2", "conv", "conv2", "conv2", ["forward_14"]),
        ("bn2", "BN2", "bn", "bn2", "bn2", [F4+"CHANNEL_LOOP_FEATURE_LOOP6"]),
        ("lif2", "LIF2", "lif", "lif2", "lif2", ["forward_10"]),
        ("pool2", "池化2", "pool", "pool2", "pool2", [F4+"READ_CHANNEL7", F4+"POOL_LOOP8"]),
        ("qi2", "QI2：16×43", "qi", "qi3", "qi3", ["forward_2"]),
        ("conv3", "卷积3", "conv", "conv3", "conv3", ["forward_13"]),
        ("bn3", "BN3", "bn", "bn3", "bn3", [F4+"CHANNEL_LOOP_FEATURE_LOOP9"]),
        ("lif3", "LIF3", "lif", "lif3", "lif3", ["forward_8"]),
        ("pool3", "池化3", "pool", "pool3", "pool3", [F4+"READ_CHANNEL10", F4+"POOL_LOOP11"]),
        ("headInputBin", "二分类输入：QI480+RR4", "headInput", "bin_qi", "qi480", ["forward", F4+"VITIS_LOOP_289_5", F4+"VITIS_LOOP_294_6"]),
        ("fcBin", "FC484→2", "fc", "bin_fc", "fcbin", [F4+"DOT_I", F4+"READ_IN", F4+"OUT_LOOP"]),
        ("lifBin", "二分类LIF", "lif", "bin_lif", "lifbin", ["forward_9"]),
        ("gate", "二分类累计与门控", "gate", "gate", None, []),
        ("headInput4", "四分类输入：QI480+RR4", "headInput", "m_qi1", None, ["forward", F4+"VITIS_LOOP_353_8", F4+"VITIS_LOOP_358_9"]),
        ("fc1", "FC484→128", "fc", "m_fc1", "fc1", ["forward_5"]),
        ("lif4a", "四分类隐藏LIF128", "lif", "m_lif1", "lif128", ["forward_12"]),
        ("qi4", "QI128", "qi", "m_qi2", "qi128", ["forward_3"]),
        ("fc2", "FC128→4", "fc", "m_fc2", "fc2", ["forward_6"]),
        ("lif4b", "四分类输出LIF4", "lif", "m_lif2", "lif4", ["forward_7"]),
        ("argmax", "四分类累计与argmax", "argmax", "arg", None, []),
    ]
    legacy = json.loads((HERE / "kernel.json").read_text(encoding="utf-8"))
    legacy_layers = {layer["key"]: layer for layer in legacy["layers"]}
    lif_configs = {
        "lif1": (parameters["blocks"][0]["lif"], "blocks.0.lif", "trunk_lif1", 16, 178),
        "lif2": (parameters["blocks"][1]["lif"], "blocks.1.lif", "trunk_lif2", 16, 87),
        "lif3": (parameters["blocks"][2]["lif"], "blocks.2.lif", "trunk_lif3", 24, 41),
        "lifBin": (parameters["bin"]["lif"], "bin.lif", "bin_lif", 2, 1),
        "lif4a": (parameters["multi"]["lif1"], "multi.lif1", "multi_lif1", 128, 1),
        "lif4b": (parameters["multi"]["lif2"], "multi.lif2", "multi_lif2", 4, 1),
    }
    micro: dict[str, dict] = {}
    layers = []
    implementation_layers = []
    # Each micro entry is a schedulable leaf; resource aggregation for wrappers
    # still uses the wrapper exactly once.
    micro_overrides = {
        "forward_14": ["forward_14_Pipeline_VITIS_LOOP_58_3_VITIS_LOOP_59_4", "forward_14_Pipeline_VITIS_LOOP_46_1_VITIS_LOOP_47_2"],
        "forward_13": ["forward_13_Pipeline_VITIS_LOOP_58_3_VITIS_LOOP_59_4", "forward_13_Pipeline_VITIS_LOOP_46_1_VITIS_LOOP_47_2"],
        "forward_5": ["forward_5_Pipeline_DOT_I", "forward_5_Pipeline_READ_IN", "forward_5_Pipeline_OUT_LOOP"],
        "forward_6": ["forward_6_Pipeline_DOT_I", "forward_6_Pipeline_READ_IN", "forward_6_Pipeline_OUT_LOOP"],
    }
    for key, label, kind, flow_key, legacy_key, modules in definitions:
        micro_ids = [child for module in modules for child in micro_overrides.get(module, [module])]
        for module in micro_ids:
            if module not in micro:
                micro[module] = parse_schedule(module, lif=kind == "lif")
        rpt_sources = [module_info(module)["source"] for module in modules]
        hls = resources(module_info(module) for module in modules) if modules else None
        if len(modules) == 1:
            hls["latency"] = module_info(modules[0])["latency"]
        route = routed_layer(modules, rows) if modules else None
        layer = {"key": key, "label": label, "kind": kind, "flowKey": flow_key,
                 "stage": 2 if key in {"headInput4", "fc1", "lif4a", "qi4", "fc2", "lif4b", "argmax"} else 1,
                 "legacyKey": legacy_key, "modules": modules, "microIds": micro_ids,
                 "hls": hls, "routed": route, "storage": [], "sources": rpt_sources, "notes": []}
        if key in lif_configs:
            p, param_key, bank_prefix, channels, length = lif_configs[key]
            config = {"paramKey": param_key, "stateKey": flow_key + ".state", "traceKey": flow_key,
                      "bankPrefix": bank_prefix, "channels": channels, "length": length,
                      "beta": p["beta"], "betaClamped": min(4096, max(0, p["beta"])),
                      "theta": p["theta"], "scale": p["scale"], "fracBits": p["frac_bits"],
                      "bankRule": "same-bank t-2"}
            layer["lif"] = config
            layer["shape"] = [channels, length]
            layer["storage"] = memory_groups("forward_4", bank_prefix + "_V")
            for memory in layer["storage"]:
                rtl_path = next(RTL.glob("topFunction_forward_4_topClass24_qcsnn24_" + bank_prefix + "_V0*RAM_AUTO_1R1W.v"))
                memory["addressWidth"] = int(re.search(r"parameter AddressWidth = (\d+)", "\n".join(read(rtl_path)))[1])
                memory["sources"].append(source(rtl_path, find_line(rtl_path, r"q1 <= ram\[address1\]")))
            layer["notes"] = ["每拍处理一个坐标；所有神经元位置复用这一套流水线。", "V0/V1读写同一选中bank，偶/奇时间步各是一条t−2状态链。", "状态RAM归父模块forward_4；子模块BRAM=0不代表没有状态存储。", "输入空/输出满会停顿；以下周期仅为无停顿HLS调度。"]
            if config["betaClamped"] == 4096:
                layer["notes"].append("β乘法被常量移位优化，但负膜电位经负舍入仍为Vprev−1（24位回绕）。")
            if p["theta"] < 0:
                layer["notes"].append(f"theta={p['theta']}：负reset乘积舍入为{p['theta']-1}，所以复位项实际加{-p['theta']+1}。")
            micro[micro_ids[0]]["lif"] = config
        elif kind == "fc":
            owner = "forward_5_Pipeline_DOT_I" if key == "fc1" else "forward_6_Pipeline_DOT_I" if key == "fc2" else F4+"DOT_I"
            layer["storage"] = memory_groups(owner)
            layer["notes"].append("资源用包装模块总数或各独立子模块之和；不会将包装模块与子模块重复相加。")
        elif kind == "input":
            layer["storage"] = memory_groups("forward_4", "sig_buf")
        if kind == "headInput":
            layer["sharedWith"] = "headInput4" if key == "headInputBin" else "headInputBin"
            layer["sharedModule"] = "forward"
            layer["resourceCountedAt"] = "headInputBin"
            layer["notes"].append("QI480由两个头顺序调用同一个物理forward模块，不能将两次调用当成两份硬件。RR4绕过QI。")
        if kind in ("gate", "argmax"):
            ident = "forward_4_" + key
            ranges = set(range(29, 35)) | set(range(315, 330)) if kind == "gate" else set(range(37, 46)) | set(range(396, 409))
            micro[ident] = parse_schedule("forward_4", filter_lines=ranges)
            layer["microIds"] = [ident]
            layer["sources"] = [source(MODEL+"qcsnn24_rrboth_sd.h", 323 if kind == "gate" else 407)]
            layer["notes"] = ["内联到forward_4控制/计数逻辑，无独立资源总表，不臆造单层LUT/FF/latency。", "严格大于比较；相等时保留正常或较早索引。"]
        layer["datapath"] = nodes(kind, layer.get("lif"))
        layers.append(layer)
        if legacy_key and legacy_key != "qi480":
            implementation_layers.append({"key": legacy_key, "name": label, **route})
    # Add the physically shared QI once to the legacy resource view.
    implementation_layers.append({"key": "qi480", "name": "QI480（物理共享）", **routed_layer(["forward"], rows)})
    controls = []
    for key, label, modules in [
        ("cache", "480×10特征缓存", [F4+"VITIS_LOOP_277_4", F4+"VITIS_LOOP_343_7"]),
        ("reset", "样本复位与第二阶段复位", [F4+"VITIS_LOOP_25_1_VITIS_LOOP_26_2", F4+"VITIS_LOOP_25_1_VITIS_LOOP_26_24", F4+"VITIS_LOOP_25_1_VITIS_LOOP_26_25", F4+"VITIS_LOOP_25_1", F4+"VITIS_LOOP_25_112", F4+"VITIS_LOOP_25_113"]),
    ]:
        for module in modules:
            micro[module] = parse_schedule(module)
        controls.append({"key": key, "label": label, "modules": modules, "microIds": modules,
                         "hls": resources(module_info(m) for m in modules), "routed": routed_layer(modules, rows),
                         "storage": memory_groups("forward_4", "body_cache") if key == "cache" else [],
                         "sources": [module_info(m)["source"] for m in modules]})
    structure = json.loads((HERE / "structure.json").read_text(encoding="utf-8"))
    fw4 = next(x for x in structure["modules"] if x["module"] == "forward_4")
    shared = [x for x in fw4["instances"] if x["module"].startswith("mul_")]
    controls.append({"key": "sharedArithmetic", "label": "父模块共享乘法实例", "modules": [x["module"] for x in shared],
                     "microIds": [], "hls": resources({"DSP": x["dsp"], "BRAM": x["bram18"], "LUT": x["lut"], "FF": x["ff"]} for x in shared),
                     "sources": [source(REPORT/"forward_4_csynth.rpt", find_line(REPORT/"forward_4_csynth.rpt", re.escape(x["instance"]))) for x in shared],
                     "note": "BN1/2/3的重定标乘法复用父层2个HLS DSP；Conv2/3重定标乘法复用另一组2个HLS DSP。逐算子绑定来自bind表、共享选择来自父RTL；不能将每次调用重复计为新硬件。"})
    parent_rtl = RTL / "topFunction_forward_4.v"
    controls[-1]["sharedPaths"] = [
        {"label": "BN1/2/3重定标乘法", "modules": [F4+"CHANNEL_LOOP_FEATURE_LOOP", F4+"CHANNEL_LOOP_FEATURE_LOOP6", F4+"CHANNEL_LOOP_FEATURE_LOOP9"], "DSP": 2,
         "sources": [source(parent_rtl, find_line(parent_rtl, r"grp_fu_24295_p0 =")),
                     source(parent_rtl, find_line(parent_rtl, r"grp_fu_24295_p1 ="))]},
        {"label": "Conv2/3重定标乘法", "modules": ["forward_14", "forward_13"], "DSP": 2,
         "sources": [source(parent_rtl, find_line(parent_rtl, r"grp_fu_24299_p0 =")),
                     source(parent_rtl, find_line(parent_rtl, r"grp_fu_24299_p1 ="))]},
    ]
    unpack = ["Loop_VITIS_LOOP_26_1_proc", "Block_entry_buf_i_0_rd_buf_i_1_rd_buf_i_2_rd_buf_i_3_rd_buf_i_4_rd_buf_i_5_rd_bu_1"]
    for module in unpack:
        micro[module] = parse_schedule(module)
    controls.append({"key": "unpack", "label": "AXI64解包与188个INT8分发", "modules": unpack, "microIds": unpack,
                     "hls": resources(module_info(m) for m in unpack), "sources": [source(MODEL+"topclass24_sd.cpp", 26)],
                     "notes": ["24个64位输入字解包；188字节中180信号送stream，8个RR整数分为两头各4个。"]})
    listed_hls = resources(legacy_layers.values())
    reset_hls = controls[1]["hls"]
    shared_hls = controls[2]["hls"]
    routed_visible = resources(implementation_layers)
    total_route = next(x for x in rows if x["instance"] == "bd_0_wrapper")
    accounting = {"hls": {"layers": listed_hls, "reset": reset_hls, "shared": shared_hls,
                           "forward4": resources([module_info("forward_4")]), "formula": "220 + 3 + 4 = 227 DSP"},
                  "routed": {"total": resources([total_route]), "visibleLayers": routed_visible,
                             "remainder": {k: total_route[k]-routed_visible[k] for k in ("DSP", "BRAM", "LUT", "FF")},
                             "formula": "207 + 13 = 220 DSP", "source": total_route["source"],
                             "note": "13个DSP为当前层级表未归给可见逻辑层的差额；不能据此宣称RTL错误或猜测逐算子归属。"}}
    accounting.update(hlsLayerDSP=listed_hls["DSP"], hlsResetDSP=reset_hls["DSP"],
                      hlsSharedDSP=shared_hls["DSP"], hlsTotalDSP=module_info("forward_4")["DSP"],
                      routedTotalDSP=total_route["DSP"], routedUnresolvedDSP=total_route["DSP"]-routed_visible["DSP"])
    hw = {"version": 1, "evidenceKind": "HLS调度＋功能模型数值推演；不是RTL采样波形",
          "lanes": [{"key": "control", "label": "地址、计数与bank控制"}, {"key": "memory", "label": "状态RAM与端口"},
                    {"key": "input", "label": "输入scale与延迟reset"}, {"key": "neuron", "label": "β、舍入、积分、阈值及写回"}],
          "layers": layers, "controls": controls, "accounting": accounting, "sourceFiles": SOURCE_FILES,
          "notes": ["资源分列HLS估计和Vivado routed实现；模块名含DSP48不保证最终原语占用。", "最终算子绑定见可核对的实现证据；不能从模块总数差值反推某个具体乘法器去向。", "聚合count为该状态的调度操作数，不是物理DSP个数；width为本组最大位宽，widths列出本组出现的位宽。"]}
    hw["fifos"] = fifo_catalog()
    layer_streams = {
        "input": ["s_in"], "conv1": ["s_in", "s0"], "bn1": ["s0", "s1"], "lif1": ["s1", "s2"],
        "pool1": ["s2", "s3"], "qi1": ["s3", "s4"], "conv2": ["s4", "s5"], "bn2": ["s5", "s6"],
        "lif2": ["s6", "s7"], "pool2": ["s7", "s8"], "qi2": ["s8", "s9"], "conv3": ["s9", "s10"],
        "bn3": ["s10", "s11"], "lif3": ["s11", "s12"], "pool3": ["s12", "s_body"],
        "headInputBin": ["s_bin_qi_in", "s_bin_qi_out", "s_bin_fc"], "fcBin": ["s_bin_fc", "s_bin_lif_in"],
        "lifBin": ["s_bin_lif_in", "s_bin_out"], "gate": ["s_bin_out"],
        "headInput4": ["s_m_qi1_in", "s_m_qi1_out", "s_m_fc1"], "fc1": ["s_m_fc1", "s_m_lif1_out"],
        "lif4a": ["s_m_lif1_out", "s_m_qi2"], "qi4": ["s_m_qi2", "s_m_fc2"], "fc2": ["s_m_fc2", "s_m_lif2_in"],
        "lif4b": ["s_m_lif2_in", "s_m_out"], "argmax": ["s_m_out"]}
    for layer in layers:
        layer["fifoIds"] = [fifo["name"] for fifo in hw["fifos"] if fifo["name"] in layer_streams[layer["key"]]]
    compact_ops(micro)
    output = {"hardware": hw, "micro": micro, "implementation_layers": implementation_layers}
    validate(output)
    text = json.dumps(output, ensure_ascii=False, separators=(",", ":"))
    (HERE / "hardware.json").write_text(text, encoding="utf-8")
    print(f"hardware: {len(layers)} layers, {len(micro)} schedules, {len(text.encode('utf-8')):,} bytes")
    print("DSP evidence: HLS 220 + reset 3 + shared 4 = 227; routed visible 207 + remainder 13 = 220")


def validate(output: dict) -> None:
    hw, micro = output["hardware"], output["micro"]
    assert len(hw["layers"]) == 26
    assert len({x["key"] for x in hw["layers"]}) == 26
    for layer in hw["layers"]:
        assert layer["microIds"], layer["key"]
        for ident in layer["microIds"]:
            assert ident in micro
    expected_lif = {"lif1": (8, 2856, 3, 2), "lif2": (8, 1400, 3, 2), "lif3": (7, 991, 1, 0),
                    "lifBin": (6, 8, 1, 1), "lif4a": (6, 134, 2, 2), "lif4b": (6, 10, 1, 1)}
    for layer in hw["layers"]:
        if layer["key"] not in expected_lif:
            continue
        sched = micro[layer["microIds"][0]]
        depth, latency, hls_dsp, route_dsp = expected_lif[layer["key"]]
        assert (sched["ii"], sched["depth"], sched["latency"], layer["hls"]["DSP"], layer["routed"]["DSP"]) == (1, depth, latency, hls_dsp, route_dsp)
        assert len(sched["stages"]) == depth
        assert layer["storage"] and all(x["owner"] == "forward_4" for x in layer["storage"])
        assert sum(x["banks"] for x in layer["storage"]) == 2
    account = hw["accounting"]
    assert account["hls"]["layers"]["DSP"] == 220
    assert account["hls"]["reset"]["DSP"] == 3
    assert account["hls"]["shared"]["DSP"] == 4
    assert account["hls"]["forward4"]["DSP"] == 227
    assert account["routed"]["total"]["DSP"] == 220
    assert account["routed"]["visibleLayers"]["DSP"] == 207
    assert account["routed"]["remainder"]["DSP"] == 13
    for ident, sched in micro.items():
        assert sched["stages"], ident
        if sched["kind"] == "pipeline":
            assert sched["depth"] == len(sched["stages"]), ident
            assert sched["stateRange"] == [sched["stages"][0]["state"], sched["stages"][-1]["state"]]
        for stage in sched["stages"]:
            assert len({idx for indices in stage["lanes"].values() for idx in indices}) == len(stage["ops"])
    assert len(json.dumps(output, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) <= 170000


if __name__ == "__main__":
    main()
