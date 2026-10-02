// Read-only acceptance check for the 24 displayed beats and the animation arithmetic.
// Usage from any directory: node walkthrough/qa_numeric.js
// Reads saved C++ references; never regenerates or writes verification summaries.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const KM = require('./kernel_model');
const { readDump, indexBeat } = require('./golden_parse');
const file = n => path.join(__dirname, n);
const read = n => fs.readFileSync(file(n), 'utf8');
const P = JSON.parse(read('params.json'));
const pack = JSON.parse(read('pack.json'));
const model = KM.create(P);
const i8 = s => Int8Array.from(Buffer.from(s, 'base64'), v => v > 127 ? v - 256 : v);
const f32 = s => {
  const b = Buffer.from(s, 'base64');
  return Array.from({ length: b.length / 4 }, (_, i) => b.readFloatLE(i * 4));
};
// Verify all packed scalars/arrays too; omitted bias and diagnostic fields are intentional.
const unpacked = JSON.parse(JSON.stringify(pack.params));
unpacked.blocks.forEach(b => { b.conv.weights = Array.from(i8(b.conv.weights)); });
[unpacked.bin.fc, unpacked.multi.fc1, unpacked.multi.fc2].forEach(f => { f.weights = Array.from(i8(f.weights)); });
const checkPackedFields = (packed, original, label) => {
  if (Array.isArray(packed)) assert.equal(packed.length, original.length, label + ': array length');
  for (const key of Object.keys(packed)) {
    assert.ok(Object.hasOwn(original, key), `${label}.${key}: exported field exists`);
    if (packed[key] && typeof packed[key] === 'object') checkPackedFields(packed[key], original[key], `${label}.${key}`);
    else assert.deepEqual(packed[key], original[key], `${label}.${key}`);
  }
};
checkPackedFields(unpacked, P, 'packed parameters');
const eq = (a, b, label) => {
  assert.ok(a && b, label + ': missing tensor');
  assert.equal(a.length, b.length, label + ': length');
  for (let i = 0; i < a.length; i++) assert.equal(a[i], b[i], `${label}[${i}]`);
};
const tensor = (r, stage, step, tag) => {
  if (tag === 'sums2') return Int32Array.from([...r.sums2, r.pred2]);
  if (tag === 'sums4') return Int32Array.from([...r.sums4, r.pred4]);
  const m = /^(\w+?)(?:\.(V0|V1|bank))?$/.exec(tag);
  const s = (stage === 1 ? r.steps : r.stage2)[step];
  if (!s) return null;
  if (!m[2]) return s[m[1]];
  const st = s[m[1] + '.state'];
  return m[2] === 'bank' ? Int32Array.from([st.bank]) : st[m[2]];
};

// Load the actual animation detail functions, skipping all browser/DOM callbacks.
// Runtime instrumentation only makes the closure's neuron function available here.
const animationHost = { HW: {}, KM, AN: { PARAMS: P, guard() {} } };
vm.createContext(animationHost);
vm.runInContext(read('anim_b.js'), animationHost, { filename: 'anim_b.js' });
const cSource = read('anim_c.js');
assert.ok(cSource.includes("AN.guard('lif', function () {"), 'LIF instrumentation anchor');
vm.runInContext(cSource.replace("AN.guard('lif', function () {", "AN.neuronDetail = neuron; AN.guard('lif', function () {"), animationHost, { filename: 'anim_c.js' });
const A = animationHost.AN;

// Packed weights must be the same exported parameters used by the model.
P.blocks.forEach((b, i) => eq(i8(pack.params.blocks[i].conv.weights), b.conv.weights, 'packed conv' + (i + 1)));
for (const [name, ref, packed] of [['bin FC', P.bin.fc, pack.params.bin.fc], ['multi FC1', P.multi.fc1, pack.params.multi.fc1], ['multi FC2', P.multi.fc2, pack.params.multi.fc2]]) {
  eq(i8(packed.weights), ref.weights, 'packed ' + name);
  assert.equal(ref.inn, packed.inn, name + ' input size');
  assert.equal(ref.out, packed.out, name + ' output size');
}
console.log('PASS packed parameters: all scalars and 6 convolution / FC weight arrays match params.json');

