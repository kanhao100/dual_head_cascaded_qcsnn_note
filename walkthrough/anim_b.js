/* Sections: convolution engine, BatchNorm + round-half-even. Every value comes from the verified model / its primitives. */
(function () {
  const { $, $$, fmt, pal, setupCanvas, txt, line, onRedraw } = HW;
  const A = AN, P = A.PARAMS;
  const CV = [{ ic: 1, oc: 16, inLen: 180, outLen: 178, key: 'conv1', inKey: null, depth: 24 }, { ic: 16, oc: 16, inLen: 89, outLen: 87, key: 'conv2', inKey: 'qi2', depth: 27 }, { ic: 16, oc: 24, inLen: 43, outLen: 41, key: 'conv3', inKey: 'qi3', depth: 25 }];
  const BNL = [178, 87, 41];
  const big = A.big, row = (k, v) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  const clip8 = v => v > 127 ? 127 : (v < -128 ? -128 : v);

  /* exact requantisation steps with BigInt (display only; the result is cross-checked against KM.prim.requant) */
  function reqDetail(acc, mult, shift) {
    const prod = BigInt(acc) * BigInt(mult); const rnd = shift > 0 ? (1n << BigInt(shift - 1)) : 0n;
    const added = prod + rnd, shifted = shift > 0 ? added >> BigInt(shift) : prod, w32 = Number(BigInt.asIntN(32, shifted));
    return { prod, rnd, added, shifted, w32, y: clip8(w32) };
  }
  function rneDetail(acc, mult, shift) {
    const prod = BigInt(acc) * BigInt(mult); const neg = prod < 0n, ax = neg ? -prod : prod;
    if (shift <= 0) { const w = Number(BigInt.asIntN(32, prod)); return { prod, ax, neg, r: shift, w32: w, y: clip8(w), base: ax, rem: 0n, half: 0n, bump: false, tie: false, halfUp: clip8(w), trivial: true }; }
    const R = BigInt(shift), base = ax >> R, rem = ax & ((1n << R) - 1n), half = 1n << (R - 1n);
    const tie = rem === half, bump = rem > half || (tie && (base & 1n) === 1n), b2 = bump ? base + 1n : base, sv = neg ? -b2 : b2, w32 = Number(BigInt.asIntN(32, sv));
    const hu = Number(BigInt.asIntN(32, (prod + half) >> R));
    return { prod, ax, neg, r: shift, base, rem, half, bump, tie, b2, w32, y: clip8(w32), halfUp: clip8(hu) };
  }

  A.reqDetail = reqDetail; A.rneDetail = rneDetail;

  /* ================================================================= convolution */
  AN.guard('conv', function () {
    let L = 0, mode = 'pos', playerObj = null;
    A.beatSelect($('#cv-beat'));
    const ctr = $('#cv-ctrls');
    const cOc = A.ctrlRange(ctr, 'cv-oc', '输出通道', 0, 15, 0, 1, v => `${v} / ${CV[L].oc - 1}`);
    const cW = A.ctrlRange(ctr, 'cv-w', '输出位置 w', 0, 177, 60, 1, v => `${v}`);
    const cT = A.ctrlRange(ctr, 'cv-t', '时间步 t（卷积 1 每步相同）', 0, 9, 0, 1);
    const g = () => { const sp = CV[L], res = A.run(A.S.beat); const conv = P.blocks[L].conv; const S = res.steps[cT.get()];
      const inp = L === 0 ? res.words.subarray(0, 180) : S[sp.inKey]; return { sp, res, conv, S, inp, out: S[sp.key], oc: cOc.get(), w: cW.get(), t: cT.get() }; };
    function microN() { return CV[L].ic * 3 + 5; }

    function draw() {
      const cv = $('#cv-cv'); const { c, w: W } = setupCanvas(cv), p = pal(), P_ = A.palette(); const G = g(), { sp, conv, inp, oc, w } = G, ic = sp.ic, k = 3;
      const m = mode === 'mac' ? (playerObj ? playerObj.get() : 0) : 1e9; const nprod = ic * k;
      const top = 52; let acc = 0; const vals = [];
      for (let q = 0; q < ic; q++) for (let j = 0; j < k; j++) { const x = inp[q * sp.inLen + w + j], wt = conv.weights[(oc * ic + q) * k + j]; vals.push([x, wt, x * wt]); }
      const shown = Math.min(nprod, m + 1 > nprod ? nprod : m + 1); // items already multiplied
      for (let q = 0; q < shown; q++) acc += vals[q][2];
      const accFull = vals.reduce((a, v) => a + v[2], 0), accShow = mode === 'pos' ? accFull : acc;
      if (L === 0) {
        // conv 1 has a single input channel, so show it as what it is: a waveform, a 3-point template sliding over it, and the filtered waveform
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
      } else {
      // ---- left: input map + output row
      const rowh = ic === 1 ? 26 : Math.min(17, 255 / ic), LX = 10, LW = 380, IY = 34, ih = rowh * ic, cw = LW / sp.inLen;
      txt(c, `输入 ${ic}×${sp.inLen}（${L === 0 ? '波形 INT8' : L === 1 ? 'QuantIdentity 输出' : 'QuantIdentity 输出'}，时间步 ${G.t}）`, LX, 22, p.ink2, 11.5, 'left', p.body);
      A.heat(c, inp, ic, sp.inLen, LX, IY, LW, ih, 'i8');
      c.strokeStyle = p.bad; c.lineWidth = 2; c.strokeRect(LX + w * cw - 1.5, IY - 2, Math.max(3 * cw, 6) + 3, ih + 4);
      const OY = IY + ih + 40; txt(c, `输出通道 ${oc} 的输出行（${sp.outLen} 个点，已算到 w=${w}）`, LX, OY - 8, p.ink2, 11.5, 'left', p.body);
      const outRow = G.out.subarray(oc * sp.outLen, (oc + 1) * sp.outLen), part = new Int8Array(sp.outLen); for (let q = 0; q <= w; q++) part[q] = outRow[q];
      A.heat(c, part, 1, sp.outLen, LX, OY, LW, 26, 'i8'); line(c, LX + (w + .5) * LW / sp.outLen, OY - 3, LX + (w + .5) * LW / sp.outLen, OY + 29, p.bad, 2);
      // ---- middle: patch / weights / products
      const MX = 420, cellW = 40, rh = Math.min(17, 330 / ic), titles = ['输入窗口', '权重', '乘积'];
      for (let b = 0; b < 3; b++) {
        const bx = MX + b * (cellW * 3 + 14); txt(c, titles[b], bx, 22, p.ink2, 11.5, 'left', p.body); txt(c, b === 2 ? `合计（已加 ${shown} 项）` : `${ic}×3`, bx, 38, p.muted, 10.5, 'left', p.body);
        for (let q = 0; q < ic; q++) for (let j = 0; j < k; j++) {
          const idx = q * k + j, v = vals[idx][b], x = bx + j * cellW, y = top + q * rh; const cur = mode === 'mac' && idx === m && m < nprod;
          c.fillStyle = cur ? A.mix(P_.zero, P_.pos, .55) : (b === 2 && !(idx < shown) ? p.surface2 : p.surface); c.fillRect(x, y, cellW - 2, rh - 1.5); c.strokeStyle = p.line; c.strokeRect(x + .5, y + .5, cellW - 3, rh - 2.5);
          if (b === 2 && !(idx < shown)) continue;
          txt(c, String(v), x + cellW / 2 - 1, y + rh - 4.5, v === 0 ? p.muted : p.ink, Math.min(11.5, rh - 3), 'center');
        }
        if (b === 0) txt(c, '×', bx + cellW * 3 + 1, top + ic * rh / 2, p.muted, 14, 'left'); if (b === 1) txt(c, '=', bx + cellW * 3 + 1, top + ic * rh / 2, p.muted, 14, 'left');
      }
      txt(c, `Σ = ${accShow}${shown < nprod ? '（部分和）' : '（INT32 累加值）'}`, MX + 2 * (cellW * 3 + 14), top + ic * rh + 18, shown < nprod ? p.muted : p.ink, 12);
      }
      // ---- right: requantisation
      const RX = 815, lines = []; const D = reqDetail(accFull, conv.mult[oc], conv.shift[oc]);
      const st = mode === 'pos' ? 99 : Math.max(0, m - nprod + 1);
      lines.push(['① 累加值 acc', String(accFull)]); lines.push(['② × 乘数 ' + conv.mult[oc], big(D.prod)]); lines.push([`③ + 2^(${conv.shift[oc]}−1)`, big(D.added)]); lines.push([`④ >> ${conv.shift[oc]}（取 32 位）`, big(D.w32)]); lines.push(['⑤ 饱和到 INT8', String(D.y)]);
      txt(c, '重量化', RX, 22, p.ink2, 11.5, 'left', p.body); txt(c, `乘数 ${conv.mult[oc]}，移位 ${conv.shift[oc]}（通道 ${oc}）`, RX, 38, p.muted, 10.5, 'left', p.body);
      lines.forEach((l, q) => { const on = q < st; const y = top + q * 56; A.box(c, RX, y, 180, 46, on ? p.surface : p.surface2, on ? (q === 4 ? p.en : p.line) : p.grid, 6); txt(c, l[0], RX + 8, y + 16, on ? p.ink2 : p.muted, 10.5, 'left', p.body); if (on) txt(c, l[1].length > 22 ? l[1].slice(0, 21) + '…' : l[1], RX + 8, y + 37, q === 4 ? p.en : p.ink, 13); });
    }
    function info() {
      const G = g(), { sp, conv, inp, oc, w } = G, ic = sp.ic; let acc = 0; for (let q = 0; q < ic; q++) for (let j = 0; j < 3; j++) acc += inp[q * sp.inLen + w + j] * conv.weights[(oc * ic + q) * 3 + j];
      const D = reqDetail(acc, conv.mult[oc], conv.shift[oc]), mv = G.out[oc * sp.outLen + w], pv = KM.prim.requant(acc | 0, conv.mult[oc], conv.shift[oc]);
      const ok = D.y === mv && pv === mv;
      $('#cv-info').innerHTML = `<b>${sp.key}</b>，通道 ${oc}，位置 ${w}：${ic * 3} 个乘积相加得 acc = <b>${acc}</b>，重量化后 = <b>${D.y}</b>${D.w32 !== D.y ? `（32 位值 ${D.w32} 超出 INT8，被饱和）` : ''}。模型卷积张量里该处的值 = ${mv}，${ok ? '<b style="color:var(--mwi)">一致 ✓</b>' : '<b style="color:var(--bad)">不一致 ✗</b>'}。` +
        `<br><span class="small">输入窗口取自第 ${w}..${w + 2} 个点；这一步没有偏置项、没有零点修正（模板默认关闭，源码）。${L === 0 ? '卷积 1 只有 1 个输入通道，所以窗口只有 3 个数；它的输入每个时间步都一样。' : '输入是 QuantIdentity 的输出，取值只有 0 和 q_one，所以多数乘积是 0。'}</span>`;
    }
    function drawBank() {
      const cv = $('#cv-bank'); const { c, w: W } = setupCanvas(cv), p = pal(), P_ = A.palette(); const sp = CV[L], w = cW.get(), cols = [p.sig, p.tree, p.en];
      const n = sp.inLen, X = 10, SW = W - 20; txt(c, `一个输入通道的 ${n} 个位置，按 位置 mod 3 着色`, X, 14, p.ink2, 11, 'left', p.body);
      for (let i = 0; i < n; i++) { c.fillStyle = A.mix(P_.zero, A.rgb(cols[i % 3]), .55); c.fillRect(X + i * SW / n, 22, Math.max(SW / n - .3, .6), 18); }
      c.strokeStyle = p.bad; c.lineWidth = 2; c.strokeRect(X + w * SW / n - 1, 20, 3 * SW / n + 2, 22);
      const na = Math.ceil(n / 3); txt(c, '三个存储块（块内按 ⌊位置/3⌋ 编址）', X, 62, p.ink2, 11, 'left', p.body);
      for (let b = 0; b < 3; b++) {
        const y = 70 + b * 24; txt(c, `块${b}`, X, y + 13, p.muted, 10.5); for (let a = 0; a < na; a++) { c.fillStyle = A.mix(P_.zero, A.rgb(cols[b]), .3); c.fillRect(X + 34 + a * (SW - 34) / na, y, Math.max((SW - 34) / na - .3, .6), 16); }
        const pos = [w, w + 1, w + 2].find(x => x % 3 === b); const ad = (pos * 171) >> 9; c.fillStyle = cols[b]; c.fillRect(X + 34 + ad * (SW - 34) / na - .5, y - 1, Math.max((SW - 34) / na, 3) + 1, 18);
      }
      const t3 = [w, w + 1, w + 2].map(x => `${x}→块${x % 3}[${(x * 171) >> 9}]`).join('，');
      $('#cv-bank-info').innerHTML = `当前窗口的 3 个点落在 3 个不同的块：${t3}，所以同一拍可以各读一块。<span class="small">依据：源码把 <code>input_buffer[IC][L]</code> 在通道维完全分块；报告的存储器表里，卷积 1 是 3 块 × 60 字，卷积 2 是 48 块 × 30 字（= 16 通道 × 3），卷积 3 是 48 块 × 15 字；RTL 里有对 3 取模和乘 171 的运算。<span class="src rpt">报告</span> “⌊x/3⌋ = (x·171)&gt;&gt;9”对 x &lt; 256 成立，我逐个核对过。<span class="src der">推导</span></span>`;
    }
    function drawPipe() {
      const cv = $('#cv-pipe'); const { c, w: W } = setupCanvas(cv), p = pal(), P_ = A.palette(); const sp = CV[L], D = sp.depth, trip = sp.oc * sp.outLen, oc = cOc.get(), w = cW.get(), it = oc * sp.outLen + w;
      const X = 10, cw = (W - 20) / D; txt(c, `流水线 ${D} 级；第 ${it + 1} 个迭代（oc=${oc}, w=${w}）刚进入第 0 级`, X, 16, p.ink2, 11, 'left', p.body);
      for (let s = 0; s < D; s++) {
        const k = it - s, ok = k >= 0, x = X + s * cw; A.box(c, x + 1, 30, cw - 2, 70, s === 0 ? `color-mix(in srgb, ${p.en} 16%, ${p.surface})` : p.surface, s === 0 ? p.en : p.line, 4);
        txt(c, String(s), x + cw / 2, 44, p.muted, 9, 'center');
        if (ok) { txt(c, String(Math.floor(k / sp.outLen)), x + cw / 2, 64, p.ink, 9.5, 'center'); txt(c, String(k % sp.outLen), x + cw / 2, 82, p.ink2, 9.5, 'center'); } else txt(c, '—', x + cw / 2, 72, p.muted, 10, 'center');
      }
      txt(c, '上：级号   中：oc   下：w', X, 120, p.muted, 10.5, 'left', p.body); txt(c, '同一拍里这些输出点同时在途，每拍完成 1 个', X, 140, p.muted, 10.5, 'left', p.body);
      $('#cv-pipe-info').innerHTML = `共 ${fmt(trip)} 个迭代（${sp.oc} 通道 × ${sp.outLen} 位置，外层 oc、内层 w），II = 1；流水线深度 ${D} 级，每级里同时有一个不同的迭代。<span class="small">只标出哪个迭代在哪一级，不代表寄存器里的数值。深度 = 报告延迟 − 迭代数：${({ 0: '2872 − 2848', 1: '1419 − 1392', 2: '1009 − 984' })[L]} = ${D}（卷积 2 的 27 级与逐状态调度报告一致）。<span class="src der">推导</span></span>`;
    }
    const redraw = () => { draw(); info(); drawBank(); drawPipe(); };
    function bestPos() {   // the position with the largest |acc| for the selected channel: a more telling default than an all-zero window
      const G = g(), sp = G.sp, ic = sp.ic; let best = 0, bv = -1;
      for (let w = 0; w < sp.outLen; w++) { let a = 0; for (let q = 0; q < ic; q++) for (let j = 0; j < 3; j++) a += G.inp[q * sp.inLen + w + j] * G.conv.weights[(G.oc * ic + q) * 3 + j]; if (Math.abs(a) > bv) { bv = Math.abs(a); best = w; } }
      return best;
    }
    function jump() { const w = bestPos(); cW.set(w); if (mode === 'pos') playerObj.set(w); else redraw(); }
    function setLayer(l) {
      L = l; const sp = CV[L]; cOc.set(Math.min(cOc.get(), sp.oc - 1), 0, sp.oc - 1); cW.set(Math.min(cW.get(), sp.outLen - 1), 0, sp.outLen - 1);
      cT.root.style.opacity = L === 0 ? .5 : 1; setMode(mode); jump();
    }
    function setMode(m) {
      mode = m; const sp = CV[L], w0 = cW.get();
      if (mode === 'pos') { playerObj.setN(sp.outLen, false); cW.set(w0); playerObj.set(w0); } else { playerObj.setN(microN(), false); cW.set(w0); }
    }
    playerObj = A.Player($('#cv-player'), { n: CV[0].outLen, fps: 10, label: i => mode === 'pos' ? `输出位置 w=${i}` : (i < CV[L].ic * 3 ? `第 ${i + 1} 项乘加` : `重量化第 ${i - CV[L].ic * 3 + 1} 步`), onFrame: i => { if (mode === 'pos') { if (cW.get() !== i) cW.set(i); } redraw(); } });
    ['input'].forEach(ev => [cOc, cW, cT].forEach(cc => cc.inp.addEventListener(ev, () => { if (cc === cW && mode === 'pos') { playerObj.stop(); playerObj.set(cW.get()); } else redraw(); })));
    $('#cv-cv').addEventListener('click', e => { if (L !== 0) return; const cv = e.currentTarget, g = cv._g; if (!g) return; const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, col = Math.floor((x - g.x0) / g.cw), row = Math.floor((y - g.y0) / g.ch); if (col < 0 || col >= g.cols || row < 0 || row > 1) return; const i = row * g.cols + col; if (i < CV[0].oc) { cOc.set(i); jump(); } });
    HW.seg('cv-layer', v => { setLayer(+v); });
    HW.seg('cv-mode', v => { playerObj.stop(); setMode(v); });
    A.onBeat(jump); onRedraw(redraw); setLayer(0);
  });

  /* ================================================================= BatchNorm + RNE */
  AN.guard('bn', function () {
    let b = 0, src = 'real';
    A.beatSelect($('#bn-beat'));
    const ctr = $('#bn-ctrls');
    const cC = A.ctrlRange(ctr, 'bn-c', '通道', 0, 15, 3, 1, v => `${v}`), cP = A.ctrlRange(ctr, 'bn-p', '位置（真实输入）', 0, 177, 40, 1), cT = A.ctrlRange(ctr, 'bn-t', '时间步', 0, 9, 0, 1), cX = A.ctrlRange(ctr, 'bn-x', '输入 x（手动）', -128, 127, 10, 1);
    const params = () => { const B = P.blocks[b].bn; const c = cC.get(); return { w: B.weight[c], bias: B.bias[c], mult: B.mult[c], shift: B.shift[c], c, n: B.c }; };
    const xval = () => { if (src === 'manual') return cX.get(); const res = A.run(A.S.beat), S = res.steps[cT.get()]; return S['conv' + (b + 1)][cC.get() * BNL[b] + cP.get()]; };
    function calc() {
      const q = params(), x = xval(), acc = x * q.w + q.bias, D = rneDetail(acc, q.mult, q.shift), res = A.run(A.S.beat);
      const model = KM.prim.requantRNE(acc | 0, q.mult, q.shift), mt = src === 'real' ? res.steps[cT.get()]['bn' + (b + 1)][q.c * BNL[b] + cP.get()] : null;
      const frac = D.trivial ? 0 : Number(D.rem) / Math.pow(2, D.r);
      const pct = (frac * 100).toFixed(2);
      $('#bn-calc').innerHTML =
        row('输入 x', `<b>${x}</b>　<span class="small">${src === 'real' ? `= 卷积 ${b + 1} 的输出 [通道 ${q.c}][位置 ${cP.get()}]，时间步 ${cT.get()}` : '手动设定'}</span>`) +
        row('该通道的参数', `w = ${q.w}，bias = ${q.bias}，乘数 = ${q.mult}，移位 r = ${q.shift}`) +
        row('① acc = x·w + bias', `${x} × ${q.w} + ${q.bias} = <b>${acc}</b>`) +
        row('② prod = acc × 乘数', `<b>${big(D.prod)}</b>　<span class="small">（64 位）</span>`) +
        (D.trivial ? row('③ 移位 ≤ 0', '不做取整，直接取 32 位') : row('③ |prod| 分解', `|prod| = <b>${big(D.base)}</b> × 2^${q.shift} + <b>${big(D.rem)}</b>　<span class="small">（商 base，余数 rem）</span><div class="meter"><i style="left:0;width:${pct}%"></i><u style="left:50%"></u></div><span class="small">余数占 ${pct}%（红线 = 恰好一半）</span>`)) +
        (D.trivial ? '' : row('④ 五成双判定', D.rem > D.half ? `<span class="hb">rem &gt; 一半</span> → 进位` : D.rem < D.half ? `<span class="hg">rem &lt; 一半</span> → 不进位` : `<span class="hl">rem = 一半（平局）</span> → base=${big(D.base)} 是${D.base % 2n ? '奇' : '偶'}数，${D.bump ? '进位' : '不进位'}`)) +
        row('⑤ 还原符号并饱和', `${D.neg ? '−' : ''}${D.trivial ? '' : big(D.b2)} → 32 位 ${D.w32} → <b>y = ${D.y}</b>${D.w32 !== D.y ? '（饱和）' : ''}`) +
        row('对照：加半再右移', `${D.halfUp}　${D.halfUp === D.y ? '<span class="hg">相同</span>' : '<span class="hl">不同（平局才会不同）</span>'}`) +
        row('模型', `requantRNE = ${model}${mt != null ? `；模型 BN 张量里该处 = ${mt}` : ''}　${model === D.y && (mt == null || mt === D.y) ? '<b style="color:var(--mwi)">一致 ✓</b>' : '<b style="color:var(--bad)">不一致 ✗</b>'}`);
    }
    /* where the exact quotient sits between two integers, and which one each rule picks */
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
    function curve() {
      const cv = $('#bn-cv'); const { c, w: W, h: H } = setupCanvas(cv), p = pal(); const q = params(), x0 = xval();
      const L = 44, R = W - 10, T = 14, Bt = H - 30, xs = x => L + (x + 128) / 255 * (R - L), ys = y => Bt - (y + 128) / 255 * (Bt - T);
      line(c, L, ys(0), R, ys(0), p.grid, 1); line(c, xs(0), T, xs(0), Bt, p.grid, 1); c.strokeStyle = p.line; c.strokeRect(L, T, R - L, Bt - T);
      txt(c, '127', L - 4, T + 8, p.muted, 10, 'right'); txt(c, '−128', L - 4, Bt, p.muted, 10, 'right'); txt(c, '输入 x', (L + R) / 2, H - 6, p.muted, 10.5, 'center', p.body); txt(c, '输出 y', 4, T + 2, p.muted, 10.5, 'left', p.body);
      c.strokeStyle = p.sig; c.lineWidth = 1.8; c.beginPath(); let ties = 0, sat = 0;
      for (let x = -128; x <= 127; x++) { const a = x * q.w + q.bias, y = KM.prim.requantRNE(a | 0, q.mult, q.shift); const d = rneDetail(a, q.mult, q.shift); if (d.tie) ties++; if (d.w32 !== d.y) sat++; x === -128 ? c.moveTo(xs(x), ys(y)) : c.lineTo(xs(x), ys(y)); }
      c.stroke(); const y0 = KM.prim.requantRNE((x0 * q.w + q.bias) | 0, q.mult, q.shift); c.fillStyle = p.bad; c.beginPath(); c.arc(xs(x0), ys(y0), 5, 0, 7); c.fill();
      $('#bn-info').innerHTML = `这个通道的输入-输出曲线（256 个 INT8 输入）。${sat ? `有 ${sat} 个输入被饱和。` : ''}<b>这 256 个输入里恰好一半的次数：${ties}。</b>` + (ties ? '' : ' 所以这个通道里“五成双”和“加半再右移”给出相同结果。');
    }
    const nlBn = () => { const q = params(), x = xval(); numberLine($('#bn-nl'), rneDetail(x * q.w + q.bias, q.mult, q.shift)); };
    const redraw = () => { calc(); curve(); nlBn(); };
    function setLayer(l) { b = l; const n = P.blocks[b].bn.c; cC.set(Math.min(cC.get(), n - 1), 0, n - 1); cP.set(Math.min(cP.get(), BNL[b] - 1), 0, BNL[b] - 1); redraw(); }
    HW.seg('bn-layer', v => setLayer(+v)); HW.seg('bn-src', v => { src = v; cP.root.style.opacity = cT.root.style.opacity = v === 'real' ? 1 : .4; cX.root.style.opacity = v === 'real' ? .4 : 1; redraw(); });
    [cC, cP, cT, cX].forEach(cc => cc.inp.addEventListener('input', redraw)); A.onBeat(redraw); onRedraw(redraw); setLayer(0); cX.root.style.opacity = .4;

    // ---- tie demo
    const tc = $('#bn-tie-ctrls'), tA = A.ctrlRange(tc, 'tie-a', '累加值 acc', -40, 40, 5, 1), tM = A.ctrlRange(tc, 'tie-m', '乘数', 1, 8, 1, 1), tS = A.ctrlRange(tc, 'tie-s', '移位 r', 1, 5, 1, 1);
    const pre = [['2.5 → 2', 5, 1, 1], ['3.5 → 4', 7, 1, 1], ['−2.5 → −2', -5, 1, 1], ['−3.5 → −4（加半再右移得 −3）', -7, 1, 1], ['6/4 = 1.5', 6, 1, 2], ['10/8 = 1.25（非平局）', 10, 1, 3]];
    $('#bn-tie-presets').innerHTML = `<div class="seg" role="group" aria-label="预设">${pre.map((q, i) => `<button data-i="${i}" aria-pressed="${i === 0}">${q[0]}</button>`).join('')}</div>`;
    function tie() {
      try { numberLine($('#bn-tie-nl'), rneDetail(tA.get(), tM.get(), tS.get())); } catch (e) { console.error(e); }
      const a = tA.get(), m = tM.get(), s = tS.get(), D = rneDetail(a, m, s), rmodel = KM.prim.requantRNE(a, m, s);
      $('#bn-tie-calc').innerHTML = row('prod = acc × 乘数', `${a} × ${m} = <b>${a * m}</b>，除以 2^${s} = ${(a * m / Math.pow(2, s))}`) + row('|prod| 分解', `${big(D.ax)} = ${big(D.base)} × ${2 ** s} + ${big(D.rem)}；一半 = ${big(D.half)}`) +
        row('五成双', D.tie ? `<span class="hl">平局</span>：商 ${big(D.base)} 是${D.base % 2n ? '奇' : '偶'}数 → ${D.bump ? '进位' : '不进位'} → y = <b>${D.y}</b>` : `非平局：${D.bump ? '余数过半，进位' : '余数不足一半，不进位'} → y = <b>${D.y}</b>`) +
        row('加半再右移', `${D.halfUp}　${D.halfUp === D.y ? '<span class="hg">相同</span>' : '<span class="hl">不同</span>'}`) + row('模型 requantRNE', `${rmodel}　${rmodel === D.y ? '<b style="color:var(--mwi)">一致 ✓</b>' : '<b style="color:var(--bad)">不一致 ✗</b>'}`);
    }
    [tA, tM, tS].forEach(cc => cc.inp.addEventListener('input', tie));
    $('#bn-tie-presets').addEventListener('click', e => { const bt = e.target.closest('button'); if (!bt) return; const q = pre[+bt.dataset.i]; $$('#bn-tie-presets button').forEach(x => x.setAttribute('aria-pressed', x === bt)); tA.set(q[1]); tM.set(q[2]); tS.set(q[3]); tie(); });
    tie();
  });
})();
