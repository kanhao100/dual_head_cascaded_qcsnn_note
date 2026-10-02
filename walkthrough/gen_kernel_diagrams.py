# -*- coding: utf-8 -*-
"""SVG figures for the kernel walkthrough. Numbers come from kernel.json (reports) so nothing is typed by hand
except structural facts read from the C++/RTL (tagged in the page text). Every box is checked for text overflow."""
import json, sys, os
from pathlib import Path

os.chdir(Path(__file__).resolve().parent)

K = json.load(open("kernel.json", encoding="utf-8"))
WARN = []

def tw(s, size):
    return sum(size * (1.0 if ord(c) > 0x2E80 or c in "→×−Σ≥≤⋯·₁₂" else 0.58) for c in s)

def esc(s): return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
fmt = lambda n: "{:,}".format(n)

class S:
    def __init__(s, n, w, h): s.n, s.w, s.h, s.o = n, w, h, []
    def rect(s, x, y, w, h, c, rx=7): s.o.append('<rect class="%s" x="%s" y="%s" width="%s" height="%s" rx="%d"/>' % (c, x, y, w, h, rx))
    def text(s, x, y, t, c="ts", a="middle"): s.o.append('<text class="%s" x="%s" y="%s" text-anchor="%s">%s</text>' % (c, x, y, a, esc(t)))
    def box(s, x, y, w, h, cls, titles, subs=()):
        s.rect(x, y, w, h, "bx " + cls)
        lines = [(t, "t", 13) for t in titles] + [(t, "ts", 11) for t in subs]
        y0 = y + (h - len(lines) * 16) / 2 + 12
        if len(lines) * 16 > h - 2: WARN.append("%s: box (%s,%s) too short" % (s.n, x, y))
        for i, (t, c, z) in enumerate(lines):
            if tw(t, z) > w - 8: WARN.append("%s: '%s' %.0fpx > box %s" % (s.n, t, tw(t, z), w))
            s.text(x + w / 2, y0 + i * 16, t, c)
    def ln(s, pts, cls="", head="A", dash=False):
        d = "M" + " L".join("%s %s" % p for p in pts)
        s.o.append('<path class="ln %s%s" d="%s"%s/>' % (cls, " dsh" if dash else "", d, ' marker-end="url(#%s%s)"' % (s.n, head) if head else ""))
    def region(s, x, y, w, h, cls=""): s.o.append('<rect class="rg %s" x="%s" y="%s" width="%s" height="%s" rx="10"/>' % (cls, x, y, w, h))
    def svg(s, title):
        mk = "".join('<marker id="%s%s" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="mk %s" d="M2 1L8 5L2 9"/></marker>' % (s.n, k, c) for k, c in (("A", ""), ("C", "mkc"), ("G", "mkg")))
        return '<svg class="dg" viewBox="0 0 %d %d" role="img"><title>%s</title><defs>%s</defs>%s</svg>' % (s.w, s.h, esc(title), mk, "".join(s.o))

M = K["macro"]; s1 = {r["tag"] + "|" + r["label"]: r for r in M["stage1"]}
def cyc(rows, *labels):
    return sum(r["cycles"] for r in rows if any(r["label"].startswith(l) for l in labels))
b1 = cyc(M["stage1"], "卷积1", "BN1", "LIF1", "池化1") + M["stage1"][0]["cycles"]   # includes input replay
b2 = cyc(M["stage1"], "QI2", "卷积2", "BN2", "LIF2", "池化2")
b3 = cyc(M["stage1"], "QI3", "卷积3", "BN3", "LIF3", "池化3")
head1 = M["stage1_sum"] - b1 - b2 - b3
st2 = M["stage2_iter"]

