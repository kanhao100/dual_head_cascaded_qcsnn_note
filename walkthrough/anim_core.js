/* Shared pieces for the functional-model and animation sections.
 * Globals expected: HW (widgets), KM (kernel_model.js), PACK (pack.json).
 * AN.model is the bit-accurate model; every number the animations show is read from its traces. */
const AN = (function () {
  const { $, $$, pal, setupCanvas, txt, line, alpha, onRedraw, fmt } = HW;
  const CLS = ['正常 N', '室上性 S', '室性 V', '融合 F'], CLS1 = ['N', 'S', 'V', 'F'];
  const hex = v => (v >>> 0).toString(16).padStart(8, '0');

  // ------------------------------------------------------------------ decode the packed data
  const unb64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const i8 = s => { const u = unb64(s); return new Int8Array(u.buffer, u.byteOffset, u.length); };
  const f32 = s => { const u = unb64(s); return new Float32Array(u.buffer, u.byteOffset, u.length / 4); };
  const u32 = s => { const u = unb64(s); return new Uint32Array(u.buffer, u.byteOffset, u.length / 4); };
  const PARAMS = JSON.parse(JSON.stringify(PACK.params));
  PARAMS.blocks.forEach(b => { b.conv.weights = i8(b.conv.weights); });
  [PARAMS.bin.fc, PARAMS.multi.fc1, PARAMS.multi.fc2].forEach(f => { f.weights = i8(f.weights); });
  const BEATS = PACK.beats.map(b => Object.assign({}, b, { rowF: f32(b.row), wordsG: i8(b.words) }));
  const KEYS = PACK.keys.map(k => { const p = k.split('|'); return [+p[0], +p[1], p[2]]; });
  const GOLD = PACK.gold.map(g => ({ n: g.n, d: u32(g.d) }));
  const model = KM.create(PARAMS);

  // ------------------------------------------------------------------ model runs (small LRU; traces are large)
  const lru = [];
  function wordsOf(i) { return model.quantizeRow(Array.from(BEATS[i].rowF)); }
  function run(i, words) {
    if (!words) { const hit = lru.find(e => e.i === i); if (hit) return hit.res; }
    const res = model.run(words || wordsOf(i), { trace: true });
    if (!words) { lru.push({ i, res }); if (lru.length > 4) lru.shift(); }
    return res;
  }
  function getTensor(res, stage, step, tag) {
    if (tag === 'sums2') return Int32Array.from([res.sums2[0], res.sums2[1], res.pred2]);
    if (tag === 'sums4') return Int32Array.from([...res.sums4, res.pred4]);
    const m = /^(\w+?)(?:\.(V0|V1|bank))?$/.exec(tag), base = m[1], sub = m[2];
    const src = stage === 1 ? res.steps[step] : res.stage2[step];
    if (!src) return null;
    if (sub) { const st = src[base + '.state']; return sub === 'bank' ? Int32Array.from([st.bank]) : st[sub]; }
    return src[base];
  }
  function digestsOf(res, n) { const d = new Uint32Array(n); for (let j = 0; j < n; j++) { const k = KEYS[j], t = getTensor(res, k[0], k[1], k[2]); d[j] = t ? KM.digest(t) : 0xdeadbeef; } return d; }
  const finalClass = r => r.pred2 === 1 ? r.pred4 : 0;

  // External replay is added after the original 24-beat verification has run.
  // It has saved inputs and final C++ outputs, without per-layer digest sets.
  function importBeat(payload) {
    if (!payload || payload.schema !== 'qcsnn-error-beat-v1') throw new Error('回放心拍格式无效');
    if (typeof REPLAY_META === 'undefined' || payload.paramsId !== REPLAY_META.paramsId) throw new Error('误分类页与解读页的模型参数版本不同，请重新构建');
    if (!Number.isInteger(payload.id) || payload.id < 0 || payload.id > 1000000 ||
        !Number.isInteger(payload.label) || payload.label < 0 || payload.label > 3 ||
        !/^\d{3}$/.test(String(payload.record)) || !Number.isInteger(payload.center) ||
        payload.center < 0 || payload.center > 0xffffffff ||
        !Array.isArray(payload.row) || payload.row.length !== 184 || !payload.row.every(Number.isFinite) ||
        !Array.isArray(payload.words) || payload.words.length !== 188 ||
        !payload.words.every(v => Number.isInteger(v) && v >= -128 && v <= 127) ||
        !Array.isArray(payload.top) || payload.top.length !== 2 ||
        ![0, 1].includes(payload.top[0]) || ![0, 1, 2, 3].includes(payload.top[1]) ||
        (payload.top[0] === 0 && payload.top[1] !== 0)) throw new Error('回放心拍的输入、标签或预测无效');
    const rowF = Float32Array.from(payload.row), wordsG = Int8Array.from(payload.words);
    const actual = model.quantizeRow(Array.from(rowF));
    for (let j = 0; j < 188; j++) if (actual[j] !== wordsG[j]) throw new Error('回放输入量化与保存的 C++ 输入字不一致');
    const res = model.run(actual, { trace: true });
    if (res.pred2 !== payload.top[0] || res.pred4 !== payload.top[1]) throw new Error('回放预测与保存的 C++ 输出不一致');
    const found = BEATS.findIndex(b => b.source === 'full-test-cpp' && b.fullIndex === payload.id);
    if (found >= 0) { setBeat(found); return found; }
    const i = BEATS.length;
    BEATS.push(Object.assign({}, payload, { id: i, fullIndex: payload.id, source: 'full-test-cpp', rowF, wordsG }));
    GOLD.push(null); finals.push(finalClass(res));
    summ.push({ pred2: res.pred2, pred4: res.pred4, sums2: res.sums2.slice(), sums4: res.sums4.slice(), early: res.pred2 === 0 });
    lru.push({ i, res }); if (lru.length > 4) lru.shift();
    refreshLabels(); setBeat(i); return i;
  }

  // ------------------------------------------------------------------ colours
  const rgb = c => { c = c.trim(); if (c[0] === '#') { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; } const m = c.match(/\d+/g); return m ? m.slice(0, 3).map(Number) : [128, 128, 128]; };
  const mix = (a, b, t) => `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
  function palette() { const p = pal(); return { p, neg: rgb(p.sig), pos: rgb(p.en), zero: rgb(p.surface2), spk: rgb(p.mwi), bad: rgb(p.bad), tree: rgb(p.tree) }; }

  /** draw a rows x cols int8/0-1 map into the box (x,y,w,h). mode 'spk': non-zero = spike colour; 'i8': diverging by value / maxAbs. */
  function heat(c, data, rows, cols, x, y, w, h, mode, o) {
    o = o || {}; const P = palette(), cw = w / cols, ch = h / rows;
    c.fillStyle = P.p.surface2; c.fillRect(x, y, w, h);
    if (!data) return;
    const mx = o.max || 127;
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      const v = data[r * cols + q]; if (!v) continue;
      c.fillStyle = mode === 'spk' ? mix(P.zero, P.spk, 1) : (v > 0 ? mix(P.zero, P.pos, Math.min(1, v / mx)) : mix(P.zero, P.neg, Math.min(1, -v / mx)));
      c.fillRect(x + q * cw, y + r * ch, Math.max(cw, .6) + .3, Math.max(ch, .6) + .3);
    }
    c.strokeStyle = P.p.line; c.lineWidth = 1; c.strokeRect(x + .5, y + .5, w - 1, h - 1);
  }
  function box(c, x, y, w, h, fill, stroke, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r || 6) : c.rect(x, y, w, h); c.fillStyle = fill; c.fill(); c.strokeStyle = stroke; c.lineWidth = 1.2; c.stroke(); }
  function arrow(c, x0, y0, x1, y1, col, w) {
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = w || 1.4; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    const a = Math.atan2(y1 - y0, x1 - x0), s = 6; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - s * Math.cos(a - .45), y1 - s * Math.sin(a - .45)); c.lineTo(x1 - s * Math.cos(a + .45), y1 - s * Math.sin(a + .45)); c.closePath(); c.fill();
  }

  // ------------------------------------------------------------------ shared beat selection
  const beatSubs = []; const S = { beat: Math.max(0, BEATS.findIndex(b => b.label === 0 && (b.top[0] === 1 ? b.top[1] : 0) === 0)) };
  const finals = BEATS.map(() => null), summ = BEATS.map(() => null);
  function beatLabel(i) { const b = BEATS[i], f = finals[i]; return (b.fullIndex == null ? '#' + i : '全测试集 #' + b.fullIndex) + ' · ' + CLS1[b.label] + ' · 记录 ' + b.record + (f == null ? '' : (f === b.label ? ' · 判对' : ' · 判为 ' + CLS1[f])); }
  function beatSelect(host) {
    host.innerHTML = `<label class="ctrl" style="min-width:230px"><span>选一个心拍（24 个真实测试心拍）</span><span></span><select aria-label="心拍"></select></label>`;
    const sel = $('select', host); fill();
    function fill() {
      host.querySelector('label > span').textContent = '选择心拍（' + BEATS.length + ' 个' + (BEATS.length > 24 ? '，含全测试集回放' : '真实测试心拍') + '）';
      sel.innerHTML = BEATS.map((b, i) => `<option value="${i}">${beatLabel(i)}</option>`).join(''); sel.value = S.beat;
    }
    sel.addEventListener('change', () => setBeat(+sel.value));
    beatSubs.push({ fill, sel });
  }
  const beatCbs = [];
  function setBeat(i) { S.beat = i; beatSubs.forEach(s => { s.sel.value = i; }); beatCbs.forEach(f => f(i)); }
  function onBeat(f) { beatCbs.push(f); }
  function refreshLabels() { beatSubs.forEach(s => s.fill()); }

  // ------------------------------------------------------------------ transport
  function Player(host, cfg) {
    let n = cfg.n, i = 0, playing = false, raf = 0, last = 0, acc = 0, speed = 1;
    const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const reduced = () => !!(motion && motion.matches);
    host.tabIndex = 0;
    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', '动画播放控制；方向键逐帧，Home 回开头，End 到末尾，空格播放或暂停');
    host.innerHTML = `<div class="lab-bar"><div class="transport">
      <button class="btn" data-a="first" aria-label="回到开头">⏮</button><button class="btn" data-a="prev">◀ 上一帧</button>
      <button class="btn primary" data-a="play" aria-label="播放或暂停" aria-pressed="false">▶ 播放</button><button class="btn" data-a="next">下一帧 ▶</button></div>
      <div class="seg" data-sp role="group" aria-label="速度"><button data-v="0.25">0.25×</button><button data-v="1" aria-pressed="true">1×</button><button data-v="4">4×</button><button data-v="16">16×</button></div>
      <label class="ctrl" style="min-width:240px;flex:1 1 240px"><span data-l></span><output></output><input type="range" min="0" max="${Math.max(0, n - 1)}" value="0" step="1" aria-label="帧"></label></div>`;
    const btnPlay = $('[data-a=play]', host), rng = $('input', host), out = $('output', host), lab = $('[data-l]', host);
    function playLabel() {
      btnPlay.textContent = playing ? '⏸ 暂停' : (reduced() ? '▶ 慢速播放' : '▶ 播放');
      btnPlay.setAttribute('aria-pressed', String(playing));
      btnPlay.title = reduced() ? '遵循减少动态效果设置：需手动播放，最多每秒 1 帧；也可用方向键逐帧查看' : '空格播放或暂停；方向键逐帧，Home / End 跳转';
    }
    function render() { rng.value = i; out.textContent = `${i + 1} / ${n}`; lab.textContent = cfg.label ? cfg.label(i) : '帧'; cfg.onFrame(i); }
    function set(k) { i = Math.max(0, Math.min(n - 1, k)); render(); }
    function stop() { playing = false; cancelAnimationFrame(raf); playLabel(); }
    function tick(ts) {
      if (!playing) return;
      const rate = (cfg.fps || 6) * speed;
      acc += (ts - last) / 1000 * (reduced() ? Math.min(rate, 1) : rate); last = ts; const a = Math.floor(acc);
      if (a > 0) { acc -= a; if (i + a >= n - 1) { set(n - 1); stop(); return; } set(i + a); }
      raf = requestAnimationFrame(tick);
    }
    function play() { if (playing) return; if (i >= n - 1) set(0); playing = true; playLabel(); last = performance.now(); acc = 0; raf = requestAnimationFrame(tick); }
    host.addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (!b) return; const a = b.dataset.a; if (a === 'play') playing ? stop() : play(); else { stop(); set(a === 'first' ? 0 : i + (a === 'next' ? 1 : -1)); } });
    HW.seg($('[data-sp]', host), v => { speed = +v; });
    rng.addEventListener('input', () => { stop(); set(+rng.value); });
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { if (!es[0].isIntersecting && playing) stop(); }).observe(host);
    host.addEventListener('keydown', e => {
      // Preserve native editing, range and select navigation, including their Home / End keys.
      if (e.target.closest('input, select, textarea, [contenteditable="true"]') || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); stop(); set(i - 1); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); stop(); set(i + 1); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); stop(); set(e.key === 'Home' ? 0 : n - 1); }
      else if ((e.key === ' ' || e.key === 'Enter') && e.target.tagName !== 'BUTTON') { e.preventDefault(); if (!e.repeat) playing ? stop() : play(); }
      else if (e.key === 'Escape') { stop(); }
    });
    if (motion) {
      const changed = () => { if (reduced()) stop(); else playLabel(); };
      if (motion.addEventListener) motion.addEventListener('change', changed);
      else if (motion.addListener) motion.addListener(changed);
    }
    playLabel();
    render();
    return { set, get: () => i, stop, setN(m, keep) { n = m; rng.max = Math.max(0, n - 1); i = keep ? Math.min(i, n - 1) : 0; render(); } };
  }

  // ------------------------------------------------------------------ tiny DOM helpers
  function ctrlRange(host, id, label, min, max, val, step, fmtf) {
    const d = document.createElement('label'); d.className = 'ctrl';
    d.innerHTML = `<span>${label}</span><output></output><input type="range" id="${id}" min="${min}" max="${max}" value="${val}" step="${step || 1}" aria-label="${label}">`;
    host.appendChild(d); const inp = $('input', d), out = $('output', d);
    const upd = () => { out.textContent = fmtf ? fmtf(+inp.value) : inp.value; }; inp.addEventListener('input', upd); upd();
    return { inp, set(v, mn, mx) { if (mn != null) inp.min = mn; if (mx != null) inp.max = mx; inp.value = v; upd(); }, get: () => +inp.value, root: d };
  }
  function canvasIn(host, cls, minw) { const w = document.createElement('div'); w.className = 'cv-scroll'; const cv = document.createElement('canvas'); cv.className = cls; if (minw) cv.style.minWidth = minw + 'px'; w.appendChild(cv); host.appendChild(w); return cv; }
  function guard(name, f) { try { f(); } catch (e) { console.error('[' + name + ']', e); } }
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const big = v => (typeof v === 'bigint' ? v : BigInt(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return { CLS, CLS1, hex, PARAMS, BEATS, KEYS, GOLD, model, run, wordsOf, getTensor, digestsOf, finalClass, finals, summ, palette, rgb, mix, heat, box, arrow, S, beatSelect, setBeat, onBeat, refreshLabels, importBeat, Player, ctrlRange, canvasIn, esc, big, guard };
})();
