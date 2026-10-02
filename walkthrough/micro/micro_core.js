/* Micro-architecture page: shared helpers (DOM, SVG, player, waveform viewer, tooltip). Globals: HW (widgets), MD (data). */
const MC = (function () {
  const { $, $$ } = HW;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => Number(n).toLocaleString('en-US');
  const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  /* kinds -> theme tokens (colour = how it is built) */
  const KIND = {
    dsp: { v: '--en', n: 'DSP48' }, bram: { v: '--sig', n: 'BRAM / 存储' }, lut: { v: '--mwi', n: 'LUT 逻辑' }, fifo: { v: '--tree', n: 'FIFO' },
    reg: { v: '--muted', n: '寄存器 / 计数器' }, ctrl: { v: '--gold', n: '控制' }, wire: { v: '--muted', n: '连线' },
  };
  const tokenFill = k => `color-mix(in srgb, var(${KIND[k].v}) 18%, var(--surface))`;
  const tokenLine = k => `var(${KIND[k].v})`;

  /* ---------------------------------------------------------------- tooltip */
  let tipEl = null;
  function tip(html, x, y) {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'mc-tip'; tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl); }
    if (html == null) { tipEl.style.display = 'none'; return; }
    tipEl.innerHTML = html; tipEl.style.display = 'block';
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight; tipEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, x + 14)) + 'px'; tipEl.style.top = Math.max(8, Math.min(innerHeight - h - 8, y + 14)) + 'px';
  }

  /* ---------------------------------------------------------------- player */
  function Player(host, cfg) {
    let n = cfg.n, i = 0, playing = false, raf = 0, last = 0, acc = 0, speed = 1;
    host.innerHTML = `<div class="lab-bar"><div class="transport">
      <button class="btn" data-a="first" aria-label="回到开头">⏮</button><button class="btn" data-a="prev">◀ 上一帧</button>
      <button class="btn primary" data-a="play" aria-label="播放或暂停">▶ 播放</button><button class="btn" data-a="next">下一帧 ▶</button></div>
      <div class="seg" data-sp role="group" aria-label="速度"><button data-v="0.25">0.25×</button><button data-v="1" aria-pressed="true">1×</button><button data-v="4">4×</button></div>
      <label class="ctrl" style="min-width:240px;flex:1 1 240px"><span data-l></span><output></output><input type="range" min="0" max="${Math.max(0, n - 1)}" value="0" step="1" aria-label="帧"></label></div>`;
    const btn = $('[data-a=play]', host), rng = $('input', host), out = $('output', host), lab = $('[data-l]', host);
    function render() { rng.value = i; out.textContent = `${i + 1} / ${n}`; lab.textContent = cfg.label ? cfg.label(i) : ''; cfg.onFrame(i); }
    function set(k) { i = Math.max(0, Math.min(n - 1, k)); render(); }
    function stop() { playing = false; cancelAnimationFrame(raf); btn.textContent = '▶ 播放'; }
    function tick(ts) { if (!playing) return; acc += (ts - last) / 1000 * (cfg.fps || 3) * speed; last = ts; const a = Math.floor(acc); if (a > 0) { acc -= a; if (i + a >= n - 1) { set(n - 1); stop(); return; } set(i + a); } raf = requestAnimationFrame(tick); }
    function play() { if (i >= n - 1) set(0); playing = true; btn.textContent = '⏸ 暂停'; last = performance.now(); acc = 0; raf = requestAnimationFrame(tick); }
    host.addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (!b) return; const a = b.dataset.a; if (a === 'play') playing ? stop() : play(); else { stop(); set(a === 'first' ? 0 : i + (a === 'next' ? 1 : -1)); } });
    HW.seg($('[data-sp]', host), v => { speed = +v; });
    rng.addEventListener('input', () => { stop(); set(+rng.value); });
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { if (!es[0].isIntersecting && playing) stop(); }).observe(host);
    render();
    return { set, get: () => i, stop, setN(m, keep) { n = m; rng.max = Math.max(0, n - 1); i = keep ? Math.min(i, n - 1) : 0; render(); } };
  }

  /* ---------------------------------------------------------------- SVG helpers */
  const A = o => Object.entries(o).map(([k, v]) => `${k}="${esc(v)}"`).join(' ');
  const T = (x, y, s, o) => { o = o || {}; return `<text x="${x}" y="${y}" font-size="${o.size || 11}" fill="${o.fill || 'var(--ink)'}" text-anchor="${o.anchor || 'start'}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.mono ? ' font-family="var(--f-mono)"' : ''}>${esc(s)}</text>`; };
  function arrowPath(pts, o) {
    o = o || {}; const d = pts.map((p, k) => (k ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' '), col = o.color || 'var(--muted)';
    const [x1, y1] = pts[pts.length - 1], [x0, y0] = pts[pts.length - 2], a = Math.atan2(y1 - y0, x1 - x0), s = 6;
    const hd = `M${x1} ${y1} L${x1 - s * Math.cos(a - .45)} ${y1 - s * Math.sin(a - .45)} L${x1 - s * Math.cos(a + .45)} ${y1 - s * Math.sin(a + .45)} Z`;
    return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${o.w || 1.4}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''} opacity="${o.opacity == null ? 1 : o.opacity}"/><path d="${hd}" fill="${col}" opacity="${o.opacity == null ? 1 : o.opacity}"/>`;
  }

  /* ---------------------------------------------------------------- waveform viewer (canvas) */
  /* rows: [{name, kind:'bit'|'bus', get(rec)->value|null, text(v)}], data: array of records, opts: {cell, onCursor, marks:[{cyc,label,color}], hilite(rec)->bool} */
  function Wave(host, rows, data, opts) {
    opts = opts || {}; const cell = opts.cell || 20, LW = 128, RH = 22, TOP = 26;
    host.classList.add('mc-wave'); host.innerHTML = '<div class="cv-scroll"><canvas></canvas></div><div class="info mc-wave-info" aria-live="polite"></div>';
    const cv = $('canvas', host), info = $('.mc-wave-info', host); let cursor = opts.cursor == null ? 0 : opts.cursor;
    function draw() {
      cv.style.width = (LW + data.length * cell + 12) + 'px'; cv.style.height = (TOP + rows.length * RH + 10) + 'px';
      const { c, w, h } = HW.setupCanvas(cv), p = HW.pal(); c.font = `11px ${p.mono}`;
      c.fillStyle = p.surface2; c.fillRect(0, 0, w, h);
      data.forEach((r, k) => { const x = LW + k * cell; if (opts.hilite && opts.hilite(r)) { c.fillStyle = HW.alpha(p.bad, .10); c.fillRect(x, TOP - 6, cell, rows.length * RH + 8); } if (k % 4 === 0) { c.fillStyle = p.muted; c.textAlign = 'left'; c.fillText(String(r.cyc), x + 2, 14); } c.strokeStyle = p.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(x + .5, TOP - 6); c.lineTo(x + .5, h - 4); c.stroke(); });
      (opts.marks || []).forEach(m => { const k = data.findIndex(r => r.cyc === m.cyc); if (k < 0) return; const x = LW + k * cell; c.strokeStyle = m.color || p.en; c.lineWidth = 1.5; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(x + .5, TOP - 6); c.lineTo(x + .5, h - 4); c.stroke(); c.setLineDash([]); c.fillStyle = m.color || p.en; c.textAlign = 'left'; c.fillText(m.label, x + 3, 24 - 12 + 0); });
      rows.forEach((row, ri) => {
        const y = TOP + ri * RH; c.fillStyle = p.ink2; c.textAlign = 'right'; c.fillText(row.name, LW - 8, y + 14);
        let prev = undefined;
        data.forEach((r, k) => {
          const x = LW + k * cell, v = row.get(r), unk = v == null || (typeof v === 'string' && /x/i.test(v));
          if (row.kind === 'bit') {
            const yy = unk ? y + 9 : (v ? y + 3 : y + 16); c.strokeStyle = unk ? p.bad : (row.color ? p[row.color] : p.sig); c.lineWidth = unk ? 1 : 1.8;
            if (unk) { c.setLineDash([2, 2]); } c.beginPath(); if (prev !== undefined && prev !== yy) { c.moveTo(x, prev); c.lineTo(x, yy); } else c.moveTo(x, yy); c.lineTo(x + cell, yy); c.stroke(); c.setLineDash([]); prev = yy;
          } else {
            const same = k > 0 && String(row.get(data[k - 1])) === String(v); c.strokeStyle = unk ? p.bad : p.muted; c.lineWidth = 1;
            if (!same) { c.fillStyle = unk ? HW.alpha(p.bad, .12) : HW.alpha(p[row.color || 'sig'], .12); let e = k; while (e + 1 < data.length && String(row.get(data[e + 1])) === String(v)) e++; const w2 = (e - k + 1) * cell - 2; c.fillRect(x + 1, y + 3, w2, 15); c.strokeRect(x + 1.5, y + 3.5, w2, 14); if (!unk && w2 > 22) { c.fillStyle = p.ink; c.textAlign = 'left'; const t = row.text ? row.text(v) : String(v); c.save(); c.beginPath(); c.rect(x + 2, y + 3, w2 - 2, 15); c.clip(); c.fillText(t, x + 4, y + 14.5); c.restore(); } else if (unk && w2 > 10) { c.fillStyle = p.bad; c.textAlign = 'left'; c.fillText('x', x + 4, y + 14.5); } }
          }
        });
      });
      const x = LW + cursor * cell; c.strokeStyle = p.bad; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + cell / 2, TOP - 8); c.lineTo(x + cell / 2, h - 3); c.stroke();
      const r = data[cursor]; if (r) info.innerHTML = `<b>周期 ${r.cyc}</b>　` + rows.map(rw => { const v = rw.get(r); return `<span class="mc-sig">${esc(rw.name)}=<b>${v == null ? 'x' : esc(rw.text && typeof v !== 'string' ? rw.text(v) : v)}</b></span>`; }).join(' ');
    }
    function setCursor(k) { cursor = Math.max(0, Math.min(data.length - 1, k)); draw(); if (opts.onCursor) opts.onCursor(cursor, data[cursor]); }
    cv.addEventListener('pointermove', e => { const b = cv.getBoundingClientRect(); const k = Math.floor((e.clientX - b.left - LW) / cell); if (k >= 0 && k < data.length && k !== cursor) setCursor(k); });
    cv.addEventListener('click', e => { const b = cv.getBoundingClientRect(); const k = Math.floor((e.clientX - b.left - LW) / cell); if (k >= 0 && k < data.length) setCursor(k); });
    cv.tabIndex = 0; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', opts.label || '波形');
    cv.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { e.preventDefault(); setCursor(cursor + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); setCursor(cursor - 1); } });
    HW.onRedraw(draw); draw();
    return { setCursor, draw, get: () => cursor };
  }

  /* ---------------------------------------------------------------- tiny table */
  function table(host, heads, rows, cls) {
    host.innerHTML = `<div class="tscroll"><table class="t ${cls || ''}"><tr>${heads.map(h => `<th class="l">${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td class="l">${c}</td>`).join('')}</tr>`).join('')}</table></div>`;
  }
  function guard(name, f) { try { f(); } catch (e) { console.error('[' + name + ']', e); } }
  const num = v => v == null ? '—' : fmt(v);
  const tr = (tr, k, f) => (tr || []).map(r => r[k]);
  return { $, $$, esc, fmt, num, KIND, tokenFill, tokenLine, tip, Player, A, T, arrowPath, Wave, table, guard, reduce };
})();
