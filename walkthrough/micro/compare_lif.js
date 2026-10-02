// Compare what the simulated RTL did with what the verified model says each call must do.
'use strict';
const fs = require('fs'), path = require('path');
const S = path.join(__dirname, 'sim');
function compare(mod, label, olabel) {
  olabel = olabel || label;
  const exp = fs.readFileSync(path.join(S, 'vec', `${mod}_${label}_spk.txt`), 'utf8').trim().split('\n').map(Number);
  const got = fs.readFileSync(path.join(S, 'out', `${mod}_${olabel}_spk.txt`), 'utf8').trim().split('\n').map(Number);
  const est = fs.readFileSync(path.join(S, 'vec', `${mod}_${label}_state.txt`), 'utf8').trim().split('\n');
  const gst = fs.readFileSync(path.join(S, 'out', `${mod}_${olabel}_state.txt`), 'utf8').trim().split('\n');
  const lat = +gst[0].split(' ')[1];
  let spkBad = 0; for (let i = 0; i < exp.length; i++) if (exp[i] !== got[i]) spkBad++;
  let stBad = 0, bankBad = 0, calls = est.length / 3;
  for (let k = 0; k < calls; k++) {
    for (let b = 0; b < 2; b++) { const e = est[3 * k + b].trim().split(/\s+/).map(Number), g = gst[1 + 3 * k + b].trim().split(/\s+/).map(Number); for (let i = 0; i < e.length; i++) if (e[i] !== g[i]) stBad++; }
    if (+est[3 * k + 2] !== +gst[1 + 3 * k + 2]) bankBad++;
  }
  return { mod, label, olabel, calls, spikes: exp.length, spkBad, lenOk: got.length === exp.length, stateValues: calls * 2 * (est[0].trim().split(/\s+/).length), stBad, bankBad, lat };
}
module.exports = compare;
if (require.main === module) console.log(JSON.stringify(compare(process.argv[2], process.argv[3], process.argv[4])));
