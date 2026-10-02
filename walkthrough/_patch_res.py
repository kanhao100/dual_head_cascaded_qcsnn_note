p = "hardware_page.js"
s = open(p, encoding="utf-8").read()
code = r'''
  /* ---------------------------------------------------------------- resource picture ("资源与存储"):
   * HLS estimate vs routed, as a share of the whole xc7z020, and every memory drawn as its bank grid. */
  const DEV = { DSP: 220, BRAM: 280, LUT: 53200, FF: 106400 };
  (function () { const st = document.createElement('style'); st.textContent = '.hw-rrow{display:grid;grid-template-columns:54px minmax(0,1fr) minmax(190px,auto);gap:10px;align-items:center;margin:7px 0;font-size:12px}.hw-rbars{display:grid;gap:3px}.hw-rbar{height:11px;border-radius:3px;min-width:2px}.hw-rbar.h{background:color-mix(in srgb,var(--muted) 55%,var(--surface))}.hw-rbar.r{background:var(--sig)}.hw-rv{font:11.5px var(--f-mono);color:var(--ink2)}.hw-banks{display:flex;flex-wrap:wrap;gap:2px;margin:6px 0 2px}.hw-banks i{display:block;width:9px;height:9px;border-radius:2px;background:color-mix(in srgb,var(--sig) 60%,var(--surface));border:1px solid var(--sig)}.hw-mem{margin:10px 0;font-size:12px}.hw-mem b{font-weight:600}'; document.head.appendChild(st); })();
  function resFigure(l) {
    const g = (r, k) => r ? (r[k] == null ? r[k.toLowerCase()] : r[k]) : null, pct = (v, k) => v == null ? '—' : (v / DEV[k] * 100).toFixed(v / DEV[k] < .01 ? 2 : 1) + '%';
    let h = '<div class="hw-resfig"><h4>占整块 xc7z020 的比例</h4>' + ['DSP', 'BRAM', 'LUT', 'FF'].map(k => {
      const a = g(l.hls, k), b = g(l.routed, k), w = v => v == null ? 0 : Math.max(.4, v / DEV[k] * 100);
      return `<div class="hw-rrow"><b>${k === 'BRAM' ? 'BRAM18K' : k}</b><div class="hw-rbars"><div class="hw-rbar h" style="width:${w(a)}%"></div><div class="hw-rbar r" style="width:${w(b)}%"></div></div><span class="hw-rv">HLS ${num(a)}（${pct(a, k)}） · 布线后 ${num(b)}（${pct(b, k)}）</span></div>`;
    }).join('') + '<p class="small">灰条 = HLS 综合预估，蓝条 = 布局布线后；条长是占整块器件（DSP 220、BRAM18K 280、LUT 53,200、FF 106,400）的比例。共享模块和膜电位 RAM 的归属见下面的说明。</p>';
    const stores = (l.storage || []).concat((l.fifoIds || []).map(id => (H.fifos || []).find(f => f.name === id)).filter(Boolean));
    if (stores.length) h += '<h4>存储：每块 RAM 画一个小方块</h4>' + stores.map(s => { const banks = s.banks || 1, kb = banks * s.words * s.bits / 1024; return `<div class="hw-mem"><b>${E(s.name)}</b> · ${banks} 块 × ${num(s.words)} 字 × ${num(s.bits)} 位 = ${kb.toFixed(kb < 10 ? 1 : 0)} Kb，BRAM18K ${num(s.BRAM == null ? s.bram : s.BRAM)}<div class="hw-banks" aria-hidden="true">${'<i></i>'.repeat(Math.min(banks, 128))}</div>${banks > 128 ? '<span class="small">（只画前 128 块）</span>' : ''}</div>`; }).join('');
    return h + '</div>';
  }
'''
hook = "  function selectLayer(key) {"
assert hook in s
s = s.replace(hook, code + hook, 1)
old = "} else html=table(['口径','DSP','BRAM18K','LUT','FF']"
assert old in s
s = s.replace(old, "} else html=resFigure(l)+table(['口径','DSP','BRAM18K','LUT','FF']", 1)
open(p, "w", encoding="utf-8").write(s)
print("ok")