# ------------------------------------------------------------------ fig 1 : top-level data path
def fig1():
    s = S("f1", 940, 790)
    s.box(20, 24, 120, 56, "io", ["AXI-Stream 输入"], ["24 拍 × 64 位"])
    s.ln([(140, 52), (166, 52)])
    s.box(166, 24, 130, 56, "cmp", ["解包"], ["24 字 → 188 字节"])
    s.ln([(296, 52), (322, 52)])
    s.box(322, 24, 170, 56, "mem", ["输入缓冲"], ["188 × 8 位，8 路分块"])
    s.ln([(492, 52), (516, 52)], head="")
    s.ln([(516, 23), (516, 87)], head="")
    for y in (23, 55, 87): s.ln([(516, y), (540, y)])
    s.box(540, 10, 200, 26, "mem", ["重放缓冲 180 × 8 位"])
    s.box(540, 42, 200, 26, "mem", ["RR₁ 寄存器 4 × 8 位"])
    s.box(540, 74, 200, 26, "mem", ["RR₂ 寄存器 4 × 8 位"])
    for i, (c, t) in enumerate([("cmp", "计算"), ("mem", "存储"), ("cnd", "4 分类头（按需）"), ("ok", "提前退出路径")]):
        s.rect(770, 12 + i * 23, 18, 14, "bx " + c, rx=3); s.text(796, 24 + i * 23, t, "ts", "start")
    s.region(10, 118, 920, 236)
    s.text(24, 138, "时间步循环 × 10（每步 %s 周期；LIF 膜电位在步间保留）" % fmt(M["stage1_iter"]), "tm", "start")
    s.box(30, 150, 110, 50, "io", ["重放缓冲"], ["每步送入一次"])
    s.ln([(140, 175), (156, 175)])
    s.box(156, 150, 170, 50, "cmp", ["卷积块 1"], ["Conv · BN · LIF · 池化", "≈ %s 周期" % fmt(b1 - M["stage1"][0]["cycles"])])
    s.ln([(326, 175), (342, 175)])
    s.box(342, 150, 50, 50, "cmp", ["QI"])
    s.ln([(392, 175), (408, 175)])
    s.box(408, 150, 170, 50, "cmp", ["卷积块 2"], ["Conv · BN · LIF · 池化", "≈ %s 周期（含 QI）" % fmt(b2)])
    s.ln([(578, 175), (594, 175)])
    s.box(594, 150, 50, 50, "cmp", ["QI"])
    s.ln([(644, 175), (660, 175)])
    s.box(660, 150, 170, 50, "cmp", ["卷积块 3"], ["Conv · BN · LIF · 池化", "≈ %s 周期（含 QI）" % fmt(b3)])
    s.text(745, 216, "480 个 0/1 脉冲 / 步", "ts")
    s.ln([(745, 222), (745, 262)]); s.ln([(745, 240), (80, 240), (80, 262)])
    s.text(400, 234, "同一份特征分给两条路", "ts")
    s.box(30, 262, 100, 60, "cmp", ["QI"], ["480 → INT8"])
    s.ln([(130, 292), (146, 292)])
    s.box(146, 262, 120, 60, "cmp", ["拼接 + RR₁"], ["共 484 个"])
    s.ln([(266, 292), (282, 292)])
    s.box(282, 262, 110, 60, "cmp", ["FC 484→2"], ["2 路并行 MAC"])
    s.ln([(392, 292), (408, 292)])
    s.box(408, 262, 80, 60, "cmp", ["LIF × 2"])
    s.ln([(488, 292), (504, 292)])
    s.box(504, 262, 140, 60, "cmp", ["Σ 脉冲数"], ["sum_norm / sum_abn", "16 位"])
    s.box(660, 262, 170, 60, "mem", ["特征缓存"], ["body_cache[10][480]", "8 位，8 块（每块 600 字）"])
    s.text(86, 340, "二分类头（每步都跑，含缓存写入共 ≈ %s 周期）" % fmt(head1), "tm", "start")
    s.ln([(569, 322), (569, 385)])
    s.box(494, 385, 150, 60, "io", ["门控"], ["sum_abn > sum_norm ?"])
    s.ln([(494, 415), (260, 415)])
    s.text(377, 408, "pred2（0 正常 / 1 异常）", "ts")
    s.box(30, 385, 230, 60, "io", ["打包 pred2 → AXI 输出"], ["dmaOut2Stream · 1 个 64 位字"])
    s.ln([(530, 445), (530, 500), (490, 500)], cls="ok", head="G")
    s.text(538, 468, "正常 (0)", "ts", "start")
    s.box(290, 470, 200, 60, "ok", ["提前退出：pred4 = 0"], ["打包 → dmaOut4Stream"])
    s.ln([(610, 445), (610, 555)], cls="cnd", head="C")
    s.text(620, 505, "异常 (1)", "ts", "start")
    s.box(770, 385, 160, 60, "io", ["两路输出各一个字"], ["低字节 = 类别号", "keep = 0x0F"])
    s.region(10, 555, 920, 215, "cnd")
    s.text(24, 575, "4 分类头 · 循环 × 10（仅异常心拍；每步 %s 周期；读缓存，不重算主干）" % fmt(st2), "tm", "start")
    s.ln([(745, 322), (745, 595)], cls="cnd", head="C", dash=True)
    def c2(x, y, w, t, sub=()): s.box(x, y, w, 55, "cnd", t, sub)
    c2(700, 595, 130, ["读缓存"], ["body_cache[t]"]); s.ln([(700, 622), (676, 622)], cls="cnd", head="C")
    c2(556, 595, 120, ["QI"], ["0/1 → 0 / q_one"]); s.ln([(556, 622), (532, 622)], cls="cnd", head="C")
    c2(412, 595, 120, ["拼接 + RR₂"], ["共 484 个"]); s.ln([(412, 622), (388, 622)], cls="cnd", head="C")
    c2(258, 595, 130, ["FC 484→128"], ["128 路并行 MAC"]); s.ln([(258, 622), (234, 622)], cls="cnd", head="C")
    c2(124, 595, 110, ["LIF × 128"]); s.ln([(179, 650), (179, 690)], cls="cnd", head="C")
    c2(124, 690, 110, ["QI"], ["128"]); s.ln([(234, 717), (250, 717)], cls="cnd", head="C")
    c2(250, 690, 120, ["FC 128→4"], ["4 路并行 MAC"]); s.ln([(370, 717), (386, 717)], cls="cnd", head="C")
    c2(386, 690, 100, ["LIF × 4"]); s.ln([(486, 717), (502, 717)], cls="cnd", head="C")
    c2(502, 690, 140, ["Σ 脉冲数"], ["4 × 16 位"]); s.ln([(642, 717), (658, 717)], cls="cnd", head="C")
    c2(658, 690, 110, ["argmax"], ["取最大者"]); s.ln([(768, 717), (784, 717)], cls="cnd", head="C")
    s.box(784, 690, 140, 55, "io", ["打包 pred4"], ["→ dmaOut4Stream"])
    return s.svg("kernel 顶层数据通路")

