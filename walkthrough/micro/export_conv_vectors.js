// Export test vectors for RTL simulation of the conv2 / conv3 engines: per time step the INT8 input the load module streams in
// and the INT8 output the verified model says the compute module must stream out.
'use strict';
const fs = require('fs'), path = require('path');
const KM = require('../kernel_model');
const P = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'params.json'), 'utf8'));
const D = path.join(__dirname, '..', 'data') + path.sep;
const rd = f => { const b = fs.readFileSync(D + f); const a = new Int8Array(b.buffer, b.byteOffset, b.length); const o = []; for (let i = 0; i < a.length / 188; i++) o.push(a.slice(i * 188, i * 188 + 188)); return o; };
const tens = rd('words_tensor.bin'), stress = rd('words_stress.bin');
const model = KM.create(P);
const cases = [['b8', tens[8]], ['b2', tens[2]], ['b12', tens[12]], ['b20', tens[20]], ['s1', stress[1]], ['s2', stress[2]], ['s3', stress[3]], ['s4', stress[4]], ['s10', stress[10]], ['s40', stress[40]], ['s70', stress[70]]];
const CONV = [{ mod: 'forward_14', inKey: 'qi2', outKey: 'conv2' }, { mod: 'forward_13', inKey: 'qi3', outKey: 'conv3' }];
const hex8 = v => (v & 255).toString(16).padStart(2, '0');
fs.mkdirSync(path.join(__dirname, 'sim', 'vec'), { recursive: true });
const idx = JSON.parse(fs.readFileSync(path.join(__dirname, 'sim', 'vec', 'index.json'), 'utf8'));
idx.conv = [];
for (const [label, w] of cases) {
  const R = model.run(w, { trace: true });
  for (const C of CONV) {
    const base = path.join(__dirname, 'sim', 'vec', `${C.mod}_${label}`);
    fs.writeFileSync(base + '_in.hex', R.steps.map(S => Array.from(S[C.inKey]).map(hex8).join('\n')).join('\n') + '\n');
    fs.writeFileSync(base + '_exp.txt', R.steps.map(S => Array.from(S[C.outKey]).join('\n')).join('\n') + '\n');
    idx.conv.push({ mod: C.mod, label, nin: R.steps[0][C.inKey].length, nout: R.steps[0][C.outKey].length, steps: R.steps.length });
  }
}
fs.writeFileSync(path.join(__dirname, 'sim', 'vec', 'index.json'), JSON.stringify(idx));
console.log('exported', idx.conv.length, 'conv cases');
