# One-shot patch: make three animations more visual.
#   1. conv 1: waveform line plots + 3-point filter bars + clickable filter gallery (instead of a colour strip)
#   2. FC: aligned input / weight / product strips and a running-sum line chart (instead of a bare bar chart)
#   3. BN / rounding: a number line showing where the value sits between two integers and which one each rule picks
import re

# ------------------------------------------------------------------ conv 1
p = "anim_b.js"
s = open(p, encoding="utf-8").read()
a = s.index("      // ---- left: input map + output row")
b = s.index("      // ---- right: requantisation")
old = s[a:b]
pre_old = ("      const items = []; let acc = 0; const vals = [];\n"
           "      for (let q = 0; q < ic; q++) for (let j = 0; j < k; j++) { const x = inp[q * sp.inLen + w + j], wt = conv.weights[(oc * ic + q) * k + j]; vals.push([x, wt, x * wt]); }\n"
           "      const shown = Math.min(nprod, m + 1 > nprod ? nprod : m + 1); // items already multiplied\n"
           "      for (let q = 0; q < shown; q++) acc += vals[q][2];\n")
assert pre_old in old
acc_line = "      const accFull = vals.reduce((a, v) => a + v[2], 0), accShow = mode === 'pos' ? accFull : acc;\n"
assert acc_line in old
old2 = old.replace(pre_old, "").replace(acc_line, "")
assert "const MX = 420, cellW = 40, top = 52, rh" in old2
old2 = old2.replace("const MX = 420, cellW = 40, top = 52, rh", "const MX = 420, cellW = 40, rh")

