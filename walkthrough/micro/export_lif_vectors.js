// Export test vectors for RTL simulation of the six LIF modules: the inputs each call receives and what the verified model says each call must produce.
'use strict';
const fs = require('fs'), path = require('path');
const KM = require('../kernel_model');
const P = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'params.json'), 'utf8'));
const D = path.join(__dirname, '..', 'data') + path.sep;
const rd = f => { const b = fs.readFileSync(D + f); const a = new Int8Array(b.buffer, b.byteOffset, b.length); const o = []; for (let i = 0; i < a.length / 188; i++) o.push(a.slice(i * 188, i * 188 + 188)); return o; };
const tens = rd('words_tensor.bin'), stress = rd('words_stress.bin');
const model = KM.create(P);
// cases: [label, words]
const cases = [['b8', tens[8]], ['b2', tens[2]], ['b12', tens[12]], ['s1', stress[1]], ['s2', stress[2]], ['s3', stress[3]], ['s10', stress[10]], ['s40', stress[40]]];
const LIF = [
  { mod: 'forward_11', key: 'lif1', inKey: 'bn1', n: 16 * 178, stage: 1 }, { mod: 'forward_10', key: 'lif2', inKey: 'bn2', n: 16 * 87, stage: 1 },
  { mod: 'forward_8', key: 'lif3', inKey: 'bn3', n: 24 * 41, stage: 1 }, { mod: 'forward_9', key: 'bin_lif', inKey: 'bin_fc', n: 2, stage: 1 },
  { mod: 'forward_12', key: 'm_lif1', inKey: 'm_fc1', n: 128, stage: 2 }, { mod: 'forward_7', key: 'm_lif2', inKey: 'm_fc2', n: 4, stage: 2 },
];
const out = { cases: [] }; const hex8 = v => (v & 255).toString(16).padStart(2, '0');
fs.mkdirSync(path.join(__dirname, 'sim', 'vec'), { recursive: true });
for (const [label, w] of cases) {
  const R = model.run(w, { trace: true });
  for (const L of LIF) {
    const arr = L.stage === 1 ? R.steps : R.stage2; if (!arr.length) continue;
    const base = path.join(__dirname, 'sim', 'vec', `${L.mod}_${label}`);
    fs.writeFileSync(base + '_in.hex', arr.map(S => Array.from(S[L.inKey]).map(hex8).join('\n')).join('\n') + '\n');
    fs.writeFileSync(base + '_spk.txt', arr.map(S => Array.from(S[L.key]).join('\n')).join('\n') + '\n');
    fs.writeFileSync(base + '_state.txt', arr.map(S => { const st = S[L.key + '.state']; return Array.from(st.V0).join(' ') + '\n' + Array.from(st.V1).join(' ') + '\n' + st.bank; }).join('\n') + '\n');
    out.cases.push({ mod: L.mod, label, n: L.n, calls: arr.length });
  }
}
fs.writeFileSync(path.join(__dirname, 'sim', 'vec', 'index.json'), JSON.stringify(out));
console.log('exported', out.cases.length, 'module-cases');
