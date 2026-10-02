# QCSNN 工程解读

独立入口：qcsnn_engineering_guide.html。本页讲工程目录、源码职责、调用链、HLS库类型/综合指令、模板实例和构建流程。原walkthrough解读页保持独立。

源码片段直接从当前工程提取，带文件路径与行号；Notebook使用代码单元内行号。生效入口以实际hls/hls_config.cfg及其include链为准。

## 构建与核对

工程根目录运行：

    python engineering_guide/make_hls_config.py
    python engineering_guide/build_guide.py
    python engineering_guide/qa_sources.py

构建只依赖Python标准库。生成HTML没有外部字体、脚本或样式依赖。配置生成器仅写本目录的hls_current.cfg，不启动HLS综合或修改旧配置。

## HLS工程复现

原hls/hls_config.cfg的绝对路径指向不带“ - 副本”的原目录。新配置定位当前副本的设计入口、编译include路径，并将IP包输出到本目录。

页面给出真实的v++/vitis-run命令，需在工程根目录、已加载2026.1工具环境的cmd中使用。这些命令会耗时并生成新的综合/实现工作目录，本次仅准备并静态核对配置，没有执行新综合。

## 板级边界

当前有HLS IP和单IP Vivado OOC工程/报告/DCP。现有bd_0.hwh属于OOC包装，尚无可部署的PYNQ整系统配套bitstream。顶层接口是三条AXIS与ap_ctrl_hs；PS控制适配、双输出接收、DMA/DDR/时钟复位及板级生成需另行实现。
