// Extra checks the page quotes:
//  1. which bank port holds which (channel, position mod 3), recovered from what the simulated load module actually wrote
//  2. how many outputs change if the LIF write went to the *other* bank (i.e. how sharply the simulation tells the two readings apart)
'use strict';
const fs = require('fs'), path = require('path');
const KM = require('../kernel_model');
const S = path.join(__dirname, 'sim');
const P = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'params.json'), 'utf8'));
const out = { banks: {}, intended: {} };

// ---- 1. bank mapping for conv2 / conv3
const cfg = [{ mod: 'forward_14', ic: 16, len: 89 }, { mod: 'forward_13', ic: 16, len: 43 }];
const idx = JSON.parse(fs.readFileSync(path.join(S, 'vec', 'index.json'), 'utf8'));
for (const c of cfg) {
  const labels = idx.conv.filter(x => x.mod === c.mod).map(x => x.label);
  const cand = {};
  for (const lab of labels) {
    const bf = path.join(S, 'out', `${c.mod}_${lab}_banks.txt`), hf = path.join(S, 'vec', `${c.mod}_${lab}_in.hex`);
    if (!fs.existsSync(bf)) continue;
    const hex = fs.readFileSync(hf, 'utf8').trim().split('\n'), inp = hex.slice(0, c.ic * c.len).map(h => { const v = parseInt(h, 16); return v > 127 ? v - 256 : v; });
    for (const line of fs.readFileSync(bf, 'utf8').trim().split('\n')) {
      const parts = line.trim().split(/\s+/), name = parts[0], ram = parts.slice(1);
      const ok = new Set();
      for (let ic = 0; ic < c.ic; ic++) for (let b = 0; b < 3; b++) {
        let good = true;
        for (let a = 0; a * 3 + b < c.len; a++) if (+ram[a] !== inp[ic * c.len + a * 3 + b]) { good = false; break; }
        if (good) ok.add(ic * 3 + b);
      }
      cand[name] = cand[name] ? new Set([...cand[name]].filter(x => ok.has(x))) : ok;
    }
  }
  const map = {}; let unique = 0, bad = 0;
  for (const [n, s] of Object.entries(cand)) { if (s.size === 1) { const v = [...s][0]; map[n] = { ic: Math.floor(v / 3), bank: v % 3 }; unique++; } else if (s.size === 0) bad++; else map[n] = { ambiguous: [...s].length }; }
  out.banks[c.mod] = { total: Object.keys(cand).length, unique, noMatch: bad, map, casesUsed: labels.length };
}

// ---- 2. intended (write-to-the-other-bank) reading vs the RTL results
const D = path.join(__dirname, '..', 'data') + path.sep;
const rd = f => { const b = fs.readFileSync(D + f); const a = new Int8Array(b.buffer, b.byteOffset, b.length); const o = []; for (let i = 0; i < a.length / 188; i++) o.push(a.slice(i * 188, i * 188 + 188)); return o; };
const tens = rd('words_tensor.bin'), stress = rd('words_stress.bin');
const words = { b8: tens[8], b2: tens[2], b12: tens[12], s1: stress[1], s2: stress[2], s3: stress[3], s10: stress[10], s40: stress[40] };
const mi = KM.create(P, { lifMode: 'intended' });
const keyOf = { forward_11: 'lif1', forward_10: 'lif2', forward_8: 'lif3', forward_9: 'bin_lif', forward_12: 'm_lif1', forward_7: 'm_lif2' };
const total = {}, diff = {};
for (const [lab, w] of Object.entries(words)) {
  const R = mi.run(w, { trace: true });
  for (const [mod, key] of Object.entries(keyOf)) {
    const f = path.join(S, 'out', `${mod}_${lab}_spk.txt`); if (!fs.existsSync(f)) continue;
    const rtl = fs.readFileSync(f, 'utf8').trim().split('\n').map(Number), arr = (['lif1', 'lif2', 'lif3', 'bin_lif'].includes(key) ? R.steps : R.stage2);
    if (!arr.length) continue;
    let k = 0, d = 0; for (const St of arr) for (const v of St[key]) { if (v !== rtl[k]) d++; k++; }
    total[mod] = (total[mod] || 0) + rtl.length; diff[mod] = (diff[mod] || 0) + d;
  }
}
out.intended = { total, diff, note: 'LIF output spikes of the RTL simulation vs. a model whose LIF writes the other bank (inputs are the real run of that variant, so downstream layers also change)' };
fs.writeFileSync(path.join(__dirname, 'micro_checks.json'), JSON.stringify(out));
console.log(JSON.stringify(out.intended), JSON.stringify(Object.fromEntries(Object.entries(out.banks).map(([k, v]) => [k, { total: v.total, unique: v.unique, noMatch: v.noMatch, cases: v.casesUsed }]))));