const tops = read('data/preds_tensor_top.txt').trim().split('\n').map(l => l.trim().split(/\s+/).map(Number));
const wordsCpp = fs.readFileSync(file('data/words_tensor.bin'));
const runs = [];
let digestCount = 0;
assert.equal(pack.beats.length, 24, 'display beat count');
for (let b = 0; b < pack.beats.length; b++) {
  const beat = pack.beats[b], words = model.quantizeRow(f32(beat.row));
  eq(words, i8(beat.words), 'FileReader quantization beat ' + b);
  eq(words, Int8Array.from(wordsCpp.subarray(188 * b, 188 * (b + 1)), v => v > 127 ? v - 256 : v), 'saved C++ words beat ' + b);
  const r = model.run(words, { trace: true });
  runs.push(r);
  eq([r.pred2, r.pred4], beat.top, 'packed topFunction beat ' + b);
  eq([r.pred2, r.pred4], tops[b], 'saved topFunction beat ' + b);
  const g = pack.gold[b], dig = Buffer.from(g.d, 'base64');
  assert.equal(dig.length, g.n * 4, 'packed digest bytes beat ' + b);
  for (let k = 0; k < g.n; k++) {
    const [stage, step, tag] = pack.keys[k].split('|');
    const t = tensor(r, +stage, +step, tag);
    assert.ok(t, `${b}: ${tag}@${stage}.${step}`);
    assert.equal(KM.digest(t), dig.readUInt32LE(k * 4), `${b}: digest ${tag}@${stage}.${step}`);
    digestCount++;
  }
}
console.log(`PASS 24 beats: float32 input quantization, ${digestCount} tensor/state digests, pred2 / pred4`);

// Check every saved tensor for these beats, and retain only beat #12 for the 5 worked examples.
let cppBeatCount = 0, tensorCount = 0, valueCount = 0, workedGolden;
for (const beat of readDump(file('data/tensors_show200.bin'))) {
  if (beat.index >= pack.beats.length) break;
  cppBeatCount++;
  for (const rec of beat.recs) {
    const out = tensor(runs[beat.index], rec.stage, rec.step, rec.tag);
    eq(out, rec.data, `C++ beat ${beat.index} ${rec.tag}@${rec.stage}.${rec.step}`);
    tensorCount++;
    valueCount += rec.data.length;
  }
  if (beat.index === 12) workedGolden = indexBeat(beat);
}
assert.equal(cppBeatCount, 24, 'C++ reference beat count');
console.log(`PASS C++ tensor values: ${cppBeatCount} beats, ${tensorCount} tensors, ${valueCount.toLocaleString()} values`);

// BN animation details: every INT8 input in every exported BN channel.
let bnCases = 0;
for (const b of P.blocks) for (let ch = 0; ch < b.bn.c; ch++) for (let x = -128; x <= 127; x++) {
  const acc = (x * b.bn.weight[ch] + b.bn.bias[ch]) | 0;
  assert.equal(A.rneDetail(acc, b.bn.mult[ch], b.bn.shift[ch]).y, KM.prim.requantRNE(acc, b.bn.mult[ch], b.bn.shift[ch]), 'BN animation RNE');
  bnCases++;
}
console.log(`PASS BN animation: ${bnCases.toLocaleString()} (channel, INT8 input) cases`);

