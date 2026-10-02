// Quantifies the LIF bank behaviour: 'asWritten' (what the repository code does and what the verified model reproduces)
// vs 'intended' (write goes to the other bank, as the comments say). Only 'asWritten' is verified against C++.
'use strict';
const fs = require('fs'); const KM = require('./kernel_model');
const P = JSON.parse(fs.readFileSync('params.json', 'utf8'));
const b = fs.readFileSync('data/words_verify.bin'); const A = new Int8Array(b.buffer, b.byteOffset, b.length); const N = A.length / 188;
const meta = JSON.parse(fs.readFileSync('data/verify_meta.json', 'utf8'));
const mW = KM.create(P, { lifMode: 'asWritten' }), mI = KM.create(P, { lifMode: 'intended' });
let diff2 = 0, diff4 = 0, finW = 0, finI = 0, diffFinal = 0, pair = 0, pairTot = 0, spikeDiffBeats = 0;
const cm = (k) => Array.from({ length: 4 }, () => new Array(4).fill(0)); const cW = cm(), cI = cm();
for (let i = 0; i < N; i++) {
  const w = A.slice(i * 188, i * 188 + 188); const a = mW.run(w, { trace: true }), c = mI.run(w, { trace: true });
  if (a.pred2 !== c.pred2) diff2++; if (a.pred4 !== c.pred4) diff4++;
  const fa = a.pred2 === 1 ? a.pred4 : 0, fc = c.pred2 === 1 ? c.pred4 : 0, y = meta[i].label;
  cW[y][fa]++; cI[y][fc]++; if (fa === y) finW++; if (fc === y) finI++; if (fa !== fc) diffFinal++;
  // paired-step property in the as-written model: lif1 spikes at step 2k+1 equal those at 2k ?
  let same = true; let anyDiff = false;
  for (let t = 0; t < 10; t++) { const x = a.steps[t].lif1, z = c.steps[t].lif1; for (let j = 0; j < x.length; j++) if (x[j] !== z[j]) { anyDiff = true; break; } }
  if (anyDiff) spikeDiffBeats++;
  for (let k = 0; k < 5; k++) { const x = a.steps[2 * k].lif1, z = a.steps[2 * k + 1].lif1; for (let j = 0; j < x.length; j++) if (x[j] !== z[j]) { same = false; break; } if (!same) break; }
  pairTot++; if (same) pair++;
}
console.log(`beats ${N}`);
console.log(`asWritten accuracy (final 4-class) ${(100 * finW / N).toFixed(2)}%   intended ${(100 * finI / N).toFixed(2)}%`);
console.log(`beats whose final class differs: ${diffFinal}; pred2 differs: ${diff2}; pred4 differs: ${diff4}; beats with any lif1 spike difference: ${spikeDiffBeats}`);
console.log(`as-written: lif1 spikes of step 2k equal step 2k+1 for all k in ${pair}/${pairTot} beats`);
console.log('confusion asWritten', JSON.stringify(cW)); console.log('confusion intended', JSON.stringify(cI));

fs.writeFileSync('data/lif_bank.json', JSON.stringify({ beats: N, accWritten: finW / N, accIntended: finI / N, diffFinal, diff2, diff4, spikeDiffBeats, pairBeats: pair, cW, cI }));
