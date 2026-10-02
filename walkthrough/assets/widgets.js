/* HW — reusable widgets for HLS/RTL walkthrough pages.  No dependencies, works from file://.
 *
 *   HW.setupCanvas / pal / alpha / txt / line         drawing helpers (theme-aware, HiDPI)
 *   HW.onRedraw / redrawAll                           re-render everything on resize / theme switch
 *   HW.nav()                                          build side rail + chip nav from <section class="step" data-sec="...">
 *   HW.themeButton(btn)                               light/dark toggle
 *   HW.verify(el, got, golden, label)                 "model == golden" badge (the single most important trust signal)
 *   HW.Scope(cfg)                                     multi-lane time-series scope with envelope decimation + cursor
 *   HW.PipelineGantt(cfg)                             overlapped-iteration schedule, resource lanes, dependence arrows
 *   HW.RecurrenceModel(cfg)                           II = max(recurrence chains), sliders + presets + bars
 *   HW.StateCards(cfg)                                multi-cycle block expanded into per-state cards
 *   HW.ResourceBars(cfg) / HW.Table(el,h,rows)        per-module LUT/FF/BRAM/DSP bars; operator inventory tables
 * See SKILL.md / references/page-design.md for when to use which.
 */
const HW = (function () {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const hex32 = v => '0x' + ((v >>> 0).toString(16).padStart(8, '0'));
  const redrawers = [];
  const onRedraw = f => { redrawers.push(f); };
  const redrawAll = () => redrawers.forEach(f => { try { f(); } catch (e) { console.error(e); } });

  function setupCanvas(cv) {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); return { c, w, h };
  }
  const pal = () => ({ sig: cssv('--sig'), en: cssv('--en'), mwi: cssv('--mwi'), bad: cssv('--bad'), tree: cssv('--tree'), thr: cssv('--thr'), gold: cssv('--gold'),
    ink: cssv('--ink'), ink2: cssv('--ink2'), muted: cssv('--muted'), line: cssv('--line'), grid: cssv('--grid'), surface: cssv('--surface'), surface2: cssv('--surface2'),
    mono: cssv('--f-mono'), body: cssv('--f-body') });
  const alpha = (col, a) => { if (col[0] === '#') { const n = parseInt(col.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; } return col; };
  function line(c, x0, y0, x1, y1, col, w = 1, dash) { c.beginPath(); c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash || []); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.setLineDash([]); }
  function txt(c, s, x, y, col, size = 11, align = 'left', font) { c.fillStyle = col; c.font = `${size}px ${font || cssv('--f-mono')}`; c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillText(s, x, y); }
  function seg(id, cb) { const el = typeof id === 'string' ? $('#' + id) : id; el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $$('button', el).forEach(x => x.setAttribute('aria-pressed', x === b)); cb(b.dataset.v, b); }); }
  const tag = (kind, text) => `<span class="src ${{ src: '', rpt: 'rpt', pap: 'pap', der: 'der', ill: 'ill' }[kind] || ''}">${text || { src: '源码', rpt: '报告', pap: '论文', der: '推导', ill: '示意' }[kind]}</span>`;

  function nav() {
    const secs = $$('section.step'), rail = $('#railnav'), chip = $('#chipnav');
    secs.forEach((s, i) => { const no = String(i + 1).padStart(2, '0'); [rail, chip].forEach(box => { if (!box) return; const a = document.createElement('a'); a.href = '#' + s.id; a.innerHTML = `<span>${no}</span>${s.dataset.sec}`; box.appendChild(a); }); });
    const links = $$('#railnav a, #chipnav a');
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id)); }), { rootMargin: '-30% 0px -60% 0px' });
    secs.forEach(s => io.observe(s));
    let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(redrawAll, 80); });
  }
  function themeButton(btn) {
    btn.onclick = () => { const r = document.documentElement; const cur = r.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); r.dataset.theme = cur === 'dark' ? 'light' : 'dark'; redrawAll(); };
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redrawAll);
  }
  /** got / golden: arrays of numbers. Adds class ok|no to `el` and fills the label span (#id-t or el.querySelector('span')). */
  function verify(el, got, golden, label) {
    let bad = 0; for (let i = 0; i < Math.max(got.length, golden.length); i++) if (got[i] !== golden[i]) bad++;
    const span = el.querySelector('span') || el; const ok = bad === 0 && got.length === golden.length;
    el.classList.add(ok ? 'ok' : 'no'); span.textContent = ok ? `${label}：${got.length}/${golden.length} 个值与 cosim golden 逐个相同` : `${label}：与 golden 不一致（${bad} 处差异，长度 ${got.length} vs ${golden.length}）`;
    return ok;
  }

  /* ---------------------------------------------------------------- Scope */
  /** cfg: { canvas, n, lanes:[{key,label,color:'sig|en|mwi|bad|tree', get:(i)=>v, fixed:[lo,hi]|null, zero:true, fill:true}],
   *         win:500, markers:[{at,label}], onCursor:(i)=>{} }   returns {draw,setWindow,setCursor,state} */
  function Scope(cfg) {
    const cv = typeof cfg.canvas === 'string' ? $('#' + cfg.canvas) : cfg.canvas;
    const S = { t0: cfg.t0 || 0, win: cfg.win || 500, cur: cfg.cursor ?? 0 };
    const niceStep = (span, px, minPx) => { for (const s of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]) if (s / span * px >= minPx) return s; return 10000; };
    function draw() {
      const { c, w, h } = setupCanvas(cv), P = pal(); const lx = 62, rx = w - 12, top = 6, axH = 34; const L = cfg.lanes; const lh = (h - top - axH) / L.length;
      const i1 = Math.min(cfg.n - 1, S.t0 + S.win - 1); const X = i => lx + (i - S.t0) / (S.win - 1) * (rx - lx); cv._map = { lx, rx };
      L.forEach((ln, li) => {
        const y0 = top + li * lh + 4, y1 = top + (li + 1) * lh - 4, col = P[ln.color || 'sig'];
        if (li % 2 === 0) { c.fillStyle = alpha(P.ink, .025); c.fillRect(lx, top + li * lh, rx - lx, lh); }
        let lo, hi; if (ln.fixed) [lo, hi] = ln.fixed; else { let mn = 1e18, mx = -1e18; for (let i = S.t0; i <= i1; i++) { const v = ln.get(i); if (v < mn) mn = v; if (v > mx) mx = v; } const pad = (mx - mn) * .1 + 1e-9; lo = ln.zero ? Math.min(0, mn) : mn - pad; hi = mx + pad; }
        const Y = v => y1 - (v - lo) / (hi - lo) * (y1 - y0); ln._Y = Y;
        for (let g = 0; g <= 2; g++) { const v = lo + (hi - lo) * g / 2, yy = Y(v); line(c, lx, yy, rx, yy, P.grid, 1, g === 1 ? [2, 4] : []); txt(c, Math.abs(v) >= 100 ? fmt(v) : v.toFixed(2), lx - 6, yy + (g === 0 ? 0 : g === 2 ? 8 : 4), P.muted, 9.5, 'right'); }
        const spp = S.win / (rx - lx); c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 1.5;
        if (spp > 1.6) { const tp = [], bt = []; for (let px = Math.ceil(lx); px <= rx; px++) { const a = S.t0 + Math.floor((px - lx) / (rx - lx) * (S.win - 1)), b = Math.min(i1, S.t0 + Math.floor((px + 1 - lx) / (rx - lx) * (S.win - 1))); let mn = 1e18, mx = -1e18; for (let i = a; i <= Math.max(a, b); i++) { const v = ln.get(i); if (v < mn) mn = v; if (v > mx) mx = v; } tp.push([px, Y(mx)]); bt.push([px, Y(mn)]); }
          c.beginPath(); c.moveTo(tp[0][0], tp[0][1]); tp.forEach(p => c.lineTo(p[0], p[1])); for (let k = bt.length - 1; k >= 0; k--) c.lineTo(bt[k][0], bt[k][1]); c.closePath(); c.globalAlpha = .85; c.fill(); c.globalAlpha = 1; }
        else { c.beginPath(); let st = false; for (let i = S.t0; i <= i1; i++) { const px = X(i), py = Y(ln.get(i)); if (!st) { c.moveTo(px, py); st = true; } else c.lineTo(px, py); } c.stroke(); }
        c.fillStyle = col; c.fillRect(lx + 6, y0 + 2, 8, 8); txt(c, ln.label, lx + 19, y0 + 10, P.ink2, 10.5, 'left', P.body);
        line(c, lx, top + (li + 1) * lh, rx, top + (li + 1) * lh, P.line, 1);
      });
      (cfg.markers || []).forEach(m => { if (m.at >= S.t0 && m.at <= i1) { const px = X(m.at); line(c, px, top, px, h - axH + 4, alpha(P.mwi, .5), 1, [3, 3]); } });
      const ay = h - axH + 4; line(c, lx, ay, rx, ay, P.ink2, 1); const st = niceStep(S.win, rx - lx, 54);
      for (let i = Math.ceil(S.t0 / st) * st; i <= i1; i += st) { const px = X(i); line(c, px, ay, px, ay + 4, P.ink2, 1); txt(c, String(i), px, ay + 16, P.muted, 9.5, 'center'); if (cfg.fs) txt(c, (i / cfg.fs).toFixed(2) + ' s', px, ay + 27, P.muted, 9, 'center'); }
      if (S.cur >= S.t0 && S.cur <= i1) { const px = X(S.cur); line(c, px, top, px, ay, alpha(P.ink, .55), 1.2, [4, 3]); L.forEach(ln => { const v = ln.get(S.cur), py = ln._Y(v); c.fillStyle = P[ln.color || 'sig']; c.beginPath(); c.arc(px, py, 3.8, 0, 7); c.fill(); }); }
    }
    const pick = ev => { const r = cv.getBoundingClientRect(), m = cv._map; const px = (ev.clientX - r.left) / r.width * cv.clientWidth; S.cur = clamp(S.t0 + Math.round((px - m.lx) / (m.rx - m.lx) * (S.win - 1)), 0, cfg.n - 1); draw(); cfg.onCursor && cfg.onCursor(S.cur); };
    cv.addEventListener('pointerdown', e => { pick(e); const mv = pick, up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); });
    onRedraw(draw); draw();
    return { draw, state: S, setWindow(t0, win) { S.t0 = clamp(t0, 0, Math.max(0, cfg.n - (win || S.win))); if (win) S.win = win; draw(); }, setCursor(i) { S.cur = i; draw(); cfg.onCursor && cfg.onCursor(i); } };
  }

  /* ---------------------------------------------------------------- PipelineGantt */
  /** cfg: { canvas, ii, ops:[{name,start,len,color:'sig|...', dashed, resource:'tree'|null}],
   *         iterations:[-1,0,1,2], deps:[{from:'op',to:'op',fromIter:0,toIter:1,label,kind:'true'|'conservative'}],
   *         resources:['tree', ...]   // lanes that show which iteration owns the resource, overlap => red
   *         onInfo:(cycle, active)=>html  , range:[-19,54] }
   *  returns {draw, setCursor, play(cyclesPerSec), stop, state} */
  function PipelineGantt(cfg) {
    const cv = typeof cfg.canvas === 'string' ? $('#' + cfg.canvas) : cfg.canvas; const II = cfg.ii; const its = cfg.iterations || [-1, 0, 1, 2];
    const S = { cyc: 0, timer: 0 }; const range = cfg.range || [-II, II * 3 - 3]; const ITC = ['thr', 'sig', 'tree', 'en'];
    const itCol = k => ITC[Math.max(0, Math.min(ITC.length - 1, its.indexOf(k)))];
    function draw() {
      const { c, w, h } = setupCanvas(cv), P = pal(); const lx = 210, rx = w - 16; const [c0, c1] = range; const X = cy => lx + (cy - c0) / (c1 - c0) * (rx - lx);
      const res = cfg.resources || []; const top = 44, resH = 28; const rowH = Math.max(14, (h - top - res.length * (resH + 12) - 50) / cfg.ops.length);
      for (let cy = Math.ceil(c0 / 5) * 5; cy <= c1; cy += 5) { line(c, X(cy), top - 4, X(cy), h - 40, P.grid, 1); txt(c, String(cy), X(cy), h - 26, P.muted, 9.5, 'center'); }
      its.filter(k => k >= 0).forEach(k => { const x = X(II * k); line(c, x, top - 10, x, h - 40, P[itCol(k)], 1.4, [5, 4]); txt(c, '迭代 ' + (k === 0 ? 'i' : 'i+' + k) + ' 启动', x + 4, top - 14, P[itCol(k)], 10.5, 'left', P.body); });
      [[0, II], [II, 2 * II]].forEach(([a, b]) => { if (b > c1) return; const y = top - 32; line(c, X(a), y, X(b), y, P.ink2, 1.4); line(c, X(a), y - 4, X(a), y + 4, P.ink2, 1.4); line(c, X(b), y - 4, X(b), y + 4, P.ink2, 1.4); txt(c, 'II = ' + II, (X(a) + X(b)) / 2, y - 5, P.ink, 11, 'center'); });
      const rowOf = {}; const active = [];
      cfg.ops.forEach((o, i) => { const y = top + i * rowH; rowOf[o.name] = i; if (i % 2 === 0) { c.fillStyle = alpha(P.ink, .03); c.fillRect(lx, y, rx - lx, rowH); } txt(c, o.name, lx - 8, y + rowH * .68, P.ink2, 10.5, 'right', P.body);
        its.forEach(k => { const off = II * k, x0 = X(o.start + off), x1 = X(o.start + o.len + off); if (x1 < lx || x0 > rx) return; const on = S.cyc >= o.start + off && S.cyc < o.start + o.len + off; if (on) active.push({ iter: k, op: o.name });
          const col = P[o.color && k === 0 ? o.color : itCol(k)]; c.fillStyle = alpha(col, on ? .95 : k === 0 ? .62 : .3); c.fillRect(Math.max(lx, x0), y + 2, Math.min(rx, x1) - Math.max(lx, x0) - 1, rowH - 4);
          if (o.dashed) { c.strokeStyle = alpha(P.ink, .5); c.lineWidth = 1; c.setLineDash([3, 2]); c.strokeRect(Math.max(lx, x0), y + 2, Math.min(rx, x1) - Math.max(lx, x0) - 1, rowH - 4); c.setLineDash([]); }
          if (x1 - x0 > 16) txt(c, k === 0 ? 'i' : k < 0 ? 'i' + k : 'i+' + k, (x0 + x1) / 2 - 1, y + rowH * .68, on ? '#fff' : P.ink, 9.5, 'center', P.body); }); });
      // resource lanes
      let ly = top + cfg.ops.length * rowH + 14; const conflicts = [];
      res.forEach(rn => { txt(c, '资源：' + rn, lx - 8, ly + resH * .66, P.ink, 11, 'right', P.body); c.fillStyle = alpha(P.tree, .05); c.fillRect(lx, ly - 3, rx - lx, resH + 6); const segs = [];
        cfg.ops.filter(o => o.resource === rn).forEach(o => its.forEach(k => segs.push({ a: o.start + II * k, b: o.start + o.len + II * k, k, name: o.name })));
        segs.forEach(s => { const x0 = X(s.a), x1 = X(s.b); if (x1 < lx || x0 > rx) return; const hit = segs.some(t => t !== s && t.a < s.b && s.a < t.b); if (hit) conflicts.push(s); c.fillStyle = hit ? P.bad : alpha(P[itCol(s.k)], S.cyc >= s.a && S.cyc < s.b ? .95 : .6); c.fillRect(Math.max(lx, x0), ly, Math.min(rx, x1) - Math.max(lx, x0) - 1, resH); if (x1 - x0 > 20) txt(c, s.name.split(/[ (（]/)[0], (x0 + x1) / 2, ly + resH * .66, '#fff', 10, 'center', P.body); });
        ly += resH + 12; });
      // dependence arrows
      (cfg.deps || []).forEach(d => { const a = cfg.ops[rowOf[d.from]], b = cfg.ops[rowOf[d.to]]; if (!a || !b) return; const xa = X(a.start + a.len + II * (d.fromIter || 0)), xb = X(b.start + II * (d.toIter ?? 1)); const ya = top + rowOf[d.from] * rowH + rowH / 2, yb = top + rowOf[d.to] * rowH + rowH / 2; const col = d.kind === 'true' ? P.bad : P.gold;
        c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1.8; c.beginPath(); c.moveTo(xa, ya); c.bezierCurveTo(xa + 18, ya, xb - 18, yb, xb, yb); c.stroke(); c.beginPath(); c.moveTo(xb, yb); c.lineTo(xb - 8, yb - 4); c.lineTo(xb - 8, yb + 4); c.closePath(); c.fill(); if (d.label) txt(c, d.label + (d.kind === 'true' ? '（真依赖）' : '（保守依赖）'), (xa + xb) / 2 + 10, (ya + yb) / 2 - 4, col, 10, 'left', P.body); });
      const cx = X(S.cyc + .5); line(c, cx, top - 10, cx, h - 40, P.bad, 2); txt(c, '周期 ' + S.cyc, cx + 4, h - 10, P.bad, 11);
      if (cfg.onInfo) cfg.onInfo(S.cyc, active, conflicts);
    }
    const api = { draw, state: S, setCursor(c) { S.cyc = Math.max(0, Math.min(cfg.range ? cfg.range[1] : 3 * II, Math.round(c))); draw(); },
      play(cps = 6) { api.stop(); S.timer = setInterval(() => { S.cyc = (S.cyc + 1) % ((cfg.range ? cfg.range[1] : 3 * II) + 1); draw(); }, 1000 / cps); }, stop() { clearInterval(S.timer); S.timer = 0; } };
    onRedraw(draw); draw(); return api;
  }

  /* ---------------------------------------------------------------- RecurrenceModel */
  /** cfg: { container, chains:[{name, kind:'true|conservative', segments:[{name,lat,min,max}]}], presets:{label:{"chain/segment":lat,...}}, onChange:(ii,chains)=>{} }
   *  II = max over chains of ceil(sum(lat)/distance). Renders one bar per chain, the binding chain is outlined. */
  function RecurrenceModel(cfg) {
    const root = typeof cfg.container === 'string' ? $('#' + cfg.container) : cfg.container; const base = JSON.parse(JSON.stringify(cfg.chains));
    root.innerHTML = `<div class="lab-bar" data-role="pre"></div><div class="ctrls" data-role="sl"></div><canvas style="width:100%;height:${cfg.height || 40 + base.length * 52}px;display:block;border:1px solid var(--line);border-radius:10px;background:var(--surface2)"></canvas><div class="eq" data-role="eq" style="margin-top:10px"></div>`;
    const cv = $('canvas', root), sl = $('[data-role=sl]', root), eq = $('[data-role=eq]', root), pre = $('[data-role=pre]', root); const inputs = {};
    base.forEach(ch => ch.segments.forEach(s => { const id = ch.name + '/' + s.name; const lab = document.createElement('label'); lab.className = 'ctrl'; lab.innerHTML = `<span>${ch.name} · ${s.name}</span><output>${s.lat}</output><input type="range" min="${s.min ?? 0}" max="${s.max ?? Math.max(12, s.lat * 2)}" step="1" value="${s.lat}">`; const inp = $('input', lab), out = $('output', lab); inp.addEventListener('input', () => { out.textContent = inp.value; draw(); }); inputs[id] = { inp, out }; sl.appendChild(lab); }));
    function set(map) { Object.entries(map).forEach(([k, v]) => { if (inputs[k]) { inputs[k].inp.value = v; inputs[k].out.textContent = v; } }); draw(); }
    if (cfg.presets) { const sg = document.createElement('div'); sg.className = 'seg'; Object.keys(cfg.presets).forEach((k, i) => { const b = document.createElement('button'); b.textContent = k; b.dataset.v = k; b.setAttribute('aria-pressed', i === 0); sg.appendChild(b); }); pre.appendChild(sg); seg(sg, k => set(cfg.presets[k])); }
    function current() { return base.map(ch => ({ ...ch, segments: ch.segments.map(s => ({ ...s, lat: +inputs[ch.name + '/' + s.name].inp.value })) })); }
    function draw() {
      const chains = current(); const { c, w, h } = setupCanvas(cv), P = pal(); const tot = chains.map(ch => ch.segments.reduce((a, s) => a + s.lat, 0) / (ch.distance || 1)); const II = Math.max(...tot.map(Math.ceil)); const lx = 170, rx = w - 70; const span = Math.max(24, II + 6); const X = v => lx + v / span * (rx - lx);
      const COL = ['tree', 'sig', 'mwi', 'en', 'gold', 'bad'];
      chains.forEach((ch, ci) => { const y = 14 + ci * 52; txt(c, ch.name + (ch.kind ? '（' + ch.kind + '）' : ''), lx - 8, y + 16, P.ink, 11, 'right', P.body); let x = 0; ch.segments.forEach((s, si) => { if (s.lat <= 0) return; c.fillStyle = alpha(P[COL[si % COL.length]], .75); c.fillRect(X(x), y, X(x + s.lat) - X(x) - 1, 24); if (X(x + s.lat) - X(x) > 28) txt(c, s.name + ' ' + s.lat, (X(x) + X(x + s.lat)) / 2, y + 16, '#fff', 10, 'center', P.body); x += s.lat; });
        const bind = Math.ceil(tot[ci]) === II; txt(c, Math.ceil(tot[ci]) + ' 拍', X(x) + 6, y + 16, bind ? P.bad : P.ink2, 11); if (bind) { c.strokeStyle = P.bad; c.lineWidth = 2; c.strokeRect(X(0) - 1, y - 1, X(x) - X(0) + 1, 26); } });
      line(c, X(II), 4, X(II), h - 4, P.bad, 1.2, [4, 3]);
      eq.innerHTML = chains.map((ch, i) => `${ch.name}：${ch.segments.map(s => s.lat).join(' + ')} = <b>${Math.ceil(tot[i])}</b>`).join('<br>') + `<br>II = max(…) = <b>${II}</b>`;
      cfg.onChange && cfg.onChange(II, chains);
    }
    onRedraw(draw); draw(); return { draw, set, ii: () => Math.max(...current().map(ch => Math.ceil(ch.segments.reduce((a, s) => a + s.lat, 0) / (ch.distance || 1)))) };
  }

  /* ---------------------------------------------------------------- StateCards */
  /** cfg: { container, cols, states:[{title, cycle, sub, ports, values, dashed, color}], braces:[{from,to,label,color}] } */
  function StateCards(cfg) {
    const root = typeof cfg.container === 'string' ? $('#' + cfg.container) : cfg.container; const n = cfg.cols || cfg.states.length;
    const card = o => `<div style="border:1px ${o.dashed ? 'dashed' : 'solid'} ${o.color || 'var(--line)'};border-radius:9px;background:var(--surface2);padding:8px 9px;min-width:0;font-size:12px;line-height:1.55"><div style="display:flex;justify-content:space-between;gap:6px"><b class="mono">${o.title}</b><span class="mono muted">${o.cycle ?? ''}</span></div><div style="font-weight:600;color:var(--ink2);margin:2px 0 4px">${o.sub || ''}</div><div class="mono muted" style="font-size:11px;margin-bottom:4px">${o.ports || ''}</div><div class="mono" style="font-size:11.5px;overflow-wrap:anywhere">${o.values || ''}</div></div>`;
    const br = (cfg.braces || []).map(b => `<div style="grid-column:${b.from} / ${b.to + 1};border-bottom:3px solid ${b.color};text-align:center;font-size:12px;font-weight:600;color:${b.color};padding-bottom:3px">${b.label}</div>`).join('');
    root.innerHTML = (br ? `<div style="display:grid;grid-template-columns:repeat(${n},minmax(0,1fr));gap:8px;margin-bottom:6px">${br}</div>` : '') + `<div style="display:grid;grid-template-columns:repeat(${n},minmax(0,1fr));gap:8px">${cfg.states.map(card).join('')}</div>`;
  }


  /* ---------------------------------------------------------------- ResourceBars / Table */
  /** cfg: { container, rows:[{name, LUT, FF, BRAM_18K, DSP}], metric:'LUT', metrics:['LUT','FF','BRAM_18K','DSP'], top:12 }
   *  Horizontal bars per module for the chosen metric; the switch above lets the reader pivot between LUT/FF/BRAM/DSP. */
  function ResourceBars(cfg) {
    const root = typeof cfg.container === 'string' ? $('#' + cfg.container) : cfg.container; const metrics = cfg.metrics || ['LUT', 'FF', 'BRAM_18K', 'DSP']; let m = cfg.metric || metrics[0];
    root.innerHTML = `<div class="seg" data-role="sg"></div><div data-role="bars" style="margin-top:10px;display:grid;gap:6px"></div>`;
    const sg = $('[data-role=sg]', root), bars = $('[data-role=bars]', root);
    metrics.forEach(k => { const b = document.createElement('button'); b.textContent = k; b.dataset.v = k; b.setAttribute('aria-pressed', k === m); sg.appendChild(b); });
    function draw() {
      const rows = cfg.rows.filter(r => (r[m] || 0) > 0).sort((a, b) => b[m] - a[m]).slice(0, cfg.top || 12); const mx = Math.max(1, ...rows.map(r => r[m]));
      bars.innerHTML = rows.length ? rows.map(r => `<div style="display:grid;grid-template-columns:minmax(120px,300px) 1fr 70px;gap:10px;align-items:center;font-size:12.5px"><span class="mono" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.name}">${r.name}</span><div style="height:14px;background:var(--surface2);border-radius:4px;overflow:hidden"><div style="height:100%;width:${(r[m] / mx * 100).toFixed(1)}%;background:var(--tree);opacity:.75"></div></div><b class="mono" style="text-align:right">${fmt(r[m])}</b></div>`).join('') : `<span class="muted">没有使用 ${m} 的模块（该指标为 0）</span>`;
    }
    seg(sg, v => { m = v; draw(); }); draw(); return { draw };
  }
  /** Table(container, headers[], rows[][]) — plain numeric-friendly table, first column left aligned. */
  function Table(container, headers, rows) {
    const root = typeof container === 'string' ? $('#' + container) : container;
    root.innerHTML = `<div class="tscroll"><table class="t"><tr>${headers.map((h, i) => `<th${i ? '' : ''}>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table></div>`;
  }

  return { $, $$, cssv, clamp, fmt, hex32, setupCanvas, pal, alpha, line, txt, seg, tag, nav, themeButton, verify, onRedraw, redrawAll, Scope, PipelineGantt, RecurrenceModel, StateCards, ResourceBars, Table };
})();
