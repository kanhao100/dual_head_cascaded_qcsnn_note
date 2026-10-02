/* Section: functional model & verification, and the end-to-end signal-flow animation. */
(function () {
  const { $, $$, fmt, pal, setupCanvas, txt, line, onRedraw } = HW;
  const A = AN, V = PACK.sum.verify, LIFS = PACK.sum.lif;
  const N = A.BEATS.length;

  /* ================================================================= verification section */
  const loc = s => String(s).replace(/differing tensors/g, '不同的张量').replace(/differing/g, '不同').replace(/mismatches/g, '不一致').replace(/values compared/g, '个值').replace(/tensors/g, '个张量')
    .replace(/beats x (\d+) words/g, '拍 × $1 个字').replace(/beats/g, '拍').replace(/random/g, '随机').replace(/forced ties/g, '构造的“恰好一半”').replace(/\(|\)/g, '').replace(/\s+\+\s+/g, ' + ');
  AN.guard('ladder', function () {
    const rows = [
      ['整数原语', 'requant / requantRNE 对 BigInt 参考实现'], ['整数原语', '位宽回绕 wrap24 / wrapN 对 BigInt.asIntN'], ['整数原语', 'q_one 对 32 / 136 / 140'],
      ['输入量化', 'float32 仿真 对 作者 FileReader 给出的 INT8 字'], ['逐张量', '200 拍（含 24 个展示心拍）对 C++ 导出的每层每步张量'], ['逐张量', '126 个边界 / 随机 INT8 输入字（全 0、全 ±127、交替、冲激、随机）'],
      ['最终分类', '1559 个验证心拍 对 真实 topFunction'], ['最终分类', '200 拍子集 对 真实 topFunction'], ['最终分类', '126 个边界字 对 真实 topFunction'], ['最终分类', '全部测试集 对 真实 topFunction'],
    ];
    const R = V.results, out = [];
    R.forEach((r, i) => { const d = rows[i] || ['', r.name]; out.push([`<b>${d[0]}</b>`, d[1], r.ok ? '相同' : '不同', loc(r.extra)]); });
    HW.Table('vm-ladder', ['层级', '比较对象', '结果', '规模'], out.map(r => [r[0], r[1], r[2], r[3]]));
    const rowsEl = $$('#vm-ladder tr');
    rowsEl.forEach((tr, i) => { if (!i) return; const c = tr.children; c[0].classList.add('l'); c[1].classList.add('l'); c[2].classList.add(R[i - 1].ok ? 'g' : 'r'); c[3].classList.add('l'); });
    $$('#vm-ladder th').forEach(th => th.classList.add('l'));
  });

  AN.guard('coverage', function () {
    const C = V.coverage, R = V.reach, g = k => C[k] || 0;
    const tie = ['bn1_tie', 'bn2_tie', 'bn3_tie'].map(k => R[k]);
    const tp = tie.reduce((a, r) => a + r.tiePairs, 0), pp = tie.reduce((a, r) => a + r.pairs, 0);
    const mxl = Math.max(...['conv1', 'conv2', 'conv3', 'bn1', 'bn2', 'bn3', 'fc_bin', 'fc1', 'fc2'].map(k => R[k].log2max));
    const lifMax = Math.max(...['lif1', 'lif2', 'lif3', 'bin_lif', 'm_lif1', 'm_lif2'].map(k => R[k].vBound));
    const rows = [
      ['requant.satHi / satLo', '卷积、全连接重量化饱和到 +127 / −128', `${fmt(g('requant.satHi'))} / ${fmt(g('requant.satLo'))}`, '已覆盖'],
      ['rne.satHi / satLo', 'BN 重量化饱和', `${fmt(g('rne.satHi'))} / ${fmt(g('rne.satLo'))}`, '已覆盖'],
      ['rne.tie', 'BN 取整遇到“恰好一半”（五成双的分支）', fmt(g('rne.tie')), `<b>这组参数下不可达。</b>BN 输入只有 256 种 INT8，逐通道逐输入枚举 ${fmt(pp)} 对，其中 ${fmt(tp)} 对出现恰好一半。五成双的代码路径只由“单元测试里构造的平局”验证过（351 组，对 BigInt 参考一致）。`],
      ['requant.bigint / rne.bigint', '64 位乘积超过 2^52，需要 BigInt 回退', `${fmt(g('requant.bigint'))} / ${fmt(g('rne.bigint'))}`, `<b>不可达。</b>所有卷积、BN、全连接通道的最坏 |累加值 × 乘数| ≤ 2^${mxl.toFixed(1)}，在 2^52 以内，Number 路径始终精确。（对单元测试里的大数用 BigInt 另验了回退路径）`],
      ['lif.betaClamped', 'β &gt; 4096 被夹到 4096（系数为 1；负数 Q12 舍入仍可能减 1）', fmt(g('lif.betaClamped')), '已覆盖'],
      ['lif.thetaNegative', '阈值为负（θ = −41、−136）', fmt(g('lif.thetaNegative')), '已覆盖'],
      ['lif.delayedReset', '读出的 t−2 膜电位超过阈值，触发延迟复位并扣除 sub_reset（含符号取整）', fmt(g('lif.delayedReset')), '已覆盖'],
      ['lif.wrap24', '膜电位 / x_q 超出 24 位发生回绕', fmt(g('lif.wrap24')), `<b>不可达。</b>每次同 bank 更新的保守增量 ≤ 128·|尺度| + 1（β 的符号取整误差）+ |θ| + [θ&lt;0]（负阈值复位额外 1）。偶、奇链各更新 5 次，最大上界 ${fmt(lifMax)}，远小于 2^23 = 8,388,608。`],
      ['qi.qOneClampedHi', 'q_one 商为 128，被夹成 127', fmt(g('qi.qOneClampedHi')), '已覆盖'],
      ['gate.tie', '10 步后 sum_norm = sum_abn（算正常）', fmt(g('gate.tie')), '已覆盖'],
      ['argmax.executed', '实际执行了 4 分类头与 argmax 的心拍次数（正常早退不计）', fmt(g('argmax.executed')), '已覆盖；不同验证集合可包含重复心拍'],
      ['argmax.candidateTie', '遍历时候选值等于当时最佳值；后来可能出现更大的值', fmt(g('argmax.candidateTie')), '已覆盖；这是事件次数，不是最终并列心拍数'],
      ['argmax.finalMaxTie', '4 个最终累计次数中，有两个或以上并列最大（每次执行最多计 1）', fmt(g('argmax.finalMaxTie')), '已覆盖；并列取最前面的'],
    ];
    HW.Table('vm-cov', ['事件', '含义', '次数', '状态'], rows.map(r => [`<code>${r[0]}</code>`, r[1], r[2], r[3]]));
    $$('#vm-cov tr').forEach((tr, i) => { if (!i) return; const c = tr.children; c[1].classList.add('l'); c[3].classList.add('l'); c[3].classList.add(/已覆盖/.test(r3(rows[i - 1])) ? 'g' : 'm'); c[2].style.textAlign = 'right'; });
    $$('#vm-cov th').forEach(th => th.classList.add('l'));
    function r3(r) { return r[3]; }
  });

  AN.guard('lifFinding', function () {
    const L = LIFS, pc = x => (x * 100).toFixed(2) + '%';
    $('#vm-lif-body').innerHTML = ` <code>lif1d_integer.h</code> 的注释写“从这个 bank 读，往另一个 bank 写”，代码却是 <code>rd = bank</code>、<code>wr = !bank</code>，读取写成 <code>if (rd) V1 else V0</code>，写入写成 <code>if (wr) V0 else V1</code>。<code>bank</code> 为假时 rd 为假，读 V0；wr 为真，也写 V0。读和写落在<b>同一块</b>，调用结束后 <code>bank</code> 翻转，下一次就读写 V1。结果是<b>偶数步和奇数步各用一块存储、互不相通</b>：第 t 步的膜电位接的是第 t−2 步，不是第 t−1 步。所以 LIF1 的脉冲在 (0,1)、(2,3)…… 每一对时间步里完全相同，${fmt(L.pairBeats)} / ${fmt(L.beats)} 个验证心拍全部如此。<span class="src">源码</span><br><br>
      这一行为由 C++ 导出的张量逐位验证过（包括 V0、V1 两块的内容和 bank 标志），所以是 C++ 本来的样子，不是模型的毛病。我之前页面里写的“两块轮流、读一块写另一块”不对，已改正。<br><br>
      <b>影响多大（我的模型做的对比，没有经过 C++ 或综合验证）：</b>把写入改成“写另一块”、其余不变，${fmt(L.beats)} 个验证心拍里最终分类有 ${L.diffFinal} 个不同，4 分类准确率 ${pc(L.accWritten)} → ${pc(L.accIntended)}。我没有核对训练端（snnTorch）是不是按“第 t 步接第 t−1 步”更新，所以不知道论文里的精度对应哪一种；这只是一个需要作者确认的现象。<span class="src der">推导</span>`;
  });

  AN.guard('live', function () {
    const grid = $('#vm-grid'); grid.innerHTML = Array.from({ length: N }, (_, i) => `<i title="心拍 #${i}">${i}</i>`).join('');
    const cells = $$('i', grid), badge = $('#vm-badge'); let i = 0, good = 0, wordsN = 0, digN = 0; const bad = [];
    function check(k) {
      const B = A.BEATS[k], words = A.model.quantizeRow(Array.from(B.rowF)); let ok = true, why = '';
      for (let j = 0; j < 188; j++) if (words[j] !== B.wordsG[j]) { ok = false; why = `输入字 ${j}`; break; }
      wordsN += 188;
      const res = A.model.run(words, { trace: true }), G = A.GOLD[k], d = A.digestsOf(res, G.n);
      for (let j = 0; j < G.n; j++) if (d[j] !== G.d[j]) { ok = false; why = why || `张量摘要 ${A.KEYS[j].join('/')}`; break; }
      digN += G.n;
      if (res.pred2 !== B.top[0] || res.pred4 !== B.top[1]) { ok = false; why = why || '最终分类'; }
      A.finals[k] = A.finalClass(res); A.summ[k] = { pred2: res.pred2, pred4: res.pred4, sums2: res.sums2.slice(), sums4: res.sums4.slice(), early: res.pred2 === 0 };
      cells[k].className = ok ? 'ok' : 'no'; if (ok) good++; else bad.push(`#${k}：${why}`);
    }
    function step() { const t0 = performance.now(); while (i < N && performance.now() - t0 < 25) check(i++); if (i < N) setTimeout(step, 0); else done(); }
    function done() {
      badge.classList.add(good === N ? 'ok' : 'no');
      $('#vm-head').textContent = good === N ? `${good} / ${N} 个心拍逐位一致` : `${good} / ${N} 个心拍一致，有 ${bad.length} 个不一致`;
      $('#vm-sub').textContent = good === N ? `${fmt(wordsN)} 个输入字、${fmt(digN)} 个张量摘要（每层每个时间步）、最终分类，全部与 C++ 相同。` : bad.join('；');
      A.refreshLabels(); fireDone();
    }
    const doneCbs = []; A.onVerified = f => { if (A.summ[0]) f(); else doneCbs.push(f); }; function fireDone() { doneCbs.forEach(f => f()); }
    setTimeout(step, 30);
  });

  /* ================================================================= flow animation */
  const ST1 = ['in', 'conv1', 'bn1', 'lif1', 'pool1', 'qi2', 'conv2', 'bn2', 'lif2', 'pool2', 'qi3', 'conv3', 'bn3', 'lif3', 'pool3', 'bin_qi', 'bin_fc', 'bin_lif'];
  const ST2 = ['m_qi1', 'm_fc1', 'm_lif1', 'm_qi2', 'm_fc2', 'm_lif2'];
  const ND = {
    in: { t: '输入 INT8', r: 1, c: 180, m: 'i8', pos: [0, 0], key: 'in', cap: '1×180' },
    conv1: { t: '卷积 1', r: 16, c: 178, m: 'i8', pos: [0, 1], key: 'conv1', cap: '16×178' }, bn1: { t: 'BN 1', r: 16, c: 178, m: 'i8', pos: [0, 2], key: 'bn1', cap: '16×178' },
    lif1: { t: 'LIF 1', r: 16, c: 178, m: 'spk', pos: [0, 3], key: 'lif1', cap: '16×178' }, pool1: { t: '池化 1', r: 16, c: 89, m: 'spk', pos: [0, 4], key: 'pool1', cap: '16×89' },
    qi2: { t: 'QuantIdentity', r: 16, c: 89, m: 'i8', pos: [0, 5], key: 'qi2', cap: '16×89，1→127' },
    conv2: { t: '卷积 2', r: 16, c: 87, m: 'i8', pos: [1, 0], key: 'conv2', cap: '16×87' }, bn2: { t: 'BN 2', r: 16, c: 87, m: 'i8', pos: [1, 1], key: 'bn2', cap: '16×87' },
    lif2: { t: 'LIF 2', r: 16, c: 87, m: 'spk', pos: [1, 2], key: 'lif2', cap: '16×87' }, pool2: { t: '池化 2', r: 16, c: 43, m: 'spk', pos: [1, 3], key: 'pool2', cap: '16×43' },
    qi3: { t: 'QuantIdentity', r: 16, c: 43, m: 'i8', pos: [1, 4], key: 'qi3', cap: '16×43，1→127' },
    conv3: { t: '卷积 3', r: 24, c: 41, m: 'i8', pos: [2, 0], key: 'conv3', cap: '24×41' }, bn3: { t: 'BN 3', r: 24, c: 41, m: 'i8', pos: [2, 1], key: 'bn3', cap: '24×41' },
    lif3: { t: 'LIF 3', r: 24, c: 41, m: 'spk', pos: [2, 2], key: 'lif3', cap: '24×41' }, pool3: { t: '池化 3', r: 24, c: 20, m: 'spk', pos: [2, 3], key: 'pool3', cap: '24×20 = 480，进缓存' },
    bin_qi: { t: 'QI 480 + RR 4', r: 1, c: 484, m: 'i8', pos: [3, 0], key: 'bin_cat', dkey: 'bin_qi', cap: '1×484' }, bin_fc: { t: '全连接 484→2', r: 1, c: 2, m: 'i8', pos: [3, 1], key: 'bin_fc', cap: '1×2' },
    bin_lif: { t: 'LIF（二分类）', r: 1, c: 2, m: 'spk', pos: [3, 2], key: 'bin_lif', cap: '1×2' },
    m_qi1: { t: 'QI 480 + RR 4', r: 1, c: 484, m: 'i8', pos: [4, 0], key: 'm_cat', dkey: 'm_qi1', cap: '缓存的第 t 步', st: 2 }, m_fc1: { t: '全连接 484→128', r: 1, c: 128, m: 'i8', pos: [4, 1], key: 'm_fc1', cap: '1×128', st: 2 },
    m_lif1: { t: 'LIF', r: 1, c: 128, m: 'spk', pos: [4, 2], key: 'm_lif1', cap: '1×128', st: 2 }, m_qi2: { t: 'QuantIdentity', r: 1, c: 128, m: 'i8', pos: [4, 3], key: 'm_qi2', cap: '1×128', st: 2 },
    m_fc2: { t: '全连接 128→4', r: 1, c: 4, m: 'i8', pos: [4, 4], key: 'm_fc2', cap: '1×4', st: 2 }, m_lif2: { t: 'LIF（4 分类）', r: 1, c: 4, m: 'spk', pos: [4, 5], key: 'm_lif2', cap: '1×4', st: 2 },
  };
  ND.gate = { t: '门控', pos: [3, 3], special: 'gate', cap: 'sum 比较' }; ND.arg = { t: 'argmax', pos: [4, 6], special: 'arg', cap: '4 个累计' };
  const PW = 146, PH = 116, NW = 132, HT = 54, X0 = 14, Y0 = 10;
  const rect = k => { const p = ND[k].pos; return { x: X0 + p[1] * PW, y: Y0 + p[0] * PH, w: NW, h: 18 + HT + 16 }; };
  let frames = [], player, sel = null, rects = {};
  function buildFrames() {
    const res = A.run(A.S.beat); frames = [];
    for (let t = 0; t < 10; t++) ST1.forEach((k, j) => frames.push({ st: 1, t, k, j }));
    frames.push({ st: 1, t: 9, k: 'gate', j: 99 });
    if (res.pred2 === 1) { for (let t = 0; t < 10; t++) ST2.forEach((k, j) => frames.push({ st: 2, t, k, j })); frames.push({ st: 2, t: 9, k: 'arg', j: 99 }); }
  }
  function tensorFor(key, res, step, stage) { const S = stage === 1 ? res.steps[step] : res.stage2[step]; if (!S) return null; if (key === 'in') return res.words.subarray(0, 180); return S[key]; }
  const cum = (res, stage, upto, key, n) => { const s = new Array(n).fill(0); const arr = stage === 1 ? res.steps : res.stage2; for (let t = 0; t <= upto && t < arr.length; t++) for (let q = 0; q < n; q++) s[q] += arr[t][key][q]; return s; };

  // One source of truth for the time step shown in each block. The inspector
  // uses this too: a block not reached at t=0 has no tensor, rather than zeros.
  function displayed(k, f, res) {
    f = f || frames[player ? player.get() : 0]; res = res || A.run(A.S.beat);
    const d = ND[k], stage = d.st || (k === 'arg' ? 2 : 1);
    if (d.special) {
      const unrun = stage === 2 && res.pred2 !== 1;
      const order = stage === 1 ? ST1 : ST2, last = stage === 1 ? 'bin_lif' : 'm_lif2';
      const step = stage === 1 ? ((f.st === 2 || f.k === 'gate') ? 9 : (f.j < order.indexOf(last) ? f.t - 1 : f.t))
        : (f.st === 2 ? (f.k === 'arg' ? 9 : (f.j < order.indexOf(last) ? f.t - 1 : f.t)) : -1);
      return { node: d, stage, step, unrun, pending: step < 0 || unrun, prior: false,
        tensor: step >= 0 && !unrun ? Int32Array.from(cum(res, stage, step, last, stage === 1 ? 2 : 4)) : null };
    }
    let step = -1, prior = false;
    if (f.st === 1 && stage === 1) { const idx = ST1.indexOf(k); const reached = idx <= f.j || f.k === 'gate'; step = reached ? f.t : f.t - 1; prior = !reached; }
    else if (f.st === 2) { if (stage === 1) step = 9; else { const reached = f.k === 'arg' || ST2.indexOf(k) <= f.j; step = reached ? f.t : f.t - 1; prior = !reached; } }
    const unrun = stage === 2 && res.pred2 !== 1;
    return { node: d, stage, step, prior, unrun, pending: step < 0 || unrun,
      tensor: step >= 0 && !unrun ? tensorFor(d.key, res, step, stage) : null };
  }
  A.flow = { nodes: ND, frame: () => ({ ...frames[player ? player.get() : 0], index: player ? player.get() : 0 }), displayed,
    pause: () => player && player.stop(), select(k) { sel = k; flowFrame(); },
    open(k, origin) { if (!ND[k]) return; this.pause(); this.select(k); if (A.inspector) A.inspector.open(k, origin); } };

  function drawFlow() {
    const cv = $('#fl-cv'); if (!cv || !frames.length) return; const { c, w } = setupCanvas(cv); const P = A.palette(), p = P.p; const res = A.run(A.S.beat);
    const f = frames[player ? player.get() : 0]; rects = {};
    // stage captions sit in the free corners of the grid
    [['共享主干：每个时间步都重新算一遍', 'pool3 的结果同时写进缓存，', '留给阶段 2 使用'], ['二分类头 → 门控', '10 步累计后比较；判异常才', '运行下面的 4 分类头']].forEach((ls, q) => ls.forEach((l, z) => txt(c, l, X0 + 4 * PW + 6, Y0 + (2 + q) * PH + 26 + z * 17, z ? p.muted : p.ink2, z ? 11 : 12, 'left', p.body)));
    // edges
    const edge = (a, b, dash) => { const ra = rect(a), rb = rect(b); c.setLineDash(dash ? [4, 4] : []); if (ra.y === rb.y) A.arrow(c, ra.x + ra.w, ra.y + 18 + HT / 2, rb.x - 1, rb.y + 18 + HT / 2, p.muted, 1.2); else { const x0 = ra.x + ra.w / 2, y0 = ra.y + ra.h, x1 = rb.x + rb.w / 2, y1 = rb.y - 2, ym = y1 - 8; c.strokeStyle = p.muted; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0, ym); c.lineTo(x1, ym); c.stroke(); A.arrow(c, x1, ym, x1, y1 + 1, p.muted, 1.2); } c.setLineDash([]); };
    for (let q = 0; q + 1 < ST1.length; q++) edge(ST1[q], ST1[q + 1]);
    edge('bin_lif', 'gate'); edge('gate', 'm_qi1', true); for (let q = 0; q + 1 < ST2.length; q++) edge(ST2[q], ST2[q + 1]); edge('m_lif2', 'arg');
    Object.keys(ND).forEach(k => {
      const d = ND[k], r = rect(k); rects[k] = r; const active = f.k === k;
      A.box(c, r.x, r.y, r.w, r.h, active ? `color-mix(in srgb, ${p.en} 14%, ${p.surface})` : p.surface, active ? p.en : (sel === k ? p.sig : p.line), 7); if (active) { c.lineWidth = 2; c.strokeStyle = p.en; c.stroke(); }
      txt(c, d.t, r.x + 7, r.y + 13, p.ink, 11.5, 'left', p.body); const hy = r.y + 18, hw = r.w - 14;
      if (d.special === 'gate') {
        const shown = displayed(k, f, res); if (!shown.tensor) { txt(c, '尚未累计', r.x + 7, hy + 30, p.muted, 11, 'left', p.body); return; }
        const s = shown.tensor, mx = Math.max(1, s[0], s[1]);
        [[s[0], p.sig, '正常'], [s[1], p.bad, '异常']].forEach(([v, col, nm], q) => { c.fillStyle = A.mix(P.zero, A.rgb(col), .1); c.fillRect(r.x + 7, hy + 4 + q * 24, hw, 18); c.fillStyle = col; c.fillRect(r.x + 7, hy + 4 + q * 24, hw * v / mx, 18); txt(c, `${nm} ${v}`, r.x + 11, hy + 17 + q * 24, p.ink, 11); });
        const done = f.k === 'gate' || f.st === 2; txt(c, done ? (res.pred2 ? '异常 > 正常 → 继续' : '不大于 → 正常，退出') : d.cap, r.x + 7, r.y + r.h - 4, done ? (res.pred2 ? p.bad : p.mwi) : p.muted, 10.5, 'left', p.body); return;
      }
      if (d.special === 'arg') {
        if (res.pred2 !== 1) { txt(c, '未运行', r.x + 7, hy + 30, p.muted, 11, 'left', p.body); return; }
        const shown = displayed(k, f, res); if (!shown.tensor) { txt(c, '尚未累计', r.x + 7, hy + 30, p.muted, 11, 'left', p.body); return; }
        const s = shown.tensor, mx = Math.max(1, ...s);
        s.forEach((v, q) => { c.fillStyle = A.mix(P.zero, P.spk, .3); c.fillRect(r.x + 7, hy + 2 + q * 13, hw, 10); c.fillStyle = `rgb(${P.spk.join(',')})`; c.fillRect(r.x + 7, hy + 2 + q * 13, hw * v / mx, 10); txt(c, `${A.CLS1[q]} ${v}`, r.x + 10, hy + 11 + q * 13, p.ink, 9.5); });
        txt(c, f.k === 'arg' ? `结果：${A.CLS1[res.pred4]}` : d.cap, r.x + 7, r.y + r.h - 4, p.muted, 10.5, 'left', p.body); return;
      }
      // tensor nodes
      const shown = displayed(k, f, res), arr = shown.tensor;
      c.globalAlpha = shown.prior ? .45 : 1; A.heat(c, arr, d.r, d.c, r.x + 7, hy, hw, HT, d.m); c.globalAlpha = 1;
      let st = d.cap; if (arr) { if (d.m === 'spk') { let n = 0; for (let q = 0; q < arr.length; q++) n += arr[q] ? 1 : 0; st = `脉冲 ${n} / ${arr.length}`; } else { let mn = 127, mxv = -128; for (let q = 0; q < arr.length; q++) { if (arr[q] < mn) mn = arr[q]; if (arr[q] > mxv) mxv = arr[q]; } st = `[${mn}, ${mxv}]  ${d.cap}`; } }
      txt(c, st, r.x + 7, r.y + r.h - 4, p.muted, 10, 'left', p.body);
    });
    c.setLineDash([]);
  }
  function infoFlow() {
    const res = A.run(A.S.beat), f = frames[player ? player.get() : 0], B = A.BEATS[A.S.beat];
    let h = `<b>阶段 ${f.st} · 时间步 t = ${f.t}${f.st === 1 && f.k === 'gate' ? ' · 门控' : ''}</b>　正在算：<b>${ND[f.k].t}</b>（${ND[f.k].cap}）。`;
    if (f.k === 'gate') h += ` 10 步累计：正常 ${res.sums2[0]}，异常 ${res.sums2[1]}；严格大于才判异常 → <b>${res.pred2 ? '异常，继续 4 分类头' : '正常，提前退出（pred4 = 0）'}</b>。`;
    else if (f.k === 'arg') h += ` 4 个神经元累计 ${res.sums4.join(' / ')}，取最大（并列取最前面）→ <b>${A.CLS[res.pred4]}</b>。`;
    else {
      const d0 = ND[f.k]; const step = f.t, stg = d0.st || 1, arr = tensorFor(d0.key, res, step, stg);
      if (arr) {
        const dk = d0.dkey || d0.key; let gm = '';
        if (d0.key === 'in') { let same = true; for (let q = 0; q < 180; q++) if (res.words[q] !== B.wordsG[q]) same = false; gm = same ? ' 与 FileReader 的输入字相同 ✓' : ' 与 FileReader 不同 ✗'; }
        else { const j = A.KEYS.findIndex(q => q[0] === stg && q[1] === step && q[2] === dk); const G = A.GOLD[A.S.beat]; if (j >= 0 && j < G.n) { const dg = KM.digest(A.getTensor(res, stg, step, dk)); gm = dg === G.d[j] ? ` ${d0.dkey ? '前 480 个 QI 值的' : '张量'}摘要 0x${A.hex(dg)} = C++ 导出 ✓` : ` 摘要与 C++ 不同 ✗`; } if (d0.dkey) { const off = stg === 1 ? 180 : 184, rrOk = Array.from(arr.subarray(480)).every((v, i) => v === B.wordsG[off + i]); gm += rrOk ? '；后 4 个 RR 与 FileReader 相同 ✓' : '；RR 与 FileReader 不同 ✗'; } }
        h += ` ${gm}`;
      }
      if (f.k === 'lif1' && f.t % 2 === 1) h += ` 注意：LIF1 第 ${f.t - 1}、${f.t} 步的脉冲完全相同，见“验证时发现的一件事”。`;
      if (f.k === 'qi2' || f.k === 'qi3' || f.k === 'bin_qi' || f.k === 'm_qi1' || f.k === 'm_qi2') h += ` 脉冲“1”在这里是 q_one（见 QuantIdentity 一节）。`;
      if (f.k === 'conv1' || f.k === 'bn1') h += ` 输入每步都一样，所以第 ${f.t} 步的结果和第 0 步相同。`;
    }
    $('#fl-info').innerHTML = h + `<br><span class="small">点击任意方框可查看它；当前心拍：${A.CLS[B.label]}，记录 ${B.record}，模型判为 ${A.CLS[A.finalClass(res)]}（二分类和 4 分类共 ${res.pred2 ? 20 : 10} 个时间步）。</span>`;
  }
  function flowFrame() { drawFlow(); infoFlow(); }
  function initFlow() {
    A.beatSelect($('#fl-beat')); buildFrames();
    player = A.Player($('#fl-player'), { n: frames.length, fps: 8, label: i => { const f = frames[i]; return f.k === 'gate' ? '门控' : f.k === 'arg' ? 'argmax' : `阶段 ${f.st} · t=${f.t} · ${ND[f.k].t}`; }, onFrame: flowFrame });
    A.onBeat(() => { buildFrames(); player.setN(frames.length); drawInput(); });
    const cv = $('#fl-cv'); cv.tabIndex = 0; cv.setAttribute('aria-label', '信号流热图。方向键选择模块，Enter 查看真实数据。'); cv.style.cursor = 'pointer';
    cv.addEventListener('click', e => { const b = e.target.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top; let hit = null; for (const k in rects) { const r = rects[k]; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) hit = k; } if (hit) A.flow.open(hit, cv); });
    cv.addEventListener('keydown', e => { const ks = Object.keys(ND); if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) { e.preventDefault(); const i = ks.indexOf(sel), dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1; sel = ks[(Math.max(0, i) + dir + ks.length) % ks.length]; cv.setAttribute('aria-label', `${ND[sel].t}。Enter 查看真实数据。`); flowFrame(); } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); A.flow.open(sel || fkey(), cv); } });
    function fkey() { return frames[player ? player.get() : 0].k; }
    onRedraw(drawFlow);
  }

  /* ---------------- input strip */
  let curIdx = 90;
  function drawInput() {
    const cv = $('#fl-in'); if (!cv) return; const { c, w, h } = setupCanvas(cv), p = pal(); const B = A.BEATS[A.S.beat], row = B.rowF, words = A.wordsOf(A.S.beat);
    const X = 10, W = Math.min(w - 250, 720), top = 12, hh = 70, bt = top + hh + 26, bh = 64;
    let mn = 1e9, mx = -1e9; for (let i = 0; i < 180; i++) { mn = Math.min(mn, row[i]); mx = Math.max(mx, row[i]); }
    const ys = v => top + hh - (v - mn) / (mx - mn || 1) * hh, xs = i => X + i / 179 * W;
    txt(c, '浮点（作者预处理后的 z-score 波形）', X, top - 2, p.muted, 10.5, 'left', p.body);
    line(c, X, ys(0), X + W, ys(0), p.grid, 1); c.strokeStyle = p.sig; c.lineWidth = 1.6; c.beginPath(); for (let i = 0; i < 180; i++) { i ? c.lineTo(xs(i), ys(row[i])) : c.moveTo(xs(i), ys(row[i])); } c.stroke();
    txt(c, 'INT8（kernel 的输入字 0..179）', X, bt - 4, p.muted, 10.5, 'left', p.body);
    const zy = bt + bh / 2; line(c, X, zy, X + W, zy, p.grid, 1); const bw = Math.max(1, W / 180 - .5);
    for (let i = 0; i < 180; i++) { const v = words[i]; c.fillStyle = v >= 0 ? p.en : p.sig; const hgt = Math.abs(v) / 128 * bh / 2; c.fillRect(xs(i) - bw / 2, v >= 0 ? zy - hgt : zy, bw, Math.max(hgt, .5)); }
    const cx = xs(curIdx); line(c, cx, top, cx, bt + bh, p.bad, 1, [3, 3]);
    const f32 = KM.prim.f32, inv = f32(1 / f32(A.PARAMS.input_scale_f32)), xf = f32(row[curIdx]), sc = f32(xf * inv), q = Math.max(-128, Math.min(127, KM.prim.rne(sc)));
    const tx = X + W + 18; txt(c, `采样点 ${curIdx}（鼠标在图上移动）`, tx, top + 10, p.ink, 11.5, 'left', p.body);
    txt(c, `x = ${xf.toPrecision(7)}`, tx, top + 30, p.ink2, 11.5); txt(c, `x × (1/${A.PARAMS.input_scale_f32}) = ${sc.toFixed(4)}`, tx, top + 48, p.ink2, 11.5); txt(c, `nearbyint（偶数优先）→ ${q}`, tx, top + 66, p.ink2, 11.5); txt(c, `夹到 [−128,127] → ${words[curIdx]}`, tx, top + 84, p.ink, 12);
    const rr = [...Array(4)].map((_, r) => row[180 + r]);
    txt(c, 'RR 特征（原始）：' + rr.map(v => v.toFixed(3)).join('  '), tx, top + 110, p.muted, 10.5); txt(c, '第一级字 180..183：' + Array.from(words.slice(180, 184)).join(' '), tx, top + 128, p.muted, 10.5); txt(c, '第二级字 184..187：' + Array.from(words.slice(184, 188)).join(' '), tx, top + 146, p.muted, 10.5);
    $('#fl-in-tag').textContent = `${A.CLS[B.label]} · 记录 ${B.record}`;
  }
  function initInput() {
    const cv = $('#fl-in'); cv.addEventListener('pointermove', e => { const b = cv.getBoundingClientRect(), W = Math.min(b.width - 250, 720); curIdx = Math.max(0, Math.min(179, Math.round((e.clientX - b.left - 10) / W * 179))); drawInput(); });
    $('#fl-in-info').innerHTML = `输入量化发生在<b>主机侧</b>（作者的 <code>FileReader</code>），不在 kernel 里：波形乘以 1/${A.PARAMS.input_scale_f32}（float32），按“偶数优先”取整，夹到 INT8。RR 特征先减均值、乘以标准差的倒数，再分别用两级的尺度量化，放进字 180–187。kernel 只看到这 188 个 INT8。这一步我用 float32 仿真，和作者程序逐字比对过（1559 拍 × 188 个字，零差异）。<span class="src">源码</span> <span class="src rpt">验证</span>`;
    onRedraw(drawInput); A.onBeat(drawInput);
  }
  AN.guard('initFlow', initFlow); AN.guard('initInput', initInput); drawInput();
})();
