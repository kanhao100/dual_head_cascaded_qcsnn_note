/* Sections: LIF neuron animation, MaxPool + QuantIdentity. */
(function () {
  const { $, $$, fmt, pal, setupCanvas, txt, line, onRedraw } = HW;
  const A = AN, P = A.PARAMS, W24 = KM.prim.wrap24;

  /* ================================================================= LIF */
  const LY = [
    { id: 'lif1', name: 'LIF 1', rows: 16, cols: 178, par: P.blocks[0].lif, inKey: 'bn1', outKey: 'lif1', stage: 1 },
    { id: 'lif2', name: 'LIF 2', rows: 16, cols: 87, par: P.blocks[1].lif, inKey: 'bn2', outKey: 'lif2', stage: 1 },
    { id: 'lif3', name: 'LIF 3', rows: 24, cols: 41, par: P.blocks[2].lif, inKey: 'bn3', outKey: 'lif3', stage: 1 },
    { id: 'bin', name: '二分类 LIF', rows: 1, cols: 2, par: P.bin.lif, inKey: 'bin_fc', outKey: 'bin_lif', stage: 1 },
    { id: 'm1', name: '4 分类 LIF 1', rows: 1, cols: 128, par: P.multi.lif1, inKey: 'm_fc1', outKey: 'm_lif1', stage: 2 },
    { id: 'm2', name: '4 分类 LIF 2', rows: 1, cols: 4, par: P.multi.lif2, inKey: 'm_fc2', outKey: 'm_lif2', stage: 2 },
  ];
  const T = 10;
  /** One neuron over T steps. chain: 'kernel' = as written (step t reads what step t-2 wrote), 'ideal' = step t reads step t-1,
   *  'float' = kernel chain without the two roundings. Integer arithmetic mirrors lif1d_integer.h:53-113 statement by statement. */
  function neuron(inSeq, par, chain) {
    const beta = Math.max(0, Math.min(4096, par.beta)), theta = par.theta, sc = par.scale, out = [], bank = [0, 0]; let last = 0;
    for (let t = 0; t < T; t++) {
      const xq = W24(inSeq[t] * sc); const b = t & 1; const vPrev = chain === 'ideal' ? last : bank[b];
      const rPrev = vPrev > theta ? 1 : 0, rawB = beta * vPrev, rawR = rPrev * 4096 * theta; let prodB, prodR, vBeta, sub;
      if (chain === 'float') { prodB = rawB; prodR = rawR; vBeta = prodB / 4096; sub = rPrev * theta; }
      else { prodB = rawB >= 0 ? rawB + 2048 : rawB - 2048; vBeta = W24(Math.floor(prodB / 4096)); prodR = rawR >= 0 ? rawR + 2048 : rawR - 2048; sub = W24(Math.floor(prodR / 4096)); }
      const base = chain === 'float' ? vBeta + xq : W24(vBeta + xq), vNext = chain === 'float' ? base - sub : W24(base - sub), spk = vNext > theta ? 1 : 0;
      out.push({ t, b, x: inSeq[t], xq, vPrev, rPrev, rawB, rawR, prodB, prodR, vBeta, base, sub, vNext, spk }); if (chain === 'ideal') last = vNext; else bank[b] = vNext;
    }
    return out;
  }
  AN.guard('lif', function () {
    let L = 0, playerObj, preset = 'none';
    A.beatSelect($('#lf-beat'));
    $('#lf-layer').innerHTML = LY.map((y, i) => `<button data-v="${i}" aria-pressed="${i === 0}">${y.name}</button>`).join('');
    const ctr = $('#lf-ctrls'), cR = A.ctrlRange(ctr, 'lf-r', '通道', 0, 15, 2, 1), cC = A.ctrlRange(ctr, 'lf-c', '位置', 0, 177, 90, 1);
    const res = () => A.run(A.S.beat);
    const avail = () => LY[L].stage === 1 || res().pred2 === 1;
    const seqOf = (R, idx) => { const y = LY[L], arr = y.stage === 1 ? R.steps : R.stage2; return arr.map(S => S[y.inKey][idx]); };
    const idxNow = () => cR.get() * LY[L].cols + cC.get();
    function traces() {
      const R = res(), y = LY[L], idx = idxNow(); const inS = seqOf(R, idx), ker = neuron(inS, y.par, 'kernel');
      const arr = y.stage === 1 ? R.steps : R.stage2; let ok = true;
      for (let t = 0; t < T; t++) { const S = arr[t], st = S[y.outKey + '.state']; if (S[y.outKey][idx] !== ker[t].spk || (t & 1 ? st.V1 : st.V0)[idx] !== ker[t].vNext) ok = false; }
      return { R, y, idx, inS, ker, ideal: neuron(inS, y.par, 'ideal'), flt: neuron(inS, y.par, 'float'), ok };
    }
    function datapath(Tr, t) {
      const cv = $('#lf-dp'); const { c, w: W } = setupCanvas(cv), p = pal(); const s = Tr.ker[t], par = Tr.y.par, col = s.b ? p.tree : p.sig;
      const BW = 98, BH = 58, XS = [8, 122, 236, 350, 456 - 4]; const box = (x, y, lab, val, o) => { o = o || {}; A.box(c, x, y, BW, BH, o.fill || p.surface, o.stroke || p.line, 7); txt(c, lab, x + 6, y + 14, p.muted, 10, 'left', p.body); txt(c, String(val), x + 6, y + 40, o.vcol || p.ink, val.toString().length > 9 ? 11.5 : 14); };
      const ar = (x0, y0, x1, y1, cc) => A.arrow(c, x0, y0, x1, y1, cc || p.muted, 1.3);
      const hot = cc => ({ fill: `color-mix(in srgb, ${cc} 14%, ${p.surface})`, stroke: cc });
      const beta = Math.min(4096, Math.max(0, par.beta));
      box(XS[0], 8, '输入 int8', s.x); box(XS[1], 8, `× scale ${par.scale}`, '→'); box(XS[2], 8, 'x_q（24 位）', s.xq);
      box(XS[0], 100, `读 V${s.b}`, s.vPrev, { stroke: col, vcol: col }); box(XS[1], 100, `× β(${beta}) >>12 取整`, '→'); box(XS[2], 100, 'v_beta', s.vBeta); box(XS[3], 100, 'base = v_beta+x_q', s.base);
      box(XS[0], 192, `v_prev > θ(${par.theta})?`, s.rPrev ? 'r_prev = 1' : 'r_prev = 0', s.rPrev ? Object.assign(hot(p.bad), { vcol: p.bad }) : {});
      box(XS[1], 192, 'r_prev × θ 取整', s.sub, s.rPrev ? hot(p.bad) : {});
      box(XS[3], 192, 'v_next = base − sub', s.vNext); box(XS[4] - 0, 192, `v_next > θ ?`, s.spk ? '发放 1' : '0', s.spk ? Object.assign(hot(p.mwi), { vcol: p.mwi }) : {});
      box(XS[3], 284, `写回 V${s.b}（同一块）`, s.vNext, { stroke: col, vcol: col });
      ar(XS[0] + BW, 37, XS[1], 37); ar(XS[1] + BW, 37, XS[2], 37); ar(XS[2] + BW, 37, XS[3] + BW / 2, 37); c.strokeStyle = p.muted; c.beginPath(); c.moveTo(XS[3] + BW / 2, 37); c.lineTo(XS[3] + BW / 2, 100); c.stroke(); ar(XS[3] + BW / 2, 92, XS[3] + BW / 2, 100);
      ar(XS[0] + BW, 129, XS[1], 129); ar(XS[1] + BW, 129, XS[2], 129); ar(XS[2] + BW, 129, XS[3], 129); ar(XS[0] + BW / 2, 158, XS[0] + BW / 2, 192);
      ar(XS[0] + BW, 221, XS[1], 221); c.beginPath(); c.moveTo(XS[1] + BW, 221); c.lineTo(XS[3], 221); c.strokeStyle = p.muted; c.stroke(); ar(XS[3] - 10, 221, XS[3], 221);
      ar(XS[3] + BW / 2, 158, XS[3] + BW / 2, 192); ar(XS[3] + BW, 221, XS[4], 221); ar(XS[3] + BW / 2, 250, XS[3] + BW / 2, 284);
      txt(c, `Q12：4096 = 1.0。第 ${t} 步读写的是 V${s.b}`, 8, 288, col, 11.5, 'left', p.body); txt(c, `（第 ${t - 2 >= 0 ? t - 2 : '—'} 步写入的值）`, 8, 306, p.muted, 11, 'left', p.body);
      txt(c, par.beta > 4096 ? `β 导出值 ${par.beta} > 4096，被夹成 4096` : `β = ${par.beta}（≤ 4096）`, 8, 340, par.beta > 4096 ? p.bad : p.muted, 11, 'left', p.body); txt(c, par.theta < 0 ? `θ = ${par.theta} 为负：v_next ∈ (θ, 0] 也会发放` : `θ = ${par.theta}`, 8, 358, par.theta < 0 ? p.bad : p.muted, 11, 'left', p.body); txt(c, `尺度 scale = ${par.scale}`, 8, 376, p.muted, 11, 'left', p.body);
    }
    function volt(Tr, t) {
      const cv = $('#lf-volt'); const { c, w: W, h: H } = setupCanvas(cv), p = pal(); const th = Tr.y.par.theta;
      const showI = $('#lf-c-int').checked, showIdeal = $('#lf-c-idl').checked, showF = $('#lf-c-flt').checked;
      const ser = [Tr.ker.map(s => s.vNext)]; if (showIdeal) ser.push(Tr.ideal.map(s => s.vNext)); if (showF) ser.push(Tr.flt.map(s => s.vNext));
      let mn = Math.min(0, th, ...ser.flat()), mx = Math.max(0, th, ...ser.flat()); const pad = (mx - mn) * .12 || 100; mn -= pad; mx += pad;
      const L = 56, R = W - 12, Tp = 14, Bt = H - 28, xs = i => L + i / 9 * (R - L), ys = v => Bt - (v - mn) / (mx - mn) * (Bt - Tp);
      c.strokeStyle = p.line; c.strokeRect(L, Tp, R - L, Bt - Tp); line(c, L, ys(0), R, ys(0), p.grid, 1);
      for (let i = 0; i < T; i++) { line(c, xs(i), Bt, xs(i), Bt + 4, p.muted, 1); txt(c, String(i), xs(i), Bt + 16, p.muted, 10, 'center'); }
      txt(c, '时间步 t', (L + R) / 2, H - 4, p.muted, 10.5, 'center', p.body); txt(c, Math.round(mx), L - 4, Tp + 8, p.muted, 10, 'right'); txt(c, Math.round(mn), L - 4, Bt, p.muted, 10, 'right'); txt(c, '膜电位 v_next (Q12)', 4, 10, p.muted, 10.5, 'left', p.body);
      line(c, L, ys(th), R, ys(th), p.en, 1.6, [5, 4]); txt(c, `θ=${th}`, R - 2, ys(th) - 4, p.en, 10.5, 'right');
      if (showF) { c.strokeStyle = p.muted; c.setLineDash([2, 3]); c.lineWidth = 1.4; c.beginPath(); Tr.flt.forEach((s, i) => i ? c.lineTo(xs(i), ys(s.vNext)) : c.moveTo(xs(i), ys(s.vNext))); c.stroke(); c.setLineDash([]); }
      if (showIdeal) { c.strokeStyle = p.gold; c.setLineDash([6, 4]); c.lineWidth = 1.6; c.beginPath(); Tr.ideal.forEach((s, i) => i ? c.lineTo(xs(i), ys(s.vNext)) : c.moveTo(xs(i), ys(s.vNext))); c.stroke(); c.setLineDash([]); Tr.ideal.forEach((s, i) => { c.strokeStyle = p.gold; c.lineWidth = 1.4; c.beginPath(); c.arc(xs(i), ys(s.vNext), 3.4, 0, 7); c.stroke(); }); }
      if (showI) for (const par of [0, 1]) { c.strokeStyle = par ? p.tree : p.sig; c.lineWidth = 2; c.beginPath(); let first = true; Tr.ker.forEach((s, i) => { if ((i & 1) !== par) return; first ? c.moveTo(xs(i), ys(s.vNext)) : c.lineTo(xs(i), ys(s.vNext)); first = false; }); c.stroke(); }
      if (showI) Tr.ker.forEach((s, i) => { c.fillStyle = s.b ? p.tree : p.sig; c.beginPath(); c.arc(xs(i), ys(s.vNext), i === t ? 6 : 4, 0, 7); c.fill(); if (s.spk) { c.fillStyle = p.mwi; c.beginPath(); c.moveTo(xs(i), Tp + 4); c.lineTo(xs(i) - 5, Tp + 14); c.lineTo(xs(i) + 5, Tp + 14); c.closePath(); c.fill(); } });
      line(c, xs(t), Tp, xs(t), Bt, p.bad, 1, [3, 3]);
    }
    function map(Tr, t) {
      const cv = $('#lf-map'); const { c, w: W, h: H } = setupCanvas(cv), p = pal(), y = Tr.y, arr = y.stage === 1 ? Tr.R.steps : Tr.R.stage2, S = arr[t];
      txt(c, `${y.name} 第 ${t} 步的输出脉冲（${y.rows}×${y.cols}），点击选择神经元`, 8, 12, p.muted, 10.5, 'left', p.body);
      const X = 8, Y = 20, w = W - 16, h = H - 28; A.heat(c, S[y.outKey], y.rows, y.cols, X, Y, w, h, 'spk');
      const r = cR.get(), q = cC.get(); c.strokeStyle = p.bad; c.lineWidth = 2; c.strokeRect(X + q * w / y.cols - 1.5, Y + r * h / y.rows - 1.5, Math.max(w / y.cols, 3) + 3, Math.max(h / y.rows, 3) + 3);
    }
    function info(Tr, t) {
      const s = Tr.ker[t], y = Tr.y, par = y.par, arr = y.stage === 1 ? Tr.R.steps : Tr.R.stage2;
      const spk = Tr.ker.reduce((a, q) => a + q.spk, 0), diff = Tr.ker.filter((q, i) => q.spk !== Tr.ideal[i].spk).length;
      let h = `<b>${y.name}</b> 神经元（通道 ${cR.get()}，位置 ${cC.get()}）第 <b>${t}</b> 步：x = ${s.x} → x_q = ${s.x} × ${par.scale} = ${s.xq}；v_prev = ${s.vPrev}（从 V${s.b} 读出${t >= 2 ? `，第 ${t - 2} 步写入` : '，初始为 0'}）；` +
        (s.rPrev ? `<b>v_prev &gt; θ，触发延迟复位：sub = (${s.rawR} ${s.rawR >= 0 ? '+' : '−'} 2048) &gt;&gt; 12 = ${s.sub}</b>；` : `v_prev ≤ θ，不扣除；`) + `v_beta = (${Math.max(0, Math.min(4096, par.beta))} × ${s.vPrev} ${s.rawB >= 0 ? '+' : '−'} 2048) &gt;&gt; 12 = ${s.vBeta}；base = ${s.vBeta} + ${s.xq} = ${s.base}；v_next = ${s.base} − ${s.sub} = <b>${s.vNext}</b>；${s.vNext} ${s.spk ? '&gt;' : '≤'} θ(${par.theta}) → <b>${s.spk ? '发放' : '不发放'}</b>。`;
      h += `<br><span class="small">这个神经元 10 步共发放 ${spk} 次。${Tr.ok ? '<b style="color:var(--mwi)">10 步的 v_next 和脉冲与模型张量（含 V0/V1 内容）逐个一致 ✓</b>' : '<b style="color:var(--bad)">与模型张量不一致 ✗</b>'}。` +
        `同一组输入若改成“第 t 步接第 t−1 步”，有 ${diff} 个时间步的发放结果不同（只换这个神经元的更新方式，输入取自实际序列，不含对下游的影响）。`;
      if (par.theta < 0) h += ` θ 为负：膜电位在 (θ, 0] 之间也判发放，所以输入为 0 时它也会发放。`;
      h += ` Q12 取整完全按源码：非负乘积加 2048，负乘积减 2048，再算术右移 12 位（向负无穷取整），最后取 24 位。这不是通常的对称四舍五入。`;
      if (par.theta < 0) h += ` 复位触发时，θ=${par.theta} 的乘积恰为负整数倍，经过这套运算，sub=${par.theta - 1}；动画显示的是这个实际值。`;
      if (par.beta > 4096) h += ` β 导出值 ${par.beta} 超过 1.0（4096），硬件里被夹成 4096，即不泄漏。`;
      $('#lf-info').innerHTML = h + '</span>';
    }
    function redraw() {
      const off = !avail(); const cvs = ['#lf-dp', '#lf-volt', '#lf-map'];
      if (off) { if (bkPlayer) bkDraw(); cvs.forEach(id => { const { c, w, h } = setupCanvas($(id)); txt(c, '该心拍被判为正常，提前退出，4 分类头没有运行。请选一个判为异常的心拍。', 12, 30, pal().muted, 12, 'left', pal().body); }); $('#lf-info').innerHTML = '<b>4 分类头没有运行。</b>提前退出时，kernel 不会执行这两个 LIF。'; return; }
      const Tr = traces(), t = playerObj ? playerObj.get() : 0; datapath(Tr, t); volt(Tr, t); map(Tr, t); info(Tr, t); if (bkPlayer) bkRefresh();
    }
    function setLayer(l) {
      L = l; const y = LY[L]; cR.set(Math.min(cR.get(), y.rows - 1), 0, y.rows - 1); cC.set(Math.min(cC.get(), y.cols - 1), 0, y.cols - 1); cR.root.style.display = y.rows > 1 ? '' : 'none'; cC.root.querySelector('span').textContent = y.rows > 1 ? '位置' : '神经元';
      $$('#lf-layer button').forEach((b, i) => b.setAttribute('aria-pressed', i === L)); redraw();
    }
    function setNeuron(r, q) { cR.set(r); cC.set(q); }
    function applyPreset(v) {
      preset = v; $$('#lf-preset button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v)); const R = res(); let msg = '';
      const scan = (li, pred) => { const y = LY[li]; if (y.stage === 2 && R.pred2 !== 1) return null; const arr = y.stage === 1 ? R.steps : R.stage2; let best = null; for (let i = 0; i < y.rows * y.cols; i++) { const ker = neuron(arr.map(S => S[y.inKey][i]), y.par, 'kernel'); const sc = pred(ker); if (sc != null && (best == null || sc > best.sc)) best = { i, sc }; } return best; };
      if (v === 'reset') { for (const li of [0, 1, 2]) { const b = scan(li, k => k[0].spk && k[2].rPrev ? 10 + k.reduce((a, q) => a + q.spk, 0) : null); if (b) { setLayer(li); setNeuron(Math.floor(b.i / LY[li].cols), b.i % LY[li].cols); playerObj.set(2); return; } } msg = '这个心拍里没找到第 0 步就发放的神经元'; }
      if (v === 'clamp') { const b = scan(2, k => k.reduce((a, q) => a + q.spk, 0)); if (b) { setLayer(2); setNeuron(Math.floor(b.i / LY[2].cols), b.i % LY[2].cols); playerObj.set(3); return; } }
      if (v === 'neg') { const b = scan(3, k => k.filter(q => q.vNext > LY[3].par.theta && q.vNext <= 0).length + 1); setLayer(3); const i = b ? b.i : 0; setNeuron(0, i); playerObj.set(1); return; }
      if (msg) $('#lf-info').innerHTML = msg;
    }

    /* ---------------------------------------------------------------- bucket animation (the intuitive view of the same neuron) */
    let bkPlayer = null, syncing = false, lastFrame = -1, raf = 0, trKey = '', trVal = null;
    let anim = { step: 0, ph: 0, from: 0, to: 0, t0: 0, dur: 0, p: 1 };
    const PHN = ['读出', '漏水', '灌入', '延迟复位', '判定'];
    const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
    const ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    const q12 = v => (v / 4096).toFixed(2);
    const endLevel = s => [s.vPrev, s.vBeta, s.base, s.vNext, s.vNext];
    const startLevel = (s, ph) => ph === 0 ? s.vPrev : endLevel(s)[ph - 1];
    function getTr() { const k = A.S.beat + ':' + L + ':' + idxNow(); if (k !== trKey) { trKey = k; trVal = traces(); } return trVal; }
    const sgn = v => v < 0 ? '−' + Math.abs(v) : String(v);
    function phaseText(Tr, t, ph) {
      const s = Tr.ker[t], par = Tr.y.par, b = s.b, beta = Math.min(4096, Math.max(0, par.beta));
      if (ph === 0) return `第 ${t} 步用 <b>V${b}</b> 号桶。` + (t >= 2 ? `桶里是第 ${t - 2} 步留下的水位 <b>${s.vPrev}</b>（约 ${q12(s.vPrev)}）。` : `它还是空的（初始 0）。`) + (s.rPrev ? ` 水位超过过 θ，说明上一次用这只桶时发放过，这一步要<b>补扣一个 θ</b>。` : '');
      if (ph === 1) return beta >= 4096 ? `β 被限制成 1.0（导出值 ${par.beta}，硬件里夹到 4096），<b>一点也不漏</b>，水位仍是 ${s.vBeta}。` : `水位乘以 β/4096 = ${beta}/4096 ≈ ${(beta / 4096).toFixed(2)}，只留下 <b>${s.vBeta}</b>。β 越小，漏得越快、记得越短。`;
      if (ph === 2) return s.xq === 0 ? `这一步输入为 0，水位不变，仍是 ${s.base}。` : `输入 x = ${s.x}，乘以尺度 ${par.scale}，得 x_q = ${s.xq}，${s.xq > 0 ? '灌进' : '<b>抽走</b>'} ${Math.abs(s.xq)}，水位到 <b>${s.base}</b>。`;
      if (ph === 3) return s.rPrev ? `扣掉上一次欠下的 θ（取整后是 ${s.sub}），水位降到 <b>${s.vNext}</b>。` : `上一次没发放，没有欠账，不用扣，水位仍是 <b>${s.vNext}</b>。`;
      return `${s.vNext} ${s.spk ? '&gt;' : '≤'} θ = ${par.theta} → ` + (s.spk ? `<b style="color:var(--mwi)">发放一个脉冲</b>。${t + 2 < T ? `水位不会立刻降，要等 V${b} 下一次被用到（第 ${t + 2} 步）才补扣 θ。` : `水位不会立刻降。这是 V${b} 在本心拍里最后一次被用到，下一个心拍开始时整体清零，这笔 θ 不会再扣。`}` : `<b>不发放</b>。`) + ` 水位 ${s.vNext} 写回 V${b}。` + (par.theta < 0 && s.vNext > par.theta && s.vNext <= 0 ? ' θ 是负数，所以水位在 θ 与 0 之间也算越线。' : '');
    }
    function bkDraw() {
      const cv = $('#lf-bk'); if (!cv) return; const { c, w: W, h: H } = setupCanvas(cv), p = pal(), P_ = A.palette();
      if (!avail()) { txt(c, '该心拍被判为正常，提前退出，4 分类头没有运行。请选一个判为异常的心拍。', 12, 30, p.muted, 12, 'left', p.body); $('#lf-bk-info').innerHTML = ''; return; }
      const Tr = getTr(), t = anim.step, ph = anim.ph, s = Tr.ker[t], par = Tr.y.par, b = s.b, th = par.theta, beta = Math.min(4096, Math.max(0, par.beta));
      const pr = anim.dur ? Math.min(1, anim.p) : 1, e = ease(pr), lvl = anim.from + (anim.to - anim.from) * e;
      let lo = Math.min(0, th), hi = Math.max(0, th); Tr.ker.forEach(q => { lo = Math.min(lo, q.vPrev, q.vBeta, q.base, q.vNext); hi = Math.max(hi, q.vPrev, q.vBeta, q.base, q.vNext); });
      const pad = (hi - lo) * .1 || 100; lo -= pad; hi += pad;
      const TT = 84, TB = 292, ty = v => TB - (v - lo) / (hi - lo) * (TB - TT), TW = 150, XS = [92, 272];
      const colB = [p.sig, p.tree], rgbB = [P_.neg, P_.tree];
      txt(c, `${Tr.y.name} · 通道 ${cR.get()} · ${Tr.y.rows > 1 ? '位置' : '神经元'} ${cC.get()}　第 ${t} 步 · ${PHN[ph]}`, 8, 16, p.ink, 13, 'left', p.body);
      [hi, 0, lo].forEach((v, i) => txt(c, i === 1 ? '0' : String(Math.round(v)), XS[0] - 8, ty(v) + 4, p.muted, 10, 'right'));
      txt(c, '水位 = 膜电位（Q12，4096 = 1.0）', W - 12, 16, p.muted, 10.5, 'right', p.body);
      for (let k = 0; k < 2; k++) {
        const x = XS[k], act = k === b, level = act ? lvl : (t >= 1 ? Tr.ker[t - 1].vNext : 0);
        c.globalAlpha = act ? 1 : .55;
        A.box(c, x, TT, TW, TB - TT, p.surface, act ? colB[k] : p.line, 10); if (act) { c.lineWidth = 2.5; c.strokeStyle = colB[k]; c.stroke(); }
        c.save(); c.beginPath(); c.rect(x + 2, TT + 1, TW - 4, TB - TT - 2); c.clip();
        const y0 = ty(0), y1 = ty(level);
        c.fillStyle = A.mix(P_.zero, rgbB[k], level >= 0 ? .62 : .22); c.fillRect(x + 2, Math.min(y0, y1), TW - 4, Math.abs(y1 - y0));
        if (level < 0) { c.strokeStyle = colB[k]; c.setLineDash([4, 3]); c.lineWidth = 1.2; c.strokeRect(x + 3, y0, TW - 6, y1 - y0); c.setLineDash([]); }
        c.fillStyle = A.mix(P_.zero, rgbB[k], .9); c.fillRect(x + 2, y1 - 1.5, TW - 4, 3);
        if (act && ph >= 3 && level > th) { c.fillStyle = `rgba(${P_.spk.join(',')},.35)`; c.fillRect(x + 2, ty(level), TW - 4, ty(th) - ty(level)); }
        c.restore(); c.globalAlpha = 1;
        line(c, x, ty(0), x + TW, ty(0), p.muted, 1, [2, 3]);
        txt(c, `V${k}`, x + TW / 2, TB + 20, colB[k], 14, 'center', p.body); txt(c, k ? '奇数步 1 3 5 7 9' : '偶数步 0 2 4 6 8', x + TW / 2, TB + 36, p.muted, 10.5, 'center', p.body);
        if (act) txt(c, '本步用这只桶', x + TW / 2, TT - 8, colB[k], 11.5, 'center', p.body);
        txt(c, String(Math.round(level)), x + TW - 6, Math.max(TT + 14, Math.min(TB - 6, ty(level) - 6)), p.ink, 11, 'right');
      }
      line(c, XS[0] - 10, ty(th), XS[1] + TW + 10, ty(th), p.en, 1.8, [6, 4]); txt(c, `θ=${th}`, XS[1] + TW + 14, ty(th) + 4, p.en, 11, 'left');
      const ax = XS[b], cx = ax + TW / 2, drops = (n, x, y0, y1, col, up) => { for (let q = 0; q < n; q++) { const u = ((pr * 2 + q / n) % 1), y = up ? y1 - (y1 - y0) * u : y0 + (y1 - y0) * u; c.fillStyle = col; c.globalAlpha = .85; c.beginPath(); c.arc(x + (q % 2 ? 5 : -5), y, 3, 0, 7); c.fill(); c.globalAlpha = 1; } };
      A.box(c, cx - 12, 28, 24, TT - 52, p.surface2, p.gold, 4); txt(c, `x_q = ${s.xq}`, cx + 18, 46, ph === 2 ? p.gold : p.muted, 11.5, 'left');
      if (ph === 2 && s.xq !== 0) drops(3, cx, TT - 22, ty(lvl) - 4, p.gold, s.xq < 0);
      if (ph === 2 && s.xq < 0) txt(c, '抽走', cx + 18, 62, p.gold, 11, 'left', p.body);
      const hx = ax + TW, hy = TB - 18; A.box(c, hx, hy - 6, 14, 12, p.surface2, ph === 1 ? p.muted : p.line, 3); txt(c, beta >= 4096 ? '不漏' : `漏 ×${(beta / 4096).toFixed(2)}`, hx + 4, hy + 24, ph === 1 ? p.ink2 : p.muted, 10.5, 'left', p.body);
      if (ph === 1 && beta < 4096) drops(Math.max(2, Math.min(5, 1 + Math.round(Math.abs(s.vPrev - s.vBeta) / (hi - lo) * 14))), hx + 7, hy + 6, hy + 52, p.muted, false);
      const vx = ax - 14; A.box(c, vx, TT + 20, 14, 14, p.surface2, s.rPrev ? p.bad : p.line, 3);
      if (s.rPrev) { txt(c, '欠扣 θ', vx - 2, TT + 14, p.bad, 10.5, 'right', p.body); if (ph === 3) drops(4, vx + 7, TT + 36, TB + 20, p.bad, false); }
      if (ph === 0 && s.rPrev) txt(c, '⚑ 上次发放过', ax + 6, TT + 16, p.bad, 11, 'left', p.body);
      const spikesSoFar = Tr.ker.slice(0, t).reduce((a, q) => a + q.spk, 0) + (ph === 4 ? s.spk : 0), on = ph === 4 && s.spk, lx = 500, ly = TT + 70;
      c.fillStyle = on ? `rgb(${P_.spk.join(',')})` : p.surface2; c.strokeStyle = on ? p.mwi : p.line; c.lineWidth = 2; c.beginPath(); c.arc(lx, ly, 18, 0, 7); c.fill(); c.stroke();
      if (on && anim.dur && pr < 1) { c.strokeStyle = p.mwi; c.globalAlpha = 1 - pr; c.lineWidth = 3; c.beginPath(); c.arc(lx, ly, 18 + 26 * pr, 0, 7); c.stroke(); c.globalAlpha = 1; }
      txt(c, '输出脉冲', lx, ly + 36, p.ink2, 11.5, 'center', p.body); txt(c, `已发放 ${spikesSoFar} 次`, lx, ly + 52, p.muted, 11, 'center', p.body);
      if (on) A.arrow(c, XS[1] + TW + 62, ty(th) - 8, lx - 22, ly, p.mwi, 2);
      const EX = 548, rows = [[`① 读出　v_prev = ${s.vPrev}`, t >= 2 ? `V${b} 里第 ${t - 2} 步留下的（约 ${q12(s.vPrev)}）` : '初始值 0'], [`② 漏水　v_beta = ${s.vPrev} × ${beta}/4096 = ${s.vBeta}`, '乘 β 再做 Q12 取整'], [`③ 灌入　base = ${s.vBeta} ${s.xq < 0 ? '−' : '+'} ${Math.abs(s.xq)} = ${s.base}`, `x_q = ${s.x} × ${par.scale}`], [`④ 复位　v_next = ${s.base} − ${sgn(s.sub)} = ${s.vNext}`, s.rPrev ? '上一次发放过，补扣 θ' : '上一次没发放，不扣'], [`⑤ 判定　${s.vNext} ${s.spk ? '>' : '≤'} θ(${th}) → ${s.spk ? '发放' : '不发放'}`, `写回 V${b}`]];
      rows.forEach((r, i) => { const y = TT - 20 + i * 50, cur = i === ph, done = i <= ph; A.box(c, EX, y, W - EX - 12, 44, cur ? `color-mix(in srgb, ${p.en} 13%, ${p.surface})` : p.surface, cur ? p.en : p.line, 7); txt(c, done ? r[0] : r[0].split('=')[0].trim() + ' …', EX + 10, y + 19, done ? p.ink : p.muted, 12.5); txt(c, r[1], EX + 10, y + 36, p.muted, 11, 'left', p.body); });
      const SX = 92, SW = (W - 24 - SX) / 10, SY0 = 372, SY1 = 432, sy = v => SY1 - (v - lo) / (hi - lo) * (SY1 - SY0);
      txt(c, '每一步写回的水位（同色的点用线相连：第 t 步接的是第 t−2 步）', 8, SY0 - 12, p.muted, 10.5, 'left', p.body); line(c, SX, sy(th), SX + SW * 10, sy(th), p.en, 1.2, [5, 4]); line(c, SX, sy(0), SX + SW * 10, sy(0), p.grid, 1);
      const done = i => i < t || (i === t && ph === 4), X = i => SX + SW * (i + .5);
      for (let i = 0; i < 10; i++) { if (i === t) { c.fillStyle = 'rgba(128,128,128,.13)'; c.fillRect(SX + SW * i, SY0 - 4, SW, SY1 - SY0 + 8); } txt(c, 't' + i, X(i), SY1 + 14, i % 2 ? p.tree : p.sig, 10, 'center'); }
      for (let i = 0; i + 2 < 10; i++) if (done(i + 2)) { c.strokeStyle = i % 2 ? p.tree : p.sig; c.lineWidth = 1.8; c.beginPath(); c.moveTo(X(i), sy(Tr.ker[i].vNext)); c.lineTo(X(i + 2), sy(Tr.ker[i + 2].vNext)); c.stroke(); }
      if ($('#lf-bk-idl') && $('#lf-bk-idl').checked) { c.strokeStyle = p.gold; c.lineWidth = 1.5; c.setLineDash([5, 3]); c.beginPath(); let f = true; for (let i = 0; i < 10; i++) if (done(i)) { f ? c.moveTo(X(i), sy(Tr.ideal[i].vNext)) : c.lineTo(X(i), sy(Tr.ideal[i].vNext)); f = false; } c.stroke(); c.setLineDash([]); for (let i = 0; i < 10; i++) if (done(i)) { c.beginPath(); c.arc(X(i), sy(Tr.ideal[i].vNext), 4, 0, 7); c.stroke(); } }
      for (let i = 0; i < 10; i++) { const q = Tr.ker[i]; c.globalAlpha = done(i) ? 1 : .22; c.fillStyle = i % 2 ? p.tree : p.sig; c.beginPath(); c.arc(X(i), sy(q.vNext), i === t ? 6 : 4.5, 0, 7); c.fill(); if (q.spk && done(i)) { c.fillStyle = p.mwi; c.beginPath(); c.moveTo(X(i), SY0 - 2); c.lineTo(X(i) - 5, SY0 + 8); c.lineTo(X(i) + 5, SY0 + 8); c.closePath(); c.fill(); } c.globalAlpha = 1; }
      $('#lf-bk-info').innerHTML = `<b>${PHN[ph]}</b>　` + phaseText(Tr, t, ph);
    }
    function bkTick() { cancelAnimationFrame(raf); const now = performance.now(); anim.p = anim.dur ? (now - anim.t0) / anim.dur : 1; bkDraw(); if (anim.dur && anim.p < 1) raf = requestAnimationFrame(bkTick); }
    function bkFrame(i) {
      const t = Math.floor(i / 5), ph = i % 5;
      if (playerObj && playerObj.get() !== t) { syncing = true; playerObj.set(t); syncing = false; }
      if (!avail()) { bkDraw(); lastFrame = i; return; }
      const s = getTr().ker[t], step = lastFrame >= 0 && Math.abs(i - lastFrame) === 1 && !reduce();
      anim = { step: t, ph, from: step ? startLevel(s, ph) : endLevel(s)[ph], to: endLevel(s)[ph], t0: performance.now(), dur: step ? 650 : 0, p: 0 };
      lastFrame = i; bkTick();
    }
    function bkRefresh() { trKey = ''; if (bkPlayer) { lastFrame = -1; bkFrame(bkPlayer.get()); } }
    playerObj = A.Player($('#lf-player'), { n: T, fps: 2, label: i => `时间步 t = ${i}（读写 V${i & 1}）`, onFrame: i => { redraw(); if (!syncing && bkPlayer && Math.floor(bkPlayer.get() / 5) !== i) bkPlayer.set(i * 5); } });
    bkPlayer = A.Player($('#lf-bk-player'), { n: T * 5, fps: 1.6, label: i => `第 ${Math.floor(i / 5)} 步 · ${PHN[i % 5]}`, onFrame: bkFrame });
    $('#lf-more').addEventListener('toggle', redraw); $('#lf-bk-idl').addEventListener('change', bkDraw);
    HW.seg('lf-layer', v => { $$('#lf-preset button').forEach((b, i) => b.setAttribute('aria-pressed', i === 0)); setLayer(+v); });
    HW.seg('lf-preset', v => { if (v !== 'none') applyPreset(v); });
    [cR, cC].forEach(cc => cc.inp.addEventListener('input', redraw)); ['lf-c-int', 'lf-c-idl', 'lf-c-flt'].forEach(id => $('#' + id).addEventListener('change', redraw));
    $('#lf-map').addEventListener('click', e => { const y = LY[L], b = e.currentTarget.getBoundingClientRect(), x = e.clientX - b.left - 8, yy = e.clientY - b.top - 20, w = b.width - 16, h = b.height - 28; if (x < 0 || yy < 0 || x > w || yy > h) return; cC.set(Math.min(y.cols - 1, Math.floor(x / w * y.cols))); cR.set(Math.min(y.rows - 1, Math.floor(yy / h * y.rows))); redraw(); });
    A.onBeat(redraw); onRedraw(redraw); setLayer(0);
    // start on an interesting neuron: the first one in LIF1 that spikes at step 0
    setTimeout(() => applyPreset('reset'), 0);
  });

  /* ================================================================= MaxPool + QuantIdentity */
  AN.guard('pool', function () {
    const SP = [{ lif: 'lif1', pool: 'pool1', qi: 'qi2', rows: 16, inLen: 178, outLen: 89, scale: P.blocks[1].qi_scale, name: 'QI2' }, { lif: 'lif2', pool: 'pool2', qi: 'qi3', rows: 16, inLen: 87, outLen: 43, scale: P.blocks[2].qi_scale, name: 'QI3' }, { lif: 'lif3', pool: 'pool3', qi: 'bin_qi', rows: 24, inLen: 41, outLen: 20, scale: P.bin.qi_scale, name: '二分类 QI' }];
    let L = 0, playerObj; A.beatSelect($('#pl-beat'));
    const ctr = $('#pl-ctrls'), cCh = A.ctrlRange(ctr, 'pl-ch', '通道', 0, 15, 4, 1), cT = A.ctrlRange(ctr, 'pl-t', '时间步', 0, 9, 0, 1);
    function data() { const R = A.run(A.S.beat), sp = SP[L], S = R.steps[cT.get()], ch = cCh.get(); return { sp, ch, s: S[sp.lif].subarray(ch * sp.inLen, (ch + 1) * sp.inLen), pl: S[sp.pool].subarray(ch * sp.outLen, (ch + 1) * sp.outLen), qi: S[sp.qi].subarray(ch * sp.outLen, (ch + 1) * sp.outLen) }; }
    function draw() {
      const cv = $('#pl-cv'); const { c, w: W } = setupCanvas(cv), p = pal(), P_ = A.palette(); const D = data(), sp = D.sp, j = playerObj ? playerObj.get() : 0, q1 = KM.prim.qiQOne(sp.scale);
      const X = 10, Wd = W - 20, rowY = [34, 120, 206], rh = 34; const names = [`${sp.lif.toUpperCase()} 输出脉冲（${sp.inLen} 个点，通道 ${D.ch}）`, `MaxPool 输出（窗口 2、步长 2，${sp.outLen} 个点）`, `${sp.name} 输出（0 → 0，1 → ${q1}）`];
      names.forEach((n, i) => txt(c, n, X, rowY[i] - 8, p.ink2, 11.5, 'left', p.body));
      const cwI = Wd / sp.inLen, cwO = Wd / sp.outLen;
      A.heat(c, D.s, 1, sp.inLen, X, rowY[0], Wd, rh, 'spk'); const pl = new Int8Array(sp.outLen), qi = new Int8Array(sp.outLen); for (let q = 0; q <= j; q++) { pl[q] = D.pl[q]; qi[q] = D.qi[q]; }
      A.heat(c, pl, 1, sp.outLen, X, rowY[1], Wd, rh, 'spk'); A.heat(c, qi, 1, sp.outLen, X, rowY[2], Wd, rh, 'i8');
      c.strokeStyle = p.bad; c.lineWidth = 2; c.strokeRect(X + 2 * j * cwI - 1, rowY[0] - 2, 2 * cwI + 2, rh + 4); c.strokeRect(X + j * cwO - 1, rowY[1] - 2, cwO + 2, rh + 4); c.strokeRect(X + j * cwO - 1, rowY[2] - 2, cwO + 2, rh + 4);
      A.arrow(c, X + (2 * j + 1) * cwI, rowY[0] + rh + 2, X + (j + .5) * cwO, rowY[1] - 3, p.bad, 1.2); A.arrow(c, X + (j + .5) * cwO, rowY[1] + rh + 2, X + (j + .5) * cwO, rowY[2] - 3, p.bad, 1.2);
      const a = D.s[2 * j], b = D.s[2 * j + 1], mx = Math.max(a, b);
      txt(c, `第 ${j} 个窗口：(${a}, ${b}) → max = ${mx} → ${mx ? 'q_one = ' + q1 : 0}`, X, rowY[2] + rh + 36, p.ink, 13); txt(c, `${sp.inLen} 个输入点里有 ${D.s.reduce((x, y) => x + y, 0)} 个脉冲 → 池化后 ${D.pl.reduce((x, y) => x + y, 0)} 个 → QuantIdentity 后非零 ${D.qi.filter(v => v).length} 个，值都是 ${q1}`, X, rowY[2] + rh + 58, p.muted, 11.5, 'left', p.body);
      if (sp.inLen % 2) txt(c, `输入长度 ${sp.inLen} 是奇数，最后一个点（下标 ${sp.inLen - 1}）不属于任何窗口，被丢弃。`, X, rowY[2] + rh + 80, p.muted, 11.5, 'left', p.body);
    }
    function info() { const sp = SP[L], q1 = KM.prim.qiQOne(sp.scale), exact = 4096 / sp.scale; $('#pl-info').innerHTML = `${sp.name} 的输入尺度 s = ${sp.scale}：q_one = (4096 + ${sp.scale >> 1}) / ${sp.scale} = ${Math.trunc((4096 + (sp.scale >> 1)) / sp.scale)}${Math.trunc((4096 + (sp.scale >> 1)) / sp.scale) > 127 ? ' → 超出 INT8，被夹成 127' : ''}。下一层看到的“1”是 <b>${q1}</b>，对应的实数值是 ${q1}·${sp.scale}/4096 = ${(q1 * sp.scale / 4096).toFixed(4)}（精确应为 1）。${L === 2 ? ' 4 分类头的 QuantIdentity 用 s = ' + P.multi.qi1_scale + '，“1”是 ' + KM.prim.qiQOne(P.multi.qi1_scale) + '。' : ''}<span class="src">源码</span>`; }
    const redraw = () => { draw(); info(); };
    function setLayer(l) { L = l; const sp = SP[L]; cCh.set(Math.min(cCh.get(), sp.rows - 1), 0, sp.rows - 1); playerObj.setN(sp.outLen, false); redraw(); }
    playerObj = A.Player($('#pl-player'), { n: SP[0].outLen, fps: 8, label: i => `池化窗口 ${i}`, onFrame: redraw });
    HW.seg('pl-layer', v => { playerObj.stop(); setLayer(+v); }); [cCh, cT].forEach(cc => cc.inp.addEventListener('input', redraw)); A.onBeat(redraw); onRedraw(redraw);
    // QuantIdentity table
    const rows = [['QI2（卷积 2 之前）', P.blocks[1].qi_scale], ['QI3（卷积 3 之前）', P.blocks[2].qi_scale], ['二分类头 QI', P.bin.qi_scale], ['4 分类头 QI1', P.multi.qi1_scale], ['4 分类头 QI2', P.multi.qi2_scale]].map(([n, s]) => {
      const t = Math.trunc((4096 + (s >> 1)) / s), q = KM.prim.qiQOne(s), eff = q * s / 4096; return [n, s, `(4096 + ${s >> 1}) / ${s} = ${t}`, t > 127 ? `${t} → 夹成 <b>127</b>` : `<b>${q}</b>`, eff.toFixed(4), `${((eff - 1) * 100).toFixed(2)}%`]; });
    HW.Table('pl-table', ['位置', '输入尺度 s', 'q_one 的算式', '硬件里的“1”', '等效实数值 q_one·s/4096', '与 1.0 的偏差'], rows);
    $$('#pl-table td, #pl-table th').forEach((e, i) => { if (i % 6 === 0 || i % 6 === 2) e.style.textAlign = 'left'; });
    setLayer(0);
  });
})();
