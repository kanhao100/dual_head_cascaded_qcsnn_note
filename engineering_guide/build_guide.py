"""Build a new standalone engineering guide from the actual repository sources.
Does not modify the kernel, HLS configuration or original walkthrough page.
"""
from pathlib import Path
from html import escape
import hashlib
import json
import re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
MODEL = "csnn_cpp/include/hls4csnn1d_sd/model24/"
CB = MODEL + "cblk_sd/"
files = []

def add_notebook(ident, name, title, marker):
    text=(ROOT/name).read_text(encoding="utf-8")
    notebook=json.loads(text)
    cells=[(i, c) for i, c in enumerate(notebook["cells"]) if c.get("cell_type")=="code"]
    index,cell=next(((i,c) for i,c in cells if marker in "".join(c.get("source",[]))),cells[0])
    lines="".join(cell.get("source",[])).splitlines()
    hit=next((i for i,line in enumerate(lines) if marker in line),0)
    start=max(0,hit-3); end=min(len(lines),start+32)
    files.append(dict(id=ident,path=name,title=title,role="Python/Jupyter数据或模型代码；生成参数接入HLS，训练代码本身不综合为FPGA。",
        domain="训练",includes=[],sourceType="notebook",sha256=hashlib.sha256(text.encode()).hexdigest(),
        sections=[dict(title=f"Notebook代码单元 {index+1}",start=start+1,end=end,cell=index,
            code="\n".join(lines[start:end]),note="行号为此代码单元内的代码行，不是.ipynb JSON文件行；仅展示已有流程，不能据此证明所有保存权重来自这次训练。")]))


def add(ident, path, title, role, domain, ranges):
    text = (ROOT / path).read_text(encoding="utf-8")
    lines = text.splitlines()
    sections = []
    for name, start, end, note in ranges:
        assert 1 <= start <= end <= len(lines), (path, start, end, len(lines))
        sections.append(dict(title=name, start=start, end=end,
                             code="\n".join(lines[start-1:end]), note=note))
    files.append(dict(id=ident, path=path, title=title, role=role, domain=domain,
                      includes=re.findall(r'^\s*#include\s+[<"]([^>"]+)', text, re.M),
                      sections=sections, sha256=hashlib.sha256(text.encode()).hexdigest()))