// Independently recompute the convolution, pool/QI and FC displays from their trace inputs.
let convCases = 0, poolCases = 0, fcCases = 0, lifSteps = 0;
const lifLayers = [
  ['bn1', 'lif1', P.blocks[0].lif, 1], ['bn2', 'lif2', P.blocks[1].lif, 1],
  ['bn3', 'lif3', P.blocks[2].lif, 1], ['bin_fc', 'bin_lif', P.bin.lif, 1],
  ['m_fc1', 'm_lif1', P.multi.lif1, 2], ['m_fc2', 'm_lif2', P.multi.lif2, 2],
];
for (const r of runs) {
  for (let t = 0; t < P.num_steps; t++) {
    const s = r.steps[t];
    P.blocks.forEach((b, layer) => {
      const cv = b.conv, inLen = [180, 89, 43][layer], outLen = inLen - cv.k + 1;
      const input = layer === 0 ? r.words : s['qi' + (layer + 1)];
      for (let o = 0; o < cv.oc; o++) for (let w = 0; w < outLen; w++) {
        let acc = 0;
        for (let ch = 0; ch < cv.ic; ch++) for (let k = 0; k < cv.k; k++) acc += input[ch * inLen + w + k] * cv.weights[(o * cv.ic + ch) * cv.k + k];
        assert.equal(A.reqDetail(acc | 0, cv.mult[o], cv.shift[o]).y, s['conv' + (layer + 1)][o * outLen + w], 'convolution animation');
        convCases++;
      }
      const plLen = Math.floor(outLen / 2), pl = s['pool' + (layer + 1)], qi = s[layer === 2 ? 'bin_qi' : 'qi' + (layer + 2)];
      const scale = layer === 2 ? P.bin.qi_scale : P.blocks[layer + 1].qi_scale;
      const qOne = KM.prim.qiQOne(scale);
      for (let ch = 0; ch < cv.oc; ch++) for (let w = 0; w < plLen; w++) {
        const mx = Math.max(s['lif' + (layer + 1)][ch * outLen + 2 * w], s['lif' + (layer + 1)][ch * outLen + 2 * w + 1]);
        assert.equal(mx, pl[ch * plLen + w], 'MaxPool animation');
        assert.equal(mx ? qOne : 0, qi[ch * plLen + w], 'QuantIdentity animation');
        poolCases++;
      }
    });
    for (const [inputKey, outputKey, f, s_] of [['bin_cat', 'bin_fc', P.bin.fc, s], ['m_cat', 'm_fc1', P.multi.fc1, r.stage2[t]], ['m_qi2', 'm_fc2', P.multi.fc2, r.stage2[t]]]) {
      if (!s_) continue;
      assert.equal(s_[inputKey].length, f.inn, 'FC input size');
      const safe = 128 * Math.max(...Array.from({ length: f.out }, (_, o) => f.weights.slice(o * f.inn, (o + 1) * f.inn).reduce((a, w) => a + Math.abs(w), 0)));
      assert.ok(safe < 2 ** 31, 'FC accumulator INT32 bound');
      for (let o = 0; o < f.out; o++) {
        let acc = 0;
        for (let i = 0; i < f.inn; i++) acc += s_[inputKey][i] * f.weights[o * f.inn + i];
        assert.equal(A.reqDetail(acc | 0, f.mult[o], f.shift[o]).y, s_[outputKey][o], 'FC animation');
        fcCases++;
      }
    }
  }
  // The actual LIF animation function must reproduce every neuron's spike and both bank contents.
  for (const [inputKey, outputKey, par, stage] of lifLayers) {
    const steps = stage === 1 ? r.steps : r.stage2;
    if (!steps.length) continue;
    for (let i = 0; i < steps[0][inputKey].length; i++) {
      const tr = A.neuronDetail(steps.map(s => s[inputKey][i]), par, 'kernel');
      for (let t = 0; t < P.num_steps; t++) {
        const s = steps[t], st = s[outputKey + '.state'], active = t & 1 ? st.V1 : st.V0, inactive = t & 1 ? st.V0 : st.V1;
        assert.equal(tr[t].spk, s[outputKey][i], 'LIF animation spike');
        assert.equal(tr[t].vNext, active[i], 'LIF animation membrane');
        assert.equal(tr[t].vPrev, t >= 2 ? tr[t - 2].vNext : 0, 'LIF t−2 bank chain');
        assert.equal(inactive[i], t >= 1 ? tr[t - 1].vNext : 0, 'LIF inactive bank preserved');
        assert.equal(st.bank, (t + 1) & 1, 'LIF bank toggle');
        lifSteps++;
      }
    }
  }
}
console.log(`PASS trace-driven animation values: ${convCases.toLocaleString()} conv, ${poolCases.toLocaleString()} pool/QI, ${fcCases.toLocaleString()} FC, ${lifSteps.toLocaleString()} LIF neuron-steps`);