CONV1 = r'''        // conv 1 has a single input channel, so show it as what it is: a waveform, a 3-point template sliding over it, and the filtered waveform
        const LX = 10, LW = 392, n0 = 180, xs = i => LX + (i + .5) / n0 * LW, yv = (v, y0, ht) => y0 + ht - (v + 128) / 255 * ht, outRow = G.out.subarray(oc * sp.outLen, (oc + 1) * sp.outLen);
        const poly = (arr, off, from, to, y0, ht, col, lw, al) => { c.globalAlpha = al; c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); for (let i = from; i <= to; i++) { const X = xs(i + off), Y = yv(arr[i], y0, ht); i === from ? c.moveTo(X, Y) : c.lineTo(X, Y); } c.stroke(); c.globalAlpha = 1; };
        const frame = (y0, ht) => { c.fillStyle = p.surface2; c.fillRect(LX, y0, LW, ht); c.strokeStyle = p.line; c.lineWidth = 1; c.strokeRect(LX + .5, y0 + .5, LW - 1, ht - 1); line(c, LX, yv(0, y0, ht), LX + LW, yv(0, y0, ht), p.grid, 1); };
        txt(c, '输入：INT8 波形（180 点）。红色窗口 = 滤波器此刻看的 3 个点', LX, 22, p.ink2, 11.5, 'left', p.body);
        const IY = 34, IH = 150; frame(IY, IH); c.fillStyle = HW.alpha(p.bad, .14); c.fillRect(xs(w) - 3, IY, xs(w + 2) - xs(w) + 6, IH);
        poly(inp, 0, 0, 179, IY, IH, p.sig, 1.6, 1);
        for (let j = 0; j < 3; j++) { c.fillStyle = p.bad; c.beginPath(); c.arc(xs(w + j), yv(inp[w + j], IY, IH), 3.6, 0, 7); c.fill(); }
        const OY = 226, OH = 100; txt(c, `输出：通道 ${oc} 的滤波结果（已算到 w=${w}）`, LX, OY - 8, p.ink2, 11.5, 'left', p.body); frame(OY, OH);
        poly(outRow, 1, 0, sp.outLen - 1, OY, OH, p.muted, 1.2, .35); poly(outRow, 1, 0, w, OY, OH, p.en, 1.8, 1);
        line(c, xs(w + 1), IY + IH, xs(w + 1), yv(outRow[w], OY, OH), p.bad, 1, [3, 3]); c.fillStyle = p.bad; c.beginPath(); c.arc(xs(w + 1), yv(outRow[w], OY, OH), 4.5, 0, 7); c.fill();
        const cur = mode === 'mac' && m < nprod ? m : -1, CP = 124, CW = 112, CT = 66, CH = 120, zy = CT + CH / 2, wmax = Math.max(1, ...vals.map(v => Math.abs(v[1]))), pmax = Math.max(1, ...vals.map(v => Math.abs(v[2])));
        txt(c, '窗口 × 滤波器 = 乘积，三项相加得 acc', 420, 22, p.ink2, 11.5, 'left', p.body);
        [['输入窗口', 0, 128], ['滤波器权重', 1, wmax], ['乘积', 2, pmax]].forEach(([ti, b, mx]) => {
          const x0 = 420 + b * CP; txt(c, ti, x0, 42, p.ink2, 11.5, 'left', p.body); txt(c, `刻度 ±${mx}`, x0 + CW, 42, p.muted, 10, 'right', p.body); line(c, x0, zy, x0 + CW, zy, p.grid, 1); c.strokeStyle = p.line; c.strokeRect(x0 + .5, CT + .5, CW - 1, CH - 1);
          vals.forEach((v, j) => {
            if (b === 2 && j >= shown) return; const val = v[b], bh = Math.abs(val) / mx * (CH / 2 - 14), bx = x0 + 14 + j * 34, by = val >= 0 ? zy - bh : zy;
            c.fillStyle = A.mix(P_.zero, val >= 0 ? P_.pos : P_.neg, .85); c.fillRect(bx, by, 24, Math.max(bh, 1)); if (j === cur) { c.strokeStyle = p.bad; c.lineWidth = 2; c.strokeRect(bx - 2, CT + 2, 28, CH - 4); }
            txt(c, String(val), bx + 12, val >= 0 ? by - 4 : by + bh + 12, p.ink, 11, 'center');
          });
          if (b < 2) txt(c, b === 0 ? '×' : '=', x0 + CW + 6, zy + 5, p.muted, 15, 'left');
        });
        txt(c, `Σ = ${accShow}${shown < nprod ? '（部分和）' : '（INT32 累加值）'}`, 420, 214, shown < nprod ? p.muted : p.ink, 14);
        const gmax = Math.max(1, ...Array.from(conv.weights, v => Math.abs(v))), GX = 420, GY = 252, GW = 46, GH = 56;
        txt(c, `16 个滤波器，每个只有 3 个权重（点一个切换）`, GX, GY - 8, p.ink2, 11.5, 'left', p.body);
        for (let i = 0; i < sp.oc; i++) {
          const gx = GX + (i % 8) * GW, gy = GY + Math.floor(i / 8) * GH, sel = i === oc; c.fillStyle = sel ? HW.alpha(p.en, .14) : p.surface; c.fillRect(gx, gy, GW - 3, GH - 4); c.strokeStyle = sel ? p.en : p.line; c.lineWidth = sel ? 2 : 1; c.strokeRect(gx + .5, gy + .5, GW - 4, GH - 5); line(c, gx + 4, gy + 24, gx + GW - 7, gy + 24, p.grid, 1);
          for (let j = 0; j < 3; j++) { const wt = conv.weights[i * 3 + j], bh = Math.abs(wt) / gmax * 20; c.fillStyle = A.mix(P_.zero, wt >= 0 ? P_.pos : P_.neg, .85); c.fillRect(gx + 8 + j * 11, wt >= 0 ? gy + 24 - bh : gy + 24, 8, Math.max(bh, 1)); }
          txt(c, String(i), gx + (GW - 3) / 2, gy + GH - 8, sel ? p.en : p.muted, 10, 'center');
        }
        cv._g = { x0: GX, y0: GY, cw: GW, ch: GH, cols: 8 };
        txt(c, '滤波器像一个 3 点模板：窗口里的波形越像它，输出越大。', 420, 380, p.muted, 11.5, 'left', p.body); txt(c, '16 个模板各找一种形状，输出的 16 条波形就是 16 个“通道”。', 420, 398, p.muted, 11.5, 'left', p.body);
'''
new = ("      const top = 52; let acc = 0; const vals = [];\n"
       "      for (let q = 0; q < ic; q++) for (let j = 0; j < k; j++) { const x = inp[q * sp.inLen + w + j], wt = conv.weights[(oc * ic + q) * k + j]; vals.push([x, wt, x * wt]); }\n"
       "      const shown = Math.min(nprod, m + 1 > nprod ? nprod : m + 1); // items already multiplied\n"
       "      for (let q = 0; q < shown; q++) acc += vals[q][2];\n" + acc_line +
       "      if (L === 0) {\n" + CONV1 + "      } else {\n" + old2 + "      }\n")
