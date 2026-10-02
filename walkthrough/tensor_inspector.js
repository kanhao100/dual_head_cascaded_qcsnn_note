/* Full tensor inspector. All displayed values come from AN.run's real trace.
 * The cell calculation is exported separately so the page can be checked
 * without a browser. No model state or C++ reference is modified here. */
(function () {
  'use strict';
  const A = AN, P = A.PARAMS, F = A.flow, esc = A.esc;
  if (!F) return;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const srcOf = (r, s, t) => (s === 1 ? r.steps : r.stage2)[t];
  const wrap = KM.prim.wrap24;
  const lifMap = {
    lif1: ['bn1', P.blocks[0].lif], lif2: ['bn2', P.blocks[1].lif], lif3: ['bn3', P.blocks[2].lif],
    bin_lif: ['bin_fc', P.bin.lif], m_lif1: ['m_fc1', P.multi.lif1], m_lif2: ['m_fc2', P.multi.lif2]
  };
  const qiMap = {
    qi2: ['pool1', P.blocks[1].qi_scale], qi3: ['pool2', P.blocks[2].qi_scale],
    bin_qi: ['pool3', P.bin.qi_scale], m_qi1: ['pool3', P.multi.qi1_scale], m_qi2: ['m_lif1', P.multi.qi2_scale]
  };
  const fcMap = { bin_fc: ['bin_cat', P.bin.fc], m_fc1: ['m_cat', P.multi.fc1], m_fc2: ['m_qi2', P.multi.fc2] };

  function tensor(k, stage, t, res) {
    if (t < 0 || (stage === 2 && res.pred2 !== 1)) return null;
    const d = F.nodes[k];
    if (d.special) {
      const steps = stage === 1 ? res.steps : res.stage2, key = stage === 1 ? 'bin_lif' : 'm_lif2';
      const a = new Int32Array(stage === 1 ? 2 : 4);
      for (let q = 0; q <= t && q < steps.length; q++) for (let i = 0; i < a.length; i++) a[i] += steps[q][key][i];
      return a;
    }
    if (k === 'in') return res.words.subarray(0, 180);
    const s = srcOf(res, stage, t); return s ? s[d.key] : null;
  }

  // Exact integer explanations, including the 32-bit cast before saturation.
  function req(acc, mult, shift, even) {
    const prod = BigInt(acc) * BigInt(mult), rows = [['64 位乘积', `${acc} × ${mult} = ${prod}`]];
    let before;
    if (shift <= 0) { before = prod; rows.push(['右移', `r=${shift}，直接取乘积`]); }
    else if (even) {
      const neg = prod < 0n, ax = neg ? -prod : prod, rr = BigInt(shift), base = ax >> rr;
      const rem = ax & ((1n << rr) - 1n), half = 1n << (rr - 1n);
      const bump = rem > half || (rem === half && (base & 1n) === 1n), rounded = base + (bump ? 1n : 0n);
      before = neg ? -rounded : rounded;
      rows.push(['绝对值分解', `|乘积| = ${base} × 2^${shift} + ${rem}；一半 = ${half}`],
        ['五成双', `余数${rem > half ? '大于' : rem < half ? '小于' : '等于'}一半；商 ${base} 为${base & 1n ? '奇数' : '偶数'} → ${bump ? '进位' : '不进位'}，还原符号 = ${before}`]);
    } else {
      const half = 1n << BigInt(shift - 1), added = prod + half;
      before = added >> BigInt(shift);
      rows.push(['加半', `${prod} + 2^${shift - 1} = ${added}`], ['算术右移', `${added} >> ${shift} = ${before}`]);
    }
    const w32 = Number(BigInt.asIntN(32, before)), result = KM.prim.satInt8(w32);
    rows.push(['32 位回绕', `${before} → ${w32}`], ['INT8 饱和', `clip(${w32}, −128, 127) = ${result}`]);
    return { rows, result };
  }

  function rrDetail(stage, j, res, beat) {
    const f32 = KM.prim.f32, raw = f32(A.BEATS[beat].rowF[180 + j]), mean = f32(P.rr.mean[j]), inv = f32(P.rr.std_inv[j]);
    const sub = f32(raw - mean), norm = f32(sub * inv), qiScale = stage === 1 ? P.bin.qi_scale : P.multi.qi1_scale;
    const scale = f32(qiScale / 4096), divided = f32(norm / scale), rounded = KM.prim.rne(divided), result = KM.prim.satInt8(rounded);
    const word = (stage === 1 ? 180 : 184) + j;
    return { result, rows: [
      ['RR 数据来源', `原始 RR[${j}] = ${raw}；主机 FileReader 量化后送入 word[${word}]`],
      ['float32 标准化', `f32(${raw} − ${mean}) = ${sub}；f32(${sub} × ${inv}) = ${norm}`],
      ['该头的尺度', `f32(${qiScale}/4096) = ${scale}；f32(${norm}/${scale}) = ${divided}`],
      ['偶数优先取整 + 饱和', `${divided} → ${rounded} → ${result}`],
      ['kernel 拼接', `cat[${480 + j}] = word[${word}] = ${res.words[word]}；RR 旁路直接拼接，不经过脉冲 QI`]
    ] };
  }

  // Return the selected integer and a fully expanded computation using that
  // layer's inputs and exported parameters. Terms preserve channel-major order.
  function cell(k, stage, t, index, res, beat) {
    beat = beat == null ? A.S.beat : beat; res = res || A.run(beat);
    const d = F.nodes[k], arr = tensor(k, stage, t, res);
    if (!arr) return { value: null, computed: null, matches: null, rows: [], terms: [], pending: true };
    index = clamp(Math.trunc(index), 0, arr.length - 1);
    const cols = d.special ? arr.length : d.c, channel = Math.floor(index / cols), pos = index % cols;
    const S = srcOf(res, stage, t), rows = [], terms = []; let computed;
    if (k === 'in') {
      const f32 = KM.prim.f32, x = f32(A.BEATS[beat].rowF[index]), inv = f32(1 / f32(P.input_scale_f32)), scaled = f32(x * inv), rounded = KM.prim.rne(scaled);
      computed = KM.prim.satInt8(rounded);
      rows.push(['输入来源', `作者预处理后的波形[${index}] = ${x}（float32）`], ['倒数尺度', `f32(1/f32(${P.input_scale_f32})) = ${inv}`],
        ['float32 乘法', `f32(${x} × ${inv}) = ${scaled}`], ['FileReader 取整', `nearbyintf（偶数优先）= ${rounded}；夹到 INT8 = ${computed}`], ['kernel 重放', `同一组 180 个字在 t=0…9 原样重放`]);
    } else if (/^conv[123]$/.test(k)) {
      const b = +k.slice(-1) - 1, cv = P.blocks[b].conv, inKey = b === 0 ? 'in' : 'qi' + (b + 1);
      const inp = b === 0 ? res.words.subarray(0, 180) : S[inKey], inLen = inp.length / cv.ic; let acc = 0;
      for (let ch = 0; ch < cv.ic; ch++) for (let tap = 0; tap < cv.k; tap++) {
        const x = inp[ch * inLen + pos + tap], w = cv.weights[(channel * cv.ic + ch) * cv.k + tap], product = x * w; acc += product;
        terms.push({ source: `${inKey}[${ch},${pos + tap}]`, x, weight: w, product, sum: acc });
      }
      const a32 = acc | 0, q = req(a32, cv.mult[channel], cv.shift[channel], false); computed = q.result;
      rows.push(['输入窗口', `阶段 1，t=${t}；${inKey} 的 ${cv.ic} 个通道，位置 ${pos}…${pos + cv.k - 1}`],
        ['逐项乘加', `${terms.length} 项，Σ(x×w) = ${acc}；INT32 = ${a32}；偏置和零点修正路径关闭`], ...q.rows);
    } else if (/^bn[123]$/.test(k)) {
      const b = +k.slice(-1) - 1, bn = P.blocks[b].bn, x = S['conv' + (b + 1)][index], acc = x * bn.weight[channel] + bn.bias[channel];
      const q = req(acc | 0, bn.mult[channel], bn.shift[channel], true); computed = q.result;
      rows.push(['输入来源', `conv${b + 1}[${channel},${pos}] = ${x}（阶段 1，t=${t}）`], ['折叠 BN', `w[${channel}]=${bn.weight[channel]}，bias=${bn.bias[channel]}；${x} × ${bn.weight[channel]} + ${bn.bias[channel]} = ${acc}；INT32=${acc | 0}`], ...q.rows);
    } else if (lifMap[k]) {
      const [inputKey, par] = lifMap[k], x = S[inputKey][index], beta = clamp(par.beta, 0, 4096), theta = par.theta;
      const bank = t % 2 ? 'V1' : 'V0', prevS = t > 0 ? srcOf(res, stage, t - 1)[k + '.state'] : null;
      const vPrev = prevS ? prevS[bank][index] : 0, xq = wrap(x * par.scale), rPrev = vPrev > theta ? 4096 : 0;
      const pb = beta * vPrev, pbRound = pb >= 0 ? pb + 2048 : pb - 2048, vBeta = wrap(Math.floor(pbRound / 4096));
      const base = wrap(vBeta + xq), pr = rPrev * theta, prRound = pr >= 0 ? pr + 2048 : pr - 2048, sub = wrap(Math.floor(prRound / 4096));
      const next = wrap(base - sub), saved = S[k + '.state'][bank][index]; computed = next > theta ? 1 : 0;
      rows.push(['输入来源', `${inputKey}[${channel},${pos}] = ${x}，阶段 ${stage}，t=${t}`],
        ['同 bank 状态', `t=${t} 读写 ${bank}；${t < 2 ? '该 bank 第一次调用，初值 0' : `接第 t−2=${t - 2} 步`}；V_prev=${vPrev}，调用后 bank 翻转`],
        ['参数', `β=${par.beta} → 限制到 [0,4096] 得 ${beta}；θ=${theta}；输入尺度=${par.scale}`],
        ['Q12 输入', `wrap24(${x} × ${par.scale}) = ${xq}`],
        ['泄漏项', `β×V_prev=${pb}；按符号加/减2048 → ${pbRound}；算术 >>12，wrap24 → ${vBeta}`],
        ['输入累加', `wrap24(${vBeta} + ${xq}) = ${base}`],
        ['延迟复位判定', `V_prev > θ：${vPrev} > ${theta} → r_prev=${rPrev}（由同 bank 上次膜电位判定）`],
        ['复位扣除项', `r_prev×θ=${pr}；按符号加/减2048 → ${prRound}；算术 >>12，wrap24 → ${sub}`],
        ['保存膜电位', `wrap24(${base} − ${sub}) = ${next}；trace 的 ${bank}[${index}] = ${saved}${saved === next ? ' ✓' : ' ✗'}`],
        ['严格发放', `${next} > ${theta} → spike=${computed}；不是 ≥`]);
    } else if (/^pool[123]$/.test(k)) {
      const inputKey = 'lif' + k.slice(-1), inp = S[inputKey], inLen = inp.length / d.r, i = channel * inLen + 2 * pos, a = inp[i], b = inp[i + 1]; computed = b > a ? b : a;
      rows.push(['输入来源', `${inputKey}[${channel},${2 * pos}] = ${a}，${inputKey}[${channel},${2 * pos + 1}] = ${b}，t=${t}`],
        ['池化窗口', `窗口 2、步长 2；max(${a},${b}) = ${computed}；脉冲输入等价于逻辑 OR`]);
      if (inLen % 2) rows.push(['边界', `输入行长 ${inLen}，最后位置 ${inLen - 1} 不在完整窗口内，丢弃`]);
    } else if (qiMap[k]) {
      if ((k === 'bin_qi' || k === 'm_qi1') && index >= 480) {
        const rr = rrDetail(stage, index - 480, res, beat); computed = rr.result; rows.push(...rr.rows);
      } else {
        const [inputKey, scale] = qiMap[k], inp = k === 'm_qi1' ? res.steps[t].pool3 : S[inputKey], x = inp[index], q = KM.prim.qiQOne(scale), raw = scale > 0 ? Math.trunc((4096 + (scale >> 1)) / scale) : 127;
        computed = x !== 0 ? q : 0;
        const sourceCh = inputKey === 'pool3' ? Math.floor(index / 20) : Math.floor(index / (inp.length / (F.nodes[inputKey] ? F.nodes[inputKey].r : 1)));
        const sourcePos = inputKey === 'pool3' ? index % 20 : pos;
        rows.push(['输入来源', `${inputKey}[${sourceCh},${sourcePos}] = ${x}，${k === 'm_qi1' ? `阶段 1 的缓存第 t=${t} 步；阶段 2 时主干缩略图保留 t=9，缓存按所选 t 读取` : `t=${t}`}`],
          ['q_one 整数除法', `尺度 s=${scale}；trunc((4096 + (s>>1))/s) = ${raw}；16 位回绕、INT8 饱和 → ${q}`],
          ['脉冲映射', `${x} ${x !== 0 ? '≠' : '='} 0 → ${computed}`]);
        if (d.dkey) rows.push(['展平与拼接', `pool3 按通道优先展平；前 480 个数经过 QI，后 4 个 RR 直接旁路拼接`]);
      }
    } else if (fcMap[k]) {
      const [inputKey, fc] = fcMap[k], inp = S[inputKey]; let acc = 0;
      for (let i = 0; i < fc.inn; i++) { const x = inp[i], w = fc.weights[index * fc.inn + i], product = x * w; acc += product; terms.push({ source: `${inputKey}[${i}]`, x, weight: w, product, sum: acc }); }
      const q = req(acc | 0, fc.mult[index], fc.shift[index], false); computed = q.result;
      rows.push(['输入来源', `${inputKey}，阶段 ${stage}，t=${t}；输出神经元 ${index}`], ['逐项乘加', `${fc.inn} 项，Σ(x×w) = ${acc}；INT32 = ${acc | 0}；无偏置项`], ...q.rows);
    } else if (d.special) {
      const steps = stage === 1 ? res.steps : res.stage2, key = stage === 1 ? 'bin_lif' : 'm_lif2'; computed = 0;
      for (let q = 0; q <= t; q++) { const x = steps[q][key][index]; computed += x; terms.push({ source: `t=${q} ${key}[${index}]`, x, weight: 1, product: x, sum: computed }); }
      const sums = Array.from(arr), name = stage === 1 ? ['正常', '异常'][index] : A.CLS[index];
      rows.push(['累计来源', `${name} 的 t=0…${t} 脉冲逐步相加；不是全连接整数输出相加`], ['当前累计', `${terms.map(v => v.x).join(' + ')} = ${computed}`]);
      if (stage === 1) rows.push(['门控', t === 9 ? `10 步结束：异常 ${sums[1]} > 正常 ${sums[0]} → ${res.pred2 ? '异常，运行四分类头' : '正常，提前退出'}；相等判正常` : `目前只有 ${t + 1}/10 步的累计；尚不做最终门控`]);
      else { let best = 0; for (let i = 1; i < 4; i++) if (sums[i] > sums[best]) best = i;
        rows.push(['argmax', t === 9 ? `${sums.join(' / ')} → ${A.CLS[best]}（下标 ${best}）；只在严格更大时更新，并列取最前面` : `目前只有 ${t + 1}/10 步，未输出最终分类`]); }
    }
    return { value: arr[index], computed, matches: computed === arr[index], rows, terms, channel, pos, index, pending: false };
  }

  function verification(k, stage, t, res, beat) {
    beat = beat == null ? A.S.beat : beat; res = res || A.run(beat);
    if (!tensor(k, stage, t, res)) return { ok: null, parts: [], note: '当前动画尚未产生此块数据' };
    const d = F.nodes[k], parts = [], G = A.GOLD[beat];
    function check(tag, st, tm) {
      const j = A.KEYS.findIndex(q => q[0] === st && q[1] === tm && q[2] === tag), arr = A.getTensor(res, st, tm, tag);
      if (!G || j < 0 || j >= G.n || !arr) { parts.push({ label: `${tag}（t=${tm}）`, ok: null }); return; }
      const actual = KM.digest(arr), expected = G.d[j]; parts.push({ label: `${tag}（t=${tm}）`, ok: actual === expected, actual, expected });
    }
    if (k === 'in') {
      const a = tensor(k, stage, t, res), same = Array.from(a).every((v, i) => v === A.BEATS[beat].wordsG[i]);
      parts.push({ label: '180 个输入字与 FileReader 逐字比较', ok: same });
    } else if (d.special) {
      if (t === 9) check(stage === 1 ? 'sums2' : 'sums4', stage, 9);
      else for (let q = 0; q <= t; q++) check(stage === 1 ? 'bin_lif' : 'm_lif2', stage, q);
    } else {
      check(d.dkey || d.key, stage, t);
      if (d.dkey) { const off = stage === 1 ? 180 : 184; parts.push({ label: '后 4 个 RR 与 FileReader 输入字逐字比较', ok: Array.from(tensor(k, stage, t, res).subarray(480)).every((v, i) => v === A.BEATS[beat].wordsG[off + i]) }); }
      if (lifMap[k]) ['V0', 'V1', 'bank'].forEach(b => check(k + '.' + b, stage, t));
    }
    return { ok: parts.every(q => q.ok === true) ? true : parts.some(q => q.ok === false) ? false : null, parts,
      note: !G ? '全测试集回放：输入字和最终预测已核对 C++；这个心拍未保存逐层 C++ 摘要，当前张量为整数功能模型重算。' : d.dkey ? '拼接张量分别核对：前 480 个 QI 值的摘要 + 后 4 个 RR 输入字。未把 484 个拼接值误作 QI 摘要。' : d.special && t < 9 ? '部分累计由已核对的逐步脉冲相加；C++ 的最终累计摘要只在 t=9 比较。' : '摘要来自 CPU 上的 C++ 导出；这里显示功能模型结果。' };
  }

  let dialog, opened = false, origin = null, state = null, geometry = null;
  const $ = id => document.getElementById(id);
  function inject() {
    const style = document.createElement('style'); style.textContent = `
      #ti-dialog{box-sizing:border-box;width:min(1180px,calc(100vw - 28px));max-width:none;max-height:calc(100dvh - 28px);border:1px solid var(--line);border-radius:14px;background:var(--surface);color:var(--ink);padding:0;box-shadow:0 20px 70px #0005}
      #ti-dialog::backdrop{background:#0007}#ti-dialog .ti-head{position:sticky;top:0;z-index:2;background:var(--surface);display:flex;gap:12px;align-items:flex-start;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--line)}
      #ti-title{margin:0;font:700 20px var(--f-body)}#ti-meta{margin:6px 0 0;font:12.5px/1.6 var(--f-body);color:var(--muted)}#ti-dialog .ti-body{padding:16px 20px 20px}#ti-dialog .ti-controls{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:12px 0}
      #ti-dialog label{font:12.5px var(--f-body);display:flex;gap:7px;align-items:center}#ti-dialog select,#ti-dialog input[type=number]{background:var(--surface2);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:5px 7px}#ti-dialog input[type=number]{width:76px}
      #ti-status{font:12.5px/1.6 var(--f-body);padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface2)}#ti-status[data-ok=true]{border-color:var(--mwi)}#ti-status[data-ok=false]{border-color:var(--bad)}#ti-status summary{cursor:pointer}#ti-status ul{padding-left:20px;margin:5px 0}
      #ti-scroll{overflow:auto;max-height:440px;border:1px solid var(--line);border-radius:8px;background:var(--surface2)}#ti-grid{display:block;max-width:none!important;cursor:crosshair}#ti-dialog [hidden]{display:none!important}#ti-empty{padding:20px;color:var(--muted);font:14px/1.7 var(--f-body)}
      #ti-selection{min-height:24px;margin:10px 0;font:600 14px/1.7 var(--f-mono)}#ti-legend{font:12px/1.7 var(--f-body);color:var(--muted);margin:7px 0}#ti-dialog h4{font:700 15px var(--f-body);margin:18px 0 8px}
      #ti-calc{font:12.5px/1.65 var(--f-mono);display:grid;gap:4px}#ti-calc .ti-row{display:grid;grid-template-columns:145px minmax(0,1fr);gap:12px;border-bottom:1px dashed var(--line);padding:5px 0}#ti-calc .ti-row span:first-child{font-family:var(--f-body);color:var(--muted)}#ti-calc .ti-row span:last-child{overflow-wrap:anywhere}
      #ti-terms{max-height:280px;overflow:auto;border:1px solid var(--line);border-radius:8px}#ti-terms table{width:100%;border-collapse:collapse;font:12px/1.6 var(--f-mono)}#ti-terms th{position:sticky;top:0;background:var(--surface2);color:var(--muted);text-align:right}#ti-terms td,#ti-terms th{padding:4px 8px;border-bottom:1px solid var(--line);white-space:nowrap}#ti-terms td:first-child,#ti-terms th:first-child{text-align:left}#ti-terms td{text-align:right}
      #fl-inspect{margin:8px 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font:12.5px var(--f-body)}#fl-inspect select{max-width:100%;padding:5px;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:6px}#fl-inspect .small{color:var(--muted)}
      @media(max-width:600px){#ti-dialog .ti-head,#ti-dialog .ti-body{padding:12px}#ti-title{font-size:17px}#ti-calc .ti-row{grid-template-columns:1fr;gap:2px}#ti-scroll{max-height:330px}}`;
    document.head.appendChild(style);
    dialog = document.createElement('dialog'); dialog.id = 'ti-dialog'; dialog.setAttribute('aria-labelledby', 'ti-title'); dialog.setAttribute('aria-describedby', 'ti-meta');
    dialog.innerHTML = `<div class="ti-head"><div><h3 id="ti-title"></h3><p id="ti-meta"></p></div><button class="btn" id="ti-close" aria-label="关闭真实数据查看器">关闭 ×</button></div>
      <div class="ti-body"><div id="ti-status"></div><div class="ti-controls">
      <label>时间步<select id="ti-time" aria-label="查看时间步"></select></label><label>格子尺寸<input id="ti-zoom" type="range" min="5" max="36" value="12" aria-label="热图格子尺寸"><output id="ti-zoom-value">12 px</output></label>
      <label>通道<input id="ti-channel" type="number" min="0" value="0" step="1" aria-label="通道"></label><label>位置<input id="ti-position" type="number" min="0" value="0" step="1" aria-label="位置"></label>
      <button class="btn" id="ti-reset">回到动画显示</button></div>
      <div id="ti-scroll"><canvas id="ti-grid" tabindex="0" role="img" aria-label="完整张量热图，方向键移动到相邻格，Home 或 End 移到行首或行尾"></canvas><div id="ti-empty" hidden></div></div>
      <p id="ti-legend"></p><div id="ti-selection" aria-live="polite"></div><h4>选中整数怎样算出来</h4><div id="ti-calc"></div><details id="ti-terms-wrap"><summary id="ti-terms-title">逐项乘加明细</summary><div id="ti-terms"></div></details></div>`;
    document.body.appendChild(dialog);
    const entry = document.createElement('div'); entry.id = 'fl-inspect';
    entry.innerHTML = `<label for="fl-inspect-node">查看块：</label><select id="fl-inspect-node" aria-label="选择信号流模块">${Object.entries(F.nodes).map(([k, d]) => `<option value="${k}">${esc(d.t)} · ${k}</option>`).join('')}</select><button class="btn" id="fl-inspect-open">打开真实数据</button><span class="small">也可点击图中方框；方向键选择模块，Enter 打开。</span>`;
    $('fl-info').before(entry);
    $('fl-inspect-open').addEventListener('click', e => F.open($('fl-inspect-node').value, e.currentTarget));
    $('ti-close').addEventListener('click', close);
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); } });
    dialog.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
    $('ti-time').addEventListener('change', () => { state.t = +$('ti-time').value; render(); });
    $('ti-reset').addEventListener('click', () => { state.t = state.displayed.step; render(); });
    $('ti-zoom').addEventListener('input', () => { draw(); scrollToCell(); });
    ['ti-channel', 'ti-position'].forEach(id => $(id).addEventListener('input', () => { state.row = clamp(Math.trunc(+$('ti-channel').value || 0), 0, state.rows - 1); state.col = clamp(Math.trunc(+$('ti-position').value || 0), 0, state.cols - 1); showCell(); draw(); scrollToCell(); }));
    const cv = $('ti-grid');
    function pick(e) { if (!geometry || !state.arr) return; const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      const col = Math.floor((x - geometry.x) / geometry.cw), row = Math.floor((y - geometry.y) / geometry.ch);
      if (col < 0 || col >= state.cols || row < 0 || row >= state.rows || (col === state.col && row === state.row)) return;
      state.row = row; state.col = col; showCell(); draw(); }
    cv.addEventListener('pointermove', pick); cv.addEventListener('click', e => { pick(e); cv.focus({ preventScroll: true }); });
    cv.addEventListener('keydown', e => { if (!state || !state.arr) return; const key = e.key;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return; e.preventDefault();
      if (key === 'ArrowLeft') state.col = clamp(state.col - 1, 0, state.cols - 1); if (key === 'ArrowRight') state.col = clamp(state.col + 1, 0, state.cols - 1);
      if (key === 'ArrowUp') state.row = clamp(state.row - 1, 0, state.rows - 1); if (key === 'ArrowDown') state.row = clamp(state.row + 1, 0, state.rows - 1);
      if (key === 'Home') state.col = 0; if (key === 'End') state.col = state.cols - 1;
      showCell(); draw(); scrollToCell(); });
    HW.onRedraw(() => { if (opened) draw(); }); A.onBeat(() => { if (opened) close(); });
  }

  function close() {
    if (!opened) return; opened = false;
    if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
    if (origin && typeof origin.focus === 'function') origin.focus({ preventScroll: true });
  }
  function open(k, source) {
    if (!dialog) inject(); F.pause(); origin = source || document.activeElement;
    const res = A.run(A.S.beat), displayed = F.displayed(k, undefined, res), d = F.nodes[k];
    state = { k, res, displayed, beat: A.S.beat, stage: displayed.stage, t: displayed.step, row: 0, col: 0,
      rows: d.special ? 1 : d.r, cols: d.special ? (k === 'gate' ? 2 : 4) : d.c };
    $('fl-inspect-node').value = k; $('ti-title').textContent = `${d.t} · 真实整数查看器`;
    $('ti-time').innerHTML = (displayed.step < 0 ? '<option value="-1">动画当前尚未产生</option>' : '') + (displayed.unrun ? '' : Array.from({ length: 10 }, (_, t) => `<option value="${t}">t=${t}${t === displayed.step ? '（动画显示）' : ''}</option>`).join(''));
    $('ti-time').disabled = displayed.unrun; $('ti-channel').max = state.rows - 1; $('ti-position').max = state.cols - 1;
    $('ti-channel').disabled = state.rows === 1; $('ti-zoom').value = 12; $('ti-terms-wrap').open = false;
    opened = true;
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); } else dialog.setAttribute('open', '');
    $('ti-scroll').scrollLeft = 0; $('ti-scroll').scrollTop = 0;
    render(); scrollToCell(); $('ti-close').focus({ preventScroll: true });
  }
  function render() {
    if (!opened) return; const d = F.nodes[state.k], B = A.BEATS[state.beat], f = F.frame();
    state.arr = tensor(state.k, state.stage, state.t, state.res); $('ti-time').value = state.t;
    const shown = state.displayed.step >= 0 ? `阶段 ${state.stage} · t=${state.displayed.step}${state.displayed.prior ? '（本步未到，保留前一步）' : ''}` : state.displayed.unrun ? '门控判正常，四分类头未运行' : '动画当前尚未产生';
    $('ti-meta').textContent = `心拍 #${state.beat} · ${A.CLS[B.label]} · 记录 ${B.record}。打开时动画：阶段 ${f.st}、t=${f.t}；此块实际显示：${shown}。` +
      (state.arr ? ` 当前查看完整模型：阶段 ${state.stage}、t=${state.t}，${state.rows}×${state.cols} 个整数。` : state.displayed.unrun ? ' 此心拍不存在该张量。' : ' 当前没有数值；可显式选择模型时间步查看。') +
      (state.stage === 1 && f.st === 2 ? ' 主干显示保留的阶段 1 t=9，不是阶段 2 的 t。' : '');
    const v = verification(state.k, state.stage, state.t, state.res, state.beat);
    $('ti-status').dataset.ok = String(v.ok);
    $('ti-status').innerHTML = `<b>${v.ok === true ? '与 C++ 参照一致 ✓' : v.ok === false ? '与 C++ 参照不一致 ✗' : '未产生数据，尚不比较'}</b><div>${esc(v.note)}</div>` + (v.parts.length ? `<details><summary>参照比较明细（${v.parts.length} 项）</summary><ul>${v.parts.map(p => `<li>${esc(p.label)}：${p.ok === true ? '相同 ✓' : p.ok === false ? '不同 ✗' : '没有参照摘要'}${p.actual != null ? `；模型 0x${A.hex(p.actual)}，C++ 0x${A.hex(p.expected)}` : ''}</li>`).join('')}</ul></details>` : '');
    if (state.arr && v.ok === null) $('ti-status').querySelector('b').textContent = '此心拍未保存逐层 C++ 参照';
    $('ti-empty').hidden = !!state.arr; $('ti-grid').hidden = !state.arr;
    $('ti-empty').textContent = state.displayed.unrun ? '此心拍经门控判正常，四分类头未执行，没有该张量。请关闭后选择一个门控判异常的心拍。' : '此块在当前动画时刻还没有输出。这里没有用 0 冒充未产生的数据；选择上方 t=0…9 后，可查看功能模型的完整结果。';
    $('ti-channel').disabled = !state.arr || state.rows === 1; $('ti-position').disabled = !state.arr;
    $('ti-legend').textContent = d.special ? '每格是截至所选时间步的脉冲累计；点击或移动鼠标查看，方向键移动，Home / End 到行首 / 行尾。' : `${d.m === 'spk' ? '灰色=0，绿色=1（脉冲）' : '蓝色=负值，灰色=0，橙色=正值；颜色统一按 INT8 ±127/128 标度'}。通道和位置均从 0 开始；完整矩阵可横向滚动和调整格子尺寸。`;
    if (state.arr) { showCell(); draw(); } else { geometry = null; $('ti-selection').textContent = '无可选整数'; $('ti-calc').textContent = ''; $('ti-terms-wrap').hidden = true; }
  }
  function showCell() {
    if (!state.arr) return; $('ti-channel').value = state.row; $('ti-position').value = state.col;
    const index = state.row * state.cols + state.col, c = cell(state.k, state.stage, state.t, index, state.res, state.beat);
    $('ti-selection').textContent = `通道 ${state.row} · 位置 ${state.col} · 展平下标 ${index} · 整数值 = ${c.value}　${c.matches ? '本格重算一致 ✓' : '本格重算不一致 ✗'}`;
    $('ti-calc').innerHTML = c.rows.map(([name, value]) => `<div class="ti-row"><span>${esc(name)}</span><span>${esc(value)}</span></div>`).join('');
    $('ti-terms-wrap').hidden = !c.terms.length;
    if (c.terms.length) {
      $('ti-terms-title').textContent = `逐项${F.nodes[state.k].special ? '脉冲累计' : '乘加'}明细（全部 ${c.terms.length} 项）`;
      $('ti-terms').innerHTML = `<table><thead><tr><th>来源</th><th>输入 x</th><th>权重</th><th>乘积</th><th>累加和</th></tr></thead><tbody>${c.terms.map(v => `<tr><td>${esc(v.source)}</td><td>${v.x}</td><td>${v.weight}</td><td>${v.product}</td><td>${v.sum}</td></tr>`).join('')}</tbody></table>`;
    }
  }
  function draw() {
    if (!opened || !state.arr) return;
    const cv = $('ti-grid'), size = +$('ti-zoom').value, cw = size, ch = Math.max(18, size), x = 44, y = 28;
    const width = Math.max(260, x + cw * state.cols + 8), height = Math.max(80, y + ch * state.rows + 8), dpr = window.devicePixelRatio || 1;
    cv.style.width = width + 'px'; cv.style.height = height + 'px'; cv.width = Math.round(width * dpr); cv.height = Math.round(height * dpr);
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); const pal = A.palette(), p = pal.p;
    c.fillStyle = p.surface2; c.fillRect(0, 0, width, height);
    const d = F.nodes[state.k], special = !!d.special, mx = special ? 10 : 127;
    for (let r = 0; r < state.rows; r++) for (let q = 0; q < state.cols; q++) {
      const v = state.arr[r * state.cols + q]; c.fillStyle = d.m === 'spk' ? (v ? A.mix(pal.zero, pal.spk, 1) : p.surface2) : (v > 0 ? A.mix(pal.zero, pal.pos, Math.min(1, v / mx)) : v < 0 ? A.mix(pal.zero, pal.neg, Math.min(1, -v / mx)) : p.surface2);
      c.fillRect(x + q * cw, y + r * ch, cw, ch);
      if (cw >= 12) { c.strokeStyle = p.line; c.lineWidth = .5; c.strokeRect(x + q * cw, y + r * ch, cw, ch); }
      if (cw >= 28) { c.fillStyle = p.ink; c.font = `10px ${p.mono}`; c.textAlign = 'center'; c.fillText(String(v), x + (q + .5) * cw, y + (r + .5) * ch + 3); }
    }
    c.fillStyle = p.muted; c.font = `10px ${p.mono}`; c.textAlign = 'right';
    for (let r = 0; r < state.rows; r++) c.fillText(String(r), x - 7, y + (r + .5) * ch + 3);
    c.textAlign = 'center'; const tick = Math.max(1, Math.ceil(35 / cw));
    for (let q = 0; q < state.cols; q += tick) c.fillText(String(q), x + (q + .5) * cw, y - 9);
    c.strokeStyle = p.bad; c.lineWidth = 2; c.strokeRect(x + state.col * cw + 1, y + state.row * ch + 1, Math.max(2, cw - 2), ch - 2);
    geometry = { x, y, cw, ch }; $('ti-zoom-value').textContent = size + ' px';
    cv.setAttribute('aria-label', `${d.t}，阶段 ${state.stage} t=${state.t}，通道 ${state.row} 位置 ${state.col}，整数 ${state.arr[state.row * state.cols + state.col]}。方向键移动，Home 或 End 到行首行尾。`);
  }
  function scrollToCell() {
    if (!geometry) return; const sc = $('ti-scroll'), x = geometry.x + state.col * geometry.cw, y = geometry.y + state.row * geometry.ch;
    if (x < sc.scrollLeft) sc.scrollLeft = x; else if (x + geometry.cw > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = x + geometry.cw - sc.clientWidth;
    if (y < sc.scrollTop) sc.scrollTop = y; else if (y + geometry.ch > sc.scrollTop + sc.clientHeight) sc.scrollTop = y + geometry.ch - sc.clientHeight;
  }
  A.inspector = { open, close, cell, tensor, verification, getState: () => state, render };
  A.guard('tensorInspector', inject);
})();
