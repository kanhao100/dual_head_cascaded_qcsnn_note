/* Import the selected full-test beat from a portable URL fragment.
 * No file fetch, session storage, remote service or modification of the kernel. */
(function () {
  const prefix = '#error-beat=';
  if (!location.hash.startsWith(prefix)) return;
  let payload;
  const section = document.getElementById('s-flow');
  const banner = document.createElement('div');
  banner.className = 'note'; banner.id = 'external-replay-status';
  banner.setAttribute('role', 'status');
  banner.textContent = '正在准备全测试集心拍回放…';
  section.insertBefore(banner, section.firstChild);
  function failure(error) {
    banner.setAttribute('role', 'alert');
    banner.textContent = '无法导入这个心拍：' + error.message;
  }
  try {
    const raw = atob(decodeURIComponent(location.hash.slice(prefix.length)));
    if (raw.length > 20000) throw new Error('回放数据过大');
    const bytes = Uint8Array.from(raw, function (c) { return c.charCodeAt(0); });
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) { failure(error); return; }
  AN.onVerified(function () {
    try {
      AN.importBeat(payload);
      banner.textContent = '全测试集 #' + payload.id + ' · 记录 ' + payload.record + ' · 中心采样 ' + payload.center +
        '。输入量化与两个 C++ 预测输出已核对；逐层张量由整数功能模型重算，此心拍没有保存逐层 C++ 参照。';
      const heading = document.getElementById('gt-table').parentElement.querySelector('h4');
      if (heading) heading.textContent = '展示与外部回放心拍的结果';
      section.scrollIntoView({ block: 'start' });
    } catch (error) { failure(error); }
  });
})();
