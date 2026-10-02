// Read-only uncached model timing: node walkthrough/qa_perf.js
// Direct model.run, complete trace, float32 quantization; no AN.run/LRU or rendering.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const KM = require('./kernel_model');
const pack = JSON.parse(fs.readFileSync(path.join(__dirname, 'pack.json'), 'utf8'));
const params = JSON.parse(fs.readFileSync(path.join(__dirname, 'params.json'), 'utf8'));
const model = KM.create(params);
const rows = pack.beats.map(b => {
  const buf = Buffer.from(b.row, 'base64');
  return Array.from({ length: buf.length / 4 }, (_, i) => buf.readFloatLE(i * 4));
});
const rounds = 3;
const samples = [];
for (let round = 0; round < rounds; round++) for (let beat = 0; beat < rows.length; beat++) {
  const start = performance.now();
  const words = model.quantizeRow(rows[beat]);
  const result = model.run(words, { trace: true });
  const ms = performance.now() - start;
  assert.deepEqual([result.pred2, result.pred4], pack.beats[beat].top, 'timed model result');
  assert.equal(result.steps.length, 10, 'timed trace has all steps');
  samples.push({ round, beat, ms, stage2: result.pred2 === 1 });
}
const stats = a => {
  const s = a.map(q => q.ms).sort((a, b) => a - b);
  return { count: s.length, medianMs: (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2,
    p95Ms: s[Math.ceil(s.length * .95) - 1], maxMs: s[s.length - 1] };
};
const all = stats(samples), firstPass = stats(samples.filter(s => s.round === 0));
console.log(JSON.stringify({ runtime: process.version, platform: process.platform, method: '24 beats × 3 rounds; direct model.quantizeRow + model.run(trace:true), no cache, no rendering',
  firstPass, all, normal: stats(samples.filter(s => !s.stage2)), abnormal: stats(samples.filter(s => s.stage2)),
  labThresholdMs: 200, needsOnDemandLab: all.p95Ms > 200,
  samples: process.argv.includes('--verbose') ? samples : undefined }, null, 2));
