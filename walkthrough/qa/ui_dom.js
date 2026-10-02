/* Offline DOM interaction checks. No browser, network, or external page is used.
 * Canvas drawing and layout are emulated: this validates handlers and numbers,
 * not browser typography, pixels, or compositor behaviour.
 * Run: node walkthrough/qa/ui_dom.js [--reduced-motion]
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '../qcsnn_kernel_walkthrough.html'), 'utf8');
const errors = [], checks = [], rafs = new Map(), observers = [];
const reduced = process.argv.includes('--reduced-motion');
let nextRaf = 1, now = 0;
const virtualConsole = new VirtualConsole();
virtualConsole.on('error', (...args) => errors.push(args.map(String).join(' ')));
virtualConsole.on('jsdomError', e => { if (e.type !== 'css parsing') errors.push(e.stack || e.message); });
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
  beforeParse(w) {
    w.addEventListener('error', e => errors.push(e.error?.stack || e.message));
    w.matchMedia = q => ({ matches: q.includes('reduced-motion') && reduced, media: q,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.IntersectionObserver = class { constructor(cb) { this.cb = cb; observers.push(this); } observe(e) { this.el = e; } unobserve() {} disconnect() {} };
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.requestAnimationFrame = cb => { const n = nextRaf++; rafs.set(n, cb); return n; };
    w.cancelAnimationFrame = n => rafs.delete(n);
    w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
    const width = e => {
      const st = e.style || {}, px = /^([\d.]+)px$/.exec(st.width);
      if (px) return +px[1];
      return Math.max(800, parseFloat(st.minWidth) || 0);
    };
    const height = e => parseFloat(e.style?.height) || (e.tagName === 'CANVAS' ? 250 : 80);
    Object.defineProperties(w.HTMLElement.prototype, {
      clientWidth: { configurable: true, get() { return width(this); } },
      clientHeight: { configurable: true, get() { return height(this); } },
      offsetWidth: { configurable: true, get() { return width(this); } },
      offsetHeight: { configurable: true, get() { return height(this); } }
    });
    w.HTMLElement.prototype.getBoundingClientRect = function () {
      const wi = width(this), he = height(this);
      return { x: 0, y: 0, top: 0, left: 0, right: wi, bottom: he, width: wi, height: he, toJSON() { return this; } };
    };
    const contexts = new WeakMap();
    w.HTMLCanvasElement.prototype.getContext = function () {
      if (!contexts.has(this)) {
        const state = { canvas: this, measureText: t => ({ width: String(t).length * 7 }),
          createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
          getLineDash: () => [], getImageData: () => ({ data: new Uint8ClampedArray(4) }) };
        contexts.set(this, new Proxy(state, { get(t, k) { return k in t ? t[k] : () => {}; }, set(t, k, v) { t[k] = v; return true; } }));
      }
      return contexts.get(this);
    };
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; this.setAttribute('open', ''); };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  }
});
const w = dom.window, d = w.document;
const wait = ms => new Promise(r => setTimeout(r, ms));
const test = (label, f) => { try { f(); checks.push(label); } catch (e) { errors.push(label + ': ' + e.stack); } };
const input = (el, v) => { assert.ok(el, 'control exists'); el.value = String(v); el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const change = (el, v) => { assert.ok(el); el.value = String(v); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
const key = (el, value) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
function pump() { now = Math.max(now, w.performance.now()) + 1000; const batch = [...rafs]; rafs.clear(); for (const [, cb] of batch) cb(now); }
async function main() {
  for (let n = 0; n < 100 && !d.querySelector('#vm-head')?.textContent.includes('24 / 24'); n++) await wait(20);
  test('24 live model checks', () => assert.match(d.querySelector('#vm-head').textContent, /24 \/ 24/));
  test('all 16 sections', () => assert.equal(d.querySelectorAll('section.step').length, 16));
  test('no external runtime dependencies', () => {
    assert.equal(d.querySelectorAll('script[src], link[rel="stylesheet"]').length, 0);
    assert.equal(d.querySelectorAll('iframe').length, 0);
  });
  const AN = w.eval('AN');
  const normalBeat = AN.BEATS.findIndex(b => b.top[0] === 0);
  assert.ok(normalBeat >= 0, 'a real early-exit beat is available');
  test('abnormal sample available', () => { AN.setBeat(12); assert.equal(AN.run(12).pred2, 1); });
  const newSections = ['s-flow', 's-conv', 's-bn', 's-lif', 's-pool', 's-fc', 's-gate', 's-lab'];
  // Segment choices and presets drive different dimensions and arithmetic paths.
  for (const id of newSections) {
    const section = d.getElementById(id); if (!section) { errors.push('missing section ' + id); continue; }
    for (const b of [...section.querySelectorAll('button')]) {
      test(id + ' button ' + (b.dataset.v || b.dataset.a || b.textContent.trim()), () => { b.click(); pump(); });
      if (b.dataset.a === 'play') b.click();
    }
    for (const el of [...section.querySelectorAll('input[type="range"]')]) {
      for (const val of [+el.min, Math.floor((+el.min + +el.max) / 2), +el.max]) {
        test(id + ' range ' + (el.id || el.getAttribute('aria-label')) + '=' + val, () => input(el, val));
      }
    }
    for (const el of [...section.querySelectorAll('select')]) {
      if (el.closest('#fl-inspect')) continue;
      test(id + ' select normal/abnormal', () => { change(el, normalBeat); change(el, 12); });
    }
  }
  test('normal early exit across all animation observers', () => { AN.setBeat(normalBeat); assert.equal(AN.run(normalBeat).stage2.length, 0); });
  test('abnormal replay restored', () => { AN.setBeat(12); assert.equal(AN.run(12).stage2.length, 10); });
  for (const host of d.querySelectorAll('[role="group"][tabindex="0"]')) {
    test('keyboard player ' + (host.id || host.parentElement.id), () => { key(host, 'Home'); key(host, 'ArrowRight'); key(host, 'End'); key(host, ' '); pump(); key(host, 'Escape'); });
  }
  test('theme redraws', () => { const b = d.querySelector('#themebtn, #theme'); assert.ok(b); b.click(); b.click(); });
  test('player rate respects motion preference', () => {
    const host = d.createElement('div'); d.body.appendChild(host); let frame = 0;
    const player = AN.Player(host, { n: 30, fps: 8, onFrame: i => { frame = i; } });
    now = w.performance.now(); host.querySelector('[data-a="play"]').click(); pump();
    assert.ok(reduced ? frame <= 1 : frame >= 7, 'manual playback rate');
    player.stop(); host.remove();
  });
  if (AN.flow) await checkInspector(AN);
  else errors.push('missing tensor inspector flow API');
  await checkHardware(AN);
  test('manual lab mode can be enabled and reverted', () => {
    AN.enableOnDemandLab(true); assert.equal(d.getElementById('lb-calculate').hidden, false);
    input(d.getElementById('lb-n'), .15); assert.match(d.getElementById('lb-calculate').textContent, /点击计算/);
    d.getElementById('lb-calculate').click(); AN.enableOnDemandLab(false);
    assert.equal(d.getElementById('lb-calculate').hidden, true);
  });
  const browserPerf = await AN.performance.measure();
  test('direct runtime performance measurement', () => {
    assert.equal(browserPerf.samples, 24); assert.ok(browserPerf.p95Ms >= browserPerf.medianMs);
    assert.ok(Number.isFinite(browserPerf.maxMs));
  });
  test('canvas drawing state remains live', () => assert.ok(d.querySelector('#fl-cv').width > 0));
  console.log(JSON.stringify({ mode: reduced ? 'reduced motion' : 'normal', checks: checks.length, errors,
    scope: 'Offline DOM and emulated canvas; browser pixels and layout are not verified.' }, null, 2));
  dom.window.close();
  if (errors.length) process.exitCode = 1;
}
async function checkHardware(AN) {
  test('hardware explorer loaded', () => assert.ok(AN.hardware));
  if (!AN.hardware) return;
  const data = w.eval('K.hardware'), micro = w.eval('K.micro');
  const lifes = data.layers.filter(l => l.lif), expected = [8, 8, 7, 6, 6, 6];
  test('six LIF instances and all network blocks', () => { assert.equal(lifes.length, 6); assert.equal(data.layers.length, 26); });
  for (const layer of [...data.layers, ...(data.controls || [])]) {
    test('hardware layer ' + layer.key, () => {
      change(d.getElementById('hs-layer'), layer.key);
      assert.equal(AN.hardware.state().layer, layer.key);
      for (const b of d.querySelectorAll('#hs-tabs button')) { b.click(); assert.ok(d.getElementById('hs-content').textContent.length > 0); }
      const modules = d.getElementById('hs-module');
      if (modules) for (const option of modules.options) { change(modules, option.value); assert.ok(d.getElementById('hs-content').textContent.length > 0); }
    });
  }
  AN.setBeat(12);
  for (let j = 0; j < lifes.length; j++) {
    const layer = lifes[j];
    test('LIF deep controls ' + layer.key, () => {
      change(d.getElementById('hd-layer'), layer.key);
      const mi = layer.microIds.map(id => micro[id]).find(m => m.kind === 'pipeline');
      assert.equal(mi.depth, expected[j]);
      for (const t of [0, 1, 2, 9]) {
        input(d.getElementById('hd-time'), t);
        input(d.getElementById('hd-channel'), layer.lif.channels - 1);
        input(d.getElementById('hd-position'), layer.lif.length - 1);
        const values = AN.hardware.traceValues(layer.lif.channels * layer.lif.length - 1);
        assert.ok(values.explanation.matches); assert.equal(values.save, values.next);
        assert.match(d.getElementById('hd-values').textContent, /重算一致/);
      }
      const player = AN.hardware.getPlayer();
      for (let i = 0; i < mi.depth; i++) { player.set(i); key(d.getElementById('hd-cv'), 'ArrowRight'); }
      const prior = AN.hardware.state().cycle;
      for (const id of ['hd-empty', 'hd-full']) {
        const box = d.getElementById(id); box.checked = true; box.dispatchEvent(new w.Event('change', { bubbles: true }));
        player.set(prior + 1); assert.equal(AN.hardware.state().cycle, prior);
        box.checked = false; box.dispatchEvent(new w.Event('change', { bubbles: true }));
      }
      player.set(prior + 1); assert.equal(AN.hardware.state().cycle, prior + 1);
      d.getElementById('hd-tensor').click();
      const state = AN.inspector.getState(); assert.equal(state.t, 9);
      const selectedIndex = layer.lif.channels * layer.lif.length - 1;
      assert.equal(state.row, Math.floor(selectedIndex / state.cols));
      assert.equal(state.col, selectedIndex % state.cols);
      d.getElementById('ti-close').click();
    });
  }
  test('early-exit LIF has no invented tensor', () => {
    AN.setBeat(AN.BEATS.findIndex(b => b.top[0] === 0));
    change(d.getElementById('hd-layer'), lifes.find(l => l.stage === 2).key);
    assert.ok(d.getElementById('hd-tensor').disabled);
    assert.equal(AN.hardware.traceValues(0), null);
    d.getElementById('hd-abnormal').click(); assert.equal(d.getElementById('hd-tensor').disabled, false);
  });
}
async function checkInspector(AN) {
  test('flow displayed time', () => {
    const f = { st: 2, t: 0, k: 'm_lif1', j: 2 }, R = AN.run(12);
    assert.equal(AN.flow.displayed('lif1', f, R).step, 9);
  });
  for (const name of Object.keys(AN.flow.nodes)) {
    test('open block ' + name, () => AN.flow.open(name, d.getElementById('fl-cv')));
    const dialog = d.querySelector('dialog[open]');
    test('dialog shows ' + name, () => assert.ok(dialog));
    if (dialog) {
      for (const el of dialog.querySelectorAll('input[type="range"]')) test('inspector range ' + el.id, () => { input(el, el.min || 0); input(el, el.max || 9); });
      const time = dialog.querySelector('#ti-time');
      for (const t of [0, 9]) test('inspector t=' + t + ' ' + name, () => {
        change(time, t); const s = AN.inspector.getState();
        assert.equal(s.t, t); assert.ok(s.arr); assert.equal(d.getElementById('ti-status').dataset.ok, 'true');
        assert.ok(!d.getElementById('ti-grid').hidden);
      });
      for (const el of dialog.querySelectorAll('input[type="number"]')) test('inspector coordinates ' + el.id + ' ' + name, () => { input(el, 0); input(el, el.max || 0); });
      test('inspector cell and keyboard ' + name, () => {
        const grid = d.getElementById('ti-grid'); grid.focus(); key(grid, 'Home'); key(grid, 'ArrowRight'); key(grid, 'ArrowDown'); key(grid, 'End');
        assert.match(d.getElementById('ti-selection').textContent, /重算一致/);
        const s = AN.inspector.getState(), row = Math.min(1, s.rows - 1), col = Math.min(2, s.cols - 1);
        const cw = +d.getElementById('ti-zoom').value, ch = Math.max(18, cw);
        const point = { bubbles: true, clientX: 44 + (col + 0.5) * cw, clientY: 28 + (row + 0.5) * ch };
        grid.dispatchEvent(new w.MouseEvent('pointermove', point));
        assert.equal(AN.inspector.getState().row, row); assert.equal(AN.inspector.getState().col, col);
        const selected = d.getElementById('ti-selection').textContent;
        assert.ok(selected.includes(`通道 ${row} · 位置 ${col}`));
        assert.ok(selected.includes(`整数值 = ${s.arr[row * s.cols + col]}`));
        assert.ok(d.getElementById('ti-calc').textContent.length > 0, 'selected cell has a calculation explanation');
        const details = d.getElementById('ti-terms-wrap');
        if (!details.hidden) { details.querySelector('summary').click(); assert.ok(details.open); assert.ok(d.querySelectorAll('#ti-terms tbody tr').length > 0); details.querySelector('summary').click(); }
        grid.dispatchEvent(new w.MouseEvent('click', point));
        d.getElementById('ti-reset').click();
        assert.equal(AN.inspector.getState().t, AN.inspector.getState().displayed.step);
      });
      test('close block ' + name, () => { const b = dialog.querySelector('[data-close], #ti-close, button[aria-label="关闭"]'); if (b) b.click(); else dialog.close(); });
    }
  }
  test('open through canvas pointer and return focus on Escape', () => {
    const flow = d.getElementById('fl-cv'); flow.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 30, clientY: 25 }));
    assert.ok(d.getElementById('ti-dialog').open); key(d.getElementById('ti-dialog'), 'Escape');
    assert.ok(!d.getElementById('ti-dialog').open); assert.equal(d.activeElement, flow);
  });
  test('open through accessible module choice', () => {
    change(d.getElementById('fl-inspect-node'), 'conv3'); d.getElementById('fl-inspect-open').click();
    assert.equal(AN.inspector.getState().k, 'conv3'); d.getElementById('ti-close').click();
    assert.equal(d.activeElement.id, 'fl-inspect-open');
  });
  const normal = AN.BEATS.findIndex(b => b.top[0] === 0);
  test('early-exit inspector never invents four-class data', () => {
    AN.setBeat(normal); AN.flow.open('m_fc1'); assert.equal(AN.inspector.getState().arr, null);
    assert.ok(d.getElementById('ti-time').disabled); assert.match(d.getElementById('ti-empty').textContent, /未执行/);
    assert.equal(w.getComputedStyle(d.getElementById('ti-grid')).display, 'none', 'no stale heatmap after early exit');
    AN.inspector.close(); AN.setBeat(12);
  });
  test('numeric selection scrolls into view and opening resets scroll', () => {
    AN.flow.open('m_qi1'); change(d.getElementById('ti-time'), 0);
    input(d.getElementById('ti-position'), 483);
    assert.ok(d.getElementById('ti-scroll').scrollLeft > 0);
    AN.inspector.close(); AN.flow.open('in');
    assert.equal(d.getElementById('ti-scroll').scrollLeft, 0);
    AN.inspector.close();
  });
  test('inspector calculations for all 24 real beats', () => {
    let cells = 0, goldenChecks = 0;
    for (let beat = 0; beat < AN.BEATS.length; beat++) {
      const res = AN.run(beat);
      for (const [name, node] of Object.entries(AN.flow.nodes)) {
        const stage = node.st || (name === 'arg' ? 2 : 1); if (stage === 2 && !res.pred2) continue;
        for (const t of [0, 1, 2, 9]) {
          const data = AN.inspector.tensor(name, stage, t, res);
          assert.ok(data); const indices = new Set([0, Math.floor(data.length / 2), data.length - 1]);
          if (node.dkey) for (let j = 480; j < 484; j++) indices.add(j);
          for (const i of indices) { const cell = AN.inspector.cell(name, stage, t, i, res, beat); assert.equal(cell.matches, true, `beat ${beat} ${name} t${t} i${i}`); cells++; }
          const v = AN.inspector.verification(name, stage, t, res, beat); assert.equal(v.ok, true, `gold beat ${beat} ${name} t${t}`); goldenChecks++;
        }
      }
    }
    console.log('Inspector numeric checks:', cells, 'cells,', goldenChecks, 'C++ comparisons');
  });
}
main().catch(e => { console.error(e.stack); dom.window.close(); process.exitCode = 1; });
