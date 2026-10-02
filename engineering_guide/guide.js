(function () {
  'use strict';
  const data = typeof ENG === 'object' && ENG ? ENG : { root: '', files: [], pragmas: [], workflow: [], facts: {} };
  const files = Array.isArray(data.files) ? data.files : [];
  const pragmas = Array.isArray(data.pragmas) ? data.pragmas : [];
  const workflow = Array.isArray(data.workflow) ? data.workflow : [];
  const facts = data.facts || {};
  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const state = { fileId: null, sectionIndex: 0, pragmaId: null, pragmaKind: 'all', workflowId: null, filter: 'all', search: '' };
  let toastTimer;
  const basename = path => String(path || '').replace(/\\/g, '/').split('/').pop();
  const sectionsOf = file => Array.isArray(file && file.sections) ? file.sections : [];
  const fileById = id => files.find(file => file.id === id);
  const fileByName = name => files.find(file => basename(file.path) === name);
  const sourceText = section => Array.isArray(section && section.code) ? section.code.join('\n') : String(section && section.code || '');
  const textValue = value => {
    if (value == null) return '';
    if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join('\n');
    if (typeof value === 'object') return value.text || value.note || value.summary || value.label || '';
    return String(value);
  };
  function setFact(id, value) { const text = textValue(value); if (text && $(id)) $(id).textContent = text; }
  function notify(message) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2300);
  }
  async function copy(text, label) {
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
      else {
        const previousFocus = document.activeElement;
        const field = document.createElement('textarea');
        field.value = text;
        field.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(field);
        field.focus();
        field.select();
        const successful = document.execCommand('copy');
        field.remove();
        if (previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true });
        if (!successful) throw new Error('copy unavailable');
      }
      notify(label + '已复制');
    } catch (_) { notify('复制未获浏览器授权；可选中文字手动复制'); }
  }
  function absolutePath(file) {
    const path = String(file && file.path || '');
    if (/^[A-Za-z]:[\\/]|^\//.test(path)) return path;
    const root = String(data.root || '').replace(/[\\/]$/, '');
    const separator = /[A-Za-z]:/.test(root) ? '\\' : '/';
    return root ? root + separator + path.replace(/[\\/]/g, separator) : path;
  }
  function classify(file) {
    const domain = String(file && file.domain || '').toLowerCase();
    const path = String(file && file.path || '').toLowerCase().replace(/\\/g, '/');
    if (/train|notebook|训练|预处理/.test(domain) || /\.ipynb$/.test(path)) return 'training';
    if (/param|weight|constant|参数|权重|常量/.test(domain) || /weights_sd\/|constants24_sd\.h$/.test(path)) return 'params';
    if (/host|cpu|verif|test|reference|主机|验证|参照/.test(domain) || /filereader|testbench|_tb\.|golden\/|walkthrough\/|qa\//.test(path)) return 'host';
    if (/build|hls.config|report|vivado|artifact|工程|配置|构建|报告|产物/.test(domain) || /^hls\/|^output\//.test(path)) return 'build';
    return 'kernel';
  }
  const domainNames = { kernel: '可综合内核', params: '常量 / 权重', host: '主机 / 验证', build: '构建 / 实现', training: '训练 / 导出' };
  function highlightLine(line) {
    const pattern = /(\/\/.*$|\/\*.*?(?:\*\/|$)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|^\s*#\s*\w+|\b(?:template|class|struct|enum|namespace|public|private|protected|static|const|constexpr|extern|void|int|bool|float|double|unsigned|signed|char|long|short|return|if|else|for|while|switch|case|break|continue|using|typename|auto|true|false)\b|\b\d+(?:\.\d+)?(?:[uUlLfF]*)\b)/g;
    let result = '', position = 0, match;
    while ((match = pattern.exec(line))) {
      result += esc(line.slice(position, match.index));
      const token = match[0];
      let cls = 'syn-keyword';
      if (/^\/\//.test(token) || /^\/\*/.test(token)) cls = 'syn-comment';
      else if (/^["']/.test(token)) cls = 'syn-string';
      else if (/^\s*#/.test(token)) cls = 'syn-preprocessor';
      else if (/^\d/.test(token)) cls = 'syn-number';
      result += '<span class="' + cls + '">' + esc(token) + '</span>';
      position = match.index + token.length;
    }
    return result + esc(line.slice(position));
  }
  function codeHTML(section) {
    const text = sourceText(section);
    if (!text) return '<div class="empty-state">此文件暂无嵌入片段，请根据路径在工程中查看。</div>';
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const start = Number(section.start) || 1;
    return lines.map((line, index) => '<div class="code-line"><span class="line-number" aria-hidden="true">' + (start + index) + '</span><span class="code-text">' + highlightLine(line || ' ') + '</span></div>').join('');
  }
  function resolveInclude(value) {
    const include = typeof value === 'object' && value ? value.id || value.fileId || value.path || value.name : value;
    return fileById(include) || files.find(file => file.path === include) || fileByName(basename(include));
  }
  function filteredFiles() {
    const query = state.search.toLowerCase().trim();
    return files.filter(file => {
      if (state.filter !== 'all' && classify(file) !== state.filter) return false;
      if (!query) return true;
      const content = [file.path, file.title, file.role, file.domain, ...(file.includes || []).map(textValue), ...sectionsOf(file).map(section => section.title + ' ' + sourceText(section) + ' ' + textValue(section.note))].join(' ').toLowerCase();
      return content.includes(query);
    });
  }
  function renderTree() {
    const visible = filteredFiles();
    $('file-count').textContent = visible.length + ' / ' + files.length + ' 个工程文件';
    if (!visible.length) { $('file-tree').innerHTML = '<div class="empty-state">没有匹配文件。试试文件名或切换角色。</div>'; return; }
    const tree = { directories: new Map(), files: [] };
    for (const file of visible) {
      const parts = String(file.path || file.title || file.id).replace(/\\/g, '/').split('/').filter(Boolean);
      let node = tree;
      for (const part of parts.slice(0, -1)) {
        if (!node.directories.has(part)) node.directories.set(part, { directories: new Map(), files: [] });
        node = node.directories.get(part);
      }
      node.files.push(file);
    }
    function renderNode(node) {
      let result = '';
      for (const [name, child] of node.directories) result += '<details class="tree-group" open><summary>' + esc(name) + '</summary>' + renderNode(child) + '</details>';
      for (const file of node.files) result += '<button type="button" class="tree-file' + (state.fileId === file.id ? ' active' : '') + '" data-file-id="' + esc(file.id) + '" aria-pressed="' + (state.fileId === file.id) + '" title="' + esc(file.role || file.path) + '"><span>' + esc(basename(file.path)) + '</span></button>';
      return result;
    }
    $('file-tree').innerHTML = renderNode(tree);
  }
  function renderFile() {
    const file = fileById(state.fileId);
    if (!file) return;
    const role = classify(file);
    $('file-title').textContent = file.title || basename(file.path);
    $('file-domain').textContent = domainNames[role];
    $('file-domain').className = 'pill ' + (role === 'kernel' || role === 'params' ? 'source-pill' : role === 'build' ? 'hls-pill' : '');
    $('file-path').textContent = absolutePath(file);
    $('file-role').textContent = textValue(file.role);
    const includes = Array.isArray(file.includes) ? file.includes : [];
    $('file-includes').innerHTML = includes.length ? '<span>关联 / include</span>' + includes.map(include => {
      const target = resolveInclude(include);
      const label = typeof include === 'object' && include ? include.label || include.path || include.name || include.id || include.fileId : include;
      return target ? '<button type="button" data-linked-file="' + esc(target.id) + '">' + esc(basename(label || target.path)) + '</button>' : '<span class="include-static">' + esc(label) + '</span>';
    }).join('') : '';
    const sections = sectionsOf(file);
    state.sectionIndex = Math.max(0, Math.min(state.sectionIndex, Math.max(0, sections.length - 1)));
    $('section-tabs').innerHTML = sections.map((section, index) => '<button type="button" role="tab" id="source-tab-' + index + '" class="' + (index === state.sectionIndex ? 'active' : '') + '" aria-selected="' + (index === state.sectionIndex) + '" aria-controls="code-view" tabindex="' + (index === state.sectionIndex ? '0' : '-1') + '" data-section="' + index + '">' + esc(section.title || '片段 ' + (index + 1)) + '</button>').join('');
    const section = sections[state.sectionIndex] || { title: '工程文件', code: '', note: file.role };
    $('snippet-title').textContent = section.title || '真实源码节选';
    $('snippet-range').textContent = section.start ? (file.sourceType === 'notebook' ? '单元 ' + (Number(section.cell) + 1) + ' · ' : '') + 'L' + section.start + '–' + (section.end || (Number(section.start) + sourceText(section).split('\n').length - 1)) : '';
    $('code-view').innerHTML = codeHTML(section);
    $('code-view').setAttribute('aria-labelledby', sections.length ? 'source-tab-' + state.sectionIndex : 'snippet-title');
    $('code-view').scrollTop = 0;
    $('code-view').scrollLeft = 0;
    $('snippet-note').textContent = textValue(section.note) || textValue(file.role);
    $('copy-code').disabled = !sourceText(section);
    document.querySelectorAll('.tree-file').forEach(button => {
      const active = button.dataset.fileId === state.fileId;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  function selectFile(id, sectionIndex, options) {
    const file = fileById(id);
    if (!file) return false;
    state.fileId = id;
    state.sectionIndex = Number.isInteger(Number(sectionIndex)) ? Number(sectionIndex) : 0;
    if (options && options.reveal) {
      state.filter = 'all'; state.search = '';
      $('domain-filter').value = 'all'; $('file-search').value = '';
      renderTree();
    }
    renderFile();
    if (options && options.scroll) {
      $('source').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      $('code-view').focus({ preventScroll: true });
    }
    return true;
  }
  function renderCallChain() {
    let chain = Array.isArray(facts.callChain) ? facts.callChain : [];
    if (!chain.length) {
      chain = [
        ['topclass24_sd.cpp', 'topFunction', 'AXI 解包 / 封装与顶层'],
        ['topclass24_sd.cpp', 'TopClass24_SD', '持有网络与 evaluator'],
        ['modeleval24_sd.h', 'ModelEvaluation', '收集输入并转交网络'],
        ['qcsnn24_rrboth_sd.h', 'network.forward', '共享主干 / 两头 / 门控'],
        ['lif1d_integer.h', '层模板', 'Conv / BN / LIF / FC / QI'],
        ['constants24_sd.h', '常量与权重', '位宽 / 尺寸 / 导出参数']
      ].map(([name, label, detail]) => ({ fileId: (fileByName(name) || {}).id, label, detail, sectionIndex: 0 })).filter(item => item.fileId);
    }
    $('call-chain').innerHTML = chain.map((item, index) => (index ? '<span class="call-arrow" aria-hidden="true">→</span>' : '') + '<button type="button" class="call-node" data-map-file="' + esc(item.fileId) + '" data-map-section="' + esc(item.sectionIndex || 0) + '"><small>' + String(index + 1).padStart(2, '0') + '</small><strong>' + esc(item.label || item.title || '') + '</strong><span>' + esc(item.detail || item.note || '') + '</span></button>').join('');
  }
  function pragmaType(item) {
    const kind = String(item.kind || '').toLowerCase();
    if (/type|类型|template|模板/.test(kind) || /ap_int|ap_uint|ap_axiu|hls::stream|range\(/.test(item.name || '')) return 'type';
    return 'pragma';
  }
  function renderPragmaChips() {
    const visible = pragmas.filter(item => state.pragmaKind === 'all' || pragmaType(item) === state.pragmaKind);
    $('pragma-count').textContent = visible.length + ' 项';
    $('pragma-chips').innerHTML = visible.length ? visible.map(item => '<button type="button" class="pragma-chip' + (item.id === state.pragmaId ? ' active' : '') + '" data-pragma-id="' + esc(item.id) + '" aria-pressed="' + (item.id === state.pragmaId) + '">' + esc(item.name) + '</button>').join('') : '<div class="empty-state">此分类暂无项目。</div>';
  }
  function selectPragma(id) {
    const item = pragmas.find(pragma => pragma.id === id);
    if (!item) return false;
    state.pragmaId = id;
    $('pragma-kind').textContent = pragmaType(item) === 'type' ? '类型 / 数据表达' : '综合指令';
    $('pragma-kind').className = 'pill ' + (pragmaType(item) === 'type' ? 'source-pill' : 'hls-pill');
    $('pragma-name').textContent = item.name || '';
    $('pragma-meaning').textContent = textValue(item.meaning);
    $('pragma-effect').innerHTML = Array.isArray(item.effect) ? '<ul>' + item.effect.map(line => '<li>' + esc(textValue(line)) + '</li>').join('') + '</ul>' : '<p>' + esc(textValue(item.effect)) + '</p>';
    const file = fileById(item.fileId);
    const section = sectionsOf(file)[Number(item.sectionIndex) || 0];
    $('pragma-evidence').innerHTML = file ? '<span class="pill source-pill">真实源码</span><button type="button" data-pragma-file="' + esc(file.id) + '" data-pragma-section="' + esc(item.sectionIndex || 0) + '">' + esc(file.path) + (section && section.start ? ' · L' + section.start + '–' + section.end : '') + ' ↗</button>' : '<span class="pill warning-pill">说明</span><span>请在源码浏览器中回查相关工程文件。</span>';
    $('pragma-code').innerHTML = section ? codeHTML(section) : '未嵌入对应源码片段。';
    $('pragma-code').classList.toggle('empty-code', !section);
    renderPragmaChips();
    return true;
  }
  function commandText(step) {
    const commands = step && step.commands;
    if (Array.isArray(commands)) return commands.map(command => typeof command === 'object' ? command.cmd || command.command || command.text || '' : String(command)).join('\n');
    return textValue(commands);
  }
  function renderWorkflowSteps() {
    $('workflow-steps').innerHTML = workflow.map((step, index) => '<button type="button" role="tab" id="workflow-tab-' + index + '" class="workflow-step' + (step.id === state.workflowId ? ' active' : '') + '" aria-selected="' + (step.id === state.workflowId) + '" aria-controls="workflow-detail" tabindex="' + (step.id === state.workflowId ? '0' : '-1') + '" data-workflow-id="' + esc(step.id) + '"><span>' + String(index + 1).padStart(2, '0') + '</span><div><strong>' + esc(step.title) + '</strong><small>' + esc(textValue(step.tool)) + '</small></div></button>').join('');
  }
  function selectWorkflow(id) {
    const index = workflow.findIndex(step => step.id === id);
    if (index < 0) return false;
    const step = workflow[index]; state.workflowId = id;
    $('workflow-number').textContent = 'STEP ' + String(index + 1).padStart(2, '0');
    $('workflow-title').textContent = step.title || '';
    $('workflow-status').textContent = textValue(step.status) || '工程阶段';
    $('workflow-status').className = 'pill ' + (/缺|待|未|补|gap|missing|pending/i.test(textValue(step.status)) ? 'warning-pill' : 'hls-pill');
    $('workflow-input').textContent = textValue(step.input);
    $('workflow-tool').textContent = textValue(step.tool);
    $('workflow-output').textContent = textValue(step.output);
    $('workflow-note').textContent = textValue(step.note);
    const commands = commandText(step);
    $('workflow-command').textContent = commands;
    $('workflow-command').hidden = !commands;
    $('workflow-no-command').hidden = Boolean(commands);
    $('copy-command').disabled = !commands;
    $('workflow-detail').setAttribute('aria-labelledby', 'workflow-tab-' + index);
    renderWorkflowSteps();
    return true;
  }
  function renderChanges() {
    let changes = Array.isArray(facts.changes) ? facts.changes : [];
    if (!changes.length) {
      const ids = names => names.map(name => (fileByName(name) || {}).id).filter(Boolean);
      const oneWeight = files.find(file => /weights_sd[\\/]/.test(file.path));
      changes = [
        { title: '输入格式 / AXI 接口', note: '从顶层的解包与输出打包开始。改变样本数或 RR 数量会牵动网络尺寸、主机打包和 TLAST。', fileIds: ids(['topclass24_sd.cpp', 'constants24_sd.h', 'filereader24.h']), check: '输入 188 个 INT8 的组织、24 个 64 位字、最后一个字及输出有效字节。' },
        { title: '网络结构 / 分类门控', note: 'forward 决定层调用次序、输入重放、缓存与提前结束；类成员决定各层的模板实例。', fileIds: ids(['qcsnn24_rrboth_sd.h', 'constants24_sd.h']), check: '层尺寸、流容量、两头 RR 参数、门控分支与正常路径输出。' },
        { title: 'LIF 状态 / 定点运算', note: '修改层模板，并检查网络中的六个实例与导出的 β / 阈值 / 尺度。不要只改变浮点训练定义。', fileIds: ids(['lif1d_integer.h', 'qcsnn24_rrboth_sd.h']), check: '24 位回绕、舍入、严格比较、reset、bank 写回，以及 HLS 存储与运算绑定。' },
        { title: '权重 / 量化常量', note: '参数由 Notebook 导出到 C 头文件；includeheaders 负责把实际权重集合带入可综合内核。', fileIds: ids(['includeheaders24_sd.h', 'constants24_sd.h']).concat(oneWeight ? [oneWeight.id] : []), check: '参数形状、零点、乘子、移位、BN 与 LIF 参数；再做整数逐层核对。' },
        { title: '并行度 / DSP 与存储', note: '从具体层的 PIPELINE、UNROLL、ARRAY_PARTITION 等约束入手；用综合和布线报告确认实际变化。', fileIds: ids(['conv1d_sd.h', 'linear1d_sd.h', 'lif1d_integer.h']), check: '实际 II、时钟、存储端口、资源共享与吞吐；不要把 pragma 请求当作实现结果。' },
        { title: '综合配置 / 板级使用', note: '先解决构建脚本与配置路径，再生成 IP。板级还需独立的 PS / DMA / 控制系统工程。', fileIds: ids(['hls_config.cfg', 'run_csynth.bat', 'skip_host_reader.h']), check: '当前目录、top、器件、时钟、编译选项、IP 输出；OOC 产物不能直接当作 overlay。' }
      ];
    }
    $('change-cards').innerHTML = changes.map(change => '<article class="change-card"><h3>' + esc(change.title) + '</h3><p>' + esc(textValue(change.note || change.description)) + '</p><div class="change-files">' + (change.fileIds || []).map(id => {
      const file = fileById(id);
      return file ? '<button type="button" data-change-file="' + esc(id) + '">' + esc(basename(file.path)) + ' ↗</button>' : '';
    }).join('') + '</div><div class="change-check"><strong>修改后检查</strong>' + esc(textValue(change.check)) + '</div></article>').join('');
  }
  function renderLifLinks() {
    const definitions = [
      ['lif1d_integer.h', '看 LIF 层模板', /class|状态|成员|template/i],
      ['qcsnn24_rrboth_sd.h', '看六个实例与 reset', /实例|成员|class|构造|reset/i],
      ['topclass24_sd.cpp', '看 static 顶层对象', /topFunction|顶层|入口/i]
    ];
    $('lif-source-actions').innerHTML = definitions.map(([name, title, pattern]) => {
      const file = fileByName(name);
      if (!file) return '';
      const index = sectionsOf(file).findIndex(section => pattern.test(section.title || '') || (name === 'lif1d_integer.h' && sourceText(section).includes('V0[OUT_CH]')));
      return '<button type="button" data-lif-file="' + esc(file.id) + '" data-lif-section="' + Math.max(0, index) + '">' + esc(title) + ' ↗</button>';
    }).join('');
  }
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $('theme-toggle').setAttribute('aria-label', theme === 'dark' ? '切换浅色主题' : '切换深色主题');
    $('theme-toggle').setAttribute('aria-pressed', String(theme === 'dark'));
    try { localStorage.setItem('qcsnn-engineering-theme', theme); } catch (_) {}
  }
  function tabKey(event, buttons, activate, vertical) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    let next;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else if (event.key === 'ArrowLeft' || (vertical && event.key === 'ArrowUp')) next = (index + buttons.length - 1) % buttons.length;
    else if (event.key === 'ArrowRight' || (vertical && event.key === 'ArrowDown')) next = (index + 1) % buttons.length;
    else return;
    event.preventDefault();
    activate(buttons[next]);
    const selector = buttons[next].dataset.workflowId ? '[data-workflow-id="' + CSS.escape(buttons[next].dataset.workflowId) + '"]' : '[data-section="' + buttons[next].dataset.section + '"]';
    const fresh = document.querySelector(selector);
    if (fresh) fresh.focus();
  }

  $('repo-root').textContent = data.root || '当前本地仓库';
  setFact('config-warning', facts.configPitfall || facts.configWarning);
  setFact('board-boundary', facts.boardBoundary);
  setFact('lif-state-note', facts.lifState);
  setFact('lif-storage-note', facts.lifStorage);
  setFact('dataflow-boundary', facts.dataflowBoundary);
  setFact('resource-boundary', facts.resourceBoundary);
  setFact('facts-extra', facts.extra || facts.evidenceNote);
  let storedTheme;
  try { storedTheme = localStorage.getItem('qcsnn-engineering-theme'); } catch (_) {}
  setTheme(storedTheme === 'dark' || (!storedTheme && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light');
  $('theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('file-search').addEventListener('input', event => { state.search = event.target.value; renderTree(); });
  $('domain-filter').addEventListener('change', event => { state.filter = event.target.value; renderTree(); });
  $('file-tree').addEventListener('click', event => { const button = event.target.closest('[data-file-id]'); if (button) selectFile(button.dataset.fileId, 0); });
  $('file-includes').addEventListener('click', event => { const button = event.target.closest('[data-linked-file]'); if (button) selectFile(button.dataset.linkedFile, 0, { reveal: true }); });
  $('section-tabs').addEventListener('click', event => { const button = event.target.closest('[data-section]'); if (button) { state.sectionIndex = Number(button.dataset.section); renderFile(); const fresh = document.querySelector('[data-section="' + state.sectionIndex + '"]'); if (fresh) fresh.focus({ preventScroll: true }); } });
  $('section-tabs').addEventListener('keydown', event => tabKey(event, Array.from($('section-tabs').querySelectorAll('[role=tab]')), button => { state.sectionIndex = Number(button.dataset.section); renderFile(); }, false));
  $('copy-path').addEventListener('click', () => copy(absolutePath(fileById(state.fileId)), '完整路径'));
  $('copy-code').addEventListener('click', () => copy(sourceText(sectionsOf(fileById(state.fileId))[state.sectionIndex]), '源码片段'));
  $('call-chain').addEventListener('click', event => { const button = event.target.closest('[data-map-file]'); if (button) selectFile(button.dataset.mapFile, Number(button.dataset.mapSection), { reveal: true, scroll: true }); });
  document.querySelectorAll('[data-domain]').forEach(button => button.addEventListener('click', () => { state.filter = button.dataset.domain; state.search = ''; $('domain-filter').value = state.filter; $('file-search').value = ''; renderTree(); const visible = filteredFiles(); if (visible.length) selectFile(visible[0].id, 0); $('source').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }));
  document.querySelectorAll('[data-kind]').forEach(button => button.addEventListener('click', () => { state.pragmaKind = button.dataset.kind; document.querySelectorAll('[data-kind]').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); }); const first = pragmas.find(item => state.pragmaKind === 'all' || pragmaType(item) === state.pragmaKind); if (first && !pragmas.some(item => item.id === state.pragmaId && (state.pragmaKind === 'all' || pragmaType(item) === state.pragmaKind))) selectPragma(first.id); else renderPragmaChips(); }));
  $('pragma-chips').addEventListener('click', event => { const button = event.target.closest('[data-pragma-id]'); if (button) { selectPragma(button.dataset.pragmaId); const fresh = document.querySelector('[data-pragma-id="' + CSS.escape(state.pragmaId) + '"]'); if (fresh) fresh.focus({ preventScroll: true }); } });
  $('pragma-evidence').addEventListener('click', event => { const button = event.target.closest('[data-pragma-file]'); if (button) selectFile(button.dataset.pragmaFile, Number(button.dataset.pragmaSection), { reveal: true, scroll: true }); });
  $('workflow-steps').addEventListener('click', event => { const button = event.target.closest('[data-workflow-id]'); if (button) { selectWorkflow(button.dataset.workflowId); const fresh = document.querySelector('[data-workflow-id="' + CSS.escape(state.workflowId) + '"]'); if (fresh) fresh.focus({ preventScroll: true }); } });
  $('workflow-steps').addEventListener('keydown', event => tabKey(event, Array.from($('workflow-steps').querySelectorAll('[role=tab]')), button => selectWorkflow(button.dataset.workflowId), true));
  $('copy-command').addEventListener('click', () => copy(commandText(workflow.find(step => step.id === state.workflowId)), '工程命令'));
  $('change-cards').addEventListener('click', event => { const button = event.target.closest('[data-change-file]'); if (button) selectFile(button.dataset.changeFile, 0, { reveal: true, scroll: true }); });
  $('lif-source-actions').addEventListener('click', event => { const button = event.target.closest('[data-lif-file]'); if (button) selectFile(button.dataset.lifFile, Number(button.dataset.lifSection), { reveal: true, scroll: true }); });
  document.addEventListener('keydown', event => { if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { event.preventDefault(); $('source').scrollIntoView({ block: 'start' }); $('file-search').focus({ preventScroll: true }); } });
  if (typeof IntersectionObserver === 'function') {
    const links = Array.from(document.querySelectorAll('.top-nav a'));
    const observer = new IntersectionObserver(entries => { const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top); if (visible[0]) links.forEach(link => link.classList.toggle('current', link.getAttribute('href') === '#' + visible[0].target.id)); }, { rootMargin: '-76px 0px -65% 0px', threshold: 0 });
    document.querySelectorAll('main>section[id]').forEach(section => observer.observe(section));
  }
  renderCallChain(); renderTree(); renderChanges(); renderLifLinks();
  const top = fileByName('topclass24_sd.cpp') || files[0];
  if (top) selectFile(top.id, 0);
  if (pragmas[0]) selectPragma(pragmas[0].id);
  if (workflow[0]) selectWorkflow(workflow[0].id);
  window.ENG_UI = Object.freeze({
    selectFile, selectPragma, selectWorkflow,
    snapshot: () => ({ ...state, fileCount: files.length, pragmaCount: pragmas.length, workflowCount: workflow.length, filteredCount: filteredFiles().length, theme: document.documentElement.dataset.theme })
  });
})();