s = s[:a] + new + s[b:]
assert s.count("const top = 52") == 1
# click on the filter gallery
hook = "    HW.seg('cv-layer', v => { setLayer(+v); });"
assert hook in s
s = s.replace(hook, "    $('#cv-cv').addEventListener('click', e => { if (L !== 0) return; const cv = e.currentTarget, g = cv._g; if (!g) return; const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, col = Math.floor((x - g.x0) / g.cw), row = Math.floor((y - g.y0) / g.ch); if (col < 0 || col >= g.cols || row < 0 || row > 1) return; const i = row * g.cols + col; if (i < CV[0].oc) { cOc.set(i); jump(); } });\n" + hook, 1) if hook in s else s

# ------------------------------------------------------------------ BN number line
NL = r'''    /* where the exact quotient sits between two integers, and which one each rule picks */
    function numberLine(cv, D) {
      if (!cv) return; const { c, w: W } = setupCanvas(cv), p = pal();
      if (D.trivial) { txt(c, '移位 ≤ 0：不做取整，直接取低 32 位后饱和。', 12, 30, p.muted, 12, 'left', p.body); return; }
      const v = Number(D.prod) / Math.pow(2, D.r), n0 = Math.floor(v), n1 = n0 + 1, mid = n0 + .5, rne = Number(D.neg ? -D.b2 : D.b2), hu = Number((D.prod + D.half) >> BigInt(D.r));
      const L0 = 40, R0 = W - 40, u0 = n0 - 1, u1 = n1 + 1, xs = u => L0 + (u - u0) / (u1 - u0) * (R0 - L0), ay = 52;
      txt(c, '数轴：精确商 acc×乘数÷2^r 落在哪两个整数之间', 8, 16, p.ink2, 11.5, 'left', p.body);
      c.fillStyle = HW.alpha(p.sig, .13); c.fillRect(xs(n0), ay - 14, xs(mid) - xs(n0), 28); c.fillStyle = HW.alpha(p.mwi, .15); c.fillRect(xs(mid), ay - 14, xs(n1) - xs(mid), 28);
      line(c, L0, ay, R0, ay, p.ink2, 1.5);
      for (let u = u0; u <= u1; u++) { line(c, xs(u), ay - 7, xs(u), ay + 7, p.ink2, 1.5); txt(c, String(u), xs(u), ay + 24, p.ink, 12.5, 'center'); }
      line(c, xs(mid), ay - 14, xs(mid), ay + 14, p.en, 2, [3, 3]); txt(c, '一半', xs(mid), ay - 18, p.en, 11, 'center', p.body);
      const mx = xs(Math.max(u0 + .02, Math.min(u1 - .02, v))); c.fillStyle = p.bad; c.beginPath(); c.arc(mx, ay, 5.5, 0, 7); c.fill(); txt(c, v.toFixed(Math.abs(v) < 1000 ? 4 : 1), mx, ay + 42, p.bad, 11, 'center');
      const ar = (to, col, dash, lab, y) => { c.setLineDash(dash ? [4, 3] : []); A.arrow(c, mx, ay + 52, xs(Math.max(u0, Math.min(u1, to))), ay + 74, col, 2); c.setLineDash([]); txt(c, lab, xs(Math.max(u0, Math.min(u1, to))), y, col, 11.5, 'center', p.body); };
      ar(rne, p.mwi, false, `五成双 → ${rne}`, ay + 90); if (hu !== rne) ar(hu, p.gold, true, `加半再右移 → ${hu}`, ay + 106);
      txt(c, D.tie ? '恰好落在一半：取偶数' : (v - n0 < .5 ? '离 ' + n0 + ' 更近' : '离 ' + n1 + ' 更近'), 8, ay + 118, p.muted, 11, 'left', p.body);
    }
'''
hook2 = "    function curve() {"
assert hook2 in s
s = s.replace(hook2, NL + hook2, 1)
s = s.replace("    const redraw = () => { calc(); curve(); };", "    const nlBn = () => { const q = params(), x = xval(); numberLine($('#bn-nl'), rneDetail(x * q.w + q.bias, q.mult, q.shift)); };\n    const redraw = () => { calc(); curve(); nlBn(); };", 1)
assert "nlBn" in s
# tie demo: draw after the calc rows
t_old = "    [tA, tM, tS].forEach(cc => cc.inp.addEventListener('input', tie));"
assert t_old in s
s = s.replace("    function tie() {", "    function tie() {\n      try { numberLine($('#bn-tie-nl'), rneDetail(tA.get(), tM.get(), tS.get())); } catch (e) { console.error(e); }", 1)
open(p, "w", encoding="utf-8").write(s)

