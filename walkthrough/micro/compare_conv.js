// Compare the INT8 stream the simulated convolution engine produced with the verified model's conv output.
'use strict';
const fs = require('fs'), path = require('path');
const S = path.join(__dirname, 'sim');
function compare(mod, label, olabel) {
  olabel = olabel || label;
  const exp = fs.readFileSync(path.join(S, 'vec', `${mod}_${label}_exp.txt`), 'utf8').trim().split('\n').map(Number);
  const got = fs.readFileSync(path.join(S, 'out', `${mod}_${olabel}_out.txt`), 'utf8').trim().split('\n').map(Number);
  const log = fs.readFileSync(path.join(S, 'out', `${mod}_${olabel}_log.txt`), 'utf8');
  let bad = 0, firstBad = -1; for (let i = 0; i < exp.length; i++) if (exp[i] !== got[i]) { bad++; if (firstBad < 0) firstBad = i; }
  const sat = exp.filter(v => v === 127 || v === -128).length;
  return { mod, label, olabel, values: exp.length, got: got.length, bad, firstBad, saturated: sat, latLoad: +(/LAT_LOAD (\d+)/.exec(log) || [])[1], latComp: +(/LAT_COMP (\d+)/.exec(log) || [])[1] };
}
module.exports = compare;
if (require.main === module) console.log(JSON.stringify(compare(process.argv[2], process.argv[3], process.argv[4])));
