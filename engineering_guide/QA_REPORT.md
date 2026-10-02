# 独立工程解读页检查

日期：2026-10-01（Europe/London）。

- 成品：qcsnn_engineering_guide.html，158,785字节，所有源码数据、CSS与JS内嵌。
- 23个实际工程文件，54项源码片段/原语引用核对通过。
- Notebook显示代码单元内行号，普通源码显示真实文件行号，保留片段末尾空行。
- 实际生成HTML的两种主题/交互分支共659项DOM检查，零错误；涵盖文件树、过滤、搜索、调用链、代码选择、HLS项、工作流、命令换行、键盘与修改导航。
- 新hls_current.cfg静态核对通过：设计源、cflags、shim、JSON include都定位当前副本，IP输出在engineering_guide目录。未启动综合或实现。
- 本轮原walkthrough/qcsnn_kernel_walkthrough.html、body.html、build_page.py哈希与工作前一致。
- 未开展本页实际浏览器视觉验收；DOM检查不证明字体、像素和真实滚动布局。

复现：

    python engineering_guide/build_guide.py
    python engineering_guide/qa_sources.py
    node engineering_guide/qa_ui.js

DOM验收使用现有walkthrough/qa/node_modules/jsdom作为只读测试依赖；成品HTML无此依赖。
