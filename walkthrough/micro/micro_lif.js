/* LIF sections: rules, KPIs, datapath diagram + token animation, stage table, waveforms, memory, stall, six instances, examples. */
(function () {
  const { $, $$, esc, fmt, num, KIND, tokenFill, tokenLine, tip, Player, T, arrowPath, Wave, table, guard } = MC;
  const L = MD.lif, L1 = L.find(x => x.key === 'lif1'), C2 = MD.conv.find(x => x.label === 'conv2');
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const rams = x => sum(x.rams, r => r.bram);
  const tag = (t, c) => `<span class="src${c ? ' ' + c : ''}">${t}</span>`;
  const simLif = MD.sim.lif || [], simStall = MD.sim.lifStall || [], simConv = MD.sim.conv || [];
  const okLif = simLif.filter(r => !r.error && !r.spkBad && !r.stBad && !r.bankBad && r.lenOk);
  const okConv = simConv.filter(r => !r.error && !r.bad && r.got === r.values);

  /* ---------------------------------------------------------------- KPIs and rules */
  guard('kpis', () => {
    const cells = [
      [`${fmt(L1.neurons)} → 1`, `LIF1 的 ${fmt(L1.neurons)} 个神经元共用 1 条 ${L1.depth} 级流水线（II = ${L1.ii}）`, '报告'],
      [`${L1.hls.DSP} DSP · ${rams(L1)} BRAM`, `LIF1 的 HLS 资源，布线后 DSP ${L1.routed ? L1.routed.DSP : '—'}；膜电位 V0、V1 各 ${L1.rams[0].bram} 块 BRAM18K`, '报告'],
      ['48 乘 / 拍', `卷积 2 每拍 48 次乘加：${C2.instances.macDsp + C2.instances.amAddmul - 1} 个 DSP48 乘加 + ${C2.instances.lutMul8} 个 LUT 乘法器`, 'RTL'],
      [`${okLif.length + okConv.length} / ${simLif.length + simConv.length}`, `RTL 仿真运行与模型逐位一致（LIF ${okLif.length} 个用例，卷积 ${okConv.length} 次运行）`, '仿真'],
    ];
    $('#mc-kpis').innerHTML = cells.map(([b, s, t]) => `<div class="kpi"><b>${b}</b><span>${s} ${tag(t, { 报告: 'rpt', 仿真: 'pap', RTL: '' }[t])}</span></div>`).join('');
  });
  guard('rules', () => {
    $('#mc-rules').innerHTML = [
      ['① 神经元和输出点，是循环的下标', `LIF1 的 ${fmt(L1.neurons)} 个神经元 = ${fmt(L1.trip)} 次迭代，状态放在两块 ${fmt(L1.rams[0].words)}×${L1.rams[0].bits} 位的 RAM 里，编号就是地址。卷积 2 的 ${fmt(C2.trip)} 个输出点 = 16 通道 × 87 位置，每拍一个。没有“神经元电路”，只有一条在地址上扫过的流水线。`],
      ['② 常量变成逻辑', `权重是 48 张 16 选 1 的常量表（没有权重 BRAM）；阈值、β、输入尺度、乘数、移位量全是立即数；LIF 的延迟复位被并进 DSP48 的加数端。常量会改变电路：尺度 20 变成两次移位加法，β = 1.0 去掉了乘法器。`],
      ['③ 一个全局暂停，没有逐级反压', `每个流水循环只有一个阻塞条件，它同时冻结所有级的使能寄存器、计数器和 DSP48 的 CE。输入 FIFO 空或输出 FIFO 满，整条流水线在同一拍停住。所以层之间用“整张特征图深度”的 FIFO 隔开，层按顺序跑。`],
    ].map(([h, p]) => `<div class="mc-card"><h4>${h}</h4><p>${p} ${tag('RTL')} ${tag('报告', 'rpt')}</p></div>`).join('');
  });

  /* ---------------------------------------------------------------- datapath diagram */
  const COLW = 118, X0 = 150, X = s => X0 + s * COLW, W = X(8) + 6, H = 524;
  const th = L1.thetaRtl, beta = L1.betaMulConst, sc = L1.scaleConst, ac = L1.addrMulConst, rc = L1.resetAddend.signed;
  const ref = lab => { const r = L1.refs.find(q => q.label.startsWith(lab)); return r ? `<code>forward_11.v:${r.line}</code>` : ''; };
  const N = [
    { id: 'cnt', k: 'reg', x: X(0) + 4, y: 62, w: COLW - 8, h: 60, s: [0, 0], t: '循环计数器', sub: ['indvar 12b', 't 8b · c 5b'], tip: `<b>循环计数器</b><br>indvar_flatten 0…${L1.neurons - 1}、t 0…${L1.length - 1}、c 0…${L1.channels - 1}；t 到 ${L1.length} 时回绕、c 加 1，indvar 到 ${L1.neurons} 退出循环。` },
    { id: 'dsp1', k: 'dsp', x: X(1) + 4, y: 62, w: 3 * COLW - 8, h: 60, s: [1, 3], t: 'DSP48 #1：地址乘加', sub: [`c × ${ac} + t → 12 位地址`, 'A/B → M → P 三级寄存器，第 3 拍出结果'], tip: `<b>地址 = c×${ac} + t</b><br>模块 <code>mac_muladd_8ns_5ns_8ns_12_4_1</code>，DSP48 模板：m = a_reg×b_reg，p = m_reg + c，t 在第 2 级从 C 口加入。` },
    { id: 'rd', k: 'reg', x: X(5) + 4, y: 62, w: COLW - 8, h: 44, s: [0, 7], t: 'rd_reg', sub: ['= bank_i，调用开始锁存'], tip: `<b>rd_reg</b><br>调用开始时 <code>rd_reg &lt;= bank_i</code>。它同时决定读哪块（多路选择）和写哪块（we0），所以读写落在同一块。${ref('V0 写使能')} ${ref('v_prev 选')}` },
    { id: 'ramr', k: 'bram', x: X(3) + 4, y: 160, w: COLW - 8, h: 96, s: [3, 3], t: 'RAM 读口', sub: ['V0 / V1', `${fmt(L1.rams[0].words)}×${L1.rams[0].bits} 位`, 'address1 → q1', '读出带寄存器：1 拍'], tip: `<b>膜电位 RAM 读口</b><br>V0、V1 各一块简单双口 RAM，读口 <code>address1/ce1/q1</code>。地址第 3 级发出，数据第 4 级有效。两块同时被读，由 rd_reg 选其一。${ref('读地址')}` },
    { id: 'mux', k: 'lut', x: X(4) + 4, y: 160, w: COLW - 8, h: 96, s: [4, 4], t: 'bank 选择', sub: ['rd_reg ? V1.q1', ': V0.q1', '→ v_prev_q_reg 24b'], tip: `<b>v_prev 选择</b><br><code>v_prev_q = rd_reg ? V1_q1 : V0_q1</code>，结果锁进 v_prev_q_reg。${ref('v_prev 选')}` },
    { id: 'dsp3', k: 'dsp', x: X(5) + 4, y: 168, w: COLW - 8, h: 80, s: [5, 5], t: `× β = ${beta}`, sub: ['24s × 12ns', '→ 36 位', '→ prod_b_reg'], tip: `<b>泄漏乘法</b><br><code>mul_24s_12ns_36_1_1</code>：v_prev（24 位有符号）× ${beta}，HLS 估计 1 个 DSP。` },
    { id: 'ramw', k: 'bram', x: X(7) + 4, y: 160, w: COLW - 8, h: 96, s: [7, 7], t: 'RAM 写口', sub: ['写 V[rd_reg]', 'd0 = v_next', '读写同一块', 'we0 随 rd_reg'], tip: `<b>写回</b><br>写使能 <code>rd_reg==0 → V0.we0</code>、<code>rd_reg==1 → V1.we0</code>；写地址是读地址经 4 级寄存器（pp0_iter4…6）延迟到第 7 级。${ref('V0 写使能')} ${ref('写回地址')}` },
    { id: 'cmp1', k: 'lut', x: X(5) + 4, y: 290, w: COLW - 8, h: 84, s: [5, 5], t: `v_prev > ${th}`, sub: ['24 位有符号', '与常量比较', '→ 选复位加数'], tip: `<b>延迟复位的判据</b><br>上一次是否发放，用“旧膜电位 &gt; θ”判断（θ = ${th}）。${ref('阈值比较（v_prev')}` },
    { id: 'round', k: 'lut', x: X(6) + 4, y: 282, w: COLW - 8, h: 60, s: [6, 6], t: '取整 · 切位', sub: ['±2048 偏置', '取 [34:12]', '→ v_beta 24b'], tip: `<b>Q12 取整</b><br>乘积为负加 −2048（35 位补码 34359736320），否则加 2048；取 [34:12] 得 v_beta，再符号扩展到 24 位。${ref('取整偏置')} ${ref('v_beta')}` },
    { id: 'add', k: 'lut', x: X(6) + 4, y: 346, w: COLW - 8, h: 48, s: [6, 6], t: '相加', sub: ['v_beta + DSP#2', '→ v_next_q_reg 24b'], tip: `<b>积分</b><br>v_next = v_beta + (x×${sc} − 复位量)。${ref('v_next')}` },
    { id: 'fout', k: 'fifo', x: X(7) + 4, y: 286, w: COLW - 8, h: 54, s: [7, 7], t: '输出 FIFO s2', sub: ['8 位 · iter7 写'], tip: '<b>输出 FIFO</b><br><code>s2_write</code> 在第 7 级拉高，<code>s2_full_n = 0</code> 时整条流水线停住。' },
    { id: 'cmp2', k: 'lut', x: X(7) + 4, y: 346, w: COLW - 8, h: 48, s: [7, 7], t: `v_next > ${th}`, sub: ['→ 脉冲 1 位'], tip: `<b>发放判定</b><br>严格大于阈值；结果经 s2_din 写输出 FIFO。${ref('阈值比较（v_next')}` },
    { id: 'fin', k: 'fifo', x: X(3) + 4, y: 410, w: COLW - 8, h: 44, s: [3, 3], t: '输入 FIFO s1', sub: ['8 位 · iter3 读'], tip: '<b>输入 FIFO</b><br><code>s1_read</code> 在第 3 级拉高；<code>s1_empty_n = 0</code> 时整条流水线停住。' },
    { id: 'dsp2', k: 'dsp', x: X(3) + 4, y: 462, w: 4 * COLW - 8, h: 54, s: [3, 6], t: `DSP48 #2：x × ${sc} + C`, sub: [`C 口 = (v_prev > ${th}) ? ${rc} : 0 ，在 M 寄存器之后的后加器处进入`, '16 位输出；A/B → M → P'], tip: `<b>输入乘加，复位并入加数</b><br><code>mac_muladd_8s_8ns_12s_16_4_1</code>：x（INT8）× ${sc} + C。C = <code>16'd${65536 + rc}</code>（= ${rc}）或 0，由 v_prev 的比较结果选择。${ref('复位加数')}` },
  ];
  const nd = Object.fromEntries(N.map(n => [n.id, n]));
  const R = n => [n.x + n.w, n.y + n.h / 2], Lf = n => [n.x, n.y + n.h / 2], Tp = (n, f) => [n.x + n.w * (f == null ? .5 : f), n.y], Bt = (n, f) => [n.x + n.w * (f == null ? .5 : f), n.y + n.h];
  const E = [
    { a: 'cnt', b: 'dsp1', p: () => [R(nd.cnt), Lf(nd.dsp1)], l: 'c, t', lp: [X(0) + 78, 86] },
    { a: 'dsp1', b: 'ramr', p: () => [Bt(nd.dsp1, .86), [Bt(nd.dsp1, .86)[0], nd.ramr.y]], l: 'addr 12b', lp: [Bt(nd.dsp1, .86)[0] + 5, 148] },
    { a: 'ramr', b: 'mux', p: () => [R(nd.ramr), Lf(nd.mux)], l: 'q1 ×2', lp: [X(4) - 14, 202] },
    { a: 'mux', b: 'dsp3', p: () => [R(nd.mux), Lf(nd.dsp3)], l: 'v_prev', lp: [X(5) - 38, 200] },
    { a: 'mux', b: 'cmp1', p: () => [Bt(nd.mux, .5), [Bt(nd.mux, .5)[0], nd.cmp1.y + nd.cmp1.h / 2], Lf(nd.cmp1)], l: 'v_prev', lp: [X(4) + 64, 276] },
    { a: 'rd', b: 'mux', p: () => [Lf(nd.rd), [X(4) + 59, nd.rd.y + nd.rd.h / 2], [X(4) + 59, nd.mux.y]], l: '选 V0 / V1', lp: [X(4) + 6, 78], dash: true },
    { a: 'rd', b: 'ramw', p: () => [R(nd.rd), [X(7) + 85, nd.rd.y + nd.rd.h / 2], [X(7) + 85, nd.ramw.y]], l: 'we0', lp: [X(7) + 90, 138], dash: true },
    { a: 'dsp1', b: 'ramw', p: () => [[X(4) - 4, 124], [X(7) + 36, 124], [X(7) + 36, nd.ramw.y]], l: '写地址 = 读地址经 4 级寄存器延迟', lp: [X(4) + 2, 138] },
    { a: 'dsp3', b: 'round', p: () => [R(nd.dsp3), [X(6) - 2, nd.dsp3.y + nd.dsp3.h / 2], [X(6) - 2, nd.round.y + nd.round.h / 2], Lf(nd.round)], l: 'prod 36b', lp: [X(5) + 6, 258] },
    { a: 'round', b: 'add', p: () => [Bt(nd.round), Tp(nd.add)], l: 'v_beta', lp: [X(6) + 62, 346] },
    { a: 'cmp1', b: 'dsp2', p: () => [Bt(nd.cmp1), [Bt(nd.cmp1)[0], nd.dsp2.y]], l: 'C 口选择', lp: [Bt(nd.cmp1)[0] + 6, 424] },
    { a: 'fin', b: 'dsp2', p: () => [Bt(nd.fin), [Bt(nd.fin)[0], nd.dsp2.y]], l: 'x int8', lp: [Bt(nd.fin)[0] + 6, 460] },
    { a: 'dsp2', b: 'add', p: () => [Tp(nd.dsp2, .93), [Tp(nd.dsp2, .93)[0], nd.add.y + nd.add.h]], l: 'x_q′ 16b', lp: [Tp(nd.dsp2, .93)[0] + 6, 436] },
    { a: 'add', b: 'cmp2', p: () => [R(nd.add), Lf(nd.cmp2)], l: 'v_next', lp: [X(7) - 44, 366] },
    { a: 'cmp2', b: 'fout', p: () => [Tp(nd.cmp2), Bt(nd.fout)], l: 'spk', lp: [X(7) + 66, 346] },
    { a: 'add', b: 'ramw', p: () => [[nd.add.x + nd.add.w, nd.add.y + nd.add.h * .25], [X(7) - 2, nd.add.y + nd.add.h * .25], [X(7) - 2, nd.ramw.y + nd.ramw.h * .75], [nd.ramw.x, nd.ramw.y + nd.ramw.h * .75]], l: 'v_next → d0', lp: [X(6) + 8, 266] },
  ];
  const lanes = [['地址', 52, 92], ['膜电位 RAM', 152, 110], ['泄漏 · 积分 · 判定', 270, 130], ['输入 · 复位加数', 404, 118]];
  const caps = ['计数', 'MAC', 'MAC', '读 RAM · 读 FIFO', 'RAM 数据 · 选 bank', '比较 · β 乘', '取整 · 相加', '判定 · 写回'];
  let lf = { stage: 0, ex: MD.ex.lif.lif1, t: 0 };
  function figure() {
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="LIF1 数据通路框图，8 级流水线">`;
    lanes.forEach(([n, y, h], i) => { s += `<rect x="0" y="${y}" width="${W}" height="${h}" fill="${i % 2 ? 'transparent' : 'var(--surface2)'}"/>` + T(8, y + 18, n, { size: 11.5, fill: 'var(--ink2)', weight: 600 }); });
    for (let k = 0; k < 8; k++) { const on = lf.run && lf.stage === k; s += `<rect x="${X(k)}" y="2" width="${COLW}" height="${H - 4}" fill="${on ? 'color-mix(in srgb, var(--en) 7%, transparent)' : 'transparent'}" stroke="var(--grid)" stroke-width="1"/>` + T(X(k) + COLW / 2, 18, 'iter' + k, { size: 12, anchor: 'middle', weight: 600, fill: on ? 'var(--en)' : 'var(--ink)', mono: true }) + T(X(k) + COLW / 2, 33, caps[k], { size: 10, anchor: 'middle', fill: 'var(--muted)' }); }
    E.forEach(e => { const pts = e.p(), act = lf.stage >= Math.min(...nd[e.a].s) && lf.stage <= Math.max(...nd[e.b].s) && lf.run; s += arrowPath(pts, { color: act ? 'var(--en)' : 'var(--muted)', w: act ? 2 : 1.3, dash: e.dash ? '4 3' : null }); if (e.l) { const lp = e.lp || [(pts[0][0] + pts[pts.length - 1][0]) / 2, (pts[0][1] + pts[pts.length - 1][1]) / 2 - 5]; s += T(lp[0], lp[1], e.l, { size: 10, fill: 'var(--ink2)', mono: true }); } });
    N.forEach(n => { const on = lf.run && lf.stage >= n.s[0] && lf.stage <= n.s[1]; s += `<g class="mc-node" data-id="${n.id}" tabindex="0" role="button" aria-label="${esc(n.t)}"><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="7" fill="${tokenFill(n.k)}" stroke="${on ? 'var(--en)' : tokenLine(n.k)}" stroke-width="${on ? 3 : 1.4}"/>` + T(n.x + 7, n.y + 16, n.t, { size: 11.5, weight: 600 }) + n.sub.map((q, i) => T(n.x + 7, n.y + 31 + i * 12.5, q, { size: 10, fill: 'var(--ink2)' })).join('') + '</g>'; });
    return s + '</svg>';
  }
  const ticketItems = () => { const r = lf.ex.rows[lf.t], idx = lf.ex.idx, c = Math.floor(idx / L1.length), t = idx % L1.length; return [
    { at: 3, n: `地址 c×${ac}+t`, v: `${idx} = ${c}×${ac}+${t}` }, { at: 3, n: 'x（INT8，来自 FIFO）', v: r.x }, { at: 4, n: `v_prev = V${r.bank}[${idx}]`, v: r.vPrev },
    { at: 5, n: `v_prev > ${th} ?`, v: r.rPrev ? `是 → C = ${rc}` : '否 → C = 0' }, { at: 5, n: `v_prev × ${beta}`, v: r.prod }, { at: 6, n: '取整偏置', v: r.prod >= 0 ? '+2048' : '−2048' }, { at: 6, n: 'v_beta', v: r.vBeta },
    { at: 6, n: `x×${sc} + C`, v: r.addend }, { at: 6, n: 'v_next', v: r.vNext }, { at: 7, n: `v_next > ${th} ?`, v: r.spk ? '发放 1' : '0' }, { at: 7, n: `写回 V${r.bank}[${idx}]`, v: r.vNext }]; };
  const STAGE = [
    ['计数', `indvar_flatten、t、c 计数；t == ${L1.length} 回绕；DSP#1 的 A/B 寄存器采样 c 与 ${ac}`],
    ['地址 MAC', 'DSP#1 的 M 寄存器；t 的流水寄存器同步前进'],
    ['地址 MAC', 'DSP#1 后加器 + t，结果进 P 寄存器'],
    ['读 RAM · 读 FIFO', `地址有效 → V0、V1 读口同时发出（address1/ce1）；s1_read 拉高取 x；DSP#2 的 A/B 采样 x 和 ${sc}`],
    ['RAM 数据', 'q1 有效；rd_reg 选 V0 或 V1 → v_prev_q_reg；DSP#2 的 M 寄存器；地址进寄存器链第 1 级'],
    ['比较 · β 乘', `v_prev > ${th} → 选 C 口加数；v_prev × ${beta} → prod_b_reg；DSP#2 后加器加上 C`],
    ['取整 · 相加', '符号位选 ±2048，35 位加法，取 [34:12] 得 v_beta；v_beta + DSP#2 输出 → v_next_q_reg'],
    ['判定 · 写回', `v_next > ${th} → 脉冲写 s2；v_next 写回 V[rd_reg]，写地址是读地址延迟 4 拍`],
  ];
  function ticket() {
    const items = ticketItems(); $('#lf-ticket').innerHTML = items.map(it => `<div class="${lf.run ? (lf.stage >= it.at ? 'on' : 'off') : ''}"><span>${esc(it.n)}${lf.run ? '' : ''}</span>${esc(it.v)}</div>`).join('');
    const r = lf.ex.rows[lf.t];
    $('#lf-info').innerHTML = lf.run ? `<b>iter${lf.stage}（${STAGE[lf.stage][0]}）</b>：${esc(STAGE[lf.stage][1])}。` : `神经元 #${lf.ex.idx}（通道 ${lf.ex.channel}、位置 ${lf.ex.pos}）第 ${lf.t} 次调用：读写 <b>V${r.bank}</b>${lf.t >= 2 ? `，读到的是第 ${lf.t - 2} 次调用写入的 ${r.vPrev}` : '，初始为 0'}。按“播放”看它走过 8 级。`;
  }
  guard('lifFig', () => {
    $('#lf-legend').innerHTML = ['dsp', 'bram', 'lut', 'fifo', 'reg'].map(k => `<span><i style="border-color:${tokenLine(k)};background:${tokenFill(k)}"></i>${KIND[k].n}</span>`).join('');
    $('#lf-ex').innerHTML = `<label class="ctrl" style="min-width:260px"><span>第几次调用（时间步 t）</span><output id="lf-t-o">0</output><input type="range" id="lf-t" min="0" max="9" value="0" aria-label="时间步"></label>`;
    const draw = () => { $('#lf-fig').innerHTML = figure(); ticket(); };
    let init = false;
    const pl = Player($('#lf-player'), { n: 9, fps: 1.6, label: i => i < 8 ? `第 ${i} 级 · iter${i}` : '完成', onFrame: i => { if (!init) return; lf.stage = Math.min(7, i); lf.run = true; draw(); } });
    init = true; lf.run = false; draw();
    $('#lf-t').addEventListener('input', e => { lf.t = +e.target.value; $('#lf-t-o').textContent = lf.t; draw(); });
    $('#lf-fig').addEventListener('pointermove', e => { const g = e.target.closest('.mc-node'); if (g) tip(nd[g.dataset.id].tip, e.clientX, e.clientY); else tip(null); });
    $('#lf-fig').addEventListener('pointerleave', () => tip(null));
    $('#lf-fig').addEventListener('click', e => { const g = e.target.closest('.mc-node'); if (g) { const n = nd[g.dataset.id]; $('#lf-info').innerHTML = n.tip; } });
    $('#lf-fig').addEventListener('focusin', e => { const g = e.target.closest && e.target.closest('.mc-node'); if (g) $('#lf-info').innerHTML = nd[g.dataset.id].tip; });
  });

  /* ---------------------------------------------------------------- stage table */
  guard('stages', () => {
    const sig = ['indvar_flatten_fu_90 · t_fu_82 · c_fu_86 · icmp_ln60', 'grp_fu_343 (M) · select_ln60_reg_395', 'grp_fu_343 (P) · select_ln60_reg_395_pp0_iter1_reg', 'V*_address1 · V*_ce1 · s1_read · grp_fu_352 (A/B)', 'V*_q1 · v_prev_q_reg_427 · grp_fu_352 (M)', 'icmp_ln74 · prod_b_reg_433 · grp_fu_352 (P)', 'select_ln78 · prod_b_5 · v_beta_q · v_next_q_reg_444', 'spk_fu · s2_write · V*_we0 · V*_address0 (= addr_reg_iter6)'];
    const bind = ['LUT / FF', 'DSP48', 'DSP48', 'BRAM · FIFO', 'BRAM 输出寄存器 · LUT', 'LUT · DSP48', 'LUT', 'LUT · BRAM · FIFO'];
    table($('#lf-stages'), ['级', '做什么', '关键 RTL 信号（forward_11.v）', '实现'], STAGE.map((s, i) => [`<b>iter${i}</b>`, esc(s[1]), `<code>${esc(sig[i])}</code>`, bind[i]]));
  });

  /* ---------------------------------------------------------------- waveforms */
  const rb = (rows, key = 'start') => { const i = rows.findIndex(r => r[key] === '1'); const t0 = rows[Math.max(0, i)].cyc; return rows.map(r => Object.assign({}, r, { cyc: r.cyc - t0 })); };
  const nx = v => (v == null || /x/i.test(String(v))) ? null : Number(v);
  const bit = k => r => /x/i.test(r[k] || 'x') ? null : (r[k] === '1' ? 1 : 0);
  const itb = k => r => r.iter ? (r.iter[r.iter.length - 1 - k] === '1' ? 1 : 0) : null;
  const FSM = { 1: 'idle/启动', 2: '流水循环', 4: '收尾' };
  guard('waves', () => {
    const t1 = rb(MD.traces.lif1).slice(0, 56);
    const mk = (rows, withHs) => [
      { name: 'ap_start', kind: 'bit', get: bit('start') }, { name: 'ap_CS_fsm', kind: 'bus', get: r => FSM[r.fsm] || r.fsm, text: v => v },
      ...Array.from({ length: 8 }, (_, k) => ({ name: 'iter' + k, kind: 'bit', get: itb(k), color: 'mwi' })),
      ...(withHs ? [{ name: 's1_empty_n', kind: 'bit', get: bit('empty_n'), color: 'tree' }] : []),
      { name: 's1_read', kind: 'bit', get: bit('fifo_rd'), color: 'tree' }, { name: 's1_dout (x)', kind: 'bus', get: r => nx(r.din), color: 'tree' },
      { name: 'V*_ce1 读', kind: 'bit', get: bit('rd') }, { name: 'V*_address1', kind: 'bus', get: r => nx(r.rd_addr) }, { name: 'V*_q1', kind: 'bus', get: r => nx(r.q1) },
      { name: 'v_prev_q_reg', kind: 'bus', get: r => nx(r.v_prev_q), color: 'gold' }, { name: 'prod_b_reg', kind: 'bus', get: r => nx(r.prod_b), color: 'en' }, { name: 'v_next_q_reg', kind: 'bus', get: r => nx(r.v_next_q), color: 'gold' },
      { name: 'V*_we0 写', kind: 'bit', get: bit('wr') }, { name: 'V*_address0', kind: 'bus', get: r => nx(r.wr_addr) }, { name: 'V*_d0', kind: 'bus', get: r => nx(r.wr_d) },
      ...(withHs ? [{ name: 's2_full_n', kind: 'bit', get: bit('full_n'), color: 'tree' }] : []),
      { name: 's2_write', kind: 'bit', get: bit('fifo_wr'), color: 'tree' }, { name: 's2_din 脉冲', kind: 'bus', get: r => nx(r.out), color: 'tree' }];
    const firstRd = t1.find(r => r.rd === '1' && r.rd_addr !== 'x'), firstWr = t1.find(r => r.wr === '1' && r.wr_addr !== 'x');
    Wave($('#lf-wave'), mk(t1, false), t1, { cell: 24, label: 'LIF1 仿真波形', marks: [firstRd && { cyc: firstRd.cyc, label: '首次读 RAM', color: '#C8265E' }, firstWr && { cyc: firstWr.cyc, label: '首次写 RAM', color: '#0E9A86' }].filter(Boolean), cursor: firstRd ? t1.indexOf(firstRd) : 0 });
    const t2 = rb(MD.traces.lif1Stall).slice(0, 62);
    const blocked = r => r.iter && r.fsm === '2' && ((r.iter[4] === '1' && r.empty_n === '0') || (r.iter[0] === '1' && r.full_n === '0'));
    Wave($('#lf-wave2'), mk(t2, true), t2, { cell: 24, label: 'LIF1 带随机停顿的仿真波形', hilite: blocked });
  });

  /* ---------------------------------------------------------------- memory */
  guard('mem', () => {
    const lines = a => a.map(x => x.n == null ? `<span class="ln"></span>…` : `<span class="ln">${x.n}</span>${x.hl ? '<span class="hl">' : ''}${esc(x.t)}${x.hl ? '</span>' : ''}`).join('\n');
    $('#lf-code1').innerHTML = `// topFunction_forward_11.v（节选）\n` + lines(MD.snippets.lif1_rw);
    const r = L1.rams[0], tw = r.totalBits, cap = 6 * 18432, rowsDepth = [1024, 1024, r.words - 2048], bitsW = [18, r.bits - 18];
    let s = `<svg viewBox="0 0 520 230" width="520" height="230" role="img" aria-label="V0 的 BRAM18K 拼装">`;
    rowsDepth.forEach((d, i) => bitsW.forEach((b, j) => { const x = 20 + j * 230, y = 28 + i * 62, fw = 210 * (b / 18), fh = 50 * (d / 1024); s += `<rect x="${x}" y="${y}" width="210" height="50" rx="5" fill="var(--surface2)" stroke="var(--sig)" stroke-width="1.3"/><rect x="${x}" y="${y}" width="${fw}" height="50" rx="5" fill="color-mix(in srgb, var(--sig) 28%, var(--surface))"/>` + T(x + 8, y + 20, `BRAM18K · 1K×18`, { size: 11, weight: 600 }) + T(x + 8, y + 36, `深度 ${i * 1024}…${i * 1024 + d - 1} · 数据位 ${j ? '18…23' : '0…17'}`, { size: 10, fill: 'var(--ink2)' }); }));
    s += T(20, 18, '2,848 个字 × 24 位 = 3 行 × 2 列 共 6 块', { size: 11, fill: 'var(--ink2)' });
    $('#lf-bram').innerHTML = s + '</svg>';
    $('#lf-bram-note').innerHTML = `实际使用 ${fmt(tw)} 位，6 块共 ${fmt(cap)} 位，利用率 ${(tw / cap * 100).toFixed(1)}%；右列只用 6 位（24 − 18），底行只用 ${r.words - 2048} / 1024 个字。V1 相同，两块共 ${rams(L1)} 块。HLS 没有给出具体拼法，此图是满足 “6 块” 的一种标准拼法，${tag('示意', 'ill')} 。`;
  });
  guard('intended', () => {
    const I = MD.checks.intended, nm = { forward_11: 'LIF1', forward_10: 'LIF2', forward_8: 'LIF3', forward_9: '二分类 LIF', forward_12: '4 分类隐藏 LIF', forward_7: '4 分类输出 LIF' };
    table($('#lf-intended'), ['模块', 'RTL 仿真输出的脉冲数', '“写另一块”读法下不同的脉冲数', '比例'], Object.keys(nm).map(k => [nm[k], fmt(I.total[k]), fmt(I.diff[k]), `${(I.diff[k] / I.total[k] * 100).toFixed(2)}%`]));
  });

  /* ---------------------------------------------------------------- stall table */
  guard('stall', () => {
    const nm = { forward_11: 'LIF1', forward_10: 'LIF2', forward_8: 'LIF3', forward_9: '二分类 LIF', forward_12: '4 分类隐藏 LIF', forward_7: '4 分类输出 LIF' }, rows = [];
    Object.keys(nm).forEach(m => { const st = simStall.filter(r => r.mod === m), pl = simLif.filter(r => r.mod === m && r.label === 'b8')[0]; if (!st.length) return; const s0 = st.find(r => r.label === 'b8') || st[0];
      rows.push([nm[m], st.length, fmt(sum(st, r => r.spikes)), fmt(sum(st, r => r.stateValues)), sum(st, r => r.spkBad + r.stBad + r.bankBad), pl ? fmt(pl.lat) : '—', s0 ? fmt(s0.lat) : '—']); });
    table($('#lf-stall-table'), ['模块', '带停顿的用例数', '脉冲数', '膜电位值', '不同', '无停顿延迟（拍）', '随机停顿延迟（拍）'], rows);
  });

  /* ---------------------------------------------------------------- six instances */
  guard('six', () => {
    const cnt = m => { const r = simLif.filter(x => x.mod === m); return `${r.length} 个用例 · 0 差异`; };
    const rows = L.map(x => {
      const scale = x.scaleConst != null ? `DSP48：x × ${x.scaleConst}` : (x.scaleShiftBits.length ? `移位加法：x&lt;&lt;${x.scaleShiftBits[0]} + x&lt;&lt;${x.scaleShiftBits[1]}（= ×${x.exported.scale}）` : '—');
      const b = x.betaMulConst != null ? `DSP48：v × ${x.betaMulConst}` : '无乘法器：β 夹到 4096，走 v&lt;&lt;12 的取整路径';
      const r = x.resetAddend, ra = r ? `${r.signed > 0 ? '+' : ''}${r.signed}（${r.width} 位常量）` : '—';
      return [`<b>${esc(x.name)}</b><br><span class="small">${fmt(x.neurons)} 个 · <code>${x.mod}</code></span>`, `${x.depth} 级 · II ${x.ii}<br><span class="small">延迟 ${fmt(x.latency)} 拍</span>`, `${x.thetaRtl}${x.thetaRtl < 0 ? '<br><span class="small">负阈值</span>' : ''}`, x.addrMulConst != null ? `DSP48：c×${x.addrMulConst}+t` : '无（一维，计数器即地址）', scale, b, ra,
        `${x.hls.DSP} / ${x.routed ? x.routed.DSP : '—'}`, `${rams(x)}`, `${fmt(x.hls.LUT)} / ${fmt(x.hls.FF)}`, cnt(x.mod)];
    });
    table($('#lf-six'), ['实例', '流水线', 'θ（RTL 24 位常量）', '地址计算', '输入尺度 x×s', 'β 路径', '复位加数（C 口 / 加法器）', 'DSP（HLS / 布线后）', 'BRAM18K', 'LUT / FF（HLS）', 'RTL 仿真'], rows);
  });
  guard('examples', () => {
    const tb = (rows, cols) => `<div class="tscroll"><table class="t"><tr>${cols.map(c => `<th>${c[0]}</th>`).join('')}</tr>${rows.map(r => `<tr>${cols.map(c => `<td${c[2] && c[2](r) ? ' class="g"' : ''}>${c[1](r)}</td>`).join('')}</tr>`).join('')}</table></div>`;
    const e3 = MD.ex.lif.lif3, eb = MD.ex.lif.lifBin, th3 = L.find(x => x.key === 'lif3').thetaRtl, thb = L.find(x => x.key === 'lifBin').thetaRtl;
    if (e3) $('#lf-ex3').innerHTML = `<h4 style="margin:0 0 6px;font-size:14px">LIF3 · 神经元 #${e3.idx}：β = 1.0 并不是“不泄漏”</h4>` + tb(e3.rows, [['t', r => r.t], ['bank', r => 'V' + r.bank], ['v_prev', r => r.vPrev], ['v_beta', r => r.vBeta, r => r.vPrev < 0 && r.vBeta === r.vPrev - 1], ['x_q', r => r.xq], ['v_next', r => r.vNext], ['脉冲', r => r.spk]]) + `<p class="mc-note">β 被夹到 4096（1.0），RTL 里没有乘法器：<code>v_beta = (v_prev &lt; 0) ? (v_prev&lt;&lt;12 − 2048)&gt;&gt;12 : v_prev</code>。非负时原样通过；负数每次调用多减 1（绿色列），因为取整偏置对负数是 −2048，向负无穷取整。这是 C++ 就有的行为，RTL 与它一致。${tag('RTL')} ${tag('仿真', 'pap')}</p>`;
    if (eb) $('#lf-exb').innerHTML = `<h4 style="margin:0 0 6px;font-size:14px">二分类 LIF · 神经元 #${eb.idx}：θ = ${thb} 为负</h4>` + tb(eb.rows, [['t', r => r.t], ['v_prev', r => r.vPrev], ['x_q', r => r.xq], ['复位加数', r => r.rPrev ? '+42' : '0', r => r.rPrev], ['v_next', r => r.vNext], ['v_next &gt; θ', r => r.vNext > thb ? 1 : 0, r => r.vNext > thb && r.vNext <= 0]]) + `<p class="mc-note">θ 为负时，复位“减去 θ”变成<b>加 42</b>（θ − 1 = −42，取整所致）；而且初始膜电位 0 本来就大于 θ，所以第一次调用就触发了复位加数（绿色 +42）。膜电位在 θ 与 0 之间也算越线，所以输入为零也会发放。RTL 里复位加数是常量 <code>15'd42</code>，选择信号仍是 “v_prev &gt; θ”。${tag('RTL')} ${tag('仿真', 'pap')}</p>`;
  });
})();