# ------------------------------------------------------------------ fig 2 : conv engine (conv2 loop, from sched report + memory table)
def fig2():
    s = S("f2", 940, 330)
    s.text(20, 22, "卷积 2 的计算循环（16→16 通道，核 3，输出 87 点 × 16 通道 = 1392 次迭代，II=1，流水线深度 27）", "tm", "start")
    s.box(20, 40, 160, 76, "mem", ["input_buffer"], ["16 通道 × 3 分块 = 48 块", "每块 30 × 8 位", "BRAM 0（寄存器/分布式）"])
    s.ln([(180, 78), (196, 78)])
    s.box(196, 40, 150, 76, "cmp", ["地址计算  S2–S12"], ["t mod 3：取模，11 周期", "t / 3：乘 171 再取高位"])
    s.ln([(346, 78), (372, 78)])
    s.box(372, 40, 130, 76, "cmp", ["读取  S12–S13"], ["144 次 load", "= 48 抽头 × 3 块"])
    s.ln([(502, 78), (528, 78)])
    s.box(528, 40, 120, 76, "cmp", ["分块选择  S13"], ["63 个 sparsemux", "按 t mod 3 挑结果"])
    s.ln([(648, 78), (674, 78)])
    s.box(674, 40, 120, 76, "cmp", ["乘法  S13–S24"], ["110 个 mul 操作", "HLS：31 DSP"])
    s.ln([(794, 78), (820, 78)])
    s.box(820, 40, 100, 76, "cmp", ["加法树", "S15–S22"], ["77 个 add"])
    s.ln([(870, 116), (870, 150), (760, 150)])
    s.box(20, 150, 130, 70, "mem", ["权重常量表"], ["weights[oc][ic][k]", "oc、ic 完全分块"])
    s.ln([(150, 185), (676, 185)], dash=True)
    s.text(410, 178, "oc 由计数器选通，同一拍取 48 个权重", "ts")
    s.box(580, 150, 180, 70, "cmp", ["重量化  S23–S27"], ["× 乘数 → + 舍入 → 右移", "→ 饱和到 INT8 → 写 FIFO"])
    s.box(780, 150, 140, 70, "io", ["输出 FIFO"], ["INT8 流"])
    s.ln([(760, 185), (780, 185)])
    s.box(20, 250, 900, 60, "io", ["为什么能做到 II=1（依据：调度报告 + 存储器表）"],
          ["每拍需要同一通道的 t、t+1、t+2 三个点：工具把 input_buffer 按时间再分成 3 块（t mod 3），三个点分属三块，同拍各读一块。", "代价是前 12 级几乎都花在地址计算上，流水线变深（27 级），但每拍仍可启动一个新迭代。"])
    return s.svg("卷积循环结构")

