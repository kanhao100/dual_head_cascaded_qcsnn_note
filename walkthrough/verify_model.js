// Verifies kernel_model.js against the C++ references. Usage: node verify_model.js [--full]
'use strict';
const fs = require('fs');
const assert = require('assert/strict');
const KM = require('./kernel_model');
const { readDump } = require('./golden_parse');
const D = 'data/';
const P = JSON.parse(fs.readFileSync('params.json', 'utf8'));
const fails = [], results = [];
const ok = (name, cond, extra) => { results.push({ name, ok: !!cond, extra: extra || '' }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails.push(name); };
const words = (f) => { const b = fs.readFileSync(D + f); assert.ok(b.length > 0 && b.length % 188 === 0, f + ': expected non-empty whole 188-word beats'); const a = new Int8Array(b.buffer, b.byteOffset, b.length); const n = a.length / 188; const o = []; for (let i = 0; i < n; i++) o.push(a.slice(i * 188, i * 188 + 188)); return o; };
const preds = (f) => { const text = fs.readFileSync(D + f, 'utf8').trim(); assert.ok(text, f + ': empty predictions'); return text.split(/\r?\n/).map((l, i) => { assert.match(l.trim(), /^[01]\s+[0-3]$/, f + ': malformed prediction line ' + (i + 1)); return l.trim().split(/\s+/).map(Number); }); };
const fullRequested = process.argv.includes('--full');
let fullCompleted = false;
// A missing/truncated full reference is a failing prerequisite, never an optional skip.
if (fullRequested) {
  assert.equal(words('words_full.bin').length, 20161, 'full-set input count must be 20161');
  assert.equal(preds('preds_top_full.txt').length, 20161, 'full-set prediction count must be 20161');
}

// ---------------------------------------------------------------- 1. primitives vs independent BigInt reference (C semantics)
(function () {
  const { requant, requantRNE, wrapN, qiQOne } = KM.prim;
  const sat = v => v > 127n ? 127 : (v < -128n ? -128 : Number(v));
  const refRequant = (acc, mul, r) => { const p = BigInt(acc) * BigInt(mul); let s; if (r > 0) s = BigInt.asIntN(32, (p + (1n << BigInt(r - 1))) >> BigInt(r)); else s = BigInt.asIntN(32, p); return sat(s); };
  const refRNE = (acc, mul, r) => { const p = BigInt(acc) * BigInt(mul); if (r <= 0) return sat(BigInt.asIntN(32, p)); const neg = p < 0n, ax = neg ? -p : p, R = BigInt(r); let b = ax >> R; const rm = ax & ((1n << R) - 1n), hf = 1n << (R - 1n); if (rm > hf || (rm === hf && (b & 1n) === 1n)) b += 1n; return sat(BigInt.asIntN(32, neg ? -b : b)); };
  let s = 12345; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  let bad = 0, n = 300000, ties = 0;
  for (let i = 0; i < n; i++) {
    const acc = Math.round((rnd() * 2 - 1) * (i % 3 === 0 ? 2 ** 31 - 1 : 2 ** 23)), mul = Math.round((rnd() * 2 - 1) * (2 ** 31 - 1)), sh = Math.floor(rnd() * 44) - 2;
    if (requant(acc, mul, sh) !== refRequant(acc, mul, sh)) bad++;
    if (requantRNE(acc, mul, sh) !== refRNE(acc, mul, sh)) bad++;
  }
  // forced ties for RNE: acc*mul = odd multiple of 2^(r-1)
  for (let r = 1; r < 40; r++) for (const base of [0, 1, 2, 3, 126, 127, 128, -1, -2, -3, -127, -128, -129]) { const half = 2 ** (r - 1), acc = Math.round(base * 2 ** r + half); if (Math.abs(acc) < 2 ** 31) { ties++; if (requantRNE(acc, 1, r) !== refRNE(acc, 1, r)) bad++; } }
  ok('primitives: requant / requantRNE vs BigInt reference', bad === 0, `(${n} random + ${ties} forced ties, mismatches ${bad})`);
  let wbad = 0; for (let i = 0; i < 200000; i++) { const x = Math.round((rnd() * 2 - 1) * 2 ** 50), b = [16, 24, 32, 40][i % 4]; if (wrapN(x, b) !== Number(BigInt.asIntN(b, BigInt(x)))) wbad++; if (b === 24 && KM.prim.wrap24(x) !== Number(BigInt.asIntN(24, BigInt(x)))) wbad++; }
  ok('primitives: wrap24 / wrapN vs BigInt.asIntN', wbad === 0);
  ok('primitives: q_one for the exported scales (32, 136, 140)', qiQOne(32) === 127 && qiQOne(136) === 30 && qiQOne(140) === 29, `(32->${qiQOne(32)}, 136->${qiQOne(136)}, 140->${qiQOne(140)})`);
})();

// ---------------------------------------------------------------- 2. host-side input quantisation vs the authors' FileReader
const model = KM.create(P);
function readRows(dir, cls) { return fs.readFileSync(dir + cls + '/beats.csv', 'utf8').trim().split(/\r?\n/).map((l, i) => { const r = l.split(',').map(Number); assert.ok(r.length === 184 && r.every(Number.isFinite), cls + ': expected 184 finite values at row ' + i); return r; }); }
(function () {
  const W = words('words_verify.bin'); assert.equal(W.length, 1559, 'verification input count'); let i = 0, bad = 0, firstBad = null;
  for (const c of ['normal', 'sveb', 'veb', 'f']) for (const row of readRows(D + 'verify/', c)) { const w = model.quantizeRow(row); for (let k = 0; k < 188; k++) if (w[k] !== W[i][k]) { bad++; if (!firstBad) firstBad = [i, k, w[k], W[i][k]]; } i++; }
  assert.equal(i, W.length, 'CSV / FileReader beat counts');
  ok('input quantisation (float32 emulation) vs FileReader words', bad === 0, `(${i} beats x 188 words, mismatches ${bad}${firstBad ? ', first ' + firstBad : ''})`);
})();

// ---------------------------------------------------------------- 3. tensor-level comparison against the patched C++ dumps
function compareDump(label, dumpFile, wordsFile, expectedCount) {
  const W = words(wordsFile); let beats = 0, tensors = 0, elems = 0, bad = 0, first = null;
  assert.equal(W.length, expectedCount, wordsFile + ': expected beat count');
  KM.resetCov();
  for (const beat of readDump(D + dumpFile)) {
    assert.equal(beat.index, beats, dumpFile + ': sequential beat index');
    const res = model.run(W[beat.index], { trace: true }); beats++;
    const S1 = res.steps, S2 = res.stage2;
    for (const r of beat.recs) {
      let mine;
      const t = r.step;
      if (r.tag === 'sums2') mine = Int32Array.from([res.sums2[0], res.sums2[1], res.pred2]);
      else if (r.tag === 'sums4') mine = Int32Array.from([...res.sums4, res.pred4]);
      else {
        const m = /^(\w+?)(?:\.(V0|V1|bank))?$/.exec(r.tag); const base = m[1], sub = m[2];
        const src = r.stage === 1 ? S1[t] : S2[t];
        if (!src) { bad++; if (!first) first = [beat.index, r.tag, 'no model step']; continue; }
        if (sub) { const stt = src[base + '.state']; mine = sub === 'bank' ? Int32Array.from([stt.bank]) : stt[sub]; }
        else mine = src[base];
      }
      tensors++; elems += r.data.length;
      if (!mine || mine.length !== r.data.length) { bad++; if (!first) first = [beat.index, r.tag + '@' + r.stage + '.' + t, 'length ' + (mine && mine.length) + ' vs ' + r.data.length]; continue; }
      for (let i = 0; i < mine.length; i++) if (mine[i] !== r.data[i]) { bad++; if (!first) first = [beat.index, r.tag + '@' + r.stage + '.' + t, 'index ' + i, 'model ' + mine[i], 'golden ' + r.data[i]]; break; }
    }
  }
  ok(label, bad === 0 && tensors > 0 && beats === expectedCount, `(${beats} beats, ${tensors} tensors, ${elems.toLocaleString()} values compared, differing tensors ${bad}${first ? ', first ' + JSON.stringify(first) : ''})`);
  return Object.assign({}, KM.COV);
}
const covShow = compareDump('tensors: 200-beat subset (24 shown beats + 176 random)', 'tensors_show200.bin', 'words_tensor.bin', 200);
const covStress = compareDump('tensors: 126 stress words (edge cases + random int8)', 'tensors_stress.bin', 'words_stress.bin', 126);

// ---------------------------------------------------------------- 4. final outputs vs the REAL, unmodified topFunction
function finals(label, wordsFile, predFile, expectedCount) {
  const W = words(wordsFile), Pr = preds(predFile); let bad = 0; KM.resetCov();
  assert.equal(W.length, expectedCount, wordsFile + ': beat count');
  assert.equal(Pr.length, expectedCount, predFile + ': prediction count');
  for (let i = 0; i < W.length; i++) { const r = model.run(W[i]); if (r.pred2 !== Pr[i][0] || r.pred4 !== Pr[i][1]) bad++; }
  ok(label, bad === 0, `(${W.length} beats, differing ${bad})`);
  return Object.assign({}, KM.COV);
}
const covVer = finals('final pred2 / pred4: 1559 verification beats vs real topFunction', 'words_verify.bin', 'preds_top.txt', 1559);
finals('final pred2 / pred4: 200-beat subset vs real topFunction', 'words_tensor.bin', 'preds_tensor_top.txt', 200);
finals('final pred2 / pred4: 126 stress words vs real topFunction', 'words_stress.bin', 'preds_stress_top.txt', 126);
let covFull = {};
if (fullRequested) { covFull = finals('final pred2 / pred4: full test set vs real topFunction', 'words_full.bin', 'preds_top_full.txt', 20161); fullCompleted = true; }

// ---------------------------------------------------------------- 5. coverage
const all = {}; for (const c of [covShow, covStress, covVer, covFull]) for (const k in c) all[k] = (all[k] || 0) + c[k];
console.log('\nBranch coverage (events counted while running the verified sets; a branch with 0 events was NOT exercised):');
const expect = ['requant.satHi', 'requant.satLo', 'requant.bigint', 'rne.tie', 'rne.satHi', 'rne.satLo', 'rne.bigint', 'lif.betaClamped', 'lif.thetaNegative', 'lif.delayedReset', 'lif.wrap24', 'qi.qOneClampedHi', 'gate.tie', 'argmax.executed', 'argmax.candidateTie', 'argmax.finalMaxTie'];
for (const k of expect) console.log('  ' + k.padEnd(20) + (all[k] || 0));
// ---------------------------------------------------------------- 6. reachability of the branches the data never hit
// 0 events means either "not tested" or "cannot happen with these parameters". Exact / worst-case bounds from the exported parameters decide which.
const reach = {};
(function () {
  const out = [];
  // BN: the input is an INT8, so every possible acc = x*w+bias is enumerable -> exact tie reachability per channel.
  P.blocks.forEach((b, i) => {
    let tieCh = 0, tieVals = 0;
    for (let c = 0; c < b.bn.c; c++) {
      const w = b.bn.weight[c], bi = b.bn.bias[c], m = b.bn.mult[c], r = b.bn.shift[c]; let hit = 0;
      if (r > 0) for (let x = -128; x <= 127; x++) { const p = BigInt(x * w + bi) * BigInt(m); const ax = p < 0n ? -p : p; if ((ax & ((1n << BigInt(r)) - 1n)) === (1n << BigInt(r - 1))) hit++; }
      if (hit) { tieCh++; tieVals += hit; }
    }
    out.push(`bn${i + 1}: RNE tie reachable for ${tieCh}/${b.bn.c} channels (${tieVals} of ${b.bn.c * 256} (channel, int8 input) pairs)`);
    reach['bn' + (i + 1) + '_tie'] = { channels: b.bn.c, tieChannels: tieCh, tiePairs: tieVals, pairs: b.bn.c * 256 };
  });
  const need = [];
  const chk = (name, maxAcc, mults) => { let mx = 0, n = 0; for (let k = 0; k < mults.length; k++) { const pr = maxAcc[k] * Math.abs(mults[k]); mx = Math.max(mx, pr); if (pr >= 2 ** 52) n++; } need.push(`${name}: max |acc*mult| = 2^${Math.log2(mx).toFixed(1)}${n ? ' (' + n + ' channels have bounds at/above 2^52 -> fallback not excluded by this bound)' : ' (< 2^52: the BigInt fallback can never trigger)'}`); reach[name] = { log2max: Math.log2(mx), over: n, fallbackThresholdBits: 52 }; };
  P.blocks.forEach((b, i) => {
    const c = b.conv, per = c.ic * c.k, ma = [];
    for (let o = 0; o < c.oc; o++) { let s = 0; for (let j = 0; j < per; j++) s += Math.abs(c.weights[o * per + j]); ma.push(128 * s); }
    chk('conv' + (i + 1), ma, c.mult);
    chk('bn' + (i + 1), b.bn.weight.map((w, k) => 128 * Math.abs(w) + Math.abs(b.bn.bias[k])), b.bn.mult);
  });
  for (const [n, f] of [['fc_bin', P.bin.fc], ['fc1', P.multi.fc1], ['fc2', P.multi.fc2]]) {
    const ma = []; for (let o = 0; o < f.out; o++) { let s = 0; for (let k = 0; k < f.inn; k++) s += Math.abs(f.weights[o * f.inn + k]); ma.push(128 * s); }
    chk(n, ma, f.mult);
  }
  const lifs = [['lif1', P.blocks[0].lif], ['lif2', P.blocks[1].lif], ['lif3', P.blocks[2].lif], ['bin_lif', P.bin.lif], ['m_lif1', P.multi.lif1], ['m_lif2', P.multi.lif2]];
  const lb = lifs.map(([n, l]) => {
    // beta in [0,4096]: signed Q12 rounding can increase |v| by <= 1.
    // A triggered negative theta rounds to theta-1; positive theta stays theta.
    // Same-bank storage gives each parity chain ceil(T/2) updates from zero.
    const chainUpdates = Math.ceil(P.num_steps / 2), resetAbsBound = Math.abs(l.theta) + (l.theta < 0 ? 1 : 0);
    const perUpdate = 128 * Math.abs(l.scale) + 1 + resetAbsBound, bound = chainUpdates * perUpdate;
    reach[n] = { vBound: bound, chainUpdates, perUpdate, resetAbsBound, betaRoundAbsErrorBound: 1 };
    return `${n} <= ${bound.toLocaleString()}`;
  });
  console.log('\nReachability (worst case over ALL inputs, from the exported parameters):');
  out.concat(need).forEach(l => console.log('  ' + l));
  console.log('  LIF |membrane| bound (T=10; limit 2^23 = 8,388,608): ' + lb.join('; '));
})();
fs.writeFileSync(D + 'reachability.json', JSON.stringify(reach));
process.on('exit', () => fs.writeFileSync(D + 'verify_summary.json', JSON.stringify({ results, coverage: all, reach, full: fullCompleted, fullRequested, scopes: { quantizationBeats: 1559, tensorRealBeats: 200, tensorStressInputs: 126, finalFullBeats: fullCompleted ? 20161 : 0, all1559TensorsCompared: false }, fails })));
console.log(fails.length ? '\nFAILED: ' + fails.join('; ') : '\nALL CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
