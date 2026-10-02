/* Convolution sections: block diagram, banking animation, weights-as-logic, 27-stage schedule, waveform, worked arithmetic, three-layer comparison. */
(function () {
  const { $, $$, esc, fmt, num, KIND, tokenFill, tokenLine, tip, Player, T, arrowPath, Wave, table, guard } = MC;
  const C = Object.fromEntries(MD.conv.map(c => [c.label, c])), C2 = C.conv2, EXC = MD.ex.conv;
  const tag = (t, c) => `<span class="src${c ? ' ' + c : ''}">${t}</span>`;
  const ref = (c, lab) => { const r = c.refs.find(q => q.label.startsWith(lab)); return r ? `<code>${c.compFile.split('/').pop().replace('topFunction_', '').replace(/_Pipeline.*/, '')}…:${r.line}</code>` : ''; };

  /* ---------------------------------------------------------------- block diagram */
  const COLW = 124, X0 = 150, X = c => X0 + c * COLW, W = X(9) + 6, H = 574;
  const NA = [
    { id: 'cnt', k: 'reg', c: 0, y: 58, h: 84, t: '循环计数器', sub: ['indvar 11b', 'w 7b · oc 4b'], tip: `<b>循环计数器</b><br>外层 oc 0…15，内层 w 0…86，flatten 计数到 ${C2.trip}，每拍加 1。` },
    { id: 'urem', k: 'lut', c: 1, y: 58, h: 40, t: 'w mod 3', sub: ['11 级 LUT 除法器'], tip: `<b>w mod 3</b><br><code>urem_7ns_3ns_2_11_1</code>：11 级流水的求余，HLS 估计 ${C2.instanceTable.urem_7ns_3ns_2_11_1 ? C2.instanceTable.urem_7ns_3ns_2_11_1.lut : 102} 个 LUT、0 个 DSP。这就是前 12 级几乎都在等它的原因，它只增加深度、不影响吞吐。${ref(C2, 'w mod 3')}` },
    { id: 'addr', k: 'lut', c: 1, y: 102, h: 42, t: '⌊p/3⌋ × 3 候选', sub: ['p×171 >> 9'], tip: `<b>bank 内地址 = ⌊p/3⌋</b><br>不用除法器：p×171 &gt;&gt; 9（171/512≈1/3，对 0…255 精确）。w、w+1、w+2 各一个候选：2 个 7×9 位 LUT 乘法器 + 1 个 DSP 乘加（<code>am_addmul_7ns_2ns_8ns_15_4_1</code>）。${ref(C2, '⌊w/3⌋')}` },
    { id: 'banks', k: 'bram', c: 2, y: 166, h: 80, t: '48 个 bank', sub: ['16 通道 × 3', '每个 30 × 8 位', '单口 · 读 1 拍'], tip: `<b>输入缓冲：48 个独立 RAM</b><br>通道 × (位置 mod 3)，每个 30 个字 × 8 位，单口（读优先）。HLS 报告 BRAM18K = 0（分布式 RAM / 寄存器实现），合计约 192 LUT + 384 FF。${ref(C2, 'bank 地址')}` },
    { id: 'mux3', k: 'lut', c: 3, y: 166, h: 80, t: '48 × 3 选 1', sub: ['旋转选择', 'sel = w mod 3', '→ 48 个抽头值'], tip: `<b>抽头旋转</b><br><code>sparsemux_7_2_8_1_1</code> × 48（每个通道每个抽头一个）：哪个 bank 对应第几个抽头随 w mod 3 旋转。LUT 估计合计 ${C2.lutBreakdown.dataMux}。` },
    { id: 'wmux', k: 'lut', c: 3, y: 262, h: 64, t: '48 × 16 选 1', sub: ['权重常量表', 'sel = oc (4b)'], tip: `<b>权重常量表</b><br><code>sparsemux_33_4_7/8</code> × 48，输入是 RTL 里的立即数，选择信号是 oc。与参数文件逐列相同。HLS 估计合计 ${fmt(C2.lutBreakdown.weightMux)} LUT（每表 65），Vivado 会把 4 输入函数化简成每位 1 个 LUT6。` },
    { id: 'mul', k: 'dsp', c: 4, y: 346, h: 84, t: '48 个乘法', sub: [`${C2.instances.macDsp} 个 DSP48 乘加`, `${C2.instances.lutMul8} 个 LUT 乘法器`, '8s×8s 或 8s×7s'], tip: `<b>乘法阵列</b><br><code>mac_muladd_8s_8s_16s_16_4_1</code> 等 ${C2.instances.macDsp} 个（DSP48 乘加：18 个的加数端接 LUT 乘法器乘积，12 个接另一个 DSP 的输出），<code>mul_8s_8s_16_1_1</code> / <code>mul_8s_7s_15_1_1</code> 共 ${C2.instances.lutMul8} 个用 LUT 实现，每个约 41 个 LUT。DSP 合计 ${C2.hls.DSP}（含 1 个地址 am_addmul）。` },
    { id: 'tree', k: 'lut', c: 5, y: 346, h: 84, t: '加法树', sub: ['DSP 后加器链', '+ LUT 加法器', '16 → 20 位 = acc'], tip: '<b>加法树</b><br>48 个乘积经 DSP48 后加器串接和 LUT 加法器逐级相加，位宽 16 → 17 → 18 → 19 → 20 位，第 21 级得到 20 位累加值 acc。' },
    { id: 'mt', k: 'lut', c: 6, y: 450, h: 56, t: '乘数表', sub: ['30 位，最高位隐含 1', '（全通道相同）'], tip: `<b>乘数表</b><br><code>sparsemux_33_4_30_1_1</code>：16 个入口全是 ${fmt(C2.multTable.rtlLow)}；乘法器的 31 位操作数 = 2<sup>30</sup> + 它 = ${fmt(C2.multTable.exported)}（HLS 把恒为 1 的最高位折掉了）。16 个入口完全相同，Vivado 会把整张表化简成常量。` },
    { id: 'mulS', k: 'dsp', c: 6, y: 346, h: 84, t: '共享乘法器', sub: ['31 × 20 → 51 位', '在顶层，2 个 DSP', '卷积 2、3 共用'], tip: '<b>共享乘法器</b><br>端口 <code>grp_fu_394_p_din0/din1/dout0/ce</code> 通向顶层的 <code>mul_31ns_20s_51_2_1</code>（2 级），卷积 2 与卷积 3 分时共用。卷积 1 则自带一个 <code>mul_31ns_17s_48_2_1</code>（2 个 DSP）。' },
    { id: 'shiftT', k: 'lut', c: 7, y: 450, h: 56, t: '移位表', sub: ['6 位', '（全通道相同）'], tip: `<b>移位表</b><br><code>sparsemux_33_4_6_1_1</code>：16 个入口全是 ${C2.shiftExported}。` },
    { id: 'round', k: 'lut', c: 7, y: 346, h: 84, t: '偏置并加', sub: ['1 << (shift−1)', '39 位', '+ 乘积 → 51 位'], tip: `<b>加半</b><br><code>rounding_offset = 39'd1 &lt;&lt; (shift−1)</code>，shift 来自移位表，<b>是可变移位</b>；再与乘积相加。${ref(C2, '取整偏置')}` },
    { id: 'ashr', k: 'lut', c: 8, y: 346, h: 84, t: '算术右移', sub: ['可变移位（桶形）', '51 位 → value'], tip: `<b>算术右移</b><br><code>value = rounded_value &gt;&gt;&gt; shift</code>，移位量不是常量。${ref(C2, '算术右移')}` },
    { id: 'sat', k: 'lut', c: 8, y: 450, h: 56, t: '饱和', sub: ['两次比较', '→ INT8'], tip: `<b>饱和</b><br>高位 &gt; 0 → 127；低 12 位 &lt; −128 → −128；否则取低 8 位。RTL 里没有 32 位回绕逻辑。${ref(C2, '饱和：上溢')} ${ref(C2, '饱和：下溢')}` },
    { id: 'fifo', k: 'fifo', c: 8, y: 512, h: 44, t: '输出 FIFO s5', sub: ['8 位，iter26 写'], tip: '<b>输出 FIFO</b><br><code>s5_write</code> 在第 26 级拉高。输出 FIFO 满时整条流水线冻结。' },
  ].map(n => Object.assign(n, { x: X(n.c) + 4, w: COLW - 8 }));
  const nd = Object.fromEntries(NA.map(n => [n.id, n]));
  const R = n => [n.x + n.w, n.y + n.h / 2], Lf = n => [n.x, n.y + n.h / 2], Tp = (n, f) => [n.x + n.w * (f == null ? .5 : f), n.y], Bt = (n, f) => [n.x + n.w * (f == null ? .5 : f), n.y + n.h];
  const EA = [
    { p: () => [[nd.cnt.x + nd.cnt.w, 78], [nd.urem.x, 78]], l: 'w', lp: [X(1) - 16, 72] },
    { p: () => [[nd.cnt.x + nd.cnt.w, 124], [nd.addr.x, 124]], l: 'w', lp: [X(1) - 16, 118] },
    { p: () => [R(nd.urem), [X(3) + 62, 78], Tp(nd.mux3, .5)], l: 'r = w mod 3', lp: [X(2) + 8, 72] },
    { p: () => [R(nd.addr), [X(2) + 62, 124], Tp(nd.banks, .5)], l: '3 个候选地址，按 r 选', lp: [X(2) + 66, 140] },
    { p: () => [R(nd.banks), Lf(nd.mux3)], l: '48×8b', lp: [X(3) - 34, 202] },
    { p: () => [Bt(nd.cnt, .5), [Bt(nd.cnt, .5)[0], 294], Lf(nd.wmux)], l: 'oc', lp: [X(1) + 30, 288] },
    { p: () => [R(nd.mux3), [X(4) + 36, nd.mux3.y + nd.mux3.h / 2], Tp(nd.mul, .3)], l: '48 个抽头值', lp: [X(4) + 44, 262] },
    { p: () => [R(nd.wmux), [X(4) + 86, nd.wmux.y + nd.wmux.h / 2], Tp(nd.mul, .7)], l: '48 个权重', lp: [X(4) + 94, 310] },
    { p: () => [R(nd.mul), Lf(nd.tree)], l: '48×16b', lp: [X(5) - 40, 382] },
    { p: () => [R(nd.tree), Lf(nd.mulS)], l: 'acc 20b', lp: [X(6) - 42, 382] },
    { p: () => [Tp(nd.mt), Bt(nd.mulS)], l: '31b', lp: [X(6) + 66, 440] },
    { p: () => [R(nd.mulS), Lf(nd.round)], l: 'prod 51b', lp: [X(7) - 50, 382] },
    { p: () => [Tp(nd.shiftT), Bt(nd.round)], l: 'shift', lp: [X(7) + 66, 440] },
    { p: () => [R(nd.round), Lf(nd.ashr)], l: '51b', lp: [X(8) - 26, 382] },
    { p: () => [R(nd.shiftT), [X(8) + 30, nd.shiftT.y + nd.shiftT.h / 2], Bt(nd.ashr, .25)], l: 'shift', lp: [X(8) + 36, 440], dash: true },
    { p: () => [Bt(nd.ashr, .75), Tp(nd.sat, .75)], l: 'value', lp: [X(8) + 94, 440] },
    { p: () => [Bt(nd.sat), Tp(nd.fifo)], l: 'INT8', lp: [X(8) + 66, 508] },
  ];
  const lanes = [['地址与计数', 50, 100], ['输入数据', 158, 96], ['权重（常量表）', 258, 74], ['乘加与重量化', 338, 100], ['乘数 · 移位表', 442, 70], ['输出', 506, 56]];
  const cols = [['计数', '0–1'], ['求余 · 地址', '1–11'], ['读 bank', '11–12'], ['选抽头 · 权重', '12–13'], ['乘', '13–15'], ['加法树', '14–21'], ['乘数 × 共享乘', '21–23'], ['偏置 · 移位表', '23–25'], ['右移 · 饱和 · 写', '25–26']];
  let cvSel = null;
  function cvFigure() {
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="卷积 2 计算模块框图">`;
    lanes.forEach(([n, y, h], i) => { s += `<rect x="0" y="${y}" width="${W}" height="${h}" fill="${i % 2 ? 'transparent' : 'var(--surface2)'}"/>` + T(8, y + 17, n, { size: 11.5, fill: 'var(--ink2)', weight: 600 }); });
    cols.forEach(([n, st], c) => { s += `<rect x="${X(c)}" y="2" width="${COLW}" height="${H - 4}" fill="transparent" stroke="var(--grid)"/>` + T(X(c) + COLW / 2, 17, n, { size: 11.5, anchor: 'middle', weight: 600 }) + T(X(c) + COLW / 2, 32, `第 ${st} 级`, { size: 10, anchor: 'middle', fill: 'var(--muted)' }); });
    EA.forEach(e => { const pts = e.p(); s += arrowPath(pts, { dash: e.dash ? '4 3' : null }); if (e.l) s += T(e.lp[0], e.lp[1], e.l, { size: 10, fill: 'var(--ink2)', mono: true }); });
    NA.forEach(n => { s += `<g class="mc-node" data-id="${n.id}" tabindex="0" role="button" aria-label="${esc(n.t)}"><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="7" fill="${tokenFill(n.k)}" stroke="${cvSel === n.id ? 'var(--en)' : tokenLine(n.k)}" stroke-width="${cvSel === n.id ? 3 : 1.4}"/>` + T(n.x + 7, n.y + 16, n.t, { size: 11.5, weight: 600 }) + n.sub.map((q, i) => T(n.x + 7, n.y + 31 + i * 12.5, q, { size: 10, fill: 'var(--ink2)' })).join('') + '</g>'; });
    return s + '</svg>';
  }
  guard('cvFig', () => {
    $('#cv-legend').innerHTML = ['dsp', 'bram', 'lut', 'fifo', 'reg'].map(k => `<span><i style="border-color:${tokenLine(k)};background:${tokenFill(k)}"></i>${KIND[k].n}</span>`).join('');
    const draw = () => { $('#cv-fig').innerHTML = cvFigure(); };
    draw();
    const info = n => { $('#cv-info').innerHTML = n ? n.tip : ''; };
    info(null);
    $('#cv-info').innerHTML = `点任一方块看细节。合计：HLS 估计 DSP ${C2.hls.DSP}、LUT ${fmt(C2.hls.LUT)}、FF ${fmt(C2.hls.FF)}、BRAM ${C2.hls.BRAM}；布线后层级汇总 DSP ${C2.routed ? C2.routed.DSP : '—'}、LUT ${C2.routed ? fmt(C2.routed.LUT) : '—'}。${tag('报告', 'rpt')}`;
    $('#cv-fig').addEventListener('pointermove', e => { const g = e.target.closest('.mc-node'); if (g) tip(nd[g.dataset.id].tip, e.clientX, e.clientY); else tip(null); });
    $('#cv-fig').addEventListener('pointerleave', () => tip(null));
    const pick = g => { cvSel = g.dataset.id; draw(); info(nd[cvSel]); };
    $('#cv-fig').addEventListener('click', e => { const g = e.target.closest('.mc-node'); if (g) pick(g); });
    $('#cv-fig').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const g = e.target.closest('.mc-node'); if (g) { e.preventDefault(); pick(g); document.querySelector(`#cv-fig [data-id="${cvSel}"]`).focus(); } } });
  });

  /* ---------------------------------------------------------------- banking animation */
  guard('bank', () => {
    const map = MD.checks.banks.forward_14.map, rev = {}; Object.entries(map).forEach(([n, v]) => { rev[v.ic * 3 + v.bank] = n; });
    $('#cb-ctrl').innerHTML = `<label class="ctrl" style="min-width:230px"><span>通道 ic</span><output id="cb-ic-o">0</output><input type="range" id="cb-ic" min="0" max="15" value="0" aria-label="通道"></label>`;
    $('#cb-ic').addEventListener('input', e => { $('#cb-ic-o').textContent = e.target.value; draw(+pl.get()); });
    const col = ['var(--sig)', 'var(--tree)', 'var(--en)'];
    function draw(w) {
      const ic = +$('#cb-ic').value, r = w % 3, rows = [0, 1, 2].map(b => ({ b, j: ((b - r) % 3 + 3) % 3 })), CW = 30, GX = 150, GY = 40;
      let s = `<svg viewBox="0 0 1130 330" width="1130" height="330" role="img" aria-label="w = ${w} 时三个抽头落在哪个 bank">`;
      s += T(8, 20, `通道 ${ic} 的输入缓冲（位置 p 存在 bank p mod 3、地址 ⌊p/3⌋）`, { size: 12, weight: 600 });
      rows.forEach(({ b, j }, i) => {
        const y = GY + i * 56, p = w + j, a = (p * 171) >> 9;
        s += T(8, y + 22, `bank ${b}`, { size: 12, weight: 600, fill: 'var(--ink)' }) + T(8, y + 38, rev[ic * 3 + b] || '', { size: 10, fill: 'var(--muted)', mono: true });
        for (let k = 0; k < 30; k++) { const hit = k === a; s += `<rect x="${GX + k * CW}" y="${y}" width="${CW - 2}" height="38" rx="3" fill="${hit ? `color-mix(in srgb, ${col[j]} 30%, var(--surface))` : 'var(--surface2)'}" stroke="${hit ? col[j] : 'var(--line)'}" stroke-width="${hit ? 2.4 : 1}"/>` + T(GX + k * CW + CW / 2 - 1, y + 15, String(3 * k + b), { size: 10, anchor: 'middle', fill: hit ? 'var(--ink)' : 'var(--muted)', mono: true }) + T(GX + k * CW + CW / 2 - 1, y + 31, String(k), { size: 9, anchor: 'middle', fill: 'var(--muted)', mono: true }); }
        s += T(GX + 30 * CW + 6, y + 18, `← 抽头 ${j}`, { size: 11, fill: col[j], weight: 600 }) + T(GX + 30 * CW + 6, y + 33, `p=${p} 地址 ${a}`, { size: 10, fill: 'var(--ink2)', mono: true });
      });
      s += T(GX, GY + 3 * 56 + 6, '格内上行 = 位置 p，下行 = bank 内地址', { size: 10, fill: 'var(--muted)' });
      s += T(8, 244, `w = ${w}：r = w mod 3 = ${r}；三个候选地址 q0=⌊w/3⌋=${(w * 171) >> 9}，q1=⌊(w+1)/3⌋=${((w + 1) * 171) >> 9}，q2=⌊(w+2)/3⌋=${((w + 2) * 171) >> 9}（均为 ×171 >> 9）`, { size: 12, fill: 'var(--ink)', mono: true });
      s += T(8, 266, `bank b 服务抽头 j = (b − r) mod 3：` + rows.map(x => `bank${x.b}→抽头${x.j}(q${x.j})`).join('，'), { size: 12, fill: 'var(--ink2)', mono: true });
      s += T(8, 288, `其余 15 个通道在同一拍读各自对应的 bank：共 16 × 3 = 48 次读，每个 RAM 一次。`, { size: 12, fill: 'var(--ink2)' });
      s += T(8, 310, '三个抽头值经 48 个 3 选 1 多路选择器（sel = r）送到乘法器，保证抽头 j 永远接第 j 个权重。', { size: 12, fill: 'var(--ink2)' });
      $('#cb-fig').innerHTML = s + '</svg>';
      $('#cb-info').innerHTML = `<b>w = ${w}</b>：窗口三个位置 ${w}、${w + 1}、${w + 2} 落在 bank ${rows.map(x => `${(w + x.j) % 3}`).join('、')}；按 RTL 的 <code>case (w mod 3)</code>，bank 0 的地址在 r=0 用 q0、r=1 用 q2、r=2 用 q1。<code>input_buffer_{3·ic+b+2}</code> 是第 (ic, b) 个 bank 的端口名（ic=0, b=0 记作 <code>input_buffer</code>），这个对应关系是我从仿真里装载模块实际写进各 RAM 的内容反推出来的，48 个 bank 全部唯一匹配。${tag('仿真', 'pap')}`;
    }
    const pl = Player($('#cb-player'), { n: 87, fps: 3, label: i => `w = ${i}（r = ${i % 3}）`, onFrame: draw });
  });

  /* ---------------------------------------------------------------- weights as logic */
  guard('weights', () => {
    $('#cm-ctrl').innerHTML = `<label class="ctrl" style="min-width:180px"><span>输入通道 ic</span><output id="cm-ic-o">0</output><input type="range" id="cm-ic" min="0" max="15" value="0" aria-label="ic"></label><label class="ctrl" style="min-width:150px"><span>抽头 k</span><output id="cm-k-o">0</output><input type="range" id="cm-k" min="0" max="2" value="0" aria-label="k"></label>`;
    const draw = () => {
      const ic = +$('#cm-ic').value, k = +$('#cm-k').value; $('#cm-ic-o').textContent = ic; $('#cm-k-o').textContent = k;
      const col = C2.weightCols.find(x => x.ic === ic && x.k === k), wd = col.width, M = 1 << wd;
      $('#cm-table').innerHTML = `<div class="mc-cells">${col.vals.map((v, o) => `<div><span>sel = ${o}</span><code>${wd}'d${(v + M) % M}</code><b>${v}</b></div>`).join('')}</div>`;
      $('#cm-table').insertAdjacentHTML('beforeend', `<p class="mc-note">这一列在 RTL 里是 <code>sparsemux_33_4_${wd}</code> 的 16 个入口，选择信号是 4 位 oc。位宽 ${wd}：${wd === 7 ? '该抽头的权重都在 [−64, 63] 内，HLS 把表和乘法器都收窄到 7 位（乘法器变成 8s×7s）' : '权重范围需要 8 位'}。48 张表里 7 位 ${C2.weightTableCheck.widthHist['7']} 张、8 位 ${C2.weightTableCheck.widthHist['8']} 张；与参数文件逐列核对：${C2.weightTableCheck.identical ? '<b style="color:var(--mwi)">48 / 48 相同</b>' : '不同'}。${tag('RTL')} ${tag('推导', 'der')}</p>`);
    };
    $('#cm-ic').addEventListener('input', draw); $('#cm-k').addEventListener('input', draw); draw();
    // LUT bars
    const b = C2.lutBreakdown, u = C2.utilization, rows = [['权重常量表 48 × 65', b.weightMux], ['抽头 3 选 1 × 48', b.dataMux], ['LUT 乘法器 × 18', b.lutMul], ['地址：求余 + ×171 乘法', b.addr], ['乘数表 + 移位表', b.tableMux], ['其余表达式（加法、比较）', u.Expression.LUT], ['多路选择', u.Multiplexer.LUT], ['寄存器相关', u.Register.LUT]];
    const tot = C2.hls.LUT, mx = Math.max(...rows.map(r => r[1]), tot);
    $('#cm-bars').innerHTML = rows.map(r => `<div class="mc-bar"><span>${r[0]}</span><div><div class="b" style="width:${r[1] / mx * 100}%;background:var(--sig)"></div></div><span class="v">${fmt(r[1])}</span></div>`).join('') + `<div class="mc-bar"><b>HLS 估计合计</b><div><div class="b" style="width:${tot / mx * 100}%;background:var(--muted)"></div></div><span class="v">${fmt(tot)}</span></div>` + (C2.routed ? `<div class="mc-bar"><b>布线后（层级汇总）</b><div><div class="b" style="width:${C2.routed.LUT / mx * 100}%;background:var(--mwi)"></div></div><span class="v">${fmt(C2.routed.LUT)}</span></div>` : '') +
      `<p class="mc-note">HLS 把每张 16 选 1 的常量表估成 65 个 LUT，但它只有 4 位选择信号：每个输出位是 4 个变量的函数，一个 LUT6 就够，所以 48 张 8 位表实际约 ${48 * 8} 个 LUT，而不是 ${fmt(b.weightMux)}。乘数表和移位表的 16 个入口完全相同，会被整体化简掉。布线后卷积 2 的层级汇总是 ${C2.routed ? fmt(C2.routed.LUT) : '—'} 个 LUT、${C2.routed ? C2.routed.DSP : '—'} 个 DSP（HLS 估 ${C2.hls.DSP} 个），比 HLS 估计多 ${C2.routed ? C2.routed.DSP - C2.hls.DSP : '—'} 个 DSP，这与“部分 LUT 乘法器被放进 DSP”相符，但报告不能逐实例核对，所以这里只是推测。${tag('报告', 'rpt')} ${tag('推导', 'der')}</p>`;
  });

  /* ---------------------------------------------------------------- stage chart */
  const CLS = [['求余 / 地址乘法', r => /^urem|^mul:logic\/15|^am/.test(r) || false, 'lut'], ['计数 · 比较 · 选择', r => /^(icmp|select|or|load:control|store:control|add:logic\/(5|7|11))/.test(r), 'reg'], ['RAM 读', r => /^load:memory/.test(r), 'bram'], ['常量表 / 抽头选择', r => /^sparsemux/.test(r), 'lut'], ['DSP 乘 / 加', r => /^(mul|add):DSP/.test(r), 'dsp'], ['LUT 乘 / 加', r => /^(mul|add):logic/.test(r), 'lut'], ['移位', r => /^(shl|ashr)/.test(r), 'lut'], ['FIFO 写', r => /^write:fifo/.test(r), 'fifo']];
  guard('stages', () => {
    const st = C2.stages, CW = 38, GX = 160, RH = 26, TOP = 52, Wd = GX + st.length * CW + 12, Hd = TOP + CLS.length * RH + 40;
    // classify using "opcode:binding" (width is dropped by extract)
    const cls = key => { if (/^urem/.test(key)) return 0; if (/^(mul|add):DSP/.test(key)) return 4; if (/^sparsemux/.test(key)) return 3; if (/^load:memory/.test(key)) return 2; if (/^write:fifo/.test(key)) return 7; if (/^(shl|ashr)/.test(key)) return 6; if (/^(mul|add):logic/.test(key)) return 5; if (/^(icmp|select|or|load:control|store:control)/.test(key)) return 1; return -1; };
    const grid = CLS.map(() => st.map(() => 0));
    st.forEach((s, j) => Object.entries(s.ops).forEach(([k, n]) => { const c = cls(k); if (c >= 0) grid[c][j] += n; }));
    const mx = Math.max(...grid.flat());
    let s = `<svg viewBox="0 0 ${Wd} ${Hd}" width="${Wd}" height="${Hd}" role="img" aria-label="卷积 2 的 27 级调度，按操作类别统计">`;
    const ph = [[0, 1, '计数'], [1, 11, '求余 · 地址'], [11, 12, '读 bank'], [12, 14, '选抽头 · 权重'], [14, 20, '乘加 · 加法树'], [21, 23, '乘数 × 共享乘'], [23, 25, '偏置 · 移位'], [25, 26, '饱和 · 写']];
    ph.forEach(([a, b, n], i) => { const x = GX + a * CW, w = (b - a + 1) * CW - 2; s += `<rect x="${x}" y="2" width="${w}" height="20" rx="4" fill="${i % 2 ? 'var(--surface2)' : 'color-mix(in srgb, var(--sig) 10%, var(--surface))'}" stroke="var(--line)"/>` + T(x + w / 2, 16, n, { size: 10.5, anchor: 'middle', weight: 600 }); });
    st.forEach((q, j) => { s += T(GX + j * CW + CW / 2 - 1, 40, String(j), { size: 10.5, anchor: 'middle', fill: 'var(--muted)', mono: true }); });
    s += T(GX - 8, 40, '阶段', { size: 10.5, anchor: 'end', fill: 'var(--muted)' });
    CLS.forEach(([n, , k], i) => { const y = TOP + i * RH; s += T(GX - 8, y + 17, n, { size: 11.5, anchor: 'end', fill: 'var(--ink2)' }); st.forEach((q, j) => { const v = grid[i][j]; if (!v) { s += `<rect x="${GX + j * CW}" y="${y}" width="${CW - 2}" height="${RH - 3}" rx="3" fill="transparent" stroke="var(--grid)"/>`; return; } const a = .18 + .72 * Math.sqrt(v / mx); s += `<g class="mc-cell" data-i="${i}" data-j="${j}"><rect x="${GX + j * CW}" y="${y}" width="${CW - 2}" height="${RH - 3}" rx="3" fill="color-mix(in srgb, var(${KIND[k].v}) ${Math.round(a * 100)}%, var(--surface))" stroke="var(${KIND[k].v})"/>` + T(GX + j * CW + CW / 2 - 1, y + 16, String(v), { size: 10.5, anchor: 'middle', weight: 600 }) + '</g>'; }); });
    s += T(GX, Hd - 16, '格内数字 = 该级该类操作个数（有些操作在报告里按“合并后的个数”计，如 RAM 读 144 = 48 个 bank × 3 个字段）；颜色深浅按平方根缩放。', { size: 10.5, fill: 'var(--muted)' });
    $('#cp-stages').innerHTML = s + '</svg>';
    $('#cp-stages').addEventListener('pointermove', e => { const g = e.target.closest('.mc-cell'); if (!g) { tip(null); return; } const i = +g.dataset.i, j = +g.dataset.j, ops = Object.entries(st[j].ops).filter(([k]) => cls(k) === i).map(([k, n]) => `${esc(k)} × ${n}`).join('<br>'); tip(`<b>第 ${j} 级 · ${esc(CLS[i][0])}</b><br>${ops}`, e.clientX, e.clientY); });
    $('#cp-stages').addEventListener('pointerleave', () => tip(null));
  });

  /* ---------------------------------------------------------------- waveform */
  guard('wave', () => {
    const tr = MD.traces.conv2; if (!tr || !tr.length) return;
    const bit = k => r => /x/i.test(r[k] || 'x') ? null : (r[k] === '1' ? 1 : 0), nx = k => r => (r[k] == null || /x/i.test(r[k])) ? null : Number(r[k]);
    const pop = r => r.iter ? r.iter.split('').filter(c => c === '1').length : null;
    const rows = [{ name: 'ap_start', kind: 'bit', get: bit('start') }, { name: '在途迭代数', kind: 'bus', get: pop, color: 'mwi' }, { name: 'bank0 ce0', kind: 'bit', get: bit('bank0_ce') }, { name: 'bank0 address0', kind: 'bus', get: nx('bank0_addr') }, { name: 'bank0 q0', kind: 'bus', get: nx('bank0_q') },
      { name: '共享乘 ce', kind: 'bit', get: bit('mul_ce'), color: 'en' }, { name: 'mul_a 乘数', kind: 'bus', get: nx('mul_a'), color: 'en' }, { name: 'mul_b = acc', kind: 'bus', get: nx('mul_b'), color: 'gold' }, { name: 'mul_p 乘积 51b', kind: 'bus', get: nx('mul_p'), color: 'en' }, { name: 's5_write', kind: 'bit', get: bit('out_wr'), color: 'tree' }, { name: 's5_din 输出 INT8', kind: 'bus', get: nx('out'), color: 'tree' }];
    const first = tr.find(r => r.out_wr === '1');
    Wave($('#cp-wave'), rows, tr, { cell: 22, label: '卷积 2 仿真波形', marks: first ? [{ cyc: first.cyc, label: '第一个输出', color: '#C8265E' }] : [], cursor: first ? tr.indexOf(first) : 0 });
  });

  /* ---------------------------------------------------------------- worked arithmetic */
  guard('point', () => {
    const p = EXC.point, bits = v => { v = BigInt(v); if (v < 0n) v = -v; return v === 0n ? 1 : v.toString(2).length; };
    const sgn = v => (Number(v) < 0 ? '−' : '+') + Math.abs(Number(v));
    const g3 = (m, f) => `<table class="t" style="margin:0"><tr><th>ic</th><th>k=0</th><th>k=1</th><th>k=2</th><th>小计</th></tr>${m.map((r, q) => `<tr><td>${q}</td>${r.map(v => `<td>${f(v)}</td>`).join('')}<td><b>${f === String ? '' : ''}${p.products[q].reduce((a, b) => a + b, 0)}</b></td></tr>`).join('')}</table>`;
    const pw = Number(p.mult).toString(2).length;
    $('#cp-point').innerHTML = `<div class="mc-two"><div><h4 style="margin:0 0 6px;font-size:14px">输出通道 ${p.oc}，位置 ${p.w}：窗口 × 权重 = 乘积</h4><div class="tscroll"><table class="t" style="margin:0"><tr><th>ic</th><th>窗口 (k=0,1,2)</th><th>权重</th><th>乘积</th><th>小计</th></tr>${p.window.map((r, q) => `<tr><td>${q}</td><td>${r.join(', ')}</td><td>${p.weights[q].join(', ')}</td><td>${p.products[q].join(', ')}</td><td><b>${p.products[q].reduce((a, b) => a + b, 0)}</b></td></tr>`).join('')}</table></div></div>
      <div><h4 style="margin:0 0 6px;font-size:14px">累加与重量化</h4><div class="calc" style="font:13px/1.7 var(--f-mono)"><div class="row"><span class="k">48 项相加</span><span class="v"><b>acc = ${fmt(p.acc)}</b>（${bits(p.acc)} 位有符号，RTL 加法树输出 20 位）</span></div>
      <div class="row"><span class="k">× 乘数</span><span class="v">${fmt(p.mult)}（31 位，=2<sup>30</sup>+${fmt(C2.multTable.rtlLow)}）<br>= <b>${fmt(p.prod)}</b>（${bits(p.prod)} 位 ≤ 51）</span></div>
      <div class="row"><span class="k">+ 1 &lt;&lt; (shift−1)</span><span class="v">shift = ${p.shift}：+ ${fmt(p.offset)} = ${fmt(p.rounded)}</span></div>
      <div class="row"><span class="k">&gt;&gt;&gt; ${p.shift}</span><span class="v">= <b>${fmt(p.shifted)}</b></span></div>
      <div class="row"><span class="k">饱和到 INT8</span><span class="v">= <b>${p.out}</b>${Number(p.shifted) !== p.out ? '（被饱和）' : '（在范围内，无需饱和）'}</span></div></div>
      <p class="mc-note">这一点的输出与模型的卷积 2 张量一致。仿真波形里 oc=0 的前 10 个累加值（${EXC.first.map(x => x.acc).join('、')}）也与模型逐个相同，其乘积 = ${fmt(EXC.first[0].prod)} 等同于波形里的 <code>mul_p</code>。${tag('仿真', 'pap')} ${tag('推导', 'der')}</p></div></div>`;
  });

  /* ---------------------------------------------------------------- three conv layers */
  guard('cmp', () => {
    const nm = { conv1: '卷积 1', conv2: '卷积 2', conv3: '卷积 3' }, sim = l => { const r = (MD.sim.conv || []).filter(x => x.mod === { conv2: 'forward_14', conv3: 'forward_13' }[l]); return r.length ? `${r.length} 次运行 · 0 差异` : '未单独仿真（在 forward_4 内）'; };
    const rows = ['conv1', 'conv2', 'conv3'].map(l => {
      const c = C[l], prod = c.ic * 3, dspMac = c.instances.macDsp, lm = c.instances.lutMul8;
      return [`<b>${nm[l]}</b>`, `${c.ic} → ${c.oc}，核宽 3<br><span class="small">输出 ${c.oc} × ${c.outLen}</span>`, `${fmt(c.trip)}<br><span class="small">${c.oc} × ${c.outLen}</span>`, `${prod}<br><span class="small">${dspMac} DSP + ${lm} LUT</span>`, `${c.depth} 级<br><span class="small">延迟 ${fmt(c.latency)}</span>`, `${c.ic * 3} × ${Math.ceil(c.inLen / 3)} 字<br><span class="small">${c.inLen} 点输入</span>`, `${c.weightTableCheck.columns} 张 · ${c.oc} 选 1<br><span class="small">HLS ${fmt(c.lutBreakdown.weightMux)} LUT</span>`,
        c.ports.sharedMul ? '顶层共享 31×20→51（2 DSP）' : '自带 31×17→48（2 DSP）', `${c.hls.DSP} / ${fmt(c.hls.LUT)} / ${fmt(c.hls.FF)}`, c.routed ? `${c.routed.DSP} / ${fmt(c.routed.LUT)} / ${fmt(c.routed.FF)}` : '—', sim(l)];
    });
    table($('#cc-table'), ['层', '通道', '迭代数', '每拍乘法', '计算流水线', '输入缓冲', '权重表', '重量化乘法器', 'HLS：DSP / LUT / FF', '布线后层级：DSP / LUT / FF', 'RTL 仿真'], rows);
  });
})();