# ------------------------------------------------------------------ fig 3 : FC1 engine
def fig3():
    s = S("f3", 940, 420)
    s.text(20, 22, "FC 484→128 的点积循环（DOT_I）：484 次迭代，II=1，流水线深度 5", "tm", "start")
    s.box(20, 60, 100, 50, "io", ["输入 FIFO"], ["INT8 流"]); s.ln([(120, 85), (140, 85)])
    s.box(140, 40, 170, 90, "mem", ["in_vec[484]"], ["484 × 8 位", "完全分块 = 寄存器"])
    s.ln([(310, 85), (330, 85)])
    s.box(330, 60, 110, 50, "cmp", ["484 选 1"], ["计数器 i"])
    cols = [470, 620, 770]; names = ["o = 0", "o = 1", "o = 127"]
    s.ln([(440, 85), (cols[-1] + 104, 85)], head="")
    s.text(640, 70, "x（INT8）广播给 128 个乘加单元", "ts")
    for x0, nm in zip(cols, names):
        s.text(x0 + 68, 138, nm, "tm")
        s.ln([(x0 + 104, 85), (x0 + 104, 150)])
        s.box(x0, 150, 64, 50, "mem", ["W[o]"], ["ROM"]); s.ln([(x0 + 64, 175), (x0 + 72, 175)], head="")
        s.box(x0 + 72, 150, 64, 50, "cmp", ["MAC"], ["8×8→24"])
        s.ln([(x0 + 104, 200), (x0 + 104, 230)])
        s.box(x0, 230, 136, 50, "cmp", ["acc[o]"], ["24 位寄存器"])
    s.text(605, 302, "…… 共 128 路同时累加", "ts")
    s.text(20, 175, "每路一块权重 ROM（484×8 位）", "ts", "start")
    s.text(20, 195, "= 1 块 BRAM，128 路共 128 块", "ts", "start")
    s.text(20, 225, "点积：HLS 128 DSP；实现后 96", "ts", "start")
    s.text(20, 245, "（S2–S4 三级流水乘，S4 读 acc", "ts", "start")
    s.text(20, 261, "并加，S5 写回）", "ts", "start")
    s.line = None
    s.ln([(538, 280), (538, 296), (838, 296)], head=""); s.ln([(688, 280), (688, 296)], head=""); s.ln([(838, 280), (838, 296)], head="")
    s.ln([(688, 296), (688, 330)])
    s.box(470, 330, 300, 56, "cmp", ["OUT_LOOP：逐个取 acc[o]"], ["重量化 → INT8（128 次，II=1，共 134 周期）"])
    s.ln([(770, 358), (800, 358)])
    s.box(800, 330, 120, 56, "io", ["输出 FIFO"], ["INT8 流"])
    return s.svg("FC 引擎结构")

