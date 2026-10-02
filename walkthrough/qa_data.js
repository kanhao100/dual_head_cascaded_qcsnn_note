// Read-only dataset / parameter acceptance: node walkthrough/qa_data.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = __dirname, file = p => path.join(root, p), read = p => fs.readFileSync(file(p), 'utf8');
const cls = ['normal', 'sveb', 'veb', 'f'];
const expectedFull = [18052, 557, 1393, 159], expectedVerify = [600, 400, 400, 159];
const lineList = p => read(p).trim().split(/\r?\n/);
function dataset(name, expected, metaFile, labelFile, wordsFile) {
  const meta = JSON.parse(read(metaFile)), labels = lineList(labelFile).map(Number), counts = [];
  let index = 0;
  for (let label = 0; label < cls.length; label++) {
    const lines = lineList(`data/${name}/${cls[label]}/beats.csv`);
    assert.equal(lines.length, expected[label], `${name} ${cls[label]} row count`);
    counts.push(lines.length);
    for (const text of lines) {
      const row = text.split(',').map(Number), m = meta[index];
      assert.equal(row.length, 184, `${name} row ${index} column count`);
      assert.ok(row.every(Number.isFinite), `${name} row ${index} finite values`);
      assert.equal(labels[index], label, `${name} label ${index}`);
      assert.equal(m.label, label, `${name} metadata label ${index}`);
      assert.equal(m.cls, cls[label], `${name} metadata class ${index}`);
      assert.ok(typeof m.record === 'string' && Number.isInteger(m.center), `${name} metadata record/center ${index}`);
      // Confirm the merged CSV row still comes from the metadata-named preprocessed beat.
      const individual = lineList(`data/rr_dataset/test/${m.cls}/${m.record}_${m.center}.csv`).flatMap(l => l.split(',')).map(Number);
      assert.deepEqual(row, individual, `${name} row / original beat alignment ${index}`);
      index++;
    }
  }
  assert.equal(meta.length, index, `${name} metadata count`);
  assert.equal(labels.length, index, `${name} label count`);
  assert.equal(fs.statSync(file(wordsFile)).size, index * 188, `${name} FileReader word bytes`);
  console.log(`PASS ${name}: ${index} beats × 184 finite columns; labels, metadata, individual CSV and ${index * 188} C++ input bytes aligned; classes ${counts.join('/')}`);
  return meta;
}
const full = dataset('full_test', expectedFull, 'data/full_test_meta.json', 'data/labels_full.txt', 'data/words_full.bin');
const verify = dataset('verify', expectedVerify, 'data/verify_meta.json', 'data/labels_verify.txt', 'data/words_verify.bin');
const fullKeys = new Set(full.map(m => `${m.cls}/${m.record}/${m.center}`));
assert.equal(fullKeys.size, full.length, 'full set contains no duplicate beat');
for (const m of verify) assert.ok(fullKeys.has(`${m.cls}/${m.record}/${m.center}`), 'verification beat belongs to full test set');
const sub = JSON.parse(read('data/tensor_subset.json')), pack = JSON.parse(read('pack.json'));
assert.equal(sub.indices.length, 200, 'tensor subset size');
assert.equal(new Set(sub.indices).size, 200, 'tensor subset unique indices');
const shownCounts = [0, 0, 0, 0];
for (let i = 0; i < pack.beats.length; i++) {
  const b = pack.beats[i], m = verify[sub.indices[i]];
  assert.equal(b.vindex, sub.indices[i], 'display index alignment');
  for (const k of ['cls', 'label', 'record', 'center']) assert.equal(b[k], m[k], 'display metadata ' + k);
  shownCounts[b.label]++;
}
assert.deepEqual(shownCounts, [6, 6, 6, 6], '6 shown beats per class');
console.log('PASS 200 unique tensor-subset indices and 24 displayed beats (6/class) align with metadata');
const py = JSON.parse(read('params_checksums_py.json'));
const cpp = new Map(lineList('golden/params_checksums_cpp.txt').map(l => { const [name, count, sum, wsum] = l.trim().split(/\s+/); return [name, { count: Number(count), sum: Number(sum), wsum: Number(wsum) }]; }));
assert.equal(Object.keys(py).length, 42, '42 Python parameter arrays');
assert.equal(cpp.size, 42, '42 C++ parameter arrays');
for (const [name, p] of Object.entries(py)) {
  assert.deepEqual(cpp.get(name), { count: p.dims.reduce((a, b) => a * b, 1), sum: p.sum, wsum: p.wsum }, 'C++ / Python checksum ' + name);
}
console.log('PASS 42 C++ / Python parameter-array counts, sums and weighted sums');
for (const [a, b, count] of [['preds_top.txt', 'preds_layers.txt', 1559], ['preds_tensor_top.txt', 'preds_tensor_layers.txt', 200], ['preds_stress_top.txt', 'preds_stress_layers.txt', 126]]) {
  const aa = lineList('data/' + a), bb = lineList('data/' + b);
  assert.equal(aa.length, count); assert.equal(bb.length, count); assert.deepEqual(aa, bb, 'unmodified / patched top outputs');
}
assert.equal(lineList('data/preds_top_full.txt').length, 20161, 'full top prediction count');
console.log('PASS unmodified / instrumented C++ predictions: 1559 / 200 / 126; full top reference has 20161 predictions');
console.log('ALL DATA ACCEPTANCE CHECKS PASSED (no files written)');