// Five inspectable calculations, including the negative Q12 edge case.
const r = runs[12], s = r.steps[0], g = (tag, stage, t, i) => workedGolden.get(`${tag}@${stage}.${t}`)[i];
const cv = P.blocks[0].conv;
let bestW = 0, bestAcc = 0;
for (let w = 0; w < 178; w++) {
  const acc = r.words[w] * cv.weights[0] + r.words[w + 1] * cv.weights[1] + r.words[w + 2] * cv.weights[2];
  if (Math.abs(acc) > Math.abs(bestAcc)) { bestW = w; bestAcc = acc; }
}
const bn = P.blocks[0].bn, bnAcc = s.conv1[bestW] * bn.weight[0] + bn.bias[0];
const lif = A.neuronDetail(r.steps.map(s => s.bin_fc[0]), P.bin.lif, 'kernel')[2];
const poolIndex = s.pool3.findIndex(v => v === 1), pc = Math.floor(poolIndex / 20), pw = poolIndex % 20;
const f = P.multi.fc1, input = r.stage2[0].m_cat;
let bestO = 0, fcAcc = 0;
for (let o = 0; o < f.out; o++) {
  let a = 0;
  for (let i = 0; i < f.inn; i++) a += input[i] * f.weights[o * f.inn + i];
  if (Math.abs(a) > Math.abs(fcAcc)) { bestO = o; fcAcc = a; }
}
const examples = [
  { block: 'conv1', stage: 1, t: 0, channel: 0, position: bestW, x: Array.from(r.words.slice(bestW, bestW + 3)), weights: cv.weights.slice(0, 3), acc: bestAcc, mult: cv.mult[0], shift: cv.shift[0], output: A.reqDetail(bestAcc, cv.mult[0], cv.shift[0]).y, cpp: g('conv1', 1, 0, bestW) },
  { block: 'bn1', stage: 1, t: 0, channel: 0, position: bestW, x: s.conv1[bestW], weight: bn.weight[0], bias: bn.bias[0], acc: bnAcc, mult: bn.mult[0], shift: bn.shift[0], output: A.rneDetail(bnAcc, bn.mult[0], bn.shift[0]).y, cpp: g('bn1', 1, 0, bestW) },
  { block: 'bin_lif', stage: 1, t: 2, neuron: 0, betaClamped: 4096, theta: P.bin.lif.theta, initialResetSub: A.neuronDetail(r.steps.map(s => s.bin_fc[0]), P.bin.lif, 'kernel')[0].sub, xq: lif.xq, vPrev: lif.vPrev, rawBetaProduct: lif.rawB, adjustedBetaProduct: lif.prodB, vBeta: lif.vBeta, resetSub: lif.sub, vNext: lif.vNext, membraneCpp: g('bin_lif.V0', 1, 2, 0), output: lif.spk, cpp: g('bin_lif', 1, 2, 0) },
  { block: 'pool3', stage: 1, t: 0, channel: pc, position: pw, pair: [s.lif3[pc * 41 + 2 * pw], s.lif3[pc * 41 + 2 * pw + 1]], output: s.pool3[poolIndex], cpp: g('pool3', 1, 0, poolIndex), qi: s.bin_qi[poolIndex] },
  { block: 'm_fc1', stage: 2, t: 0, neuron: bestO, inputSize: f.inn, acc: fcAcc, mult: f.mult[bestO], shift: f.shift[bestO], output: A.reqDetail(fcAcc, f.mult[bestO], f.shift[bestO]).y, cpp: g('m_fc1', 2, 0, bestO) },
];
for (const e of examples) {
  assert.equal(e.output, e.cpp, 'worked example ' + e.block);
  if ('membraneCpp' in e) assert.equal(e.vNext, e.membraneCpp, 'worked LIF membrane');
}
console.log('PASS 5 worked examples from real beat #12 (record 213, center 583838):');
examples.forEach(e => console.log('  ' + JSON.stringify(e)));
console.log('ALL NUMERIC ACCEPTANCE CHECKS PASSED (no files written)');
