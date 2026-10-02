/* Hardware evidence explorer. All neuron integers come from AN.run / inspector.
 * K.micro is the actual HLS state schedule; tokens replay function values over
 * that schedule and do not purport to be RTL simulation waveforms. */
(function () {
  'use strict';
  const A = AN, H = K.hardware, rawMicro = K.micro, $ = id => document.getElementById(id);
  if (!H || !rawMicro || !$('hd-root')) return;
  // The report pack uses tuples to avoid embedding thousands of repeated keys.
  // Decode into a separate view so the public evidence pack stays unchanged.
  const M = Object.fromEntries(Object.entries(rawMicro).map(([id,m])=>[id,Object.assign({},m,{stages:(m.stages||[]).map(s=>Object.assign({},s,{ops:(s.ops||[]).map(o=>Object.assign({_lif:!!m.sourceWidths},Array.isArray(o)?Object.fromEntries((m.opFields||[]).map((k,i)=>[k,o[i]])):o))}))})]));
  const E = A.esc, num = v => v == null ? '—' : E(typeof v === 'object' ? JSON.stringify(v) : v);
  const network = H.layers, controls = (H.controls||[]).map(l=>Object.assign({kind:'control',notes:l.note?[l.note]:[]},l)), layers = network.concat(controls), lifs = network.filter(l => l.kind === 'lif' || l.lif), lim = (v,a,b) => Math.max(a,Math.min(b,v));
  const table = (heads, rows) => '<div class="hw-table"><table><thead><tr>' + heads.map(v=>'<th>'+E(v)+'</th>').join('') + '</tr></thead><tbody>' + rows.map(r=>'<tr>'+r.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  const laneNames = [['control','地址 / bank 控制','thr'],['memory','膜电位存储','sig'],['input','输入尺度 / 复位路径','en'],['neuron','β / 积分 / 阈值 / 写回','mwi']];
  const source = s => { if (!s) return ''; const path = Array.isArray(s) ? (H.sourceFiles[s[0]] || s[0]) : s.path; const line = Array.isArray(s) ? s[1] : s.line; return E(path || '') + (line ? ':' + line : ''); };
  const sources = ss => (ss || []).map(source).filter(Boolean).join('；');
  const bind = b => ({DSP:'DSP',logic:'LUT / FF',memory:'RAM',fifo:'FIFO',wire:'连线',control:'控制 / FF',unresolved:'乘法器：绑定待核',unknown:'未确认（无明确绑定证据）'}[b] || b || '未给出');
  const color = (b,p) => b === 'DSP' ? p.en : b === 'memory' || b === 'fifo' ? p.sig : b === 'control' ? p.thr : b === 'wire' || b === 'unresolved' || b === 'unknown' ? p.muted : p.mwi;
  const stages = micro => micro && micro.stages || [];
  const micros = l => (l.microIds || []).map(id=>M[id]).filter(Boolean);
  const opName = o => (o.name || (o.names || []).join(', ') || o.opcode)+(o.part?` [${o.part.join('/')}]`:'');
  const sourceWidth = o => !o._lif ? '见源码' : o.group==='address-mac'?'c/t int32 → 地址':({65:'qi8 / scale16 → xq24',69:'膜电位24',70:'膜电位24',73:'V24 > θ16',74:'V24 > θ16 → rprev16',77:'β16 × V24 → prod40',78:'舍入40',79:'prod40 >> 12 → V24',82:'V24 + xq24 → base24',88:'rprev16 × θ16 → prod40',89:'舍入40',90:'prod40 >> 12 → sub24',91:'base24 − sub24 → V24',99:'V24 > θ16',100:'spk8（0/1）',103:'写膜电位24',104:'写膜电位24'}[o.sourceLine] || '见源码');
  const opRows = st => (st.ops || []).map(o=>[E(opName(o)),E(o.opcode || ''),E(sourceWidth(o)),num(o.width)+(o.widths&&o.widths.length?'；i'+E(o.widths.join('/i')):''),E(bind(o.binding)),E(o.core || '—')+(o.group?'<br>'+E(o.group):''),num(o.count || 1),num(o.sourceLine),source(o.source)+(o.bindingSource?'<br>绑定：'+source(o.bindingSource):'')]);
  const opTable = st => table(['变量 / 操作','算子','源码语义位宽','报告位宽 / 操作数','绑定','HLS core / 融合','次数','C++行','调度 / RTL证据'],opRows(st));
  const shape = l => l.lif ? `${l.lif.channels} × ${l.lif.length}` : typeof l.shape === 'object' ? JSON.stringify(l.shape) : l.shape || '';
  const resRow = (label,r) => [E(label),...['DSP','BRAM','LUT','FF'].map(k=>num(r && (r[k] == null ? r[k.toLowerCase()] : r[k])))];
  function storageTable(l) {
    const stores=(l.storage||[]).concat((l.fifoIds||[]).map(id=>(H.fifos||[]).find(f=>f.name===id)).filter(Boolean));
    return table(['存储','所有者','分块 × 字 × 位','BRAM / FF / LUT','读延迟 / 端口','证据'],stores.map(s=>[
      E(s.name),E(s.owner||''),`${num(s.banks || 1)} × ${num(s.words)} × ${num(s.bits)}`,
      `${num(s.BRAM == null?s.bram:s.BRAM)} / ${num(s.FF == null?s.ff:s.FF)} / ${num(s.LUT == null?s.lut:s.LUT)}`,
      `${num(s.readLatency)} 拍；${s.ports ? E(JSON.stringify(s.ports)) : 'FIFO full / empty握手或见RTL'}`,sources(s.sources || (s.source?[s.source]:[]))
    ]));
  }
  function style() {
    const s = document.createElement('style');
    s.textContent = `.hw-panel{font-size:13px;line-height:1.65}.hw-panel h4{margin:14px 0 7px}.hw-panel select{border:1px solid var(--line);border-radius:6px;padding:6px;background:var(--surface);color:var(--ink);max-width:100%}.hw-pick{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.hw-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin:12px 0}.hw-table{overflow:auto;border:1px solid var(--line);border-radius:8px;margin:8px 0}.hw-table table{width:100%;border-collapse:collapse;font-size:11.5px}.hw-table th,.hw-table td{padding:6px 9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;overflow-wrap:anywhere}.hw-table th{background:var(--surface2);font-weight:600;white-space:nowrap}.hw-table tbody tr:last-child td{border-bottom:0}.hw-table code{font-size:10px}.hw-values{display:grid;gap:3px}.hw-value{border-bottom:1px dashed var(--line);padding:4px 0;display:grid;grid-template-columns:118px minmax(0,1fr);gap:10px}.hw-value span:first-child{color:var(--muted)}.hw-value span:last-child{font:11.5px/1.7 var(--f-mono);overflow-wrap:anywhere}.hw-stalls{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:8px 0}.hw-stalls label{cursor:pointer}.hw-topology{display:flex;gap:5px;flex-wrap:wrap;padding:12px;border:1px solid var(--line);border-radius:8px;margin-bottom:10px;background:var(--surface2)}.hw-topology button{border:1px solid var(--line);border-radius:6px;padding:6px 8px;background:var(--surface);color:var(--ink);font:11.5px var(--f-body);cursor:pointer}.hw-topology button[aria-pressed=true]{border-color:var(--en);outline:1px solid var(--en)}.hw-topology .hw-arrow{color:var(--muted);align-self:center}.hw-path{display:flex;gap:8px;align-items:center;min-width:780px;padding:16px}.hw-node{flex:1;min-width:90px;border:2px solid var(--line);border-radius:9px;padding:11px 10px;line-height:1.5;text-align:center;background:var(--surface2)}.hw-node b{display:block;font-size:12px}.hw-node span{display:block;font-size:10px;color:var(--muted)}.hw-path-scroll{overflow:auto;border:1px solid var(--line);border-radius:8px}.hw-mem{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}.hw-bank{border:1px solid var(--line);padding:9px 12px;border-radius:8px;background:var(--surface2)}.hw-bank.active{border-color:var(--en);box-shadow:inset 0 0 0 1px var(--en)}.hw-bank .mono{font-size:11.5px;overflow-wrap:anywhere}.hw-source{font-size:11px;color:var(--muted);overflow-wrap:anywhere;margin:7px 0}.hw-accounting{border-top:1px solid var(--line);padding-top:12px;margin-top:14px}.hw-summary{font-weight:600;margin:8px 0}.hw-panel details{margin:10px 0}.hw-panel summary{cursor:pointer}.hw-panel button:focus-visible,.hw-panel canvas:focus-visible{outline:2px solid var(--en);outline-offset:2px}.hw-warning{color:var(--bad)}#hd-stall-state{font-size:11px;color:var(--bad)}@media(max-width:800px){.hw-grid{grid-template-columns:1fr}.hw-value{grid-template-columns:100px 1fr}.hw-mem{grid-template-columns:1fr}.hw-panel .tagline{white-space:normal}.hw-panel .lab-title{align-items:flex-start}}`;
    document.head.appendChild(s);
  }
  let selectedLayer = layers[0], tab = 'path', scheduleId = null;
  function diagram(l) {
    const p=HW.pal(), nodes=l.datapath || [];
    if (!nodes.length) return '<p>本模块的端口与操作见逐状态调度；未用推测补画没有报告依据的运算单元。</p>';
    return '<div class="hw-path-scroll"><div class="hw-path">'+nodes.map((n,i)=>`${i?'<span aria-hidden="true">→</span>':''}<div class="hw-node" style="border-color:${color(n.kind||n.binding,p)}"><b>${E(n.label||n.name)}</b><span>${num(n.bits)} 位 · ${E(bind(n.kind||n.binding))}</span><span>${E(n.note||'')}</span></div>`).join('')+'</div></div><p class="small">橙色 DSP；绿色 LUT/FF；蓝色 RAM/FIFO；黄色控制；灰色连线。框图是报告与源码结构归纳，实际绑定逐项见「运算绑定」。</p>';
  }

  /* ---------------------------------------------------------------- schedule diagram ("内部调度")
   * Columns are the report's states / pipeline stages, rows are functional lanes, chips are the operations HLS scheduled there
   * (colour = how the operation was bound). Below it, a pipeline-overlap grid shows which loop iteration sits in which stage on
   * each cycle. The chips come from K.micro; the overlap grid is the definition of II/depth, not a simulated waveform. */
  const OPCN = {load:'读',store:'写',mul:'乘',add:'加',icmp:'比较',select:'选择',zext:'位宽扩展',sext:'符号扩展',trunc:'截位',bitselect:'取位',partselect:'取位段',read:'FIFO 读',write:'FIFO 写',bitconcatenate:'拼位',regslice:'寄存切片',sub:'减'};
  const LIFCN = {65:'输入×尺度',64:'取 FIFO 输入',69:'读 V',70:'读 V',73:'V>θ',74:'V>θ → r',77:'β×V',78:'+舍入',79:'>>12',82:'+ x_q',88:'r×θ',89:'+舍入',90:'>>12',91:'base − sub',99:'V>θ',100:'V>θ → 脉冲',103:'写回 V',104:'写回 V',107:'脉冲入 FIFO',53:'选 bank'};
  const LIFCAP = {64:'取输入',65:'输入×尺度',69:'读 V',73:'比较 θ',74:'比较 θ',77:'β 泄漏',78:'β 泄漏',79:'β 泄漏',82:'加输入',88:'复位项',89:'复位项',90:'复位项',91:'相减',100:'发放判定',103:'写回 V',104:'写回 V',107:'输出脉冲',53:'选 bank'};
  const GEN = [['mem','存储 / FIFO'],['dsp','DSP 乘加'],['logic','LUT 逻辑：加减、比较、选择'],['wire','连线、位选择'],['ctl','控制寄存器']];
  const genLane = o => ({memory:'mem',fifo:'mem',DSP:'dsp',unresolved:'dsp',logic:'logic',wire:'wire',unknown:'wire',control:'ctl'}[o.binding] || 'logic');
  const bvar = b => b === 'DSP' ? '--en' : b === 'memory' || b === 'fifo' ? '--sig' : b === 'control' ? '--gold' : b === 'wire' || b === 'unresolved' || b === 'unknown' ? '--muted' : '--mwi';
  const chipLabel = (o, lif) => o.binding === 'control' && (o.opcode === 'load' || o.opcode === 'store') ? (lif ? (o.opcode === 'load' ? '读计数器' : '更新计数器') : (o.opcode === 'load' ? '读寄存器' : '写寄存器')) : lif ? (o.group === 'address-mac' ? '算地址' : LIFCN[o.sourceLine] || OPCN[o.opcode] || o.opcode) : (OPCN[o.opcode] || o.opcode);
  const clip = (t, n) => { let w = 0, out = ''; for (const ch of String(t)) { w += ch.charCodeAt(0) > 255 ? 2 : 1; if (w > n) return out + '…'; out += ch; } return out; };
  let schedStage = 0, schedCycle = 0, schedPlayer = null, schedModule = null;
  function chipsFor(st, lane, lif) {
    const ids = lif ? ((st.lanes || {})[lane] || []) : null, ops = lif ? ids.map(i => (st.ops || [])[i]).filter(Boolean) : (st.ops || []).filter(o => genLane(o) === lane), g = new Map();
    ops.forEach(o => { const lab = chipLabel(o, lif), k = lab + '|' + (o.binding || ''); const e = g.get(k) || { lab, bind: o.binding, n: 0, ops: [] }; e.n += o.count || 1; e.ops.push(o); g.set(k, e); });
    return Array.from(g.values());
  }
  function stageCaption(st, lif) {
    if (!lif) { const dsp = (st.ops || []).filter(o => o.binding === 'DSP').length, mem = (st.ops || []).filter(o => o.binding === 'memory' || o.binding === 'fifo').length; return [`${(st.ops || []).reduce((a, o) => a + (o.count || 1), 0)} 项操作`, dsp ? `DSP ${dsp}` : mem ? `存储 ${mem}` : '']; }
    const caps = []; (st.ops || []).forEach(o => { const c = o.group === 'address-mac' ? '算地址' : LIFCAP[o.sourceLine]; if (c && !caps.includes(c)) caps.push(c); }); return caps.slice(0, 3);
  }
  function schedSvg(m, lif) {
    const ss = stages(m), D = ss.length, lanes = lif ? laneNames.map(l => ({ key: l[0], label: l[1] })) : GEN.map(l => ({ key: l[0], label: l[1] })), pipe = m.kind === 'pipeline';
    const cw = lif ? 104 : 98, LW = 150, HH = 84, CAP = 5, ch = 17, gap = 3;
    const cells = ss.map(st => lanes.map(l => chipsFor(st, l.key, lif)));
    const laneH = lanes.map((l, li) => Math.max(1, Math.min(CAP + 1, Math.max(...cells.map(c => c[li].length)))) * (ch + gap) + 10);
    const lanesY = []; let y = HH; laneH.forEach(h => { lanesY.push(y); y += h; });
    const gridTop = y + 26, n = D + 3, rows = Math.min(n, 14), start = Math.max(0, Math.min(schedCycle - 6, n - rows)), RH = 15, H = pipe ? gridTop + 24 + rows * RH + 8 : y + 8, W = LW + D * cw + 12;
    const occ = s => !pipe || (schedCycle - s >= 0 && schedCycle - s < (m.trip || 1e9)), css = v => `var(${v})`;
    let o = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${E(m.module)} 的内部调度图：${D} 个${pipe ? '流水阶段' : '控制状态'}" style="font-family:var(--f-body);display:block">`;
    // lane bands + labels
    lanes.forEach((l, li) => { o += `<rect x="${LW}" y="${lanesY[li]}" width="${D * cw}" height="${laneH[li] - 2}" fill="var(--surface2)" rx="4"/><text x="${LW - 10}" y="${lanesY[li] + 18}" text-anchor="end" font-size="11.5" fill="var(--ink2)">${E(l.label)}</text>`; });
    ss.forEach((st, s) => {
      const x = LW + s * cw, on = occ(s), cap = stageCaption(st, lif);
      o += `<g opacity="${on ? 1 : .35}"><text x="${x + cw / 2}" y="16" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)">S${E(st.state)}</text><text x="${x + cw / 2}" y="31" text-anchor="middle" font-size="10" fill="var(--muted)">${pipe ? '阶段 ' + E(st.index) : '控制状态'}</text>`;
      cap.forEach((c, k) => { if (c) o += `<text x="${x + cw / 2}" y="${46 + k * 12}" text-anchor="middle" font-size="10" fill="var(--ink2)">${E(clip(c, 14))}</text>`; });
      lanes.forEach((l, li) => {
        const cs = cells[s][li]; cs.slice(0, CAP).forEach((c, k) => {
          const cy = lanesY[li] + 6 + k * (ch + gap), v = css(bvar(c.bind)), tip = c.ops.map(q => `${opName(q)} · ${q.opcode} · ${bind(q.binding)} · 位宽 ${q.width == null ? '—' : q.width} · C++ 行 ${q.sourceLine == null ? '—' : q.sourceLine}`).join('\n');
          o += `<g><title>${E(tip)}</title><rect x="${x + 4}" y="${cy}" width="${cw - 9}" height="${ch}" rx="4" fill="color-mix(in srgb, ${v} 24%, var(--surface))" stroke="${v}" stroke-width="1"/><text x="${x + 9}" y="${cy + 12.5}" font-size="10.5" fill="var(--ink)">${E(clip(c.lab, Math.round((cw - 24) / 6.2)))}${c.n > 1 ? ' ×' + c.n : ''}</text></g>`;
        });
        if (cs.length > CAP) { const cy = lanesY[li] + 6 + CAP * (ch + gap); o += `<text x="${x + cw / 2}" y="${cy + 12}" text-anchor="middle" font-size="10" fill="var(--muted)">另 ${cs.length - CAP} 类</text>`; }
      });
      o += '</g>';
      o += `<rect class="hs-col" data-s="${s}" x="${x}" y="2" width="${cw - 1}" height="${y - 2}" fill="transparent" tabindex="0" role="button" aria-label="状态 S${E(st.state)}，查看这一级的全部操作" style="cursor:pointer"/>`;
      if (s === schedStage) o += `<rect x="${x + .5}" y="1" width="${cw - 2}" height="${y}" fill="none" stroke="var(--en)" stroke-width="2" rx="5" pointer-events="none"/>`;
    });
    if (pipe) {
      o += `<text x="8" y="${gridTop - 8}" font-size="12" font-weight="600" fill="var(--ink)">每一拍，每一级里是哪个迭代（II=${num(m.ii)}：每拍进一个新的，深度 ${D}：同时最多 ${D} 个在途）</text>`;
      o += `<text x="${LW - 10}" y="${gridTop + 12}" text-anchor="end" font-size="10.5" fill="var(--muted)">拍 ↓ 　阶段 →</text>`;
      for (let r = 0; r < rows; r++) {
        const c = start + r, yy = gridTop + 18 + r * RH, now = c === schedCycle;
        o += `<text x="${LW - 10}" y="${yy + 11}" text-anchor="end" font-size="10.5" fill="${now ? 'var(--en)' : 'var(--muted)'}" font-weight="${now ? 700 : 400}">第 ${c} 拍</text>`;
        if (now) o += `<rect x="${LW - 2}" y="${yy - 1}" width="${D * cw + 4}" height="${RH}" fill="none" stroke="var(--en)" stroke-width="1.5" rx="3"/>`;
        for (let s2 = 0; s2 < D; s2++) {
          const it = c - s2, ok = it >= 0 && it < (m.trip || 1e9), x = LW + s2 * cw, first = it === 0 || (it === schedCycle - s2 && false);
          o += `<rect x="${x + 1}" y="${yy}" width="${cw - 2}" height="${RH - 2}" rx="3" fill="${ok ? `color-mix(in srgb, var(--${it % 2 ? 'tree' : 'sig'}) ${now ? 38 : 20}%, var(--surface))` : 'transparent'}" stroke="${ok ? 'var(--line)' : 'transparent'}" stroke-width=".6"/>`;
          if (ok) o += `<text x="${x + cw / 2}" y="${yy + 10.5}" text-anchor="middle" font-size="9.5" fill="var(--ink)">迭代 ${it}</text>`;
        }
      }
      o += `<text x="${LW}" y="${H - 1}" font-size="10" fill="var(--muted)">${start > 0 ? '（显示第 ' + start + ' 拍起的 ' + rows + ' 拍）' : ''}</text>`;
    }
    return o + '</svg>';
  }
  function drawSched() {
    const m = schedModule, host = $('hs-sched-fig'); if (!m || !host) return;
    const lif = !!m.sourceWidths; host.innerHTML = schedSvg(m, lif);
    host.querySelectorAll('.hs-col').forEach(r => { const pick = () => { schedStage = +r.dataset.s; drawSched(); const rr = host.querySelector(`.hs-col[data-s="${schedStage}"]`); if (rr) rr.focus({ preventScroll: true }); }; r.addEventListener('click', pick); r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); schedStage = lim(schedStage + (e.key === 'ArrowRight' ? 1 : -1), 0, stages(m).length - 1); drawSched(); const rr = host.querySelector(`.hs-col[data-s="${schedStage}"]`); if (rr) rr.focus({ preventScroll: true }); } }); });
    const st = stages(m)[schedStage] || stages(m)[0];
    $('hs-stage-detail').innerHTML = st ? `<div class="hw-summary">所选：状态 S${num(st.state)} · ${m.kind === 'pipeline' ? '流水阶段 ' + num(st.index) : '控制状态'} · ${(st.ops || []).reduce((a, o) => a + (o.count || 1), 0)} 项操作（点上面的列切换，或用左右方向键）</div>` + opTable(st) : '';
  }
  function mountSchedule(m) {
    schedModule = m; if (schedPlayer) { schedPlayer.stop(); schedPlayer = null; }
    schedStage = lim(schedStage, 0, Math.max(0, stages(m).length - 1)); schedCycle = 0;
    if (m.kind === 'pipeline') schedPlayer = A.Player($('hs-sched-player'), { n: stages(m).length + 3, fps: 3, label: i => `第 ${i} 拍：第 0 级进入迭代 ${i}`, onFrame: i => { schedCycle = i; drawSched(); } });
    else { $('hs-sched-player').innerHTML = ''; drawSched(); }
  }
  const lifNote = m => m.sourceWidths ? '读图：S 是报告里的状态，横向是迭代经过的阶段。LIF 的操作按功能分成四行：地址与 bank 控制、膜电位存储、输入尺度与复位路径、β 泄漏 / 积分 / 阈值 / 写回。从左到右依次是：算地址、读膜电位、算泄漏和相加、比较阈值并写回 V 和输出 FIFO。' : '';

  /* ---------------------------------------------------------------- resource picture ("资源与存储"):
   * HLS estimate vs routed, as a share of the whole xc7z020, and every memory drawn as its bank grid. */
  const DEV = { DSP: 220, BRAM: 280, LUT: 53200, FF: 106400 };
  (function () { const st = document.createElement('style'); st.textContent = '.hw-rrow{display:grid;grid-template-columns:54px minmax(0,1fr) minmax(190px,auto);gap:10px;align-items:center;margin:7px 0;font-size:12px}.hw-rbars{display:grid;gap:3px}.hw-rbar{height:11px;border-radius:3px;min-width:2px}.hw-rbar.h{background:color-mix(in srgb,var(--muted) 55%,var(--surface))}.hw-rbar.r{background:var(--sig)}.hw-rv{font:11.5px var(--f-mono);color:var(--ink2)}.hw-banks{display:flex;flex-wrap:wrap;gap:2px;margin:6px 0 2px}.hw-banks i{display:block;width:9px;height:9px;border-radius:2px;background:color-mix(in srgb,var(--sig) 60%,var(--surface));border:1px solid var(--sig)}.hw-mem{margin:10px 0;font-size:12px}.hw-mem b{font-weight:600}'; document.head.appendChild(st); })();
  function resFigure(l) {
    const g = (r, k) => r ? (r[k] == null ? r[k.toLowerCase()] : r[k]) : null, pct = (v, k) => v == null ? '—' : (v / DEV[k] * 100).toFixed(v / DEV[k] < .01 ? 2 : 1) + '%';
    let h = '<div class="hw-resfig"><h4>占整块 xc7z020 的比例</h4>' + ['DSP', 'BRAM', 'LUT', 'FF'].map(k => {
      const a = g(l.hls, k), b = g(l.routed, k), w = v => v == null ? 0 : Math.max(.4, v / DEV[k] * 100);
      return `<div class="hw-rrow"><b>${k === 'BRAM' ? 'BRAM18K' : k}</b><div class="hw-rbars"><div class="hw-rbar h" style="width:${w(a)}%"></div><div class="hw-rbar r" style="width:${w(b)}%"></div></div><span class="hw-rv">HLS ${num(a)}（${pct(a, k)}） · 布线后 ${num(b)}（${pct(b, k)}）</span></div>`;
    }).join('') + '<p class="small">灰条 = HLS 综合预估，蓝条 = 布局布线后；条长是占整块器件（DSP 220、BRAM18K 280、LUT 53,200、FF 106,400）的比例。共享模块和膜电位 RAM 的归属见下面的说明。</p>';
    const stores = (l.storage || []).concat((l.fifoIds || []).map(id => (H.fifos || []).find(f => f.name === id)).filter(Boolean)).filter(q => q.name !== 'Total');
    if (stores.length) h += '<h4>存储：每块 RAM 画一个小方块</h4>' + stores.map(s => { const banks = s.banks || 1, kb = banks * s.words * s.bits / 1024; return `<div class="hw-mem"><b>${E(s.name)}</b> · ${banks} 块 × ${num(s.words)} 字 × ${num(s.bits)} 位 = ${kb.toFixed(kb < 10 ? 1 : 0)} Kb，BRAM18K ${num(s.BRAM == null ? s.bram : s.BRAM)}<div class="hw-banks" aria-hidden="true">${'<i></i>'.repeat(Math.min(banks, 128))}</div>${banks > 128 ? '<span class="small">（只画前 128 块）</span>' : ''}</div>`; }).join('');
    return h + '</div>';
  }
  function selectLayer(key) {
    selectedLayer=layers.find(l=>l.key===key)||layers[0]; scheduleId=null; $('hs-layer').value=selectedLayer.key;
    $('hs-topology').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.key===selectedLayer.key)));
    renderLayer();
  }
  function renderLayer() {
    const l=selectedLayer, ms=micros(l), islif=!!l.lif, notes=(l.notes||[]).map(v=>'<li>'+E(v)+'</li>').join('');
    $('hs-to-lif').hidden=!islif;
    $('hs-meta').innerHTML=`<b>${E(l.label)} ${E(shape(l))}</b> · ${E(l.kind)}；${E((l.modules||[]).join(' / '))}<div class="hw-source">${sources(l.sources)}</div>`;
    let html='';
    if(tab==='path') html=diagram(l)+(notes?'<ul>'+notes+'</ul>':'');
    else if(tab==='ops') {
      const rows=[];
      ms.forEach(m=>stages(m).forEach(st=>(st.ops||[]).forEach(o=>rows.push([E(m.module),num(st.state),...opRows({ops:[o]})[0]]))));
      html='<p>报告中同一运算可能跨多个状态出现，表内次数不等于物理运算单元或 DSP 数。源码位宽与综合收窄位宽分开看；DSP 数使用资源报告。</p>'+table(['模块','状态','变量 / 操作','算子','源码语义位宽','报告位宽 / 操作数','绑定','core / 融合','次数','C++行','证据'],rows);
    } else if(tab==='schedule') {
      const m=M[scheduleId]||ms[0];
      html='<label class="hw-pick">内部模块<select id="hs-module" aria-label="选择内部调度模块">'+ms.map(x=>`<option value="${E(x.module)}" ${m===x?'selected':''}>${E(x.module)}</option>`).join('')+'</select></label>';
      if(m) html+=`<p><b>${m.kind==='pipeline'?'流水循环':'控制状态机 / 非流水模块'}</b>；II=${num(m.ii)}，深度=${num(m.depth)}，迭代数=${num(m.trip)}，报告延迟=${num(m.latency)}。${m.kind==='pipeline'?'II 表示启动间隔，深度表示迭代经过的阶段；排空与调用开销另计。':'这里的状态按控制条件转移，不能当成固定 II=1 的迭代重叠。'}</p>`+`<div class="legendrow" style="margin:8px 0"><span><i style="background:var(--en)"></i>DSP</span><span><i style="background:var(--sig)"></i>存储 / FIFO</span><span><i style="background:var(--mwi)"></i>LUT 逻辑</span><span><i style="background:var(--gold)"></i>控制寄存器</span><span><i style="background:var(--muted)"></i>连线 / 待核</span></div><div id="hs-sched-player"></div><div class="hw-path-scroll" id="hs-sched-fig" style="overflow:auto;border:1px solid var(--line);border-radius:8px;padding:6px;background:var(--surface)"></div><p class="small">每个色块是 HLS 在这一级里调度的一类操作（鼠标悬停看每个操作的算子、位宽、C++ 行号）；颜色表示它被绑定到什么硬件。${lifNote(m)}</p><div id="hs-stage-detail"></div><details><summary>展开：全部状态的文字明细（和上图同一份报告数据）</summary>`+stages(m).map(st=>`<details><summary>状态 S${num(st.state)} · ${m.kind==='pipeline'?'阶段 '+num(st.index):'控制状态'} · ${(st.ops||[]).reduce((a,o)=>a+(o.count||1),0)} 项操作</summary>${opTable(st)}</details>`).join('')+'</details>'+(m.transitions&&m.transitions.length?table(['控制状态','报告中的后继状态'],m.transitions.map(v=>['S'+num(v[0]),E(v[1].map(q=>'S'+q).join(' / '))])):'')+`<p class="hw-source">${sources(m.sources)}</p>`;
      else html+='<p>控制逻辑来自顶层源码；未保存单独的固定流水阶段。</p>';
    } else html=resFigure(l)+table(['口径','DSP','BRAM18K','LUT','FF'],[resRow('HLS 预估',l.hls),resRow('布局布线后',l.routed)])+`<p>${l.sharedWith?'共享于 '+E(Array.isArray(l.sharedWith)?l.sharedWith.join(' / '):l.sharedWith)+'；此行只为逻辑使用视图，不重复加到全网总数。':''}${islif?'膜电位 RAM 归父模块 forward_4，不能从 LIF 自身 BRAM=0 推断没有存储。':''}${l.routed&&l.routed.missingModules&&l.routed.missingModules.length?'<br>实现报告未单独列出的模块：'+E(l.routed.missingModules.join(' / '))+'；此行仅汇总可见层级，未列出不等于硬件为0。':''}</p>`+storageTable(l)+`<p class="hw-source">实现证据：${sources(l.routed&&l.routed.sources)}</p>`+(notes?'<ul>'+notes+'</ul>':'');
    $('hs-content').innerHTML=html;
    if(tab==='schedule'){const mm=M[scheduleId]||ms[0]; if(mm&&$('hs-sched-fig')) mountSchedule(mm);}
    if($('hs-module')) $('hs-module').addEventListener('change',()=>{scheduleId=$('hs-module').value;renderLayer();});
  }
  let life=lifs[0], res=null, time, ch, pos, player=null, cyc=0, focusStage=0, recursing=false, historyKey='';
  function param(l) { return String(l.lif.paramKey).split('.').reduce((o,k)=>o[k],A.PARAMS); }
  function key(l) { return l.lif.traceKey || l.flowKey || l.key; }
  function stage(l) { return l.stage || (A.flow.nodes[l.flowKey||key(l)] || {}).st || (/^(m_|lif4|fc1|fc2)/.test(key(l))?2:1); }
  function micro(l) { return micros(l).find(m=>m.kind==='pipeline')||micros(l)[0]; }
  const lSize=l=>l.lif.channels*l.lif.length;
  const paused=()=>$('hd-empty').checked||$('hd-full').checked;
  function traceValues(index, selectedTime) {
    const t=selectedTime==null?time.get():selectedTime, st=stage(life), ss=st===1?res.steps:res.stage2, s=ss[t], k=key(life), p=param(life);
    if(!s || !s[k]) return null;
    const flow=life.flowKey||k, explanation=A.inspector.cell(flow,st,t,index,res,A.S.beat), bank=t%2?'V1':'V0';
    const prev=t?ss[t-1][k+'.state'][bank][index]:0;
    const inputKey={lif1:'bn1',lif2:'bn2',lif3:'bn3',bin_lif:'bin_fc',m_lif1:'m_fc1',m_lif2:'m_fc2'}[k];
    const x=s[inputKey][index], beta=lim(p.beta,0,4096), w=KM.prim.wrap24, xq=w(x*p.scale), pb=prev*beta, pbRound=pb+(pb>=0?2048:-2048), leak=w(Math.floor(pbRound/4096)), base=w(leak+xq), reset=prev>p.theta?4096:0, pr=reset*p.theta, prRound=pr+(pr>=0?2048:-2048), sub=w(Math.floor(prRound/4096)), next=w(base-sub);
    return {x,prev,bank,xq,pb,pbRound,leak,base,reset,sub,next,spike:s[k][index],explanation,save:s[k+'.state'][bank][index]};
  }
  function chooseLife(k) {
    life=lifs.find(l=>l.key===k)||lifs[0]; $('hd-layer').value=life.key;
    ch.set(0,0,life.lif.channels-1); pos.set(0,0,life.lif.length-1); cyc=0; focusStage=0;
    if(player) {player.stop(); player.setN(lSize(life)+(micro(life).depth||stages(micro(life)).length));}
    updateLife();
  }
  function updateLife() {
    res=A.run(A.S.beat); const m=micro(life), p=param(life), st=stage(life), has=(st===1?res.steps:res.stage2).length>0;
    $('hd-meta').innerHTML=`<b>${E(life.label)}</b> · ${E(shape(life))}；${E(m.module)}；深度 ${num(m.depth)}，II=${num(m.ii)}；HLS DSP ${num(life.hls.DSP)} / 布线后 ${num(life.routed&&life.routed.DSP)}。<br>算法 t=${time.get()}，同 bank 接 t−2；硬件周期从本次循环启动计。`+(!has?'<br><span class="hw-warning">门控判正常，此心拍没有执行四分类 LIF，没有用 0 冒充结果。</span> <button class="btn" id="hd-abnormal">选一个执行四分类的心拍</button>':'');
    if($('hd-abnormal')) $('hd-abnormal').onclick=()=>{const i=A.BEATS.findIndex(b=>b.top[0]===1);if(i>=0)A.setBeat(i);};
    const flow=life.flowKey||key(life), v=A.inspector.verification(flow,st,time.get(),res,A.S.beat);
    $('hd-tensor').disabled=!has;
    const ri=p.theta>=0?p.theta:p.theta-1;
    $('hd-notes').innerHTML=`<b>比其它层更需要注意的整数语义</b><ul><li>Q12 负数先减2048再算术右移，向负无穷取整：即使 β 被夹为4096，Vprev=−1 时，(${4096}×−1−2048)&gt;&gt;12=−2。不是恒等保持。</li><li>延迟复位用同 bank 旧值的严格比较 Vprev&gt;θ；输出脉冲再用更新后 Vnext&gt;θ。相等时不发放。</li><li>θ=${p.theta}，rprev 为0或4096；复位路径 Q12 舍入后，触发时实际 sub=${ri}${p.theta<0?'（负阈值使 sub=θ−1，扣除负数会增加膜电位）':''}。${p.theta<0?'其中 θ=−41/−136 对应增加42/137，不能把复位扣除项直接写成θ。':''}</li><li>x×尺度、泄漏项、累加与保存均在源码指定位置 wrap24，范围 −8388608…8388607；脉冲虽只有0/1，层间仍通过8位 FIFO 运输。</li><li>同一批通道、位置依次流过少量共享运算单元；流水寄存器保存不同 token 的中间值。${lSize(life)} 个神经元不需要 ${lSize(life)} 套 DSP。</li></ul><div class="hw-source">整数参照：${E(v.note)}；${v.ok===true?'与保存 C++ 摘要一致 ✓':v.ok===false?'参照不同 ✗':has?'没有该张量逐层摘要':'未执行，不比较'}。${sources(life.sources)}</div>`;
    drawLife(); showValues(); drawMemory();
  }
  function drawMemory() {
    const t=time.get(), active=t%2?'V1':'V0', storage=life.storage||[], vals=traceValues(ch.get()*life.lif.length+pos.get());
    $('hd-memory').innerHTML=['V0','V1'].map((bank,b)=>{
      const s=storage.find(v=>v.name.endsWith(bank))||storage[b]||storage[0]||{}, grouped=(s.banks||1)>1, divisor=grouped?s.banks:1, before=vals?(bank===active?vals.prev:res[(stage(life)===1?'steps':'stage2')][t][key(life)+'.state'][bank][ch.get()*life.lif.length+pos.get()]):null;
      return `<div class="hw-bank ${bank===active?'active':''}"><b>${bank} · ${bank===active?'本次读、写同一 bank':'本次保持；下一次调用选择'}</b><div class="mono">${lSize(life)} × 24位；${num((s.BRAM==null?s.bram:s.BRAM)/divisor)} BRAM18K / ${num((s.FF==null?s.ff:s.FF)/divisor)} FF（每 bank）；owner=${E(s.owner||'forward_4')}<br>读 ${num(s.readLatency==null?1:s.readLatency)} 拍，读/写端口 ${s.ports?E(JSON.stringify(s.ports)):'1R1W'}；地址=${ch.get()*life.lif.length+pos.get()}<br>状态链：${b?'1 → 3 → 5 → 7 → 9':'0 → 2 → 4 → 6 → 8'}<br>${bank===active?`旧值 ${num(before)} → 写回 ${num(vals&&vals.next)}；写使能跟随有效 token`:`所选地址保持 ${num(before)}`}</div><div class="hw-source">${sources(s.sources)}</div></div>`;
    }).join('');
  }
  function showValues() {
    const i=ch.get()*life.lif.length+pos.get(), v=traceValues(i), m=micro(life), st=stages(m)[focusStage]||stages(m)[0];
    $('hd-values').innerHTML=v?`<div class="hw-summary">t=${time.get()} · 通道 ${ch.get()} · 位置 ${pos.get()} · 下标 ${i} · spike=${v.spike} · V保存=${v.save} ${v.explanation.matches&&v.save===v.next?'重算一致 ✓':'✗'}</div><div class="hw-values">`+v.explanation.rows.map(r=>`<div class="hw-value"><span>${E(r[0])}</span><span>${E(r[1])}</span></div>`).join('')+'</div>':'<p>当前心拍未执行此层；选择执行四分类的心拍后再查看。</p>';
    $('hd-ops').innerHTML=st?`<div class="hw-summary">报告状态 S${st.state} · 流水阶段 ${st.index}（点击泳道列切换）</div>${opTable(st)}<p class="small">“报告位宽”是调度后的运算宽度，iN列保留报告表达式里的操作数宽度。源码膜电位24位、乘积40位、脉冲8位。地址乘加与输入/复位乘加可能融合为一个 DSP；常量 β=4096 是移位路径，scale=20 可以变成移位加法。流水寄存器 FF 将各 token 的地址、输入与中间膜电位对齐；比较器和选择器主要是 LUT 逻辑。具体绑定使用此实例的 core、RTL 和资源表。</p>`:'<p>未保存此模块调度。</p>';
    const hk=[A.S.beat,life.key,i,time.get()].join('|');
    if(hk!==historyKey){historyKey=hk;$('hd-history').innerHTML=table(['算法时间步','bank / 来自','输入INT8','旧膜电位','β舍入后','Q12输入','复位扣除','保存膜电位','spike'],Array.from({length:10},(_,t)=>{
      const q=traceValues(i,t);return [`<button class="btn" data-time="${t}" aria-pressed="${t===time.get()}">t=${t}</button>`,`${t%2?'V1':'V0'} / ${t<2?'初值0':'t='+(t-2)}`,...(q?[q.x,q.prev,q.leak,q.xq,q.sub,q.next,q.spike].map(num):Array(7).fill('未执行'))];
    }));$('hd-history').querySelectorAll('button[data-time]').forEach(b=>b.onclick=()=>{time.set(+b.dataset.time);player.stop();updateLife();});}
  }
  function drawLife() {
    const cv=$('hd-cv'), {c,w,h}=HW.setupCanvas(cv), p=HW.pal(), m=micro(life), ss=stages(m), depth=m.depth||ss.length, lx=180, top=62, rowH=88, cw=(w-lx-18)/depth, selected=ch.get()*life.lif.length+pos.get();
    c.fillStyle=p.surface2;c.fillRect(0,0,w,h); const values=new Map();
    HW.txt(c,`局部硬件周期 ${cyc} · ${paused()?'教学停顿，token 冻结':'每拍启动一个神经元位置'} · t=${time.get()}`,12,21,p.ink,12,'left',p.body);
    HW.txt(c,'S 是报告状态；列为迭代经过的阶段；每列同时属于不同的 token。',12,41,p.muted,11,'left',p.body);
    laneNames.forEach(([lk,label,col],li)=>{const yy=top+li*rowH;HW.txt(c,label,lx-10,yy+35,p.ink,11,'right',p.body);c.fillStyle=HW.alpha(p[col],.06);c.fillRect(lx,yy,w-lx-18,rowH-2);});
    for(let s=0;s<depth;s++){
      const st=ss[s], x=lx+s*cw, token=cyc-s, valid=token>=0&&token<lSize(life), v=valid?traceValues(token):null;
      if(v) values.set(token,v);
      HW.txt(c,st?'S'+st.state:'阶段'+s,x+cw/2,top-9,p.muted,11,'center');
      laneNames.forEach(([lk,label,col],li)=>{
        const yy=top+li*rowH, ids=st&&st.lanes&&st.lanes[lk]||[], ops=ids.map(id=>(st.ops||[])[id]).filter(Boolean);
        c.strokeStyle=p.line;c.lineWidth=.7;c.strokeRect(x,yy,cw-1,rowH-2);
        if(!ops.length) return;
        c.fillStyle=HW.alpha(p[col],valid?.28:.07);c.fillRect(x+2,yy+2,cw-5,rowH-6);
        if(valid&&token===selected){c.strokeStyle=p.bad;c.lineWidth=2;c.strokeRect(x+2,yy+2,cw-5,rowH-6);}
        const names=Array.from(new Set(ops.map(o=>o.opcode))).join('/');
        HW.txt(c,names.length>17?names.slice(0,16)+'…':names,x+cw/2,yy+16,p.ink2,9.5,'center');
        HW.txt(c,valid?`c${Math.floor(token/life.lif.length)},p${token%life.lif.length}`:'—',x+cw/2,yy+34,valid?p.ink:p.muted,10,'center');
        if(v){const vv=li===0?`addr ${token} / ${v.bank}`:li===1?`旧 V=${v.prev}`:li===2?`x=${v.x} r=${v.reset}`:`新 V=${v.next} s=${v.spike}`;HW.txt(c,vv.length>22?vv.slice(0,21)+'…':vv,x+cw/2,yy+52,p.ink,8.8,'center');}
        const dsp=ops.filter(o=>o.binding==='DSP').length;
        HW.txt(c,dsp?`DSP绑定 ${dsp}项`:'逻辑 / 存储 / 连线',x+cw/2,yy+72,dsp?p.en:p.muted,8.5,'center');
      });
      if(s===focusStage){c.strokeStyle=p.en;c.lineWidth=2;c.strokeRect(x,top-22,cw-1,rowH*4+20);}
    }
    const active=Array.from(values.keys());
    HW.txt(c,'红框＝所选神经元；整数是该 token 的完整算法结果，阶段栏列出该拍真实 HLS 操作。',12,h-20,p.muted,11,'left',p.body);
    $('hd-active').textContent=`硬件周期 ${cyc}：${active.length} 个 token 在流水内。`+(active.length?active.map(i=>`(${Math.floor(i/life.lif.length)},${i%life.lif.length})`).join('、'):'尚未填充或已排空。')+`　所选神经元下标 ${selected} 在周期 ${selected} 启动，在 ${selected+depth-1} 到达末级；t 保持 ${time.get()}。`;
    cv._hwGeometry={lx,cw,depth,top,rowH};cv.setAttribute('aria-label',`LIF四泳道，硬件周期${cyc}，算法t=${time.get()}，选中通道${ch.get()}位置${pos.get()}。方向键切换阶段；Home End到首末级。`);
  }
  function init() {
    style();
    $('hs-layer').innerHTML=layers.map(l=>`<option value="${E(l.key)}">${E(l.label)}</option>`).join('');
    const topoRow=(label,keys)=>`<div style="flex-basis:100%;font-weight:600;margin-top:8px">${label}</div>`+keys.map((k,i)=>{const l=layers.find(q=>q.key===k);return l?`${i?'<span class="hw-arrow" aria-hidden="true">→</span>':''}<button data-key="${E(l.key)}" aria-pressed="false">${E(l.label)}</button>`:'';}).join('');
    $('hs-topology').innerHTML=topoRow('共享主干：每个 t 重放输入，再写缓存',network.slice(0,15).map(l=>l.key))+topoRow('二分类路径：pool3 → QI480+RR₁ → 门控',network.slice(15,19).map(l=>l.key))+topoRow('门控异常才执行：从 body_cache[t] 读取 → QI480+RR₂ → 四分类',network.slice(19).map(l=>l.key))+topoRow('全网控制与物理共享资源（单独查询）',controls.map(l=>l.key));
    $('hs-topology').onclick=e=>{const b=e.target.closest('button[data-key]');if(b)selectLayer(b.dataset.key);};
    $('hs-layer').onchange=()=>selectLayer($('hs-layer').value);
    HW.seg($('hs-tabs'),v=>{tab=v;renderLayer();});
    $('hs-to-lif').onclick=()=>{chooseLife(selectedLayer.key);$('hd-root').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});$('hd-layer').focus({preventScroll:true});};
    $('hs-shared').innerHTML='<b>共享硬件单独计数：</b>BN1/2/3 调用同一个重量化模块（2 DSP）；Conv2/3 的重量化共用另一模块（2 DSP）；QI480 由二分类路径与四分类路径分时调用（0 DSP）。<br><span class="small">主干 pool3 → 写 body_cache → 二分类；门控异常 → 读同一缓存第 t 步 → QI480 → 四分类。两条逻辑路径画出两次使用，物理资源只计一次。</span>';
    $('hs-accounting').innerHTML='<b>两种报告口径分别闭合</b>'+table(['口径','层内 / 可见模块','主干 LIF 复位地址','共享重量化','顶层合计'],[['HLS DSP','220','3','4','227'],['布线后 DSP','207，另有13未细分','层级报告未单独细分','层级报告未单独细分','220']])+'<p class="small">HLS 各层和不是布线后各层和。实现层级中尚有13个DSP无法从现有报告细分；保留未细分，不按227−220的差值编造消除原因。FC484→128：130→98；Conv2：31→42；Conv3：30→40。<span class="src rpt">HLS / 布线后层级利用率</span></p>';
    if($('res-note'))$('res-note').innerHTML='HLS DSP：层内220 + 主干 LIF 复位地址3 + 共享 BN 重量化2 + 共享 Conv2/3 重量化2 = 227。膜电位存储、缓存和 FIFO 归父模块。布线后220 DSP，需使用单独的实现表，不能混用预估数。';
    $('hd-layer').innerHTML=lifs.map(l=>`<option value="${E(l.key)}">${E(l.label)} · ${E(shape(l))}</option>`).join('');
    A.beatSelect($('hd-beat'));
    time=A.ctrlRange($('hd-ctrls'),'hd-time','算法时间步 t',0,9,0,1);
    ch=A.ctrlRange($('hd-ctrls'),'hd-channel','神经元通道',0,life.lif.channels-1,0,1);
    pos=A.ctrlRange($('hd-ctrls'),'hd-position','神经元位置',0,life.lif.length-1,0,1);
    $('hd-layer').onchange=()=>chooseLife($('hd-layer').value);
    time.inp.addEventListener('input',()=>{player.stop();updateLife();});
    [ch,pos].forEach(ctrl=>ctrl.inp.addEventListener('input',()=>{player.stop();if(!paused())player.set(ctrl===ch?ch.get()*life.lif.length+pos.get():ch.get()*life.lif.length+pos.get());updateLife();}));
    $('hd-tensor').onclick=e=>{A.inspector.open(life.flowKey||key(life),e.currentTarget);const q=A.inspector.getState(),i=ch.get()*life.lif.length+pos.get();q.t=time.get();q.row=Math.floor(i/q.cols);q.col=i%q.cols;A.inspector.render();$('ti-position').dispatchEvent(new Event('input',{bubbles:true}));};
    $('hd-compare').innerHTML=table(['LIF实例','shape','流水深度','II','HLS DSP','布线后DSP','膜电位归属'],lifs.map(l=>[E(l.label),E(shape(l)),num(micro(l).depth),num(micro(l).ii),num(l.hls.DSP),num(l.routed&&l.routed.DSP),'forward_4，V0/V1 两份24位']));
    res=A.run(A.S.beat);
    player=A.Player($('hd-player'),{n:lSize(life)+(micro(life).depth||stages(micro(life)).length),fps:5,label:i=>`局部硬件周期 ${i} · 算法 t=${time.get()}`,onFrame:i=>{
      if(recursing)return;
      if(paused()&&player&&i!==cyc){player.stop();recursing=true;player.set(cyc);recursing=false;return;}
      cyc=i;drawLife();showValues();
    }});
    ['hd-empty','hd-full'].forEach(id=>$(id).onchange=()=>{if(paused())player.stop();$('hd-stall-state').textContent=paused()?`教学CE=0：${$('hd-empty').checked?'in_empty_n=0 ':''}${$('hd-full').checked?'out_full_n=0':''}；token 与硬件周期冻结`:'教学CE=1：手动播放继续';drawLife();});
    const cv=$('hd-cv');cv.addEventListener('click',e=>{const r=cv.getBoundingClientRect(),g=cv._hwGeometry;if(!g)return;const s=Math.floor(((e.clientX-r.left)*cv.clientWidth/r.width-g.lx)/g.cw);focusStage=lim(s,0,g.depth-1);showValues();drawLife();cv.focus({preventScroll:true});});
    cv.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const d=micro(life).depth;focusStage=e.key==='Home'?0:e.key==='End'?d-1:lim(focusStage+(e.key==='ArrowRight'?1:-1),0,d-1);showValues();drawLife();});
    A.onBeat(()=>{player.stop();updateLife();});
    HW.onRedraw(()=>{renderLayer();drawLife();});
    selectLayer(layers[0].key);updateLife();
    A.hardware={selectLayer,chooseLife,traceValues,drawLife,updateLife,state:()=>({layer:selectedLayer.key,lif:life.key,tab,time:time.get(),channel:ch.get(),position:pos.get(),cycle:cyc,focusStage,paused:paused()}),getPlayer:()=>player};
  }
  A.guard('hardwareExplorer',init);
})();
