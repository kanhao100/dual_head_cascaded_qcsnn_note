/* Offline integration checks against independently loaded C++ result files.
 * No browser is launched; actual CSS pixels are outside this test's scope. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const KM = require('../kernel_model');
const base = path.join(__dirname, '..');
const meta = JSON.parse(fs.readFileSync(path.join(base, 'data/full_test_meta.json'), 'utf8'));
const predictions = fs.readFileSync(path.join(base, 'data/preds_top_full.txt'), 'utf8').trim().split('\n').map(function (l) { return l.split(/\s+/).map(Number); });
const savedWords = fs.readFileSync(path.join(base, 'data/words_full.bin'));
const model = KM.create(JSON.parse(fs.readFileSync(path.join(base, 'params.json'), 'utf8')));
const errors = [], reports = [];
function check(label, f) { f(); reports.push(label); }
const pause = function () { return new Promise(function (resolve) { setTimeout(resolve, 0); }); };
function makeDom(filename, url) {
  const console = new VirtualConsole();
  console.on('jsdomError', function (e) { if (e.type !== 'css parsing') errors.push(e.stack || e.message); });
  console.on('error', function () { errors.push(Array.from(arguments).join(' ')); });
  return new JSDOM(fs.readFileSync(path.join(base, filename), 'utf8'), {
    url: url, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: console,
    beforeParse: function (w) {
      w.Response = Response; w.DecompressionStream = DecompressionStream; w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
      w.matchMedia = function () { return { matches: false, addEventListener: function () {}, addListener: function () {} }; };
      w.ResizeObserver = class { observe() {} disconnect() {} };
      w.IntersectionObserver = class { observe() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {};
      w.scrollTo = function () {};
      w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
      w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
      w.HTMLElement.prototype.getBoundingClientRect = w.SVGElement.prototype.getBoundingClientRect = function () {
        return { x: 0, y: 0, top: 0, left: 0, bottom: 250, right: 800, width: 800, height: 250 };
      };
      Object.defineProperties(w.HTMLElement.prototype, {
        clientWidth: { get() { return Math.max(800, parseFloat(this.style.minWidth) || 0); } },
        clientHeight: { get() { return parseFloat(this.style.height) || 250; } }
      });
      const contexts = new WeakMap();
      w.HTMLCanvasElement.prototype.getContext = function () {
        if (!contexts.has(this)) contexts.set(this, new Proxy({
          canvas: this, measureText: function (t) { return { width: String(t).length * 7 }; },
          createLinearGradient: function () { return { addColorStop() {} }; }, getLineDash: function () { return []; }
        }, { get(t, k) { return k in t ? t[k] : function () {}; } }));
        return contexts.get(this);
      };
      w.addEventListener('error', function (e) { errors.push(e.error?.stack || e.message); });
    }
  });
}
function change(w, id, value) {
  const el = w.document.getElementById(id); el.value = value; el.dispatchEvent(new w.Event('change', { bubbles: true }));
}
async function settled(w) {
  for (let i = 0; i < 1000; i++) {
    const s = w.ErrorBrowser.snapshot();
    if (s.state.beat == null || s.result) return s;
    if (w.document.querySelector('#eb-model-status.bad')) throw new Error(w.document.getElementById('eb-model-status').textContent);
    await pause();
  }
  throw new Error('Selected-beat inference timed out');
}
async function main() {
  const dom = makeDom('qcsnn_error_browser.html', 'http://localhost/qcsnn_error_browser.html');
  const w = dom.window, d = w.document; await w.ErrorBrowser.ready; await settled(w);
  const expectedMatrix = Array.from({ length: 4 }, function () { return [0, 0, 0, 0]; });
  const expectedErrors = [];
  for (let i = 0; i < meta.length; i++) {
    const final = predictions[i][0] ? predictions[i][1] : 0;
    expectedMatrix[meta[i].label][final]++;
    if (final !== meta[i].label) expectedErrors.push(i);
  }
  check('full C++ confusion matrix', function () {
    assert.deepEqual(JSON.parse(JSON.stringify(w.ErrorBrowser.snapshot().matrix)), expectedMatrix);
    assert.equal(d.getElementById('eb-errors').textContent, '279');
    assert.equal(d.getElementById('eb-accuracy').textContent, '98.62%');
  });
  let wordsCompared = 0;
  for (let i = 0; i < meta.length; i++) {
    const b = w.ErrorBrowser.record(i), input = w.ErrorBrowser.inputs(i);
    assert.equal(b.record, String(meta[i].record)); assert.equal(b.center, meta[i].center); assert.equal(b.label, meta[i].label);
    assert.equal(b.pred2, predictions[i][0]); assert.equal(b.pred4, predictions[i][1]);
    const q = model.quantizeRow(input.row);
    for (let j = 0; j < 188; j++) {
      const expected = savedWords.readInt8(i * 188 + j);
      assert.equal(input.words[j], expected, 'packed input at beat ' + i + ', word ' + j);
      assert.equal(q[j], expected, 'float32 quantization at beat ' + i + ', word ' + j);
      wordsCompared++;
    }
  }
  reports.push('all 20,161 catalog identities and ' + wordsCompared.toLocaleString('en-US') + ' quantized input words');
  check('all sixteen matrix cells, including empty cells', function () {
    for (let y = 0; y < 4; y++) for (let p = 0; p < 4; p++) {
      d.querySelector('[data-truth="' + y + '"][data-pred="' + p + '"]').click();
      assert.equal(w.ErrorBrowser.snapshot().ids.length, expectedMatrix[y][p]);
    }
  });
  await settled(w);
  d.getElementById('eb-all-errors').click();
  check('all final errors match independent C++ outputs', function () {
    assert.deepEqual(Array.from(w.ErrorBrowser.snapshot().ids), expectedErrors);
  });
  for (const id of expectedErrors) {
    w.ErrorBrowser.select(id); const s = await settled(w);
    assert.equal(s.result.pred2, predictions[id][0]); assert.equal(s.result.pred4, predictions[id][1]);
    assert.equal(d.getElementById('eb-model-status').className, 'ok');
  }
  reports.push('all 279 final error beats recomputed against saved C++ outputs');
  for (const entry of [['gate_miss', 69], ['stage2_wrong', 210], ['gate_extra', 553], ['recovered', 404], ['all', 20161], ['errors', 279]]) {
    change(w, 'eb-route', entry[0]); const s = await settled(w);
    check('route ' + entry[0] + ' count', function () { assert.equal(s.ids.length, entry[1]); });
    if (entry[0] === 'gate_miss') {
      assert.match(d.getElementById('eb-reason').textContent, /四分类头没有执行/);
      assert.equal(s.result.pred2, 0); assert.equal(d.querySelectorAll('.spike-row').length, 2);
    }
    if (entry[0] === 'recovered') {
      assert.match(d.getElementById('eb-outcome').textContent, /判对/); assert.equal(s.result.pred4, 0);
      assert.match(d.getElementById('eb-reason').textContent, /纠正/);
    }
  }
  const before = w.ErrorBrowser.snapshot().state.beat;
  d.getElementById('eb-next-page').click(); await settled(w);
  check('pagination updates the actual selected beat', function () {
    assert.notEqual(w.ErrorBrowser.snapshot().state.beat, before); assert.match(d.getElementById('eb-page').textContent, /^2 /);
  });
  change(w, 'eb-record', '100'); await settled(w);
  check('record filtering, empty state and disabled paging', function () {
    assert.equal(w.ErrorBrowser.snapshot().ids.length, 0); assert.ok(d.getElementById('eb-detail').hidden);
    assert.equal(d.getElementById('eb-next-page').disabled, true);
  });
  d.getElementById('eb-all-errors').click(); await settled(w);
  const payload = JSON.parse(JSON.stringify(w.ErrorBrowser.payload()));
  const targetUrl = new URL(d.getElementById('eb-replay').href).href;
  check('portable deep link preserves selected input and C++ outputs', function () {
    const decoded = JSON.parse(Buffer.from(decodeURIComponent(new URL(targetUrl).hash.slice('#error-beat='.length)), 'base64').toString('utf8'));
    assert.deepEqual(decoded, payload);
  });
  const replay = makeDom('qcsnn_kernel_walkthrough.html', targetUrl), rw = replay.window, rd = rw.document;
  for (let n = 0; n < 1000 && !rd.getElementById('external-replay-status').textContent.includes('已核对'); n++) await pause();
  const AN = rw.eval('AN'), imported = AN.S.beat;
  check('full-test selected beat reaches existing signal-flow replay', function () {
    assert.match(rd.getElementById('external-replay-status').textContent, /已核对/);
    assert.equal(AN.BEATS[imported].fullIndex, payload.id);
    assert.equal(AN.run(imported).pred2, payload.top[0]); assert.equal(AN.run(imported).pred4, payload.top[1]);
    assert.match(rd.getElementById('vm-head').textContent, /24 \/ 24/);
  });
  AN.flow.open('conv1', rd.getElementById('fl-cv'));
  change(rw, 'ti-time', '0');
  check('imported tensor inspector has values without claiming missing C++ digests', function () {
    assert.ok(AN.inspector.getState().arr); assert.equal(rd.getElementById('ti-status').dataset.ok, 'null');
    assert.match(rd.getElementById('ti-status').textContent, /未保存逐层 C\+\+ 参照/);
    assert.match(rd.getElementById('ti-selection').textContent, /重算一致/);
  });
  rd.getElementById('ti-close').click();
  check('mismatched parameters and tampered inputs are rejected', function () {
    assert.throws(function () { AN.importBeat(Object.assign({}, payload, { paramsId: 'wrong-model' })); }, /版本不同/);
    const corrupt = Object.assign({}, payload, { words: payload.words.slice() }); corrupt.words[0] = corrupt.words[0] === 127 ? 126 : corrupt.words[0] + 1;
    assert.throws(function () { AN.importBeat(corrupt); }, /量化/);
    const badOutput = Object.assign({}, payload, { top: [0, 0] });
    assert.throws(function () { AN.importBeat(badOutput); }, /预测/);
  });
  check('repeat import does not duplicate a beat', function () {
    const length = AN.BEATS.length; assert.equal(AN.importBeat(payload), imported); assert.equal(AN.BEATS.length, length);
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: reports, errors: errors, scope: 'Offline DOM and numeric integration; actual browser pixels not inspected.' }, null, 2));
  replay.window.close(); dom.window.close();
}
main().catch(function (error) { console.error(error.stack); process.exit(1); });
