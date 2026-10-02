# HTTP复查与全网硬件扩充验收记录

日期：2026-10-01（Europe/London）。本轮采用用户选定的现有集合复验，LIF比其他层展开得更深入。

## 已交付

- 单文件HTML 678,977字节（约0.679 MB），低于1 MB目标；无外部字体、样式或脚本依赖。
- 全网26个逻辑块、52份真实HLS调度，以及输入解包、缓存、复位和共享模块详情。
- 六个LIF的四泳道流水、重叠token、精确整数链、10步双状态链、膜电位RAM、运算位宽与绑定、教学停顿。
- HLS分配与布线后资源并列；共享BN/Conv重量化和QI480只统计一次。
- 原26块数值查看器保留，硬件面板能联动到所选时间步和神经元。
- Python单文件loopback HTTP预览、端口占用后选择空闲端口。
- 浏览器端无缓存性能测量；P95超过200 ms时实验室自动切到点击计算模式。

## 实际执行的检查

| 检查 | 结果 |
|---|---|
| 数据格式、原CSV、标签和metadata | 20,161拍×184列全部对齐；类别计数18,052/557/1,393/159 |
| 验证集与参数 | 1,559拍对齐；42组C++/Python数组校验一致 |
| 输入量化 | 1,559拍×188字，零差异 |
| 逐张量比较 | 200真实拍＋126压力输入，103,924,123个值，零差异 |
| 全量最终pred2/pred4 | 20,161拍与未改动topFunction参照零差异 |
| 展示集与动画计算 | 24拍、9,041摘要、7,709,457保存的C++张量值及5个例子一致 |
| 查看器 | 7,104次格子重算、2,300次C++参照比较，一致 |
| 硬件证据检查 | 7,913项通过；核对XML资源、调度范围、绑定表、RAM和RTL握手 |
| 普通/减少动画DOM交互 | 两模式各477项通过，零捕获错误 |
| HTTP契约 | GET/HEAD、UTF-8、长度、no-store、禁止其他文件、端口占用回退通过 |
| 完整集故障门禁 | 缺失文件、输入截断、预测截断三种情况均失败，不再静默跳过 |

argmax覆盖已分开：本次集合合计3,680次实际执行，2,612个候选相等事件，86次最终最大值并列。不同验证集合可能含重复心拍，这些是执行次数，不是去重后的心拍数量。

Node无缓存性能：24拍×3轮完整trace，中位数11.84 ms、P95 15.97 ms、最大24.63 ms；不含绘图和LRU缓存命中。该结果不代表浏览器实测性能，成品在浏览器加载后自行测量并展示本机结果。

## 硬件资源口径

- HLS DSP：层内220＋主干LIF复位地址3＋BN共享重量化2＋Conv2/3共享重量化2＝227。
- routed DSP：报告可见模块207＋无法继续细分的13＝顶层220。
- 六个LIF的HLS深度为8/8/7/6/6/6；HLS DSP为3/3/1/1/2/1，routed模块DSP为2/2/0/1/2/1。
- 逐运算绑定来自verbose.bind的操作、功能单元与DSP分配表，附来源行；无法确认的绑定标为待核，不以乘法名称判断DSP或LUT。
- LIF状态存储归父模块forward_4，子模块BRAM=0并不意味着没有膜电位存储。

## 实际浏览器与DCP检查的阻断

本轮已启动并验证 http://127.0.0.1:8765/qcsnn_kernel_walkthrough.html 。浏览器工具三次正常请求该HTTP origin，均在导航前返回：管理策略无法验证，安全检查服务不可用，因此未授予访问。此问题不再是file协议。没有修改安全策略或改用其他机制绕过。实际浏览器截图、字体排版、真实滚动和浏览器控制台验收尚未完成；DOM测试使用模拟Canvas和布局，不能替代这些结果。预览服务按计划在本轮结束时停止，可按README重新启动。

读取既有routed DCP时，Vivado初始化报“Could not open C for writing”及“tclapp::load_apps failed”，未打开设计；没有重新综合、修改或保存checkpoint。13个未细分DSP保留说明。

## 验证范围

没有补做全部1,559拍的逐层比较。没有重建预处理或C++参照；模型只调整统计，未改整数运算、缓存或原作者kernel。数值是综合前CPU C++参照与功能模型结果，不声称RTL协同仿真或FPGA实测波形。原Claude在线artifact没有可用更新接口，本轮提供本地HTML及发布片段。

## 可复现命令

工程根目录：

```powershell
python walkthrough/qa_hardware.py
node walkthrough/qa_data.js
node walkthrough/qa_numeric.js
node walkthrough/qa_perf.js
node walkthrough/qa/ui_dom.js
node walkthrough/qa/ui_dom.js --reduced-motion
python walkthrough/qa_preview.py
python walkthrough/preview.py
```

完整模型复验需在walkthrough目录运行 `node verify_model.js --full`，会更新本目录的验证摘要与可达性报告。
