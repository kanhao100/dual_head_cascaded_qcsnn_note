/* Verification summary and file index. */
(function () {
  const { $, esc, fmt, table, guard } = MC;
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  guard('verify', () => {
    const NM = { forward_11: 'LIF1', forward_10: 'LIF2', forward_8: 'LIF3', forward_9: '二分类 LIF', forward_12: '4 分类隐藏 LIF', forward_7: '4 分类输出 LIF' };
    const lat = m => (MD.lif.find(x => x.mod === m) || {}).latency;
    const rows = [];
    Object.keys(NM).forEach(m => {
      const r = (MD.sim.lif || []).filter(x => x.mod === m), s = (MD.sim.lifStall || []).filter(x => x.mod === m);
      rows.push([`<b>${NM[m]}</b><br><span class="small"><code>${m}</code></span>`, '每用例连续 10 次调用', r.length, `${fmt(sum(r, x => x.spikes))} 个脉冲 + ${fmt(sum(r, x => x.stateValues))} 个膜电位值`, sum(r, x => x.spkBad + x.stBad + x.bankBad), r.length ? `${fmt(r[0].lat)} 拍（报告 ${fmt(lat(m))}）` : '—']);
      if (s.length) rows.push(['', '随机 FIFO 停顿', s.length, `${fmt(sum(s, x => x.spikes))} 个脉冲 + ${fmt(sum(s, x => x.stateValues))} 个膜电位值`, sum(s, x => x.spkBad + x.stBad + x.bankBad), `变长（如 ${fmt(s[0].lat)} 拍）`]);
    });
    const cm = { forward_14: ['卷积 2', MD.conv.find(c => c.label === 'conv2')], forward_13: ['卷积 3', MD.conv.find(c => c.label === 'conv3')] };
    Object.keys(cm).forEach(m => {
      const [n, c] = cm[m], all = (MD.sim.conv || []).filter(x => x.mod === m);
      [['正常', x => !x.poison && !x.stall], ['输入缓冲预载随机垃圾', x => x.poison], ['随机 FIFO 停顿', x => x.stall]].forEach(([lab, f], i) => {
        const r = all.filter(f); if (!r.length) return;
        rows.push([i ? '' : `<b>${n}</b><br><span class="small"><code>${m}</code> 装载 + 计算 + 共享乘法器</span>`, lab, r.length, `${fmt(sum(r, x => x.values))} 个 INT8 输出（其中 ${fmt(sum(r, x => x.saturated))} 个被饱和）`, sum(r, x => x.bad + Math.abs(x.values - x.got)), i ? '—' : `装载 ${fmt(r[0].latLoad + 1)}（报告 ${fmt(c.load.latency)}）· 计算 ${fmt(r[0].latComp + 1)}（报告 ${fmt(c.latency)}）拍`]);
      });
    });
    table($('#vf-table'), ['被测模块', '方式', '运行数', '逐个比较的值', '不同', '测得延迟'], rows);
  });
  guard('refs', () => {
    const L1 = MD.lif[0], C2 = MD.conv.find(c => c.label === 'conv2');
    const rows = [
      ['LIF1 的 RTL', `<code>${esc(L1.file)}</code>`, L1.refs.map(r => `${esc(r.label)}：${r.line}`).join('；')],
      ['LIF 六个模块', '<code>hls/work_csynth/hls/syn/verilog/topFunction_forward_{11,10,8,9,12,7}.v</code>', '常量与结构由 <code>micro/extract_micro.py</code> 解析，见“六个实例”表'],
      ['卷积 2 计算模块', `<code>${esc(C2.compFile)}</code>`, C2.refs.map(r => `${esc(r.label)}：${r.line}`).join('；')],
      ['卷积 2 装载模块', `<code>${esc(C2.loadFile)}</code>`, '13 级，写 48 个 bank；同样用 ×171 和 11 级求余'],
      ['综合报告', '<code>hls/work_csynth/hls/syn/report/*_csynth.rpt</code>', 'forward_11（LIF1）、forward_4（膜电位 RAM 与卷积 1）、forward_14 / forward_13 的 Pipeline 模块'],
      ['逐状态调度', '<code>hls/work_csynth/hls/.autopilot/db/*.verbose.sched.rpt</code>', '27 级与 8 级的操作表，经 <code>hardware.json</code> 汇总'],
      ['测试平台与结果', '<code>walkthrough/micro/gen_tb_lif.py · gen_tb_conv.py · sim/</code>', '测试向量由 <code>export_*_vectors.js</code> 从已验证的整数模型导出'],
    ];
    table($('#rf-table'), ['内容', '位置', '要点 / 行号'], rows);
  });
})();
