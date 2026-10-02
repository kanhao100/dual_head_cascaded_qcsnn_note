# One-shot patch: turn the "内部调度" tab of the hardware map from a folded text list into a diagram.
p = "hardware_page.js"
s = open(p, encoding="utf-8").read()

new_code = r'''
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
  const chipLabel = (o, lif) => lif ? (o.group === 'address-mac' ? '算地址' : LIFCN[o.sourceLine] || OPCN[o.opcode] || o.opcode) : (OPCN[o.opcode] || o.opcode);
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
'''

# 1. insert the new code before renderLayer
marker = "  function selectLayer(key) {"
assert marker in s
s = s.replace(marker, new_code + marker, 1)

# 2. replace the folded list in the schedule tab
old = "+stages(m).map(st=>`<details><summary>状态 S${num(st.state)} · ${m.kind==='pipeline'?'阶段 '+num(st.index):'控制状态'} · ${(st.ops||[]).reduce((a,o)=>a+(o.count||1),0)} 项操作</summary>${opTable(st)}</details>`).join('')+(m.transitions"
assert old in s
new = "+`<div class=\"legendrow\" style=\"margin:8px 0\"><span><i style=\"background:var(--en)\"></i>DSP</span><span><i style=\"background:var(--sig)\"></i>存储 / FIFO</span><span><i style=\"background:var(--mwi)\"></i>LUT 逻辑</span><span><i style=\"background:var(--gold)\"></i>控制寄存器</span><span><i style=\"background:var(--muted)\"></i>连线 / 待核</span></div><div id=\"hs-sched-player\"></div><div class=\"hw-path-scroll\" id=\"hs-sched-fig\" style=\"overflow:auto;border:1px solid var(--line);border-radius:8px;padding:6px;background:var(--surface)\"></div><p class=\"small\">每个色块是 HLS 在这一级里调度的一类操作（鼠标悬停看每个操作的算子、位宽、C++ 行号）；颜色表示它被绑定到什么硬件。${lifNote(m)}</p><div id=\"hs-stage-detail\"></div><details><summary>展开：全部状态的文字明细（和上图同一份报告数据）</summary>`+stages(m).map(st=>`<details><summary>状态 S${num(st.state)} · ${m.kind==='pipeline'?'阶段 '+num(st.index):'控制状态'} · ${(st.ops||[]).reduce((a,o)=>a+(o.count||1),0)} 项操作</summary>${opTable(st)}</details>`).join('')+'</details>'+(m.transitions"
s = s.replace(old, new, 1)

# 3. mount after content set
old2 = "    $('hs-content').innerHTML=html;\n    if($('hs-module'))"
assert old2 in s
s = s.replace(old2, "    $('hs-content').innerHTML=html;\n    if(tab==='schedule'){const mm=M[scheduleId]||ms[0]; if(mm&&$('hs-sched-fig')) mountSchedule(mm);}\n    if($('hs-module'))", 1)

# 4. LIF note helper (before renderLayer; reuse insertion area)
helper = "  const lifNote = m => m.sourceWidths ? '读图：S 是报告里的状态，横向是迭代经过的阶段。LIF 的操作按功能分成四行：地址与 bank 控制、膜电位存储、输入尺度与复位路径、β 泄漏 / 积分 / 阈值 / 写回。从左到右依次是：算地址、读膜电位、算泄漏和相加、比较阈值并写回 V 和输出 FIFO。' : '';\n"
s = s.replace("  function selectLayer(key) {", helper + "  function selectLayer(key) {", 1)
open(p, "w", encoding="utf-8").write(s)
print("patched hardware_page.js")
