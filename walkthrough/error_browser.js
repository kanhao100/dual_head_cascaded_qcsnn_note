/* Full-test error browser. Saved C++ outputs define the catalog; the selected
 * beat is inferred locally. Inputs and model parameters are embedded offline. */
(function () {
  'use strict';
  const $ = function (id) { return document.getElementById(id); };
  const C = ['N', 'S', 'V', 'F'], NAMES = ['正常 N', '室上性 S', '室性 V', '融合 F'];
  const PAGE_SIZE = 7, ROUTES = ['all', 'errors', 'gate_miss', 'gate_extra', 'stage2_wrong', 'recovered'];
  const state = { cell: null, route: 'all', record: '', beat: null, page: 0 };
  let index, rows, words, model, filtered = [], generation = 0, selectedResult = null;
  const fmt = function (n) { return Number(n).toLocaleString('en-US'); };
  const esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function unb64(s) {
    const text = atob(s), a = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) a[i] = text.charCodeAt(i);
    return a;
  }
  async function unpack(s) {
    if (typeof DecompressionStream !== 'function') throw new Error('此浏览器不支持离线数据解压，请用当前版本的 Edge 或 Chrome 打开。');
    const stream = new Response(unb64(s)).body.pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).arrayBuffer();
  }
  function record(i) {
    const offset = i * 8, y = index.getUint8(offset + 5), p2 = index.getUint8(offset + 6), p4 = index.getUint8(offset + 7);
    return { id: i, center: index.getUint32(offset, true), record: ERROR_DATA.records[index.getUint8(offset + 4)],
      label: y, pred2: p2, pred4: p4, final: p2 ? p4 : 0 };
  }
  function matchesRoute(b, route) {
    if (route === 'errors') return b.final !== b.label;
    if (route === 'gate_miss') return b.label > 0 && b.pred2 === 0;
    if (route === 'gate_extra') return b.label === 0 && b.pred2 === 1;
    if (route === 'stage2_wrong') return b.pred2 === 1 && b.final !== b.label;
    if (route === 'recovered') return b.label === 0 && b.pred2 === 1 && b.final === 0;
    return true;
  }
  function rowOf(i) { return rows.subarray(i * 184, (i + 1) * 184); }
  function wordsOf(i) { return words.subarray(i * 188, (i + 1) * 188); }
  function selectedPayload() {
    if (state.beat == null) return null;
    const b = record(state.beat);
    return { schema: 'qcsnn-error-beat-v1', paramsId: ERROR_DATA.paramsId, id: b.id,
      cls: ERROR_DATA.classes[b.label], label: b.label, record: b.record, center: b.center,
      top: [b.pred2, b.pred4], row: Array.from(rowOf(b.id)), words: Array.from(wordsOf(b.id)) };
  }
  function replayHref() {
    const payload = selectedPayload();
    if (!payload) return null;
    const encoded = new TextEncoder().encode(JSON.stringify(payload));
    let text = '';
    for (let i = 0; i < encoded.length; i++) text += String.fromCharCode(encoded[i]);
    return 'qcsnn_kernel_walkthrough.html#error-beat=' + encodeURIComponent(btoa(text));
  }
  function remember() {
    const p = new URLSearchParams();
    if (state.cell) p.set('cell', state.cell.join(','));
    if (state.route !== 'all') p.set('route', state.route);
    if (state.record) p.set('record', state.record);
    if (state.beat != null) p.set('beat', state.beat);
    try { history.replaceState(null, '', '#' + p.toString()); } catch (_) {}
  }
  function restore() {
    const p = new URLSearchParams(location.hash.slice(1)), cell = (p.get('cell') || '').split(',').map(Number);
    if (cell.length === 2 && cell.every(function (x) { return Number.isInteger(x) && x >= 0 && x < 4; })) state.cell = cell;
    if (ROUTES.includes(p.get('route'))) state.route = p.get('route');
    if (ERROR_DATA.records.includes(p.get('record'))) state.record = p.get('record');
    const beat = p.get('beat');
    if (beat !== null && /^\d+$/.test(beat) && +beat < ERROR_DATA.count) state.beat = +beat;
    if (!state.cell && !p.has('route')) {
      let max = -1;
      ERROR_DATA.matrix.forEach(function (r, y) { r.forEach(function (n, pred) {
        if (y !== pred && n > max) { max = n; state.cell = [y, pred]; }
      }); });
    }
    $('eb-route').value = state.route; $('eb-record').value = state.record;
  }
  function drawMatrix() {
    let html = '<span></span>' + C.map(function (c) { return '<span class="matrix-label">' + c + '</span>'; }).join('');
    const errorMax = Math.max.apply(null, ERROR_DATA.matrix.flatMap(function (r, y) { return r.filter(function (_, p) { return y !== p; }); }));
    ERROR_DATA.matrix.forEach(function (r, y) {
      html += '<span class="matrix-label">' + C[y] + '</span>';
      r.forEach(function (n, p) {
        const selected = state.cell && state.cell[0] === y && state.cell[1] === p;
        const total = r.reduce(function (a, b) { return a + b; }, 0);
        const fill = n && y !== p ? 5 + 16 * n / Math.max(1, errorMax) : 0;
        html += '<button type="button" class="matrix-cell ' + (y === p ? 'diagonal' : 'error-cell') +
          '" data-truth="' + y + '" data-pred="' + p + '" style="--cell-fill:' + fill.toFixed(2) + '%" aria-pressed="' + !!selected +
          '" aria-label="真实 ' + C[y] + '，预测 ' + C[p] + '，' + n + ' 个心拍"><strong>' + fmt(n) +
          '</strong><span>' + (100 * n / total).toFixed(1) + '%</span></button>';
      });
    });
    $('eb-matrix').innerHTML = html;
    $('eb-matrix').querySelectorAll('button').forEach(function (button) {
      button.addEventListener('click', function () {
        state.cell = [+button.dataset.truth, +button.dataset.pred]; state.route = 'all'; $('eb-route').value = 'all';
        state.page = 0; state.beat = null; refresh();
      });
    });
  }
  function filter() {
    filtered = [];
    for (let i = 0; i < ERROR_DATA.count; i++) {
      const b = record(i);
      if (state.cell && (b.label !== state.cell[0] || b.final !== state.cell[1])) continue;
      if (state.record && b.record !== state.record) continue;
      if (!matchesRoute(b, state.route)) continue;
      filtered.push(i);
    }
    if (!filtered.includes(state.beat)) state.beat = filtered.length ? filtered[0] : null;
    state.page = state.beat == null ? 0 : Math.floor(filtered.indexOf(state.beat) / PAGE_SIZE);
  }
  function drawList() {
    const pages = Math.ceil(filtered.length / PAGE_SIZE), start = state.page * PAGE_SIZE;
    const cellLabel = state.cell ? C[state.cell[0]] + ' → ' + C[state.cell[1]] : '所有类别';
    $('eb-match').textContent = cellLabel + ' · ' + fmt(filtered.length) + ' 个匹配心拍';
    $('eb-list').innerHTML = filtered.slice(start, start + PAGE_SIZE).map(function (i) {
      const b = record(i);
      return '<button type="button" class="sample-button" data-beat="' + i + '" aria-pressed="' + (i === state.beat) +
        '"><span>记录 ' + esc(b.record) + ' · ' + b.center + '<span class="sample-id">测试集 #' + i +
        '</span></span><span class="sample-prediction">' + C[b.label] + ' → ' + C[b.final] + '</span></button>';
    }).join('');
    $('eb-list').querySelectorAll('button').forEach(function (button) { button.addEventListener('click', function () { select(+button.dataset.beat); }); });
    $('eb-page').textContent = pages ? (state.page + 1) + ' / ' + pages : '0 / 0';
    $('eb-prev-page').disabled = state.page === 0; $('eb-next-page').disabled = !pages || state.page >= pages - 1;
  }
  function svgText(text, x, y, anchor, extra) {
    return '<text x="' + x + '" y="' + y + '" text-anchor="' + (anchor || 'middle') + '" ' + (extra || '') + '>' + esc(text) + '</text>';
  }
  function drawWave() {
    if (state.beat == null) return;
    const svg = $('eb-wave'), width = Math.max(230, svg.getBoundingClientRect().width || 600), height = 200;
    const row = rowOf(state.beat), left = 54, right = 13, top = 18, bottom = 38;
    const values = Array.from(row.subarray(0, 180)), min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    const pad = Math.max(.1, (max - min) * .1), low = min - pad, high = max + pad;
    const x = function (i) { return left + i / 179 * (width - left - right); };
    const y = function (value) { return height - bottom - (value - low) / (high - low) * (height - top - bottom); };
    let html = '<title>心拍 #' + state.beat + ' 的预处理 ECG 波形</title><desc>横轴采样点 0 至 179；纵轴为归一化幅值，不是毫伏。</desc>';
    html += '<rect class="frame" x="' + left + '" y="' + top + '" width="' + (width - left - right) + '" height="' + (height - top - bottom) + '"/>';
    for (let i = 0; i < 4; i++) {
      const value = low + (high - low) * i / 3, py = y(value);
      html += '<line class="grid-line" x1="' + left + '" x2="' + (width - right) + '" y1="' + py + '" y2="' + py + '"/>';
      html += svgText(value.toFixed(1), left - 7, py + 4, 'end');
    }
    (width < 350 ? [0, 90, 179] : [0, 60, 120, 179]).forEach(function (i) {
      html += svgText(i, x(i), height - bottom + 17, i === 0 ? 'start' : i === 179 ? 'end' : 'middle');
    });
    html += svgText('采样点', left + (width - left - right) / 2, height - 1, 'middle', 'class="axis-title" data-axis="x"');
    html += svgText('归一化幅值', 0, 10, 'start', 'class="axis-title" data-axis="y"');
    const path = values.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(2) + ',' + y(v).toFixed(2); }).join(' ');
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.innerHTML = html + '<path class="signal" d="' + path + '"/>';
  }
  function reason(b) {
    if (b.label > 0 && b.pred2 === 0) return '真实类别为 ' + NAMES[b.label] + '，一级判为正常并提前退出；四分类头没有执行，最终输出 N。';
    if (b.label === 0 && b.pred2 === 1 && b.final === 0) return '正常心拍被一级送入二级，四分类头将结果纠正为 N；最终判对，但多执行了二级计算。';
    if (b.label === 0 && b.pred2 === 1) return '正常心拍被一级送入二级，四分类头输出 ' + C[b.final] + '，最终错分类。';
    if (b.final !== b.label) return '一级正确识别为异常并运行二级；四分类头将 ' + C[b.label] + ' 判为 ' + C[b.final] + '，错分类发生在二级输出。';
    return b.pred2 ? '一级识别为异常，四分类头输出与真实类别一致。' : '一级识别为正常并提前退出，最终类别与真实标签一致。';
  }
  function drawDetail() {
    const token = ++generation, i = state.beat;
    $('eb-detail').hidden = i == null; $('eb-empty').hidden = i != null; selectedResult = null;
    if (i == null) return;
    const b = record(i), row = rowOf(i);
    $('eb-beat-id').textContent = '全测试集 #' + i;
    $('eb-beat-title').textContent = '记录 ' + b.record + ' · 中心采样 ' + b.center;
    $('eb-outcome').textContent = b.final === b.label ? '最终判对' : '最终错分类';
    $('eb-outcome').classList.toggle('correct', b.final === b.label);
    $('eb-classification').textContent = '真实：' + NAMES[b.label] + '　→　预测：' + NAMES[b.final];
    $('eb-path').innerHTML = '<div class="route-node"><span>一级 · 二分类</span><strong>' + (b.pred2 ? '判异常' : '判正常') +
      '</strong></div><span class="route-arrow" aria-hidden="true">→</span><div class="route-node' + (b.pred2 ? '' : ' skipped') +
      '"><span>二级 · 四分类</span><strong>' + (b.pred2 ? '输出 ' + C[b.pred4] : '跳过') +
      '</strong></div><span class="route-arrow" aria-hidden="true">→</span><div class="route-node"><span>最终类别</span><strong>' + C[b.final] + '</strong></div>';
    $('eb-reason').textContent = reason(b);
    $('eb-rr').innerHTML = [['前 RR', 180, 's'], ['后 RR', 181, 's'], ['前 / 后 RR', 182, ''], ['前 − 后 RR', 183, 's']].map(function (r) {
      return '<div><dt>' + r[0] + '</dt><dd>' + row[r[1]].toFixed(3) + (r[2] ? ' ' + r[2] : '') + '</dd></div>';
    }).join('');
    const replay = $('eb-replay'); replay.removeAttribute('href'); replay.setAttribute('aria-disabled', 'true');
    const status = $('eb-model-status'); status.className = ''; status.setAttribute('role', 'status'); status.textContent = '正在重算脉冲计数…';
    $('eb-spikes').textContent = ''; drawWave();
    setTimeout(function () {
      if (generation !== token) return;
      try {
        const input = model.quantizeRow(Array.from(row)), expected = wordsOf(i);
        for (let j = 0; j < 188; j++) if (input[j] !== expected[j]) throw new Error('输入量化与保存的 C++ 输入不一致：字 ' + j);
        const r = model.run(input);
        if (r.pred2 !== b.pred2 || r.pred4 !== b.pred4) throw new Error('当前整数模型与保存的 C++ 预测不一致');
        selectedResult = r; status.className = 'ok'; status.textContent = '输入 / 两个 C++ 输出均一致 ✓';
        let html = '<div class="spike-row"><span>一级累计 · 正常 / 异常</span><strong class="mono">' + r.sums2.join(' / ') + '</strong></div>';
        html += '<div class="spike-row"><span>一级判决</span><span>' + r.sums2[1] + (r.pred2 ? ' > ' : ' ≤ ') + r.sums2[0] +
          ' → ' + (r.pred2 ? '进入二级' : '提前退出') + '</span></div>';
        if (r.pred2) html += '<div class="spike-row"><span>二级累计 · N / S / V / F</span><strong class="mono">' + r.sums4.join(' / ') + '</strong></div>';
        $('eb-spikes').innerHTML = html;
        replay.href = replayHref(); replay.removeAttribute('aria-disabled');
        document.dispatchEvent(new CustomEvent('qcsnn:beat-ready', { detail: { id: i } }));
      } catch (error) { status.className = 'bad'; status.textContent = error.message; status.setAttribute('role', 'alert'); }
    }, 0);
  }
  function select(i) {
    if (!filtered.includes(i)) throw new Error('所选心拍不属于当前筛选');
    state.beat = i; state.page = Math.floor(filtered.indexOf(i) / PAGE_SIZE);
    drawList(); drawDetail(); remember();
  }
  function refresh() { filter(); drawMatrix(); drawList(); drawDetail(); remember(); }
  async function main() {
    $('eb-total').textContent = fmt(ERROR_DATA.count); $('eb-errors').textContent = fmt(ERROR_DATA.counts.errors);
    $('eb-accuracy').textContent = (100 * ERROR_DATA.counts.correct / ERROR_DATA.count).toFixed(2) + '%';
    const buffers = await Promise.all([unpack(ERROR_DATA.index), unpack(ERROR_DATA.rows), unpack(ERROR_DATA.words)]);
    if (buffers[0].byteLength !== ERROR_DATA.count * 8 || buffers[1].byteLength !== ERROR_DATA.count * 184 * 4 || buffers[2].byteLength !== ERROR_DATA.count * 188) throw new Error('嵌入的全测试集长度不一致');
    index = new DataView(buffers[0]); rows = new Float32Array(buffers[1]); words = new Int8Array(buffers[2]);
    const p = JSON.parse(JSON.stringify(ERROR_PARAMS));
    p.blocks.forEach(function (b) { const u = unb64(b.conv.weights); b.conv.weights = new Int8Array(u.buffer); });
    [p.bin.fc, p.multi.fc1, p.multi.fc2].forEach(function (f) { const u = unb64(f.weights); f.weights = new Int8Array(u.buffer); });
    model = KM.create(p);
    const actual = Array.from({ length: 4 }, function () { return [0, 0, 0, 0]; });
    for (let i = 0; i < ERROR_DATA.count; i++) {
      const b = record(i);
      if (!b.record || b.label > 3 || b.pred2 > 1 || b.pred4 > 3) throw new Error('目录数据无效：心拍 ' + i);
      actual[b.label][b.final]++;
    }
    if (JSON.stringify(actual) !== JSON.stringify(ERROR_DATA.matrix)) throw new Error('目录重算的混淆矩阵与保存统计不一致');
    ERROR_DATA.records.forEach(function (name) { const option = document.createElement('option'); option.value = name; option.textContent = name; $('eb-record').appendChild(option); });
    const routeCounts = Object.assign({ all: ERROR_DATA.count }, ERROR_DATA.counts);
    $('eb-route').querySelectorAll('option').forEach(function (option) { option.textContent += ' · ' + fmt(routeCounts[option.value]); });
    $('eb-sources').innerHTML = ERROR_DATA.sources.map(function (s) { return '<li><code>' + esc(s.path) + '</code> · SHA-256 <code>' + esc(s.sha256.slice(0, 16)) + '…</code></li>'; }).join('');
    $('eb-route').addEventListener('change', function () { state.route = this.value; state.cell = null; state.beat = null; refresh(); });
    $('eb-record').addEventListener('change', function () { state.record = this.value; state.beat = null; refresh(); });
    $('eb-all-errors').addEventListener('click', function () { state.cell = null; state.route = 'errors'; state.record = ''; state.beat = null; $('eb-route').value = 'errors'; $('eb-record').value = ''; refresh(); });
    $('eb-prev-page').addEventListener('click', function () { if (state.page > 0) select(filtered[(state.page - 1) * PAGE_SIZE]); });
    $('eb-next-page').addEventListener('click', function () { const next = (state.page + 1) * PAGE_SIZE; if (next < filtered.length) select(filtered[next]); });
    restore(); $('eb-workspace').hidden = false; $('eb-load').hidden = true; refresh();
    if (typeof ResizeObserver === 'function') new ResizeObserver(drawWave).observe($('eb-wave'));
    else window.addEventListener('resize', drawWave);
  }
  $('eb-theme').addEventListener('click', function () {
    const root = document.documentElement, preferred = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const current = root.dataset.theme || (preferred ? 'dark' : 'light'); root.dataset.theme = current === 'dark' ? 'light' : 'dark';
  });
  const ready = main().catch(function (error) {
    $('eb-load').hidden = false; $('eb-load').textContent = '无法打开数据：' + error.message; $('eb-load').setAttribute('role', 'alert'); throw error;
  });
  window.ErrorBrowser = {
    ready: ready, record: record, matchesRoute: matchesRoute, payload: selectedPayload,
    snapshot: function () { return { state: Object.assign({}, state), ids: filtered.slice(), result: selectedResult, counts: ERROR_DATA.counts, matrix: ERROR_DATA.matrix }; },
    inputs: function (i) { if (!Number.isInteger(i) || i < 0 || i >= ERROR_DATA.count) throw new Error('Invalid test index'); return { row: Array.from(rowOf(i)), words: Array.from(wordsOf(i)) }; },
    select: select,
  };
})();
