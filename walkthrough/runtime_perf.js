/* Direct browser-runtime benchmark; excludes LRU caches and canvas rendering. */
(function () {
  const A = AN, section = document.getElementById('s-lab');
  if (!section) return;
  const panel = document.createElement('div'); panel.className = 'info'; panel.id = 'perf-browser';
  const button = document.createElement('button'); button.className = 'btn'; button.id = 'perf-measure'; button.textContent = '重新测量本机性能';
  const label = document.createElement('span'); label.id = 'perf-result'; label.textContent = ' 完成展示心拍核对后测量本机模型运算时间…';
  panel.append(button, label); section.querySelector('.lab').append(panel);
  let result = null, pending = null;
  function measure() {
    if (pending) return pending;
    button.disabled = true; label.textContent = ' 正在直接运行24个展示心拍（不使用缓存）…';
    const times = []; let index = 0;
    pending = new Promise(resolve => {
      function step() {
        const beat = A.BEATS[index], start = performance.now();
        const words = A.model.quantizeRow(Array.from(beat.rowF));
        const trace = A.model.run(words, { trace: true });
        times.push(performance.now() - start);
        if (trace.pred2 !== beat.top[0] || trace.pred4 !== beat.top[1]) {
          label.textContent = ' 性能测试发现预测与 C++ 参照不同，停止测量。'; button.disabled = false; pending = null; resolve(null); return;
        }
        if (++index < Math.min(24, A.BEATS.length)) { setTimeout(step, 0); return; }
        const sorted = times.slice().sort((a, b) => a - b), n = sorted.length;
        result = { samples: n, medianMs: (sorted[Math.floor((n - 1) / 2)] + sorted[Math.ceil((n - 1) / 2)]) / 2,
          p95Ms: sorted[Math.ceil(.95 * n) - 1], maxMs: sorted[n - 1], method: 'direct model, full trace, no LRU or rendering' };
        const manual = result.p95Ms > 200;
        A.enableOnDemandLab(manual);
        label.textContent = ` 本机24拍：中位数 ${result.medianMs.toFixed(1)} ms，P95 ${result.p95Ms.toFixed(1)} ms，最大 ${result.maxMs.toFixed(1)} ms。${manual ? 'P95超过200 ms，实验室已切为点击计算。' : '实验室保持自动计算。'}（完整trace运算，不含绘图与缓存命中）`;
        button.disabled = false; pending = null; resolve(result);
      }
      setTimeout(step, 0);
    });
    return pending;
  }
  button.addEventListener('click', measure);
  A.performance = { measure, state: () => result };
  A.onVerified(() => setTimeout(measure, 100));
})();
