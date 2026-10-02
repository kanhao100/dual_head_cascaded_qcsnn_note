// Real numbers for the micro-architecture page, computed with the verified model and cross-checked against the RTL simulation.
'use strict';
const fs = require('fs'), path = require('path');
const KM = require('../kernel_model');
const P = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'params.json'), 'utf8'));
const D = path.join(__dirname, '..', 'data') + path.sep;
const rd = f => { const b = fs.readFileSync(D + f); const a = new Int8Array(b.buffer, b.byteOffset, b.length); const o = []; for (let i = 0; i < a.length / 188; i++) o.push(a.slice(i * 188, i * 188 + 188)); return o; };
const tens = rd('words_tensor.bin');
const model = KM.create(P);
const R = model.run(tens[8], { trace: true });
const w24 = KM.prim.wrap24;
const out = { beat: 'tensor-subset #8 (S, correct)', lif: {}, conv: {} };

// one neuron over the ten calls, the way the RTL computes it (V0 for even calls, V1 for odd calls, each read and written by the same call)
function neuron(inSeq, par) {
  const beta = Math.max(0, Math.min(4096, par.beta)), th = par.theta, sc = par.scale, bank = [0, 0], rows = [];
  for (let t = 0; t < 10; t++) {
    const b = t & 1, vPrev = bank[b], x = inSeq[t], xq = w24(x * sc), rPrev = vPrev > th ? 1 : 0;
    let pb = beta * vPrev, pbR = pb >= 0 ? pb + 2048 : pb - 2048; const vBeta = w24(Math.floor(pbR / 4096));
    let pr = rPrev * 4096 * th, prR = pr >= 0 ? pr + 2048 : pr - 2048; const sub = w24(Math.floor(prR / 4096));
    const addend = xq - sub;   // what the DSP48 produces: x*scale + (reset constant)
    const vNext = w24(vBeta + addend), spk = vNext > th ? 1 : 0;
    rows.push({ t, bank: b, x, xq, vPrev, rPrev, prod: pb, round: pb >= 0 ? 2048 : -2048, vBeta, sub, addend, vNext, spk });
    bank[b] = vNext;
  }
  return rows;
}
const pick = (key, inKey, par, nIdx, pred) => {
  const arr = R.steps || []; let best = null;
  for (let i = 0; i < nIdx; i++) { const rows = neuron(arr.map(S => S[inKey][i]), par); const sc = pred(rows); if (sc != null && (best == null || sc > best.sc)) best = { i, sc, rows }; }
  return best;
};
const L1 = pick('lif1', 'bn1', P.blocks[0].lif, 16 * 178, r => r[0].spk && r[2].rPrev ? 10 + r.reduce((a, q) => a + q.spk, 0) : null);
out.lif.lif1 = { idx: L1.i, channel: Math.floor(L1.i / 178), pos: L1.i % 178, rows: L1.rows };
// β = 1.0 (clamped) with negative membrane: the "no leak" path still moves a negative value by one step per call
const L3 = pick('lif3', 'bn3', P.blocks[2].lif, 24 * 41, r => { const neg = r.filter(q => q.vPrev < 0).length; return neg >= 3 ? neg : null; });
out.lif.lif3 = L3 ? { idx: L3.i, channel: Math.floor(L3.i / 41), pos: L3.i % 41, rows: L3.rows } : null;
// negative threshold: output LIF of the binary head
const LB = pick('bin', 'bin_fc', P.bin.lif, 2, r => r.filter(q => q.vNext > P.bin.lif.theta && q.vNext <= 0).length + 1);
out.lif.lifBin = { idx: LB.i, rows: LB.rows };

// ---- conv2: one output point, step 0
const S0 = R.steps[0], cv = P.blocks[1].conv, ic = 16, oc = 16, k = 3, inLen = 89, outLen = 87;
const inp = S0.qi2, conv2 = S0.conv2;
function point(o, w) {
  const win = [], wt = [], pr = []; let acc = 0;
  for (let q = 0; q < ic; q++) { const a = [], b = [], c = []; for (let j = 0; j < k; j++) { const x = inp[q * inLen + w + j], ww = cv.weights[(o * ic + q) * k + j]; a.push(x); b.push(ww); c.push(x * ww); acc += x * ww; } win.push(a); wt.push(b); pr.push(c); }
  const mult = cv.mult[o], shift = cv.shift[o], prod = BigInt(acc) * BigInt(mult), off = 1n << BigInt(shift - 1), rounded = prod + off, val = rounded >> BigInt(shift);
  return { oc: o, w, window: win, weights: wt, products: pr, acc, mult, shift, prod: prod.toString(), offset: off.toString(), rounded: rounded.toString(), shifted: val.toString(), out: conv2[o * outLen + w] };
}
// best demo point: biggest |acc|, not saturated
let best = null; for (let o = 0; o < oc; o++) for (let w = 0; w < outLen; w++) { const p = point(o, w); if (Math.abs(p.out) < 127 && (best == null || Math.abs(p.acc) > Math.abs(best.acc))) best = p; }
out.conv.point = best;
out.conv.first = Array.from({ length: 10 }, (_, w) => { const p = point(0, w); return { w, acc: p.acc, prod: p.prod, out: p.out }; });
out.conv.satCount = Array.from(conv2).filter(v => v === 127 || v === -128).length;
fs.writeFileSync(path.join(__dirname, 'micro_examples.json'), JSON.stringify(out));
console.log('examples ok; lif1 neuron', L1.i, 'lif3', L3 && L3.i, 'conv point', best.oc, best.w, 'acc', best.acc, 'out', best.out, '| first acc', out.conv.first.map(x => x.acc).join(','));
