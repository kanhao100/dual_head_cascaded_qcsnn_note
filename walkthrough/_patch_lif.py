# One-shot patch: insert the bucket animation into anim_c.js (kept for the record of what was changed).
p = "anim_c.js"
s = open(p, encoding="utf-8").read()

bucket = r'''
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
      if (ph === 1) return beta >= 4096 ? `漏水：β 被限制成 1.0（导出值 ${par.beta}，硬件里夹到 4096），<b>一点也不漏</b>，水位仍是 ${s.vBeta}。` : `漏水：水位乘以 β/4096 = ${beta}/4096 ≈ ${(beta / 4096).toFixed(2)}，只留下 <b>${s.vBeta}</b>。β 越小，漏得越快、记得越短。`;
      if (ph === 2) return s.xq === 0 ? `灌入：这一步输入为 0，水位不变，仍是 ${s.base}。` : `灌入：输入 x = ${s.x}，乘以尺度 ${par.scale}，得 x_q = ${s.xq}，${s.xq > 0 ? '灌进' : '<b>抽走</b>'} ${Math.abs(s.xq)}，水位到 <b>${s.base}</b>。`;
      if (ph === 3) return s.rPrev ? `延迟复位：扣掉上一次欠下的 θ（取整后是 ${s.sub}），水位降到 <b>${s.vNext}</b>。` : `上一次没发放，没有欠账，不用扣，水位仍是 <b>${s.vNext}</b>。`;
      return `判定：${s.vNext} ${s.spk ? '&gt;' : '≤'} θ = ${par.theta} → ` + (s.spk ? `<b style="color:var(--mwi)">发放一个脉冲</b>。水位不会立刻降，要等 V${b} 下一次被用到（第 ${t + 2} 步）才补扣 θ。` : `<b>不发放</b>。`) + ` 水位 ${s.vNext} 写回 V${b}。` + (par.theta < 0 && s.vNext > par.theta && s.vNext <= 0 ? ' θ 是负数，所以水位在 θ 与 0 之间也算越线。' : '');
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
      txt(c, '水位 = 膜电位（Q12，4096 = 1.0）', 8, 38, p.muted, 10.5, 'left', p.body);
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
      A.box(c, cx - 12, 30, 24, TT - 40, p.surface2, p.gold, 4); txt(c, `x_q = ${s.xq}`, cx + 18, 52, ph === 2 ? p.gold : p.muted, 11.5, 'left');
      if (ph === 2 && s.xq !== 0) drops(3, cx, TT - 8, ty(lvl) - 4, p.gold, s.xq < 0);
      if (ph === 2 && s.xq < 0) txt(c, '抽走', cx + 18, 68, p.gold, 11, 'left', p.body);
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
'''

marker = "    playerObj = A.Player($('#lf-player'),"
assert marker in s
s = s.replace(marker, bucket + marker, 1)

old = "playerObj = A.Player($('#lf-player'), { n: T, fps: 2, label: i => `时间步 t = ${i}（读写 V${i & 1}）`, onFrame: redraw });"
assert old in s
new = old.replace("onFrame: redraw });", "onFrame: i => { redraw(); if (!syncing && bkPlayer && Math.floor(bkPlayer.get() / 5) !== i) bkPlayer.set(i * 5); } });\n    bkPlayer = A.Player($('#lf-bk-player'), { n: T * 5, fps: 1.6, label: i => `第 ${Math.floor(i / 5)} 步 · ${PHN[i % 5]}`, onFrame: bkFrame });\n    $('#lf-more').addEventListener('toggle', redraw); $('#lf-bk-idl').addEventListener('change', bkDraw);")
s = s.replace(old, new, 1)

a = "      const Tr = traces(), t = playerObj ? playerObj.get() : 0; datapath(Tr, t); volt(Tr, t); map(Tr, t); info(Tr, t);\n    }"
assert a in s
s = s.replace(a, "      const Tr = traces(), t = playerObj ? playerObj.get() : 0; datapath(Tr, t); volt(Tr, t); map(Tr, t); info(Tr, t); if (bkPlayer) bkRefresh();\n    }", 1)
b = "if (off) { cvs.forEach("
assert b in s
s = s.replace(b, "if (off) { if (bkPlayer) bkDraw(); cvs.forEach(", 1)
open(p, "w", encoding="utf-8").write(s)
print("patched")