# ------------------------------------------------------------------ fig 4 : LIF neuron
def fig4():
    s = S("f4", 940, 400)
    s.box(20, 30, 110, 50, "io", ["x（INT8）"], ["来自 BN 输出"]); s.ln([(130, 55), (156, 55)])
    s.box(156, 30, 160, 50, "cmp", ["× 输入尺度"], ["Q12 → x_q 24 位"])
    s.ln([(316, 55), (660, 55), (660, 200)]); s.text(480, 47, "x_q", "tm")
    s.text(85, 124, "膜电位存储（V0 偶数步用，V1 奇数步用）", "ts")
    s.box(20, 132, 130, 44, "mem", ["V0[c][t]"], ["24 位"]); s.box(20, 184, 130, 44, "mem", ["V1[c][t]"], ["24 位"])
    s.box(176, 140, 84, 80, "cmp", ["读 V_bank"], ["bank 标志", "选哪一块"])
    s.ln([(150, 154), (176, 164)]); s.ln([(150, 206), (176, 196)])
    s.ln([(260, 180), (280, 180), (280, 135), (300, 135)]); s.ln([(280, 180), (280, 225), (300, 225)])
    s.text(268, 174, "v_prev", "tm", "end")
    s.box(300, 110, 130, 50, "cmp", ["v_prev > θ ?"], ["同 bank 的 t−2 状态"])
    s.box(300, 200, 130, 50, "cmp", ["× β"], ["β 夹在 0 … 1.0"])
    s.ln([(430, 135), (450, 135)])
    s.box(450, 110, 150, 50, "cmp", ["r_q × θ，舍入右移"], ["负 θ：−41→−42", "r_q 为 0 或 4096"])
    s.ln([(430, 225), (450, 225)])
    s.box(450, 200, 130, 50, "cmp", ["按符号 ±2048"], ["算术右移 12"])
    s.ln([(580, 225), (600, 225)])
    s.box(600, 200, 120, 50, "cmp", ["相加"], ["v_beta + x_q"])
    s.ln([(720, 225), (750, 225)]); s.ln([(600, 135), (820, 135), (820, 200)])
    s.box(750, 200, 150, 50, "cmp", ["相减"], ["v_next = base − 复位量"])
    s.ln([(820, 250), (820, 300)])
    s.box(750, 300, 150, 50, "cmp", ["v_next > θ ?"], ["是 → 脉冲 1，否 → 0"])
    s.text(825, 372, "spike（0 / 1）→ 最大池化", "ts")
    s.ln([(780, 250), (780, 278), (85, 278), (85, 232)]); s.text(440, 270, "v_next 写回同一块 V_bank（按源码；之后 bank 翻转）", "ts")
    return s.svg("整数 LIF 神经元数据通路")

if __name__ == "__main__":
    for k, f in (("f1", fig1), ("f2", fig2), ("f3", fig3), ("f4", fig4)):
        open(k + ".svg.html", "w", encoding="utf-8").write(f())
    print("\n".join(WARN) if WARN else "all text fits")
    print("block cycles: b1=%d b2=%d b3=%d head1=%d stage2_iter=%d" % (b1 - M["stage1"][0]["cycles"], b2, b3, head1, st2))
