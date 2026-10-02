/* Sections: FC MAC array, gate / early exit (+ 24-beat table), perturbation lab. */
(function () {
  const { $, $$, fmt, pal, setupCanvas, txt, line, onRedraw } = HW;
  const A = AN, P = A.PARAMS;
  const row = (k, v) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`;

  /* ================================================================= FC */
  AN.guard('fc', function () {
    const FL = [{ name: '二分类头 484→2', n: 484, o: 2, F: P.bin.fc, inK: 'bin_cat', outK: 'bin_fc', st: 1, lab: ['正常', '异常'] }, { name: '4 分类头 484→128', n: 484, o: 128, F: P.multi.fc1, inK: 'm_cat', outK: 'm_fc1', st: 2 }, { name: '4 分类头 128→4', n: 128, o: 4, F: P.multi.fc2, inK: 'm_qi2', outK: 'm_fc2', st: 2, lab: A.CLS1 }];
    let L = 0, gran = 4, playerObj; A.beatSelect($('#fc-beat'));
    const ctr = $('#fc-ctrls'), cT = A.ctrlRange(ctr, 'fc-t', '时间步', 0, 9, 0, 1), cO = A.ctrlRange(ctr, 'fc-o', '选中的输出', 0, 1, 0, 1);
    ctr.insertAdjacentHTML('beforeend', `<div class="ctrl"><span>每帧广播的输入个数</span><span></span><div class="seg" id="fc-gran" role="group" aria-label="粒度"><button data-v="1">1</button><button data-v="4" aria-pressed="true">4</button><button data-v="16">16</button></div></div>`);
    const stat = {};  // static worst-case bound per layer
    function bound(li) { if (stat[li] != null) return stat[li]; const f = FL[li].F; let mx = 0; for (let o = 0; o < f.out; o++) { let s = 0; for (let i = 0; i < f.inn; i++) s += Math.abs(f.weights[o * f.inn + i]); mx = Math.max(mx, s * 128); } return (stat[li] = mx); }
    const obs = {};
    function observed(li) { const key = A.S.beat + ':' + li; if (obs[key] != null) return obs[key]; const R = A.run(A.S.beat), y = FL[li]; let mx = 0; const arr = y.st === 1 ? R.steps : R.stage2; arr.forEach(S => { const x = S[y.inK]; for (let o = 0; o < y.o; o++) { let a = 0; for (let i = 0; i < y.n; i++) a += x[i] * y.F.weights[o * y.n + i]; mx = Math.max(mx, Math.abs(a)); } }); return (obs[key] = mx); }
    const avail = () => FL[L].st === 1 || A.run(A.S.beat).pred2 === 1;
    const nFrames = () => Math.ceil(FL[L].n / gran) + 1;
    function draw() {
      const cv = $('#fc-cv'); const { c, w: W, h: H } = setupCanvas(cv), p = pal(), P_ = A.palette(), y = FL[L];
      if (!avail()) { txt(c, '该心拍判为正常，提前退出，4 分类头没有运行。请选一个判为异常的心拍。', 12, 30, p.muted, 12, 'left', p.body); $('#fc-info').innerHTML = ''; return; }
      const R = A.run(A.S.beat), S = (y.st === 1 ? R.steps : R.stage2)[cT.get()], x = S[y.inK], f = playerObj ? playerObj.get() : 0, k = Math.min(y.n, f * gran), nn = y.n, no = y.o, F = y.F;
      const X = 10, X0 = 90, Wd = W - X0 - 14, so = Math.min(cO.get(), no - 1);
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
      const D = A.reqDetail(Math.round(fin[so]), F.mult[so], F.shift[so]), ry = no <= 4 ? 332 : 450;
      txt(c, `输出 ${y.lab ? y.lab[so] : so}：最终 acc = ${Math.round(fin[so])} → × ${F.mult[so]} → +2^(${F.shift[so]}−1) → >> ${F.shift[so]} → 饱和 → ${D.y}（模型张量里 ${S[y.outK][so]}${D.y === S[y.outK][so] ? '，一致 ✓' : '，不一致 ✗'}）`, X, ry + 18, p.ink, 12);
      const nz = Array.from(x.subarray(0, nn)).filter(v => v).length, nzk = Array.from(x.subarray(0, k)).filter(v => v).length;
      txt(c, `已广播 ${k} / ${nn} 拍；其中输入非零 ${nzk} 拍，输入为 0 的 ${k - nzk} 拍照样占用一拍、照样做乘加`, X, ry + 44, p.muted, 11.5, 'left', p.body);
      txt(c, `整个输入向量里非零 ${nz} 个，为零 ${nn - nz} 个（稀疏度 ${((1 - nz / nn) * 100).toFixed(1)}%），但循环固定 ${nn} 拍`, X, ry + 64, p.muted, 11.5, 'left', p.body);
      const bd = bound(L), ob = observed(L);
      txt(c, `累加器位宽：acc 是 32 位（acc32_t，有符号范围 −2^31..2^31−1）。任意 INT8 输入的安全上界 |acc| ≤ 128·Σ|w| = ${fmt(bd)}（2^${Math.log2(bd).toFixed(1)}）；这个心拍 10 步里最大 |acc| = ${fmt(ob)}（2^${ob ? Math.log2(ob).toFixed(1) : '0'}）`, X, ry + 86, p.muted, 11.5, 'left', p.body);
      $('#fc-info').innerHTML = `<b>${y.name}</b>：第 i 拍把输入 x[i] 同时乘到 ${no} 个输出的第 i 个权重上，累加进各自的 acc；${nn} 拍后得到 ${no} 个 INT32 累加值，再逐个重量化。${no === 128 ? '128 个输出并行，对应 128 个 <code>mac_muladd</code> 和 128 块权重 ROM（见“计算结构”）。' : ''}<span class="src">源码</span> <span class="src rpt">报告</span>`;
    }
    function setLayer(l) { L = l; const y = FL[L]; $('#fc-cv').style.height = (y.o <= 4 ? 500 : 600) + 'px'; cO.set(Math.min(cO.get(), y.o - 1), 0, y.o - 1); cO.root.style.display = y.o > 1 ? '' : 'none'; playerObj.setN(nFrames(), false); draw(); }
    playerObj = A.Player($('#fc-player'), { n: nFrames(), fps: 12, label: i => `已广播 ${Math.min(FL[L].n, i * gran)} / ${FL[L].n} 个输入`, onFrame: draw });
    HW.seg('fc-layer', v => { playerObj.stop(); setLayer(+v); }); HW.seg('fc-gran', v => { gran = +v; playerObj.stop(); playerObj.setN(nFrames(), true); });
    [cT, cO].forEach(cc => cc.inp.addEventListener('input', draw)); A.onBeat(draw); onRedraw(draw); setLayer(0);
  });

  /* ================================================================= gate */
  AN.guard('gate', function () {
    let playerObj; A.beatSelect($('#gt-beat'));
    const res = () => A.run(A.S.beat), nF = () => res().pred2 === 1 ? 22 : 11;   // 10 steps + decision (+ 10 steps + argmax)
    function draw() {
      const cv = $('#gt-cv'); const { c, w: W } = setupCanvas(cv), p = pal(), P_ = A.palette(), R = res(), f = playerObj ? playerObj.get() : 0; const X = 10;
      const s1 = Math.min(f, 9), showGate = f >= 10, s2 = f - 11;
      const colW = 38, gx = 130, rowH = 44;
      txt(c, '二分类头：两个输出神经元每一步的脉冲（绿 = 发放），和累计次数', X, 18, p.ink2, 12, 'left', p.body);
      ['正常', '异常'].forEach((nm, q) => {
        const y = 34 + q * rowH; txt(c, nm, X, y + 22, q ? p.bad : p.sig, 13, 'left', p.body);
        for (let t = 0; t < 10; t++) { const on = t <= s1 && (R.steps[t].bin_lif[q] === 1); c.fillStyle = on ? `rgb(${P_.spk.join(',')})` : p.surface2; c.fillRect(gx + t * colW, y, colW - 3, 34); c.strokeStyle = p.line; c.strokeRect(gx + t * colW + .5, y + .5, colW - 4, 33); txt(c, t <= s1 ? String(R.steps[t].bin_lif[q]) : '', gx + t * colW + colW / 2 - 1, y + 22, on ? p.ink : p.muted, 12, 'center'); }
        let cum = 0; for (let t = 0; t <= s1; t++) cum += R.steps[t].bin_lif[q]; txt(c, `累计 ${cum}`, gx + 10 * colW + 10, y + 22, p.ink, 14);
      });
      for (let t = 0; t < 10; t++) txt(c, `t${t}`, gx + t * colW + colW / 2 - 1, 30, p.muted, 10, 'center');
      const cn = [0, 1].map(q => { let s = 0; for (let t = 0; t <= s1; t++) s += R.steps[t].bin_lif[q]; return s; });
      if (showGate) { const dec = R.sums2[1] > R.sums2[0]; txt(c, `sum_abn(${R.sums2[1]}) ${dec ? '>' : '不大于'} sum_norm(${R.sums2[0]}) → ${dec ? '判异常，继续 4 分类头' : '判正常，提前退出（pred4 = 0）'}${R.sums2[1] === R.sums2[0] ? '　（相等 → 算正常）' : ''}`, X, 34 + 2 * rowH + 18, dec ? p.bad : p.mwi, 14, 'left', p.body); }
      else txt(c, `目前累计：正常 ${cn[0]}，异常 ${cn[1]}`, X, 34 + 2 * rowH + 18, p.muted, 12.5, 'left', p.body);
      const y0 = 34 + 2 * rowH + 50;
      txt(c, '4 分类头（缓存的 10 步特征喂进去；仅当判为异常）', X, y0, p.ink2, 12, 'left', p.body);
      if (R.pred2 !== 1) { txt(c, '本心拍判为正常，这一部分没有运行。kernel 直接结束。', X, y0 + 26, p.muted, 12, 'left', p.body); }
      else {
        for (let q = 0; q < 4; q++) {
          const y = y0 + 12 + q * 36; txt(c, A.CLS1[q], X, y + 20, p.ink, 13, 'left', p.body);
          for (let t = 0; t < 10; t++) { const on = s2 >= t && R.stage2[t].m_lif2[q] === 1; c.fillStyle = on ? `rgb(${P_.spk.join(',')})` : p.surface2; c.fillRect(gx + t * colW, y, colW - 3, 28); c.strokeStyle = p.line; c.strokeRect(gx + t * colW + .5, y + .5, colW - 4, 27); txt(c, s2 >= t ? String(R.stage2[t].m_lif2[q]) : '', gx + t * colW + colW / 2 - 1, y + 19, on ? p.ink : p.muted, 11.5, 'center'); }
          let cum = 0; for (let t = 0; t <= s2 && t < 10; t++) cum += R.stage2[t].m_lif2[q]; txt(c, `累计 ${Math.max(0, s2) >= 0 && s2 >= 0 ? cum : 0}`, gx + 10 * colW + 10, y + 20, p.ink, 13);
        }
        if (f === 21) { const pk = R.pred4; txt(c, `argmax（并列取最前面）→ ${A.CLS[pk]}`, X, y0 + 12 + 4 * 36 + 20, p.en, 14, 'left', p.body); }
      }
    }
    function info() {
      const R = res(), B = A.BEATS[A.S.beat], fin = A.finalClass(R), K_ = K.top;
      const cyc = R.pred2 ? K_.worst : K_.best;
      $('#gt-info').innerHTML = `这个心拍的真实类别：<b>${A.CLS[B.label]}</b>，模型给出：<b>${A.CLS[fin]}</b>（pred2 = ${R.pred2}，pred4 = ${R.pred4}）${fin === B.label ? '，判对。' : '，判错。'}` +
        `<br><span class="small">走的是${R.pred2 ? '完整路径（二分类 + 4 分类）' : '提前退出路径（只跑二分类头）'}，对应综合报告给出的${R.pred2 ? '最坏' : '最好'}情形延迟 <b>${fmt(cyc)}</b> 周期（${(cyc / 1e5).toFixed(2)} ms @100 MHz）。<span class="src rpt">报告</span> 这是报告给的界限，本页没有做协同仿真，没有测这个心拍的实际周期。</span>`;
    }
    const redraw = () => { draw(); info(); };
    playerObj = A.Player($('#gt-player'), { n: nF(), fps: 2, label: i => i < 10 ? `二分类 · 第 ${i} 步之后` : i === 10 ? '门控判决' : i < 21 ? `4 分类 · 第 ${i - 11} 步之后` : 'argmax', onFrame: redraw });
    A.onBeat(() => { playerObj.setN(nF(), false); table(); });
    onRedraw(redraw);
    function table() {
      const rows = A.BEATS.map((b, i) => { const s = A.summ[i]; if (!s) return [i, b.record, A.CLS1[b.label], '', '', '', '', '', '']; const fin = s.pred2 === 1 ? s.pred4 : 0;
        return [`<a href="#s-gate" data-i="${i}">#${i}</a>`, b.record, A.CLS1[b.label], `${s.sums2[0]} / ${s.sums2[1]}`, s.pred2 ? '异常' : '正常', s.pred2 ? s.sums4.join(' / ') : '—', A.CLS1[fin], fin === b.label ? '对' : '<b style="color:var(--bad)">错</b>', (s.pred2 === b.top[0] && s.pred4 === b.top[1]) ? '相同 ✓' : '不同 ✗']; });
      HW.Table('gt-table', ['心拍', '记录', '真实', '正常 / 异常 累计', '门控', '4 类累计 N / S / V / F', '最终', '对错', 'topFunction（真实 C++）'], rows);
      $$('#gt-table a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); A.setBeat(+a.dataset.i); $('#gt-beat').scrollIntoView({ block: 'center', behavior: 'smooth' }); }));
    }
    A.onVerified(table); table();
  });

  /* ================================================================= lab */
  AN.guard('lab', function () {
    A.beatSelect($('#lb-beat'));
    const ctr = $('#lb-ctrls'), cN = A.ctrlRange(ctr, 'lb-n', '噪声 σ（z-score 单位）', 0, 0.6, 0, 0.01, v => v.toFixed(2)), cD = A.ctrlRange(ctr, 'lb-d', '基线漂移幅度', 0, 1.5, 0, 0.05, v => v.toFixed(2)), cG = A.ctrlRange(ctr, 'lb-g', '幅度缩放', 0.2, 3, 1, 0.05, v => '×' + v.toFixed(2)), cS = A.ctrlRange(ctr, 'lb-s', '平移（采样点）', -20, 20, 0, 1, v => (v > 0 ? '+' : '') + v), cR = A.ctrlRange(ctr, 'lb-r', 'RR 特征缩放', 0, 2, 1, 0.05, v => '×' + v.toFixed(2));
    const ORDER = [['conv1', '卷积 1', 16 * 178], ['bn1', 'BN 1', 16 * 178], ['lif1', 'LIF 1', 16 * 178], ['pool1', '池化 1', 16 * 89], ['qi2', 'QI2', 16 * 89], ['conv2', '卷积 2', 16 * 87], ['bn2', 'BN 2', 16 * 87], ['lif2', 'LIF 2', 16 * 87], ['pool2', '池化 2', 16 * 43], ['qi3', 'QI3', 16 * 43], ['conv3', '卷积 3', 24 * 41], ['bn3', 'BN 3', 24 * 41], ['lif3', 'LIF 3', 24 * 41], ['pool3', '池化 3', 480], ['bin_fc', '二分类 FC', 2], ['bin_lif', '二分类 LIF', 2]];
    let seedFor = -1, gauss = [];
    function noiseFor(beat) { if (seedFor === beat) return gauss; let s = 0x9e3779b9 ^ (beat * 7919), out = []; const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; for (let i = 0; i < 180; i++) { const u = Math.max(rnd(), 1e-9), v = rnd(); out.push(Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)); } seedFor = beat; return (gauss = out); }
    function perturbed(i) {
      const B = A.BEATS[i], src = B.rowF, g = noiseFor(i), sg = cN.get(), dr = cD.get(), ga = cG.get(), sh = cS.get(), rr = cR.get(), row = Array.from(src);
      for (let k = 0; k < 180; k++) { const j = Math.max(0, Math.min(179, k - sh)); row[k] = src[j] * ga + dr * Math.sin(2 * Math.PI * k / 240 + .6) + sg * g[k]; }
      for (let r = 0; r < 4; r++) row[180 + r] = src[180 + r] * rr; return row;
    }
    let pend = 0, manual = false;
    const calculate = document.createElement('button'); calculate.className = 'btn'; calculate.id = 'lb-calculate';
    calculate.textContent = '计算扰动结果'; calculate.hidden = true; ctr.after(calculate);
    calculate.addEventListener('click', () => { if (pend) cancelAnimationFrame(pend); pend = 0; compute(); });
    A.enableOnDemandLab = enabled => { manual = !!enabled; calculate.hidden = !manual; if (manual && pend) { cancelAnimationFrame(pend); pend = 0; } calculate.textContent = manual ? '计算扰动结果（本机按需模式）' : '计算扰动结果'; };
    function schedule() {
      if (manual) { calculate.textContent = '参数已变化：点击计算扰动结果'; return; }
      if (pend) return; pend = requestAnimationFrame(() => { pend = 0; compute(); });
    }
    function compute() {
      const i = A.S.beat, base = A.run(i), row = perturbed(i), w2 = A.model.quantizeRow(row), r2 = A.model.run(w2, { trace: true }), B = A.BEATS[i];
      const cv = $('#lb-cv'); const { c, w: W, h: H } = setupCanvas(cv), p = pal(), P_ = A.palette(); const X = 10, Wd = W - 20;
      const mn = -3, mx = Math.max(3, ...Array.from(B.rowF.subarray(0, 180))), mn2 = Math.min(-3, ...row.slice(0, 180), ...Array.from(B.rowF.subarray(0, 180))), mx2 = Math.max(mx, ...row.slice(0, 180));
      const ys = v => 10 + (mx2 - v) / (mx2 - mn2) * 84, xs = k => X + k / 179 * Wd; line(c, X, ys(0), X + Wd, ys(0), p.grid, 1);
      c.strokeStyle = p.muted; c.lineWidth = 1.2; c.beginPath(); for (let k = 0; k < 180; k++) k ? c.lineTo(xs(k), ys(B.rowF[k])) : c.moveTo(xs(k), ys(B.rowF[k])); c.stroke();
      c.strokeStyle = p.sig; c.lineWidth = 1.8; c.beginPath(); for (let k = 0; k < 180; k++) k ? c.lineTo(xs(k), ys(row[k])) : c.moveTo(xs(k), ys(row[k])); c.stroke();
      txt(c, '浮点波形：灰 = 原始，蓝 = 扰动后', X, 10, p.muted, 10.5, 'left', p.body);
      const zy = 150, bh = 40; txt(c, 'INT8 字：灰 = 原始，彩色 = 扰动后', X, 112, p.muted, 10.5, 'left', p.body); line(c, X, zy, X + Wd, zy, p.grid, 1); const bw = Math.max(1, Wd / 180 - .5);
      for (let k = 0; k < 180; k++) { const a = base.words[k], b = w2[k]; c.fillStyle = 'rgba(128,128,128,.35)'; c.fillRect(xs(k) - bw / 2, a >= 0 ? zy - a / 128 * bh : zy, bw, Math.max(.5, Math.abs(a) / 128 * bh)); c.fillStyle = b >= 0 ? p.en : p.sig; c.globalAlpha = .8; c.fillRect(xs(k) - bw / 2, b >= 0 ? zy - b / 128 * bh : zy, bw * .6, Math.max(.5, Math.abs(b) / 128 * bh)); c.globalAlpha = 1; }
      // layer table
      let wd = 0; for (let k = 0; k < 188; k++) if (base.words[k] !== w2[k]) wd++;
      const rows = [['输入字', '188', wd, 188]]; let first = null;
      ORDER.forEach(([key, nm, n]) => { let d = 0; for (let t = 0; t < 10; t++) { const a = base.steps[t][key], b = r2.steps[t][key]; for (let q = 0; q < a.length; q++) if (a[q] !== b[q]) d++; } rows.push([nm, String(n), d, n * 10]); });
      rows.forEach(r => { if (first == null && r[2] > 0) first = r[0]; });
      const fb = A.finalClass(base), f2 = A.finalClass(r2);
      $('#lb-info').innerHTML = `原始：正常 ${base.sums2[0]} / 异常 ${base.sums2[1]} → <b>${A.CLS[fb]}</b>　扰动后：正常 ${r2.sums2[0]} / 异常 ${r2.sums2[1]}${r2.pred2 ? '，4 类累计 ' + r2.sums4.join('/') : ''} → <b>${A.CLS[f2]}</b>　${fb === f2 ? '<span style="color:var(--mwi)">类别没变</span>' : '<b style="color:var(--bad)">类别翻了</b>'}。` + (first ? `<br>扰动最先“穿透”的位置：<b>${first}</b>。` : '<br>没有扰动（或扰动小到量化后完全相同）：所有层都相同。');
      $('#lb-table').innerHTML = `<div class="tscroll"><table class="t"><tr><th class="l">层</th><th>每步大小</th><th>与原来不同的值（10 步合计）</th><th class="l">占比</th></tr>${rows.map(r => { const pc = r[3] ? r[2] / r[3] * 100 : 0; return `<tr><td class="l"><b>${r[0]}</b></td><td>${r[1]}</td><td>${fmt(r[2])} / ${fmt(r[3])}</td><td class="l" style="min-width:160px"><div class="meter"><i style="left:0;width:${Math.min(100, pc)}%;background:${pc ? 'color-mix(in srgb,var(--en) 50%,transparent)' : 'transparent'}"></i></div>${pc.toFixed(1)}%</td></tr>`; }).join('')}</table></div>`;
    }
    [cN, cD, cG, cS, cR].forEach(cc => cc.inp.addEventListener('input', schedule));
    const set = (n, d, g, s, r) => { cN.set(n); cD.set(d); cG.set(g); cS.set(s); cR.set(r); schedule(); };
    $('#lb-reset').addEventListener('click', () => { set(0, 0, 1, 0, 1); $$('#lb-presets button').forEach(b => b.setAttribute('aria-pressed', 'false')); });
    HW.seg('lb-presets', v => { if (v === 'noise') set(.15, 0, 1, 0, 1); else if (v === 'drift') set(0, .6, 1, 0, 1); else if (v === 'gain') set(0, 0, .5, 0, 1); else set(0, 0, 1, 8, 1); });
    $$('#lb-presets button').forEach(b => b.setAttribute('aria-pressed', 'false'));
    A.onBeat(schedule); onRedraw(compute); compute();
  });
})();