# ------------------------------------------------------------------ FC
p = "anim_d.js"
s = open(p, encoding="utf-8").read()
a = s.index("      const X = 10, Wd = W - 20; txt(c, `输入向量")
b = s.index("      const D = A.reqDetail(Math.round(fin[so])")
FC = r'''      const X = 10, X0 = 90, Wd = W - X0 - 14, so = Math.min(cO.get(), no - 1);
      const cum = []; let lo = 0, hi = 0, pmx = 1;
      for (let o = 0; o < no; o++) { const a = new Float64Array(nn + 1); let sm = 0; for (let i = 0; i < nn; i++) { sm += x[i] * F.weights[o * nn + i]; a[i + 1] = sm; if (sm < lo) lo = sm; if (sm > hi) hi = sm; } cum.push(a); }
      const pr = new Float64Array(nn), wr = new Int8Array(nn); for (let i = 0; i < nn; i++) { wr[i] = F.weights[so * nn + i]; pr[i] = x[i] * wr[i]; pmx = Math.max(pmx, Math.abs(pr[i])); }
      const accs = new Float64Array(no), fin = new Float64Array(no); for (let o = 0; o < no; o++) { accs[o] = cum[o][k]; fin[o] = cum[o][nn]; }
      txt(c, `${nn} 个输入逐个广播。红线 = 已广播到的位置；灰色 = 还没轮到`, X, 16, p.ink2, 11.5, 'left', p.body);
      [['输入 x[i]', 37], [`权重 w[${y.lab ? y.lab[so] : so}][i]`, 59], ['乘积 x·w', 81]].forEach(([t, yy]) => txt(c, t, X0 - 8, yy, p.ink2, 11, 'right', p.body));
      A.heat(c, x, 1, nn, X0, 24, Wd, 18, 'i8'); A.heat(c, wr, 1, nn, X0, 46, Wd, 18, 'i8'); A.heat(c, pr, 1, nn, X0, 68, Wd, 18, 'i8', { max: pmx });
      c.fillStyle = 'rgba(128,128,128,.2)'; c.fillRect(X0 + k / nn * Wd, 24, Wd - k / nn * Wd, 62); line(c, X0 + k / nn * Wd, 20, X0 + k / nn * Wd, 90, p.bad, 2);
      const CT = 128, CB = 300, span = (hi - lo) || 1, cl = lo - span * .06, chh = hi + span * .06, cx = i => X0 + i / nn * Wd, cy = v => CB - (v - cl) / (chh - cl) * (CB - CT);
      txt(c, '累加值随广播个数的变化（每个输出一条线：上升 = 这一拍贡献为正，下降 = 为负，平 = 输入为 0 或权重为 0）', X, CT - 8, p.ink2, 11.5, 'left', p.body);
      c.strokeStyle = p.line; c.lineWidth = 1; c.strokeRect(X0 + .5, CT + .5, Wd - 1, CB - CT - 1); line(c, X0, cy(0), X0 + Wd, cy(0), p.grid, 1);
      txt(c, String(Math.round(hi)), X0 - 6, CT + 10, p.muted, 10, 'right'); txt(c, String(Math.round(lo)), X0 - 6, CB - 2, p.muted, 10, 'right'); txt(c, '0', X0 - 6, cy(0) + 4, p.muted, 10, 'right');
      txt(c, '已广播的输入个数 →', X0 + Wd / 2, CB + 16, p.muted, 10.5, 'center', p.body); txt(c, '0', X0, CB + 16, p.muted, 10, 'center'); txt(c, String(nn), X0 + Wd, CB + 16, p.muted, 10, 'center');
      const poly = (o, from, to, col, lw, al) => { c.globalAlpha = al; c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); for (let i = from; i <= to; i++) { const px = cx(i), py = cy(cum[o][i]); i === from ? c.moveTo(px, py) : c.lineTo(px, py); } c.stroke(); c.globalAlpha = 1; };
      const ocol = no <= 4 ? [p.sig, p.bad, p.mwi, p.tree] : null;
      if (no > 4) for (let o = 0; o < no; o++) if (o !== so) poly(o, 0, nn, p.muted, 1, .13);
      for (let o = 0; o < no; o++) { if (no > 4 && o !== so) continue; const col = ocol ? ocol[o] : p.en; poly(o, 0, nn, col, 1.2, .28); poly(o, 0, k, col, o === so ? 2.6 : 1.8, 1); c.fillStyle = col; c.beginPath(); c.arc(cx(k), cy(cum[o][k]), 4.5, 0, 7); c.fill(); }
      if (no <= 4) y.lab && y.lab.forEach((lb, o) => { const lx = X0 + 12 + o * 150; c.fillStyle = ocol[o]; c.fillRect(lx, CT + 8, 12, 4); txt(c, `${lb}  ${Math.round(cum[o][k])}`, lx + 18, CT + 15, p.ink, 11.5, 'left'); });
      else txt(c, `橙色 = 选中的输出 ${so}；灰线 = 其余 ${no - 1} 个输出`, X0 + 10, CT + 15, p.ink, 11.5, 'left', p.body);
      if (no > 4) {
        const AY = 330, AH = 100, zy2 = AY + AH / 2, bw = Wd / no; let mxa = 1; for (let o = 0; o < no; o++) mxa = Math.max(mxa, Math.abs(fin[o]), Math.abs(accs[o]));
        txt(c, `${no} 个累加器此刻的值（彩色柱）和最终值（黑细线），红框 = 选中的输出`, X, AY - 8, p.ink2, 11.5, 'left', p.body); line(c, X0, zy2, X0 + Wd, zy2, p.grid, 1);
        for (let o = 0; o < no; o++) { const hg = accs[o] / mxa * AH / 2, hf = fin[o] / mxa * AH / 2; c.fillStyle = A.mix(P_.zero, accs[o] >= 0 ? P_.pos : P_.neg, o === so ? 1 : .7); c.fillRect(X0 + o * bw + .3, hg >= 0 ? zy2 - hg : zy2, Math.max(bw - .8, .8), Math.abs(hg)); c.fillStyle = p.ink2; c.fillRect(X0 + o * bw + bw / 2 - .4, hf >= 0 ? zy2 - hf : zy2, .8, Math.abs(hf)); }
        c.strokeStyle = p.bad; c.lineWidth = 1.5; c.strokeRect(X0 + so * bw - 1, AY, bw + 2, AH);
      }
'''
s = s[:a] + FC + s[b:]
old_ry = "ry = no <= 4 ? 260 : 268;"
assert old_ry in s
s = s.replace(old_ry, "ry = no <= 4 ? 332 : 450;", 1)
open(p, "w", encoding="utf-8").write(s)

# ------------------------------------------------------------------ html
p = "body_new.html"
s = open(p, encoding="utf-8").read()
a1 = '<div><div class="cv-scroll"><canvas id="bn-cv" style="height:260px;min-width:420px"></canvas></div>'
assert a1 in s
s = s.replace(a1, '<div><div class="cv-scroll"><canvas id="bn-nl" style="height:150px;min-width:420px"></canvas></div><div class="cv-scroll" style="margin-top:8px"><canvas id="bn-cv" style="height:260px;min-width:420px"></canvas></div>', 1)
a2 = '    <div class="calc" id="bn-tie-calc"></div>'
assert a2 in s
s = s.replace(a2, a2 + '\n    <div class="cv-scroll" style="margin-top:10px"><canvas id="bn-tie-nl" style="height:150px;min-width:420px"></canvas></div>', 1)
s = s.replace('<canvas id="fc-cv" style="height:400px;min-width:900px">', '<canvas id="fc-cv" style="height:600px;min-width:900px">', 1)
open(p, "w", encoding="utf-8").write(s)
print("patched")
