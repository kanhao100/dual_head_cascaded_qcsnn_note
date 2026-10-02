// Parser for golden/gold_dump.h records. Usage (module): const {readDump} = require('./golden_parse'); for (const beat of readDump(path)) ...
// Each beat = { index, recs: [ {tag, stage, step, dtype, data(Int8Array|Int16Array|Int32Array)} ... ] } in execution order.
'use strict';
const fs = require('fs');

function* readDump(path) {
  const b = fs.readFileSync(path);
  let p = 0, cur = null;
  while (p < b.length) {
    const tl = b[p++]; const tag = b.toString('latin1', p, p + tl); p += tl;
    const stage = b[p++], step = b[p++], dtype = b[p++];
    const n = b.readUInt32LE(p); p += 4;
    let data;
    if (dtype === 1) data = new Int8Array(b.buffer, b.byteOffset + p, n).slice();
    else if (dtype === 2) { data = new Int16Array(n); for (let i = 0; i < n; i++) data[i] = b.readInt16LE(p + 2 * i); }
    else { data = new Int32Array(n); for (let i = 0; i < n; i++) data[i] = b.readInt32LE(p + 4 * i); }
    p += n * dtype;
    if (tag === 'beat') { if (cur) yield cur; cur = { index: data[0], recs: [] }; }
    else cur.recs.push({ tag, stage, step, dtype, data });
  }
  if (cur) yield cur;
}

// beat.recs -> map "tag@stage.step" -> data, for quick lookup
function indexBeat(beat) {
  const m = new Map();
  for (const r of beat.recs) m.set(r.tag + '@' + r.stage + '.' + r.step, r.data);
  return m;
}
module.exports = { readDump, indexBeat };
