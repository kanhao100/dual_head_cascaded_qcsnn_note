// Packs everything the page embeds into pack.json:
//   params  : the exported parameters (weights as base64 int8) -- same numbers as params.json
//   beats   : 24 shown beats (raw float32 row, golden INT8 words from the authors' FileReader, real-topFunction predictions)
//   gold    : FNV digests of every tensor the patched C++ dumped for those beats (the page recomputes them live)
//   sum     : verification summary, coverage, reachability, LIF bank study (numbers printed in the verification section)
'use strict';
const fs = require('fs');
const KM = require('./kernel_model');
const { readDump } = require('./golden_parse');
const D = 'data/';
const P = JSON.parse(fs.readFileSync('params.json', 'utf8'));
const b64 = (typedArr) => Buffer.from(typedArr.buffer, typedArr.byteOffset, typedArr.byteLength).toString('base64');

// ---- params with weights packed
const pk = JSON.parse(JSON.stringify(P));
pk.blocks.forEach(b => { b.conv.weights = b64(Int8Array.from(b.conv.weights)); });
for (const f of [pk.bin.fc, pk.multi.fc1, pk.multi.fc2]) f.weights = b64(Int8Array.from(f.weights));
for (const b of pk.blocks) { delete b.conv.weight_sum; }
for (const f of [pk.bin.fc, pk.multi.fc1, pk.multi.fc2]) { delete f.weight_sum; delete f.bias; }
for (const b of pk.blocks) { delete b.conv.bias; }

// ---- shown beats
const meta = JSON.parse(fs.readFileSync(D + 'verify_meta.json', 'utf8'));
const sub = JSON.parse(fs.readFileSync(D + 'tensor_subset.json', 'utf8'));
const rows = [];
for (const c of ['normal', 'sveb', 'veb', 'f']) for (const l of fs.readFileSync(D + 'verify/' + c + '/beats.csv', 'utf8').trim().split('\n')) rows.push(l.split(',').map(Number));
if (rows.length !== meta.length) throw new Error('row/meta mismatch');
const wb = fs.readFileSync(D + 'words_tensor.bin'); const W = new Int8Array(wb.buffer, wb.byteOffset, wb.length);
const pr = fs.readFileSync(D + 'preds_tensor_top.txt', 'utf8').trim().split('\n').map(l => l.split(' ').map(Number));
const NB = 24;
const beats = [];
for (let k = 0; k < NB; k++) {
  const i = sub.indices[k], m = meta[i];
  beats.push({ id: k, vindex: i, cls: m.cls, label: m.label, record: m.record, center: m.center,
    row: b64(Float32Array.from(rows[i])), words: b64(W.slice(k * 188, k * 188 + 188)), top: pr[k] });
}

// ---- golden digests from the C++ dump
const dig = (d) => KM.digest(d);
let keyOrder = null; const gold = [];
for (const beat of readDump(D + 'tensors_show200.bin')) {
  if (beat.index >= NB) continue;
  const keys = beat.recs.map(r => [r.stage, r.step, r.tag]);
  const ds = Uint32Array.from(beat.recs.map(r => dig(r.data)));
  if (!keyOrder || keys.length > keyOrder.length) keyOrder = keys;
  gold[beat.index] = { n: ds.length, d: b64(ds) };
}
// every beat's key list must be a prefix of the longest one
for (const beat of readDump(D + 'tensors_show200.bin')) {
  if (beat.index >= NB) continue;
  for (let j = 0; j < beat.recs.length; j++) { const r = beat.recs[j], k = keyOrder[j]; if (r.stage !== k[0] || r.step !== k[1] || r.tag !== k[2]) throw new Error('key order differs at beat ' + beat.index); }
}
const sum = {
  verify: JSON.parse(fs.readFileSync(D + 'verify_summary.json', 'utf8')),
  lif: JSON.parse(fs.readFileSync(D + 'lif_bank.json', 'utf8')),
};
const out = { params: pk, beats, keys: keyOrder.map(k => k.join('|')), gold, sum };
fs.writeFileSync('pack.json', JSON.stringify(out));
console.log('pack.json', (fs.statSync('pack.json').size / 1024).toFixed(0), 'KB; keys', keyOrder.length, '; beats', beats.length, '; gold entries', gold.filter(Boolean).length);
console.log('class counts', ['normal', 'sveb', 'veb', 'f'].map(c => beats.filter(b => b.cls === c).length));
