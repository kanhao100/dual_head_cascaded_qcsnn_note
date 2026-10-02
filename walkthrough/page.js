/* Kernel walkthrough page script. Globals: HW (widgets), K (kernel.json), FIGS (svg strings). */
(function () {
  const { $, $$ } = HW;
  const fmt = n => Number(n).toLocaleString('en-US');
  const tag = (t, c) => `<span class="src${c ? ' ' + c : ''}">${t}</span>`;
  const T = { top: K.top, impl: K.impl, paper: K.paper, M: K.macro };

  /* ---------------- hero KPIs ---------------- */
  const ms = (cyc, mhz = 100) => (cyc / mhz / 1000).toFixed(2);
  $('#kpis').innerHTML = [
    [fmt(T.top.worst), `最坏周期（${ms(T.top.worst)} ms @100 MHz，含 4 分类头）`, '报告'],
    [fmt(T.top.best), `最好周期（${ms(T.top.best)} ms，正常心拍提前退出）`, '报告'],
    ['II = 1', `所有 ${K.log.pipelines} 个流水线循环；II 违例 ${K.log.violations} 条`, '报告'],
    [`${K.impl.DSP} / 220`, `DSP，实现后（BRAM ${K.impl.BRAM} / 280，LUT ${fmt(K.impl.LUT)}）`, '报告'],
    [`${K.impl.post_route_ns} ns`, `布线后时钟周期，目标 10 ns（裕量 +${K.impl.wns} ns）`, '报告'],
  ].map(([b, s, t]) => `<div class="kpi"><b>${b}</b><span>${s} ${tag(t, 'rpt')}</span></div>`).join('');

  /* ---------------- figures ---------------- */
  $('#fig1-host').innerHTML = FIGS.f1; $('#fig2-host').innerHTML = FIGS.f2; $('#fig3-host').innerHTML = FIGS.f3; $('#fig4-host').innerHTML = FIGS.f4;

  /* ---------------- ports ---------------- */
  (function () {
    const role = n => /ap_clk/.test(n) ? '时钟' : /ap_rst_n/.test(n) ? '复位（低有效）' : /ap_start|ap_done|ap_ready|ap_idle/.test(n) ? '块级握手 ap_ctrl_hs' : /TDATA/.test(n) ? 'AXI-Stream 数据' : /TKEEP/.test(n) ? '字节有效' : /TSTRB/.test(n) ? '字节类型' : /TLAST/.test(n) ? '帧结束' : /TVALID/.test(n) ? '有效' : /TREADY/.test(n) ? '就绪' : '';
    const base = n => n.replace(/_T(DATA|KEEP|STRB|LAST|VALID|READY)$/, '');
    const groups = {}; K.ports.forEach(p => { const g = base(p.name); (groups[g] = groups[g] || []).push(p); });
    const what = { dmaInStream: '输入：24 拍 × 8 字节，共 192 字节，用到 188 字节（180 采样 + 4 + 4 个 RR）', dmaOut2Stream: '输出 1：二分类结果（0 正常 / 1 异常）', dmaOut4Stream: '输出 2：4 分类结果（0 到 3）；正常心拍时固定写 0', ap_clk: '', ap_rst_n: '', ap_start: '', ap_done: '', ap_ready: '', ap_idle: '' };
    const rows = [];
    Object.entries(groups).forEach(([g, ps]) => {
      if (/^ap_/.test(g)) return;
      rows.push([`<b>${g}</b>`, ps.map(p => `${p.name.replace(g + '_', '')} ${p.dir === 'input' ? '入' : '出'}${p.width > 1 ? '[' + p.width + ']' : ''}`).join('，'), what[g] || '']);
    });
    rows.push(['<b>ap_ctrl_hs</b>', K.ports.filter(p => /^ap_(start|done|ready|idle)$/.test(p.name)).map(p => `${p.name} ${p.dir === 'input' ? '入' : '出'}`).join('，'), '块级启动/完成握手，每次启动处理一个心拍']);
    rows.push(['<b>时钟与复位</b>', 'ap_clk 入，ap_rst_n 入', '']);
    HW.Table('ports-host', ['端口组', '信号', '含义'], rows);
    $$('#ports-host td').forEach((td, i) => { if (i % 3 !== 0) td.style.textAlign = 'left'; td.style.whiteSpace = 'normal'; });
    $$('#ports-host th').forEach((th, i) => { if (i) th.style.textAlign = 'left'; });
  })();

  /* ---------------- macro schedule ---------------- */
  const KIND = { conv: ['卷积', '--sig'], bn: ['BatchNorm', '--tree'], lif: ['LIF', '--en'], pool: ['池化', '--thr'], qi: ['QuantIdentity', '--gold'], fc: ['全连接', '--bad'], cache: ['特征缓存读写', '--mwi'], io: ['数据搬运/拼接', '--muted'], glue: ['模块间衔接', '--line'] };
  $('#kind-legend').innerHTML = Object.values(KIND).map(([n, v]) => `<span><i style="background:var(${v})"></i>${n}</span>`).join('');
  function macro(which) {
    const rows = which === '1' ? T.M.stage1 : T.M.stage2, iter = which === '1' ? T.M.stage1_iter : T.M.stage2_iter, sum = which === '1' ? T.M.stage1_sum : T.M.stage2_sum, glue = iter - sum;
    const segs = rows.concat([{ label: '模块间衔接', kind: 'glue', start: sum, cycles: glue, tag: 'iter − Σ' }]);
    $('#mac-bar').innerHTML = segs.map((r, i) => `<div data-i="${i}" title="${r.label}：${fmt(r.cycles)} 周期" style="width:${(r.cycles / iter * 100).toFixed(4)}%;background:var(${KIND[r.kind][1]});opacity:${i % 2 ? .78 : 1};border-right:1px solid var(--surface)"></div>`).join('');
    $('#mac-rows').innerHTML = segs.map((r, i) => `<div class="tl-row" data-i="${i}"><span class="nm" title="${r.label}">${r.label}</span><span class="tr"><i style="left:${(r.start / iter * 100).toFixed(3)}%;width:${Math.max(.15, r.cycles / iter * 100).toFixed(3)}%;background:var(${KIND[r.kind][1]})"></i></span><span class="v">${fmt(r.start)} → ${fmt(r.start + r.cycles)} · ${fmt(r.cycles)} 周期 · ${(r.cycles / iter * 100).toFixed(1)}%</span></div>`).join('');
    const show = i => { const r = segs[i]; $('#mac-info').innerHTML = `<b>${r.label}</b>　从第 ${fmt(r.start)} 周期开始，长 ${fmt(r.cycles)} 周期，占这一步的 ${(r.cycles / iter * 100).toFixed(1)}%。${r.kind === 'glue' ? '这是报告里这个循环的迭代延迟减去各模块延迟之和。' : ''}`; };
    $$('#mac-bar div, #mac-rows .tl-row').forEach(el => { el.addEventListener('mouseenter', () => show(+el.dataset.i)); el.addEventListener('click', () => show(+el.dataset.i)); });
    const conv = rows.filter(r => r.kind === 'conv').reduce((a, r) => a + r.cycles, 0), big = rows.slice().sort((a, b) => b.cycles - a.cycles)[0];
    $('#mac-info').innerHTML = `一步共 <b>${fmt(iter)}</b> 周期（报告里该循环的迭代延迟）。各模块延迟之和 ${fmt(sum)}，差 ${glue} 周期是衔接开销。${which === '1' ? `最长的是<b>${big.label}</b>（${fmt(big.cycles)}），卷积合计 ${fmt(conv)}，占 ${(conv / iter * 100).toFixed(0)}%。` : `最长的是<b>${big.label}</b>（${fmt(big.cycles)}）：484×128 的全连接虽然资源最重，时间上只占一步的三分之一。`} ${tag('推导', 'der')}`;
  }
  HW.seg('mac-seg', v => macro(v)); macro('1');

  (function () {
    const worst = T.top.worst, init = T.M.init_and_other, s1 = K.loops.stage1.cycles, s2 = K.loops.stage2.cycles, ex = T.M.top_extra;
    const parts = [['复位/初始化等', init, '--muted'], ['二分类路径 × 10 步', s1, '--sig'], ['4 分类头 × 10 步', s2, '--bad'], ['顶层搬运', ex, '--thr']];
    $('#beat-bar').innerHTML = parts.map(([n, c, v]) => `<div title="${n}：${fmt(c)} 周期" style="width:${(c / worst * 100).toFixed(3)}%;background:var(${v})">${c / worst > .12 ? n + ' ' + fmt(c) : ''}</div>`).join('');
    $('#beat-info').innerHTML = `最坏 <b>${fmt(worst)}</b> = 复位等 ${fmt(init)} + 二分类路径 ${fmt(s1)} + 4 分类头 ${fmt(s2)} + 顶层 ${fmt(ex)}。最好 <b>${fmt(T.top.best)}</b>（提前退出，不跑 4 分类头），比最坏少 ${fmt(worst - T.top.best)} 周期，即 <b>${((worst - T.top.best) / worst * 100).toFixed(1)}%</b>。其中 4 分类循环占 ${fmt(s2)}，余下 ${fmt(worst - T.top.best - s2)} 周期我推测是第二个头的 LIF 膜电位复位循环（报告里有 130 和 6 周期的两个复位循环），但没有逐项核对。 ${tag('报告', 'rpt')} ${tag('推导', 'der')}<br>报告给的“平均 ${fmt(T.top.avg)} 周期”正好是最好与最坏的中点，相当于正常心拍占 50%，不是按真实比例算的。`;
    const p = $('#i-p'), f = $('#i-f');
    const upd = () => { const pv = +p.value / 100, fv = +f.value; const cyc = T.top.best * pv + T.top.worst * (1 - pv); $('#o-p').textContent = p.value + '%'; $('#o-f').textContent = fv + ' MHz'; $('#calc-out').innerHTML = `平均 <span class="calc-out">${fmt(Math.round(cyc))}</span> 周期 = <span class="calc-out">${(cyc / fv / 1000).toFixed(3)} ms</span>　（对比：全部正常 ${(T.top.best / fv / 1000).toFixed(3)} ms，全部异常 ${(T.top.worst / fv / 1000).toFixed(3)} ms）`; };
    p.addEventListener('input', upd); f.addEventListener('input', upd); upd();
  })();

  /* ---------------- micro schedule (own pipeline chart: II = 1) ---------------- */
  function sumOps(states, a, b, ops) { let n = 0; states.forEach(s => { if (s.state >= a && s.state <= b) ops.forEach(o => n += (s.ops[o] || 0)); }); return n; }
  function pipeChart(cfg) {
    const cv = $('#' + cfg.canvas), S = { cyc: 0, timer: 0 }, D = cfg.depth, N = cfg.iters, c1 = D + N - 1;
    function draw() {
      const { c, w, h } = HW.setupCanvas(cv), P = HW.pal(); const lx = 250, rx = w - 14, top = 52, bot = 26, rowH = (h - top - bot) / cfg.groups.length; const X = cy => lx + cy / c1 * (rx - lx);
      for (let cy = 0; cy <= c1; cy++) { HW.line(c, X(cy), top - 6, X(cy), h - bot, P.grid, 1); if (cy % 2 === 0 || c1 < 24) HW.txt(c, String(cy), X(cy) + (X(1) - X(0)) / 2, top - 12, P.muted, 10, 'center'); }
      const act = [];
      cfg.groups.forEach((g, i) => { const y = top + i * rowH; if (i % 2 === 0) { c.fillStyle = HW.alpha(P.ink, .03); c.fillRect(lx, y, rx - lx, rowH); }
        HW.txt(c, g.name, lx - 8, y + rowH * .66, P.ink2, 11.5, 'right', P.body);
        for (let k = 0; k < N; k++) { const x0 = X(g.a - 1 + k), x1 = X(g.b + k), on = S.cyc >= g.a - 1 + k && S.cyc < g.b + k; if (on) act.push({ k, g });
          c.fillStyle = HW.alpha(P[g.color], on ? .95 : .28 + .2 * (k === 0)); c.fillRect(x0, y + 2, Math.max(2, x1 - x0 - 1), rowH - 4);
          if (g.dashed) { c.strokeStyle = HW.alpha(P.ink, .5); c.setLineDash([3, 2]); c.lineWidth = 1; c.strokeRect(x0, y + 2, Math.max(2, x1 - x0 - 1), rowH - 4); c.setLineDash([]); }
          if (x1 - x0 > 18) HW.txt(c, k === 0 ? 'i' : 'i+' + k, (x0 + x1) / 2 - 1, y + rowH * .66, on ? '#fff' : P.ink, 10, 'center', P.body); } });
      for (let k = 0; k < N; k++) { const x = X(k) + (X(1) - X(0)) / 2; c.fillStyle = P.ink2; c.beginPath(); c.moveTo(x, top - 4); c.lineTo(x - 4, top - 10); c.lineTo(x + 4, top - 10); c.closePath(); }
      HW.txt(c, '▼ 每拍启动一个新迭代：i、i+1、i+2 …', lx, 14, P.ink2, 11.5, 'left', P.body);
      const cx = X(S.cyc + .5); HW.line(c, cx, top - 6, cx, h - bot, P.bad, 2); HW.txt(c, '周期 ' + S.cyc, cx + 4, h - 8, P.bad, 11);
      cfg.onInfo(S.cyc, act);
    }
    const api = { draw, S, set(cy) { S.cyc = Math.max(0, Math.min(c1, cy)); draw(); }, play() { api.stop(); S.timer = setInterval(() => { S.cyc = (S.cyc + 1) % (c1 + 1); draw(); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 1000 : 170); }, stop() { clearInterval(S.timer); S.timer = 0; } };
    cv.addEventListener('click', e => { const r = cv.getBoundingClientRect(), lxp = 250 / (cv.width / (window.devicePixelRatio || 1)) * r.width; const f = (e.clientX - r.left - lxp) / (r.width - lxp - 14); api.set(Math.floor(Math.max(0, Math.min(1, f)) * c1)); });
    HW.onRedraw(draw); draw(); return api;
  }
  function microPage(id, states, groups, depth, iiNote) {
    const cfg = pipeChart({ canvas: id + '-cv', groups, depth, iters: 4, onInfo: (cy, act) => { $('#' + id + '-info').innerHTML = `周期 ${cy}：` + (act.length ? act.map(a => `迭代 ${a.k === 0 ? 'i' : 'i+' + a.k} 在「${a.g.name}」`).join('；') : '—') + (act.length ? `　同一周期内同时有 ${new Set(act.map(a => a.k)).size} 个迭代在执行。` : '　流水线已排空，没有迭代在执行。'); } });
    let on = false; const btn = $('#' + id + '-play');
    btn.onclick = () => { on = !on; btn.textContent = on ? '■ 停止' : '▶ 播放'; on ? cfg.play() : cfg.stop(); };
    $('#' + id + '-step').onclick = () => { on = false; cfg.stop(); btn.textContent = '▶ 播放'; cfg.set(cfg.S.cyc + 1); };
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => { on = false; cfg.stop(); btn.textContent = '▶ 播放'; });
    const cv = $('#' + id + '-cv'); cv.tabIndex = 0; cv.setAttribute('aria-label', '微观流水线周期图；左右方向键单周期，Home到开头，End到末尾，空格播放或暂停。');
    cv.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', ' ', 'Escape'].includes(e.key)) return;
      e.preventDefault();
      if (e.key === ' ') { btn.click(); return; }
      on = false; cfg.stop(); btn.textContent = '▶ 播放';
      cfg.set(e.key === 'Home' ? 0 : e.key === 'End' ? 999 : cfg.S.cyc + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0));
    });
    HW.Table(id + '-table', ['组（级范围）', '本组里出现的操作（报告，按级统计）', '说明'], groups.map(g => [`<b>${g.name}</b>　S${g.a}${g.b > g.a ? '–S' + g.b : ''}`, g.count ? `${g.countName}：<b>${sumOps(states, g.count[0], g.count[1], g.ops)}</b>（S${g.count[0]}–S${g.count[1]}）` : '—', g.note || '']));
    $$('#' + id + '-table td').forEach((td, i) => { td.style.textAlign = 'left'; td.style.whiteSpace = 'normal'; }); $$('#' + id + '-table th').forEach(th => th.style.textAlign = 'left');
  }
  const C2 = K.micro_conv2, F1 = K.micro_fc1;
  microPage('g1', C2, [
    { name: '循环计数与判断', a: 1, b: 2, color: 'thr', count: [1, 2], ops: ['icmp', 'add', 'select', 'store'], countName: 'icmp/add/select/store', note: '展平后的 (oc, t) 计数器' },
    { name: 't mod 3（取模）', a: 2, b: 12, color: 'tree', count: [2, 12], ops: ['urem'], countName: 'urem', note: '11 周期的取模，决定读哪一个分块' },
    { name: 't / 3 地址（乘 171）', a: 3, b: 12, color: 'tree', dashed: true, count: [3, 12], ops: ['mul'], countName: 'mul', note: '乘 171 再取高位相当于除以 3；散布在 S3、S9–S12' },
    { name: '读 input_buffer', a: 12, b: 13, color: 'sig', count: [12, 12], ops: ['load'], countName: 'load', note: '2 周期读；48 个抽头 × 3 个分块同时发出' },
    { name: '分块选择（sparsemux）', a: 13, b: 14, color: 'en', count: [13, 14], ops: ['sparsemux'], countName: 'sparsemux', note: '按 t mod 3 选出各抽头的值（后面几级还有少量）' },
    { name: '乘法', a: 13, b: 16, color: 'en', count: [13, 22], ops: ['mul'], countName: 'mul', note: '主体在 S13–S16；含权重乘与位宽拆分，本模块 DSP 共 31 个' },
    { name: '加法树', a: 15, b: 22, color: 'mwi', count: [15, 22], ops: ['add'], countName: 'add', note: '把 48 个乘积加成一个 INT32' },
    { name: '重量化：乘', a: 23, b: 24, color: 'gold', count: [23, 24], ops: ['mul'], countName: 'mul', note: '乘该通道的 scale_multiplier' },
    { name: '重量化：舍入与右移', a: 25, b: 26, color: 'gold', count: [25, 26], ops: ['shl', 'add', 'ashr', 'icmp'], countName: 'shl/add/ashr/icmp', note: '加 2^(shift−1)，再算术右移，同时做越界比较' },
    { name: '饱和并写出', a: 27, b: 27, color: 'bad', count: [27, 27], ops: ['select', 'or'], countName: 'select/or', note: '限制到 −128…127，写入输出 FIFO' },
  ], C2.length);
  microPage('g2', F1, [
    { name: '取 x = in_vec[i]', a: 1, b: 1, color: 'sig', count: [1, 1], ops: ['sparsemux'], countName: 'sparsemux', note: '484 选 1；in_vec 是寄存器阵列' },
    { name: '乘：128 路 MAC', a: 2, b: 4, color: 'en', count: [2, 4], ops: ['mul'], countName: 'mul', note: '128 路 × 3 级流水；RTL 里是 128 个 mac_muladd' },
    { name: '读 acc 并相加', a: 4, b: 4, color: 'mwi', count: [4, 4], ops: ['load', 'add'], countName: 'load/add', note: '每路读出上一次的累加值' },
      { name: '加并写回 acc', a: 5, b: 5, color: 'gold', count: [5, 5], ops: ['add', 'store'], countName: 'add/store', note: '源码累加器为 INT32；此模块 HLS 根据范围收窄为 24 位，写回寄存器' },
  ], F1.length);

  /* ---------------- structure ---------------- */
  (function () {
    const fam = K.rtl_arith_family; $('#mac-n').textContent = fam.mac_muladd; $('#mul-n').textContent = fam.mul;
    const rows = K.layers.map(l => ({ name: l.name, LUT: l.LUT, FF: l.FF, BRAM_18K: l.BRAM, DSP: l.DSP }));
    const u = K.unattributed; rows.push({ name: '其余：FIFO、膜电位、缓存、复位与控制', LUT: u.LUT, FF: u.FF, BRAM_18K: u.BRAM, DSP: u.DSP });
    HW.ResourceBars({ container: 'res-host', rows, metric: 'DSP', top: 24 });
    $('#res-note').innerHTML = `HLS 分配：层内专用 DSP 合计 220，三个主干 LIF 复位地址各占 1（合计 3），BN1/2/3 共享重量化乘法器占 2，Conv2/3 共享重量化乘法器占 2，总计 227。共享资源在父模块中只计一次。“其余”行还包含层间 FIFO、膜电位、缓存与控制。布线后 DSP 总数为 220，各模块映射有所变化，见上方硬件资源对照。 ${tag('报告', 'rpt')} ${tag('src')}`;
    HW.Table('bram-host', ['用途', '18Kb 块', '来源'], K.bram_map.map(b => [b.name, b.bram, b.src]).concat([['<b>合计</b>', `<b>${K.bram_map.reduce((a, b) => a + b.bram, 0)}</b>`, '']]));
    $$('#bram-host td').forEach((td, i) => { if (i % 3 !== 1) { td.style.textAlign = 'left'; td.style.whiteSpace = 'normal'; } });
    HW.Table('par-host', ['结构', '并行度', '来源'], [
      ['卷积抽头', '每个输出点同拍算 IC × 3 个乘积（卷积2、3 各 48 个；卷积1 为 3 个）', '源码 UNROLL'],
      ['卷积输出', '一个输出点一拍（II=1），按通道和位置依次产出', '报告'],
      ['FC 484→128', '128 路 MAC 同拍累加，128 个权重 ROM 同拍取数', '报告 / RTL'],
      ['FC 128→4、484→2', '4 路、2 路 MAC', '报告'],
      ['层与层之间', '不重叠，一层算完才开始下一层', '报告'],
      ['时间步之间', '10 步串行，膜电位在步间保留', '源码 / 报告'],
    ]);
    $$('#par-host td').forEach(td => { td.style.textAlign = 'left'; td.style.whiteSpace = 'normal'; }); $$('#par-host th').forEach(th => th.style.textAlign = 'left');
    const nice = n => { let m; if (/qcsnet2_lblk1/.test(n)) return 'FC 484→2 权重（ROM）'; if (/qcsnet4_lblk1/.test(n)) return 'FC 484→128 权重（ROM）'; if (/qcsnet4_lblk2/.test(n)) return 'FC 128→4 权重（ROM）';
      if ((m = n.match(/qcsnn24_(\w+?)_V([01])$/))) return m[1].replace('trunk_lif', '主干 LIF').replace('multi_lif', '4 分类头 LIF').replace('bin_lif', '二分类头 LIF') + ' 膜电位 V' + m[2];
      return { input_buffer: '卷积输入缓冲', body_cache: '特征缓存 body_cache', sig_buf: '输入信号缓冲 sig_buf', buf: '顶层输入缓冲', buf_r: '顶层输入缓冲' }[n] || n; };
    HW.Table('mem-host', ['模块', '数组', '块数', '每块（字 × 位）', 'BRAM', 'FF', 'LUT'], K.memories.map(g => [g.module, nice(g.name), g.banks, `${g.words} × ${g.bits}`, g.bram, g.ff, g.lut]));
    $$('#mem-host td').forEach((td, i) => { if (i % 7 === 1) { td.style.textAlign = 'left'; td.style.whiteSpace = 'normal'; } }); $$('#mem-host th').forEach((th, i) => { if (i === 1) th.style.textAlign = 'left'; });
  })();

  /* ---------------- II and latency ---------------- */
  $('#pl-n').textContent = K.log.pipelines; $('#viol-n').textContent = K.log.violations;
  HW.Table('lat-host', ['模块', '迭代数', '报告延迟', '延迟 − 迭代数'], K.lat_table.map(r => [r.label, fmt(r.trip), fmt(r.lat), '+' + (r.lat - r.trip)]));

  /* ---------------- numbers ---------------- */
  (function () {
    const a = T.top.est, av = T.top.avail, im = T.impl, pa = T.paper, pc = (x, y) => (x / y * 100).toFixed(1) + '%';
    HW.Table('cmp-host', ['项目', 'HLS 综合预估', 'Vivado 实现（本机，IP 单独）', '论文 Table 15 / 16'], [
      ['LUT', `${fmt(a.LUT)}（${pc(a.LUT, av.LUT)}）`, `<b>${fmt(im.LUT)}</b>（${pc(im.LUT, av.LUT)}）`, `${fmt(pa.LUT)}（36.8%）`],
      ['FF', `${fmt(a.FF)}（${pc(a.FF, av.FF)}）`, `<b>${fmt(im.FF)}</b>（${pc(im.FF, av.FF)}）`, `${fmt(pa.FF)}（22.2%）`],
      ['DSP', `${a.DSP}（${pc(a.DSP, av.DSP)}，超出）`, `<b>${im.DSP}</b>（100%）`, `${pa.DSP}（100%）`],
      ['BRAM_18K', `${a.BRAM}（${pc(a.BRAM, av.BRAM)}）`, `<b>${im.BRAM}</b>（${pc(im.BRAM, av.BRAM)}）`, `${pa.BRAM}（67.1%）`],
      ['时钟周期', `预估 ${T.top.est_clk_ns} ns（目标 10 ns，不确定度 2.7 ns）`, `综合后 ${im.post_synth_ns} ns；布线后 <b>${im.post_route_ns} ns</b>，满足 10 ns`, `${pa.clock_MHz} MHz`],
      ['延迟', `${fmt(T.top.best)} 到 ${fmt(T.top.worst)} 周期`, '同左（IP 的延迟不随实现变化）', `实测每搏 ${pa.e2e_ms} ms（含 DMA 与 Python）`],
      ['功耗', '—', `IP 单独 ${im.power_total} W（动态 ${im.power_dyn}，静态 ${im.power_static}；无激励估算）`, `加速器 ${pa.accel_w} W，整板 ${pa.board_w} W（实测）`],
    ]);
    $$('#cmp-host td').forEach((td, i) => { if (i % 4) td.style.textAlign = 'left'; td.style.whiteSpace = 'normal'; }); $$('#cmp-host th').forEach((th, i) => { if (i) th.style.textAlign = 'left'; });
    $('#cmp-notes').innerHTML = [
      ['DSP、BRAM', `实现后与论文逐位一致（${im.DSP}、${im.BRAM}）。${tag('报告', 'rpt')} ${tag('论文', 'pap')}`],
      ['FF、LUT', `FF 相差 ${Math.abs(im.FF - pa.FF)}（${(Math.abs(im.FF - pa.FF) / pa.FF * 100).toFixed(1)}%）；LUT 比论文少 ${fmt(pa.LUT - im.LUT)}（${((pa.LUT - im.LUT) / pa.LUT * 100).toFixed(0)}%）。我推测论文统计的是整个系统，含 DMA 等；没有验证。${tag('推导', 'der')}`],
      ['预估偏保守', `HLS 预估 LUT ${fmt(a.LUT)}（超过 100%），实现后只有 ${fmt(im.LUT)}。预估只看算子个数，实现时会做逻辑优化。${tag('报告', 'rpt')}`],
      ['延迟差距', `IP 自己 ${ms(T.top.best)}–${ms(T.top.worst)} ms，论文实测 ${pa.e2e_ms} ms，差约 ${(pa.e2e_ms - T.top.worst / 1e5).toFixed(1)}–${(pa.e2e_ms - T.top.best / 1e5).toFixed(1)} ms，应是 DMA 搬运和 Python 驱动的开销，这是我用减法推的，没有实测。${tag('推导', 'der')}`],
      ['提前退出的收益', `论文说硬件提前退出降低平均延迟和能耗。本机报告里周期只少 ${((T.top.worst - T.top.best) / T.top.worst * 100).toFixed(1)}%；计算量（乘加次数）少约三分之一是另一回事，两者不要混。${tag('报告', 'rpt')} ${tag('论文', 'pap')}`],
    ].map(([t, d]) => `<li><span class="tag">${t}</span><span>${d}</span></li>`).join('');
  })();
})();
