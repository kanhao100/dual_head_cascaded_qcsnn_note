/* Bit-accurate functional model of the QCSNN `topFunction` kernel (dual-head, shared trunk).
 *
 * Ported statement by statement from csnn_cpp/include/hls4csnn1d_sd/model24/ :
 *   constants24_sd.h   requantize (l.120), sat_clip_int8 (l.113)
 *   cblk_sd/conv1d_sd.h, batchnorm1d_sd.h (requantize_rne_abs l.21), lif1d_integer.h, maxpool1d_sd.h,
 *   quantidentity1d_sd.h, linear1d_sd.h, qcsnn24_rrboth_sd.h (forward), filereader24.h (host-side input quantisation)
 *
 * All arithmetic is integer. ap_int<N> assignments wrap (AP_WRAP), so every narrowing assignment goes through a wrap.
 * Numbers are JS doubles, exact below 2^53; 64-bit products that could exceed that fall back to BigInt.
 * The model is checked against C++ references (verify_model.js); it makes no claim beyond what that check covers.
 *
 * lifMode: 'asWritten' reproduces lif1d_integer.h exactly as it is in the repository (read and write hit the same bank);
 *          'intended' swaps the write bank to match the comments ("write to the other bank") -- used ONLY for comparison.
 */
var KM = (function () {
  'use strict';

  // ------------------------------------------------------------------ coverage counters (which branches ran)
  const COV = {};
  function cnt(k) { COV[k] = (COV[k] || 0) + 1; }
  function resetCov() { for (const k in COV) delete COV[k]; }

  // ------------------------------------------------------------------ integer primitives
  const P53 = 9007199254740992, P52 = 4503599627370496;
  const wrap32 = x => x | 0;                               // ToInt32 is exact modulo 2^32 for any integer-valued double
  const wrap24 = x => ((x | 0) << 8) >> 8;                 // valid while |x| < 2^53 (modulo 2^24 after the 32-bit wrap)
  const wrap16 = x => ((x | 0) << 16) >> 16;
  function wrapN(x, bits) { const m = Math.pow(2, bits); const r = x - Math.floor(x / m) * m; return r >= m / 2 ? r - m : r; }
  const satInt8 = v => v > 127 ? 127 : (v < -128 ? -128 : v);

  // constants24_sd.h:120  y_q = clip( (acc*mult + 2^(shift-1)) >> shift )   with the (ap_int<32>) wrap before the clip
  function requant(acc, mult, shift) {
    const pd = acc * mult;
    let w;
    if (shift > 0) {
      if (Math.abs(pd) < P52) w = Math.floor((pd + Math.pow(2, shift - 1)) / Math.pow(2, shift)) | 0;
      else { cnt('requant.bigint'); w = Number(BigInt.asIntN(32, (BigInt(acc) * BigInt(mult) + (1n << BigInt(shift - 1))) >> BigInt(shift))); }
    } else {
      w = Math.abs(pd) < P53 ? pd | 0 : Number(BigInt.asIntN(32, BigInt(acc) * BigInt(mult)));
    }
    if (shift > 0 && Math.abs(pd) < P52) { /* wrap already applied by |0 */ }
    const y = satInt8(w);
    if (y !== w) cnt(w > 0 ? 'requant.satHi' : 'requant.satLo');
    return y;
  }

  // batchnorm1d_sd.h:21  round-to-nearest-even on |acc*mul| / 2^rshift, sign restored, (ap_int<32>) wrap, clip
  function requantRNE(acc, mul, rshift) {
    const pd = acc * mul;
    if (rshift <= 0) { const w = Math.abs(pd) < P53 ? pd | 0 : Number(BigInt.asIntN(32, BigInt(acc) * BigInt(mul))); return satInt8(w); }
    let base, rem, half, neg;
    if (Math.abs(pd) < P52) {
      neg = pd < 0; const ax = Math.abs(pd), p2 = Math.pow(2, rshift);
      base = Math.floor(ax / p2); rem = ax - base * p2; half = Math.pow(2, rshift - 1);
      if (rem === half) cnt('rne.tie');
      const bump = rem > half || (rem === half && (base % 2 === 1));
      if (bump) base += 1;
      const sv = (neg ? -base : base) | 0;
      const y = satInt8(sv); if (y !== sv) cnt(sv > 0 ? 'rne.satHi' : 'rne.satLo');
      return y;
    }
    cnt('rne.bigint');
    const P = BigInt(acc) * BigInt(mul); neg = P < 0n; const ax = neg ? -P : P, r = BigInt(rshift);
    let b = ax >> r; const rm = ax & ((1n << r) - 1n), hf = 1n << (r - 1n);
    if (rm > hf || (rm === hf && (b & 1n) === 1n)) b += 1n;
    return satInt8(Number(BigInt.asIntN(32, neg ? -b : b)));
  }

  // ------------------------------------------------------------------ layers (all tensors are flat, channel-major)
  // conv1d_sd.h:58-86   out[oc][w] = requant( sum_ic sum_k in[ic][w+k]*W[oc][ic][k] ); bias / zero-point paths are compiled out
  function conv1d(inp, inLen, L) {
    const { oc, ic, k, weights, mult, shift } = L, outLen = inLen - k + 1, out = new Int8Array(oc * outLen);
    for (let o = 0; o < oc; o++) {
      const wb = o * ic * k;
      for (let w = 0; w < outLen; w++) {
        let acc = 0;
        for (let c = 0; c < ic; c++) { const ib = c * inLen + w, wi = wb + c * k; for (let j = 0; j < k; j++) acc += inp[ib + j] * weights[wi + j]; }
        out[o * outLen + w] = requant(wrap32(acc), mult[o], shift[o]);
      }
    }
    return out;
  }
  // batchnorm1d_sd.h:102-109   y = requantRNE( x*weight[c] + bias[c] )
  function batchNorm(inp, c, len, B) {
    const out = new Int8Array(c * len);
    for (let ch = 0; ch < c; ch++) for (let i = 0; i < len; i++) out[ch * len + i] = requantRNE(wrap32(inp[ch * len + i] * B.weight[ch] + B.bias[ch]), B.mult[ch], B.shift[ch]);
    return out;
  }
  // maxpool1d_sd.h:38-47   window 2, stride 2, per channel
  function maxPool(inp, c, inLen) {
    const outLen = ((inLen - 2) >> 1) + 1, out = new Int8Array(c * outLen);
    for (let ch = 0; ch < c; ch++) for (let o = 0; o < outLen; o++) { const a = inp[ch * inLen + 2 * o], b = inp[ch * inLen + 2 * o + 1]; out[ch * outLen + o] = b > a ? b : a; }
    return out;
  }
  // quantidentity1d_sd.h:25-46   spike {0,1} -> {0, q_one},  q_one = (4096 + s/2) / s  (C integer division), clipped to int8
  function qiQOne(scale) {
    if (!(scale > 0)) return 127;
    const t = wrap16(Math.trunc((4096 + (scale >> 1)) / scale));
    if (t > 127) { cnt('qi.qOneClampedHi'); return 127; }
    if (t < -128) return -128;
    return t;
  }
  function quantIdentity(inp, scale) { const q = qiQOne(scale), out = new Int8Array(inp.length); for (let i = 0; i < inp.length; i++) if (inp[i] !== 0) out[i] = q; return out; }
  // linear1d_sd.h:63-98   acc[o] = sum_i x[i]*W[o][i];  y = requant(acc)
  function linear(inp, F) {
    const { out: no, inn, weights, mult, shift } = F, y = new Int8Array(no);
    for (let o = 0; o < no; o++) { let acc = 0; const wb = o * inn; for (let i = 0; i < inn; i++) acc += inp[i] * weights[wb + i]; y[o] = requant(wrap32(acc), mult[o], shift[o]); }
    return y;
  }

  // lif1d_integer.h:53-113   state = { V0, V1 (Int32Array, 24-bit values), bank }
  function lifNew(n) { return { V0: new Int32Array(n), V1: new Int32Array(n), bank: false, n }; }
  function lifReset(st) { st.V0.fill(0); st.V1.fill(0); st.bank = false; }                    // reset(): l.23-33
  function lifForward(st, inp, par, mode) {
    const theta = par.theta, scale = par.scale;
    let beta = par.beta; if (beta < 0) beta = 0; else if (beta > 4096) { beta = 4096; cnt('lif.betaClamped'); }   // l.49-51
    if (theta < 0) cnt('lif.thetaNegative');
    const rd = st.bank, wr = !st.bank;                                                          // l.53-54
    const rdArr = rd ? st.V1 : st.V0;                                                            // l.69-70
    const wrArr = mode === 'intended' ? (wr ? st.V1 : st.V0) : (wr ? st.V0 : st.V1);            // l.103-104 as written: wr ? V0 : V1
    const out = new Int8Array(st.n);
    for (let i = 0; i < st.n; i++) {
      const xq = wrap24(inp[i] * scale);                                                         // l.65
      const vPrev = rdArr[i];
      const rPrev = vPrev > theta ? 4096 : 0;                                                    // l.73-74
      if (rPrev) cnt('lif.delayedReset');
      let pb = beta * vPrev; pb = pb >= 0 ? pb + 2048 : pb - 2048;                               // l.77-78 (|pb| < 2^39: no 40-bit wrap)
      const vBeta = wrap24(Math.floor(pb / 4096));                                               // l.79
      const base = wrap24(vBeta + xq);                                                           // l.82
      let pr = rPrev * theta; pr = pr >= 0 ? pr + 2048 : pr - 2048;                              // l.88-89
      const sub = wrap24(Math.floor(pr / 4096));                                                 // l.90
      const vNext = wrap24(base - sub);                                                          // l.91
      if (vBeta !== Math.floor(pb / 4096) || base !== vBeta + xq || vNext !== base - sub) cnt('lif.wrap24');
      out[i] = vNext > theta ? 1 : 0;                                                            // l.99-100 strict '>'
      wrArr[i] = vNext;                                                                          // l.103-104
    }
    st.bank = !st.bank;                                                                          // l.112
    return out;
  }
  const lifSnapshot = st => ({ V0: st.V0.slice(), V1: st.V1.slice(), bank: st.bank ? 1 : 0 });

  // ------------------------------------------------------------------ host-side input quantisation (filereader24.h:308-329, 419-431)
  const f32 = Math.fround;
  function rne(v) { const r = Math.round(v); return Math.abs(v - Math.trunc(v)) === 0.5 ? 2 * Math.round(v / 2) : r; }   // nearbyintf, ties to even
  function clamp8(q) { return q > 127 ? 127 : (q < -128 ? -128 : q); }

  // ------------------------------------------------------------------ model
  function create(Pm, opts) {
    opts = opts || {};
    const mode = opts.lifMode || 'asWritten';
    const T = Pm.num_steps;
    const inv_s = f32(1.0 / f32(Pm.input_scale_f32));
    const rrMean = Pm.rr.mean.map(f32), rrInv = Pm.rr.std_inv.map(f32);
    const cv = Pm.blocks.map(b => ({ ...b.conv, weights: Int8Array.from(b.conv.weights), mult: Float64Array.from(b.conv.mult), shift: Int32Array.from(b.conv.shift) }));
    const bn = Pm.blocks.map(b => ({ weight: Int32Array.from(b.bn.weight), bias: Int32Array.from(b.bn.bias), mult: Float64Array.from(b.bn.mult), shift: Int32Array.from(b.bn.shift) }));
    const mkFc = f => ({ out: f.out, inn: f.inn, weights: Int8Array.from(f.weights), mult: Float64Array.from(f.mult), shift: Int32Array.from(f.shift) });
    const fcBin = mkFc(Pm.bin.fc), fcM1 = mkFc(Pm.multi.fc1), fcM2 = mkFc(Pm.multi.fc2);
    const lens = [[180, 178, 89], [89, 87, 43], [43, 41, 20]];                      // [conv in, conv out / LIF len, pool out]
    const st = {
      l1: lifNew(16 * 178), l2: lifNew(16 * 87), l3: lifNew(24 * 41), lb: lifNew(2),
      m1: lifNew(128), m2: lifNew(4),
    };

    // host-side quantisation of one 184-float CSV row -> the kernel's 188 int8 input words
    function quantizeRow(row) {
      const w = new Int8Array(188);
      for (let k = 0; k < 180; k++) w[k] = clamp8(rne(f32(f32(row[k]) * inv_s)));                                   // quantize_input_sample
      const sc1 = f32(Pm.bin.qi_scale / 4096), sc2 = f32(Pm.multi.qi1_scale / 4096);
      for (let r = 0; r < 4; r++) {
        const xn = f32(f32(f32(row[180 + r]) - rrMean[r]) * rrInv[r]);                                              // (x - mean) * std_inv
        w[180 + r] = clamp8(rne(f32(xn / sc1)));                                                                     // stage-1 head scale
        w[184 + r] = clamp8(rne(f32(xn / sc2)));                                                                     // stage-2 head scale
      }
      return w;
    }

    // qcsnn24_rrboth_sd.h: forward().  words = 180 signal + 4 RR(stage 1) + 4 RR(stage 2), int8.
    function run(words, ro) {
      ro = ro || {};
      const trace = !!ro.trace, steps = [], res = {};
      const sig = Int8Array.from(words.subarray ? words.subarray(0, 180) : words.slice(0, 180));
      const rr1 = Int8Array.from(words.slice(180, 184)), rr2 = Int8Array.from(words.slice(184, 188));
      lifReset(st.l1); lifReset(st.l2); lifReset(st.l3); lifReset(st.lb);                                          // l.103-106
      const cache = [];                                                                                             // body_cache[T][480]
      let s0 = 0, s1 = 0;                                                                                           // sum_bin0 (normal), sum_bin1 (abnormal)
      for (let t = 0; t < T; t++) {                                                                                 // STAGE1_LOOP (l.190)
        const S = {};
        S.conv1 = conv1d(sig, 180, cv[0]);                      S.bn1 = batchNorm(S.conv1, 16, 178, bn[0]);
        S.lif1 = lifForward(st.l1, S.bn1, Pm.blocks[0].lif, mode); if (trace) S['lif1.state'] = lifSnapshot(st.l1);
        S.pool1 = maxPool(S.lif1, 16, 178);                     S.qi2 = quantIdentity(S.pool1, Pm.blocks[1].qi_scale);
        S.conv2 = conv1d(S.qi2, 89, cv[1]);                     S.bn2 = batchNorm(S.conv2, 16, 87, bn[1]);
        S.lif2 = lifForward(st.l2, S.bn2, Pm.blocks[1].lif, mode); if (trace) S['lif2.state'] = lifSnapshot(st.l2);
        S.pool2 = maxPool(S.lif2, 16, 87);                      S.qi3 = quantIdentity(S.pool2, Pm.blocks[2].qi_scale);
        S.conv3 = conv1d(S.qi3, 43, cv[2]);                     S.bn3 = batchNorm(S.conv3, 24, 41, bn[2]);
        S.lif3 = lifForward(st.l3, S.bn3, Pm.blocks[2].lif, mode); if (trace) S['lif3.state'] = lifSnapshot(st.l3);
        S.pool3 = maxPool(S.lif3, 24, 41);                      cache.push(S.pool3);                                // l.280
        S.bin_qi = quantIdentity(S.pool3, Pm.bin.qi_scale);
        const cat = new Int8Array(484); cat.set(S.bin_qi); cat.set(rr1, 480);                                        // l.296: RR bypasses the QI
        S.bin_fc = linear(cat, fcBin); S.bin_cat = cat;
        S.bin_lif = lifForward(st.lb, S.bin_fc, Pm.bin.lif, mode); if (trace) S['bin_lif.state'] = lifSnapshot(st.lb);
        s0 += S.bin_lif[0]; s1 += S.bin_lif[1];
        if (trace) steps.push(S);
      }
      const pred2 = s1 > s0 ? 1 : 0;                                                                                 // gate_abnormal(sum_norm, sum_abn), l.323
      if (s1 === s0) cnt('gate.tie');
      res.sums2 = [s0, s1]; res.pred2 = pred2; res.stage2 = [];
      let pred4 = 0, sums4 = [0, 0, 0, 0];
      if (pred2 === 1) {                                                                                             // else: pred4 = 0, return (l.326)
        lifReset(st.m1); lifReset(st.m2);                                                                            // l.334-335
        for (let t = 0; t < T; t++) {                                                                                // STAGE2_LOOP (l.339)
          const S = {};
          S.m_qi1 = quantIdentity(cache[t], Pm.multi.qi1_scale);
          const cat = new Int8Array(484); cat.set(S.m_qi1); cat.set(rr2, 480);                                        // l.360
          S.m_fc1 = linear(cat, fcM1); S.m_cat = cat;
          S.m_lif1 = lifForward(st.m1, S.m_fc1, Pm.multi.lif1, mode); if (trace) S['m_lif1.state'] = lifSnapshot(st.m1);
          S.m_qi2 = quantIdentity(S.m_lif1, Pm.multi.qi2_scale);
          S.m_fc2 = linear(S.m_qi2, fcM2);
          S.m_lif2 = lifForward(st.m2, S.m_fc2, Pm.multi.lif2, mode); if (trace) S['m_lif2.state'] = lifSnapshot(st.m2);
          for (let k = 0; k < 4; k++) sums4[k] += S.m_lif2[k];
          if (trace) res.stage2.push(S);
        }
        let best = 0, bv = sums4[0];                                                                                 // argmax4 (l.35-46): first maximum wins
        for (let k = 1; k < 4; k++) { if (sums4[k] === bv) cnt('argmax.candidateTie'); if (sums4[k] > bv) { bv = sums4[k]; best = k; } }
        // Count only stage-2 executions; a traversal tie need not survive as the final maximum.
        cnt('argmax.executed');
        if (sums4.filter(v => v === bv).length > 1) cnt('argmax.finalMaxTie');
        pred4 = best;
      }
      res.sums4 = sums4; res.pred4 = pred4; res.steps = steps; res.words = Int8Array.from(words);
      return res;
    }
    return { run, quantizeRow, params: Pm, lifMode: mode, T };
  }

  // FNV-1a (32-bit) over the little-endian bytes of a typed array; used for the digests embedded in the page
  function digest(a) {
    let h = 0x811c9dc5;
    const step = b => { h ^= b & 255; h = Math.imul(h, 0x01000193) >>> 0; };
    if (a instanceof Int8Array) for (let i = 0; i < a.length; i++) step(a[i]);
    else for (let i = 0; i < a.length; i++) { const v = a[i] | 0; step(v); step(v >> 8); step(v >> 16); step(v >> 24); }
    return h >>> 0;
  }

  return { create, digest, COV, resetCov, prim: { wrap24, wrap32, wrapN, satInt8, requant, requantRNE, qiQOne, rne, f32 } };
})();
if (typeof module !== 'undefined') module.exports = KM;