def data():
    files.clear()
    add_notebook("preprocess","ecg_data_preprocessing_mit_bih_intra_patient.ipynb","MIT-BIH预处理Notebook","def ")
    add_notebook("train","ecg_qcsnn2_4_snnTorch_stratified_tts-scaled_input_mitbih_data_stage12_RR_features_intra_patient_split_SMOTE_v2_opt_f1_filtered.ipynb","RRboth训练与导出Notebook","export")
    add("config", "hls/hls_config.cfg", "HLS Component 配置", "决定芯片、时钟、唯一设计入口、编译兼容项和IP输出。当前绝对路径指向原目录。", "构建", [
        ("真正的编译入口", 7, 20, "syn.top选择函数；syn.file选择设计翻译单元。当前没有配置TB，脚本不执行csim/cosim。")])
    add("component", "hls/work_csynth/vitis-comp.json", "work_csynth HLS Component", "由工具生成的HLS Component描述；配置关联../hls_config.cfg。", "构建", [
        ("当前Component名字与配置",1,9,"name=work_csynth，type=HLS；实际综合文件和参数仍由关联的cfg控制。")])
    add("top", CB+"topclass24_sd.cpp", "顶层包装与外部接口", "AXIS解包 → 网络对象 → 双预测回包；HLS只需把该.cpp加入设计源。", "设计", [
        ("topFunction：唯一HLS顶层",111,146,"3条64位AXIS与ap_ctrl_hs；DATAFLOW作用于顶层过程。"),
        ("64位字拆成INT8",10,60,"188个有效byte，共24个word；末4byte填充。TLAST告警只存在于非综合代码。"),
        ("预测重新打包",65,87,"预测在低8bit，其余数据清0；keep/strb=0x0F，last=1。"),
        ("模型对象持久存在",89,105,"static TopClass24_SD对象包含网络与评估包装；不是每个心拍新建硬件。")])
    add("evaluation", CB+"modeleval24_sd.h", "模型调用包装", "把180个标量搬到内部流，RR分别传递，调用网络并读回两个预测。", "设计", [
        ("evaluate的整个职责",14,56,"它的INLINE让调用边界展开。FileReader只是被头文件顺带include，硬件路径没有使用它。")])
    add("network", CB+"qcsnn24_rrboth_sd.h", "RRboth网络编排", "实例化模板层、连接stream、缓存10步特征、控制门控与提前退出。", "设计", [
        ("头文件依赖与尺寸",1,60,"当前版本明确选择lif1d_integer.h；旁边的RR-only/无RR版本不是这个顶层选择的网络。"),
        ("输入、状态复位与缓存",63,115,"180点信号与两套4维RR；body_cache[10][480]为8位数据，4800byte，沿特征维8路分块。"),
        ("stream连接与FIFO深度",116,190,"每个层对象的输入输出由流连接；depth是综合FIFO容量，不代表软件仿真队列容量。"),
        ("第一时间步的层调用",191,227,"逐函数调用：层内pipeline/UNROLL与层间调度是不同粒度。"),
        ("缓存与RR旁路",272,300,"pool3写入当前时间步缓存；前480值经过QI，RR直接追加到FC输入。"),
        ("门控与第二头",309,365,"正常仍向两路输出写结果并return；异常分支重置多分类LIF并读取对应时间步缓存。"),
        ("模板实例定义",413,444,"这里决定层的尺寸和成员。一个类模板会被固定尺寸实例化，C++对象数不等于最终物理模块数。")])
    add("constants", MODEL+"constants24_sd.h", "数字类型与维度常量", "ap_int类型、10个时间步、张量尺寸、AXIS载荷和重量化公共函数。", "设计", [
        ("位宽与网络尺寸",17,89,"ap_int8_c是有符号8位，acc32_t是有符号32位。尺寸会改变综合电路结构。"),
        ("AXIS载荷类型",109,113,"实际是ap_axiu<64,0,0,0>，含64位data、8位keep/strb和1位last。")])
    add("weights", CB+"includeheaders24_sd.h", "参数头文件汇总", "把训练导出的Conv/BN/LIF/FC/QI参数接到当前模型。", "参数", [
        ("实际被包含的参数",1,28,"真实目录是model24/weights_sd。const数组经综合可成为ROM、banked ROM或逻辑常量。")])
    add("weight-example", MODEL+"weights_sd/qcsnet24_cblk1_qconv1d_weights.h", "Conv1导出参数示例", "权重尺寸、重量化乘数、右移量及权重数组；编译时接入。", "参数", [
        ("静态导出头",1,24,"展示头文件原文。当前没有通过AXI上传权重的接口；改变权重后需重新生成硬件。")])
    add("conv", CB+"conv1d_sd.h", "Conv1D模板", "先读输入缓冲；输出位置流水，输入通道和核抽头展开。", "层模板", [
        ("模板、接口与数组分块",11,43,"USE_BIAS/USE_ASYMMETRIC默认false，本网络没有覆盖这两个开关。"),
        ("缓冲与并行内积",45,97,"内积UNROLL生成并行操作；此实现使用整段buffer，文件下面的注释滑窗版本没有生效。")])
    add("bn", CB+"batchnorm1d_sd.h", "推理BN模板", "INT8仿射变换与RNE重量化，使用导出的weight/bias。", "层模板", [
        ("独立BN层的推理循环",79,116,"不用运行时统计均值方差；代码仍保留独立BN层。")])
    add("lif", CB+"lif1d_integer.h", "有状态整数LIF模板", "类成员V0/V1保存膜电位；逐坐标流水更新，调用末翻转bank。", "层模板", [
        ("模板与每心拍reset",10,43,"模板尺寸决定状态存储大小。每心拍显式reset才是应分析的运行控制流程。"),
        ("bank与输入读取",44,74,"BIND_STORAGE两行是注释。代码实际同bank读写，偶奇时间步沿t−2状态链传递。"),
        ("整数表达式如何综合",76,114,"乘法、符号舍入、24位截断、严格比较和写回是可综合C++；最终绑定由报告确认。"),
        ("状态是对象成员",115,120,"状态属于顶层static对象内部，形成长期存在的存储，不是宿主CPU每步临时变量。")])
    add("fc", CB+"linear1d_sd.h", "Linear模板", "输入维串行复用；输出维展开，独立累加器和权重存储通路。", "层模板", [
        ("权重与累加器分块",19,65,"只沿OUTPUT_SIZE分块权重，保留INPUT_SIZE的存储深度；in_vec和acc完全分块。"),
        ("输入顺序、输出并行",67,78,"484次输入迭代，每次更新128个输出，既有时间复用也有空间并行。"),
        ("输出重量化",86,111,"最后逐输出重量化并写FIFO。源码32位累加与HLS范围收窄需分开看。")])
    add("pool", CB+"maxpool1d_sd.h", "MaxPool模板", "每通道缓冲后，2点比较与选择。", "层模板", [
        ("实际池化代码",9,55,"源码使用INT8 max；输入为0/1时可等价理解为OR，器件映射以报告为准。")])
    add("qi", CB+"quantidentity1d_sd.h", "脉冲重新量化模板", "将非零spike映射成q_one并写出INT8。", "层模板", [
        ("尺度与映射",10,52,"尺度由const参数传入，除法可常量折叠；两个QI480对象在RTL中复用物理模块。")])
    add("reader", MODEL+"filereader24.h", "CPU端FileReader", "从CSV读ECG/RR，用float32和nearbyintf量化，属于宿主测试工具。", "CPU验证", [
        ("宿主量化代码",307,324,"FPGA入口看到的是已量化的188个INT8，不在kernel中读CSV或做浮点预处理。")])
    add("host-main", "csnn_cpp/src/cblk1/main.cpp", "CPU直接网络评估入口", "main读取数据后调用ModelEvaluation，绕过AXIS顶层包装。", "CPU验证", [
        ("当前主机程序的模型include",1,32,"cblk1是目录名字；当前这份main也包含model24 RRboth。以真实include判断使用的版本。")])
    add("tb", CB+"topclass24_sd_tb.cpp", "AXIS顶层测试程序", "CSV量化、按24个字打包、调用topFunction并收双输出。", "CPU验证", [
        ("顶层testbench入口",105,139,"它是测试入口；当前hls_config没有设置tb.file，所以脚本不会自动运行它。")])
    add("shim", "hls/shim/skip_host_reader.h", "综合前端兼容shim", "预定义主机FileReader头文件guard，跳过未被综合调用链使用的宿主代码。", "构建", [
        ("强制include的用途",1,9,"编译兼容手段，原作者源码未改；它不描述DSP、RAM或数据通路。")])
    add("synthesis", "hls/run_csynth.bat", "综合脚本", "加载2026.1 Vitis环境，调用v++读取配置并生成HLS工作目录。", "构建", [
        ("现有脚本命令",1,10,"运行前核对hls_config的绝对源路径。当前脚本不会运行C/RTL协同仿真。")])
    add("implementation", "hls/run_package_impl.bat", "打包与OOC实现脚本", "vitis-run打包IP并执行IP单独的Vivado实现。", "构建", [
        ("打包与实现入口",1,13,"生成的是IP/OOC验证产物，不是包含PS、DMA、DDR的PYNQ系统bitstream。")])
    add("golden", "walkthrough/golden/golden_top.cpp", "未改动顶层的CPU参照", "包含作者topclass24_sd.cpp并调用topFunction，用于模型验证。", "验证辅助", [
        ("真实顶层参照程序",1,39,"CPU stream shim支持功能运行；它不能证明FPGA握手时序或RTL一致性。")])

    def pragma(i, name, kind, meaning, effect, file_id, section):
        return dict(id=i,name=name,kind=kind,meaning=meaning,effect=effect,fileId=file_id,sectionIndex=section)
    pragmas = [
        pragma("int","ap_int<N>","库类型","固定有符号位宽整数。","窄类型赋值丢高位；饱和要显式写判断。", "constants",0),
        pragma("stream","hls::stream<T>","通道","read/write以流传递标量。","综合为FIFO和握手；FIFO空/满影响推进。", "evaluation",0),
        pragma("axi","ap_axiu<64,0,0,0>","库类型","AXIS的数据与侧带字段。","64位data、8位keep/strb和1位last。", "constants",1),
        pragma("range",".range(hi,lo)","位操作","取出或设置特定bit区间。","通常形成位切片/接线，按低byte先打包。", "top",1),
        pragma("axis","INTERFACE axis", "接口指令","把顶层stream暴露为AXI4-Stream。","本工程只有1输入、2输出三个AXIS口。", "top",0),
        pragma("ctrl","INTERFACE ap_ctrl_hs", "接口指令","启动、完成、空闲、就绪控制握手。","当前没有顶层AXI-Lite控制寄存器；接PS需明确适配。", "top",0),
        pragma("dataflow","DATAFLOW", "调度指令","顶层过程通过通道协作。","作用于该区域；网络内部仍按其控制流程调用层。", "top",0),
        pragma("pipeline","PIPELINE II=1", "循环指令","请求每拍启动新迭代。","实际II和深度以csynth/schedule为准。", "lif",2),
        pragma("unroll","UNROLL", "循环指令","展开指定循环维度。","FC输出维并行、输入维复用；不直接等于最终DSP数。", "fc",1),
        pragma("complete","ARRAY_PARTITION complete", "存储指令","将指定维度完全拆分。","FC输出权重可同时读，输入深度继续存为ROM。", "fc",0),
        pragma("cyclic","ARRAY_PARTITION cyclic factor=8", "存储指令","按索引模8拆成8路访问。","输入拆8byte、特征缓存多bank，改变访问并行度。", "network",1),
        pragma("depth","STREAM depth", "通道指令","指定综合FIFO深度。","容量与读写调度共同影响资源和阻塞。", "network",2),
        pragma("inline","INLINE / INLINE off", "函数指令","展开或保留综合函数边界。","不保证一个C++对象独占一套电路；QI480会物理共享。", "lif",0),
        pragma("axilite","子函数 s_axilite", "接口上下文","层模板和网络forward写有子函数接口指令。","真正IP外部端口按综合顶层和component.xml确定。", "network",1),
        pragma("binding","BIND_STORAGE / BIND_OP", "绑定指令","用于显式指定存储或运算绑定。","当前LIF BIND_STORAGE仅为注释，生效源码未用BIND_OP。当前映射由工具推导。", "lif",1),
    ]
    workflow = [
        dict(id="train",title="训练与导出",input="根目录PyTorch/Brevitas/snnTorch notebook及MIT-BIH数据",tool="Python / Jupyter",output="INT8权重、BN、Q12 LIF与量化参数头",status="仓库含训练与导出流程",commands=[],note="README的notebooks/目录描述与当前布局不同。已保存参数的训练来源不能仅由文件名证明。"),
        dict(id="cpu",title="CPU功能验证",input="CSV、model24头文件和FileReader",tool="C++ / g++与HLS整数头",output="输入量化字、预测与逐层参照",status="现有golden参照可用",commands=["node walkthrough/qa_numeric.js"],note="这是复查已保存C++参照的命令。编译CPP时需要HLS整数库与stream shim；当前没有本工程CMake。"),
        dict(id="hls",title="Vitis HLS综合",input="唯一design .cpp＋include链＋静态参数＋新配置",tool="Vitis 2026.1 / v++",output="RTL、csynth、verbose.sched/bind",status="已有综合工作产物",commands=["python engineering_guide/make_hls_config.py", 'call E:\\Xilinx\\2026.1\\Vitis\\settings64.bat', 'v++ -c --mode hls --config engineering_guide/hls_current.cfg --work_dir engineering_guide/work_hls'],note="命令需在工程根目录的cmd或已配置工具环境执行。新cfg指向当前副本；这里只生成配置，不自动启动综合。"),
        dict(id="ip",title="IP打包与OOC实现",input="同一个HLS工作目录",tool="vitis-run / Vivado 2026.1",output="IP ZIP、OOC project.xpr、RTL和routed DCP",status="已有IP/OOC产物",commands=['call E:\\Xilinx\\2026.1\\Vivado\\settings64.bat','vitis-run --mode hls --package --config engineering_guide/hls_current.cfg --work_dir engineering_guide/work_hls','vitis-run --mode hls --impl --config engineering_guide/hls_current.cfg --work_dir engineering_guide/work_hls'],note="CPU验证、HLS综合、OOC实现、板级生成是不同工程步骤。当前配置没有TB，没有自动cosim。"),
        dict(id="board",title="板级系统集成",input="HLS IP＋PS/DMA/DDR＋控制适配＋时钟复位",tool="Vivado Block Design / PYNQ",output="整系统.bit及匹配.hwh，板端程序",status="待完成板级工程",commands=[],note="已有bd_0.hwh是单IP OOC包装；没有可部署的配套PYNQ overlay。当前ap_ctrl_hs需控制驱动，两条输出需要独立接收路径。"),
    ]
    for step in workflow:
        step["commands"]=[command.replace(chr(92)*2,chr(92)) for command in step["commands"]]
    return dict(root=str(ROOT), files=files, pragmas=pragmas, workflow=workflow, facts={
        "callChain":[dict(fileId=f,label=l,detail=d,sectionIndex=s) for f,l,d,s in [
            ("config","HLS配置","选择top与design.cpp",0),("top","topFunction","解包 / 调用 / 回包",0),
            ("top","TopClass24_SD","static对象和网络成员",3),("evaluation","ModelEvaluation","内部流搬运与预测收集",0),
            ("network","QCSNN24_RRBOTH_SD","每步调用 / 缓存 / 门控",3),("lif","层模板","固定尺寸运算和状态",0),("weights","导出参数","include接入const数组",0)]],
        "configPitfall":"hls/hls_config.cfg仍含不带“ - 副本”的原目录绝对路径。直接从副本运行原脚本会继续读取原目录。先生成engineering_guide/hls_current.cfg并核对syn.file、cflags和IP输出路径。",
        "boardBoundary":"已有HLS综合、IP包和单IP Vivado OOC工程。bd_0.hwh属于OOC包装，板级PS/DMA/DDR系统与配套.bit/.hwh仍待完成。",
        "lifState":"V0/V1是六个LIF对象的24位成员数组，最终归顶层static对象；每心拍显式reset。实际同bank读写，偶奇t−2链由源码控制。",
        "dataflowBoundary":"topFunction含DATAFLOW，网络forward内部执行10步主干＋二分类、门控和必要的第二阶段。层内并行度由PIPELINE、UNROLL和ARRAY_PARTITION决定。",
        "resourceBoundary":"代码表达式与pragma形成综合输入；DSP/RAM物理归属以HLS绑定和Vivado实现报告确认。HLS预估227 DSP、routed220 DSP，两套口径分开。",
        "interfaces":"188 INT8输入，24个64位字；低byte先，末4byte padding。1输入/2输出AXIS，控制为ap_ctrl_hs；输出预测低8bit，keep/strb=0x0F，last=1。",
        "versions":"本页以实际model24 RRboth include链和2026.1配置为依据。README中的notebooks/、src/入口及2025.1描述需按实际文件修正。",
        "changeTargets":[dict(title=t,detail=d,fileId=f) for t,d,f in [
            ("换权重 / 量化参数","更新model24/weights_sd导出头；重新核对CPU、综合和硬件包。","weights"),
            ("改网络尺寸或连接","同步constants、模板实例、缓存/stream长度及参数维度。","network"),
            ("调并行度 / 吞吐","先看当前UNROLL/PIPELINE与数组访问；修改后检查II、资源和时序。","fc"),
            ("接PS / DMA / 板卡","核对top实际外部控制和AXIS协议，增加板级工程与控制适配。","top"),
        ]],
        "changes":[
            dict(title="换权重与量化参数",note="导出参数进入静态头文件；改动后重新核对CPU，再生成HLS和硬件包。",fileIds=["train","weights","weight-example"],check="参数维度、输入量化与C++输出一致"),
            dict(title="改网络结构与尺寸",note="同步常量、模板实例、stream长度、缓存与导出参数形状。",fileIds=["constants","network"],check="每层读写数量、固定尺寸和所有调用匹配"),
            dict(title="改LIF状态与整数语义",note="在有状态模板中改更新规则，确认每心拍reset和跨时间步状态；重新建立参照。",fileIds=["lif","network"],check="负数Q12、阈值、bank读写与时间步一致"),
            dict(title="调并行度与资源",note="从真实循环维度、UNROLL/PIPELINE及数组访问开始，再检查综合结果。",fileIds=["conv","fc","config"],check="II、FIFO/存储、DSP与布线时序"),
            dict(title="改接口或接板级系统",note="顶层决定真实IP外部端口，配套更改主机打包和板级控制。",fileIds=["top","constants","tb"],check="24输入word、两输出路径、ap_ctrl_hs适配"),
            dict(title="验证和构建工程",note="核对当前副本配置，明确CPU验证、HLS综合、OOC和板级的先后与产物。",fileIds=["config","component","synthesis","implementation","golden"],check="设计入口、工具环境、参照与输出路径"),
        ],
    })


def main():
    payload=data()
    (HERE/"engineering.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
    body=(HERE/"body.html").read_text(encoding="utf-8")
    css=(HERE/"guide.css").read_text(encoding="utf-8")
    js=(HERE/"guide.js").read_text(encoding="utf-8")
    embedded="const ENG="+json.dumps(payload,ensure_ascii=False,separators=(',',':'))+";\n"+js
    embedded=re.sub(r'</script',lambda _:r'<\/script',embedded,flags=re.I)
    html='<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QCSNN 工程解读：从源码到 HLS IP</title><style>'+css+'</style></head><body>'+body+'<script>'+embedded+'</script></body></html>'
    output=HERE/"qcsnn_engineering_guide.html"
    output.write_text(html,encoding="utf-8")
    print(f"Built {output.name}: {output.stat().st_size:,} bytes; {len(files)} source files; {len(payload['pragmas'])} HLS entries")


if __name__=="__main__":
    main()
