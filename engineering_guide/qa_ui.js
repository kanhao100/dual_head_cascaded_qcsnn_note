/* JSDOM interaction checks for the GENERATED standalone engineering HTML.
 * Reads the existing walkthrough dependency only; does not modify walkthrough,
 * launch HLS, start a server, or claim to verify browser layout/screenshots.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('../walkthrough/qa/node_modules/jsdom');

const here = __dirname;
const htmlPath = path.join(here, 'qcsnn_engineering_guide.html');
const dataPath = path.join(here, 'engineering.json');
const configPath = path.join(here, 'hls_current.cfg');
for (const filename of [htmlPath, dataPath, configPath]) {
  if (!fs.existsSync(filename)) throw new Error('Missing generated artifact: ' + filename + '. Run the guide/config generators first.');
}
const html = fs.readFileSync(htmlPath, 'utf8');
const reference = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const config = fs.readFileSync(configPath, 'utf8');
let checks = 0;
const failures = [];
const check = (condition, description) => { checks += 1; if (!condition) failures.push(description); };
const slashPath = value => String(value).replace(/\\/g, '/');

check(html.startsWith('<!doctype html>'), 'Generated document has a doctype.');
check(/<html\s+lang="zh-CN"/.test(html), 'Generated document declares Chinese language.');
check(!/<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["']https?:\/\//i.test(html), 'Generated document has no external script/style dependency.');
const root = slashPath(reference.root).replace(/\/$/, '');
const top = reference.files.find(file => file.id === 'top');
check(Boolean(top), 'Actual top source is present.');
const sourceLine = config.split(/\r?\n/).find(line => line.startsWith('syn.file=')) || '';
check(sourceLine.slice('syn.file='.length) === root + '/' + slashPath(top.path), 'Portable config syn.file points to this repository copy.');
const cflagsLine = config.split(/\r?\n/).find(line => line.startsWith('syn.file_cflags=')) || '';
check(cflagsLine.startsWith('syn.file_cflags=' + root + '/' + slashPath(top.path) + ','), 'Portable config cflags belong to the same current-copy source.');
check(cflagsLine.includes('-include "' + root + '/hls/shim/skip_host_reader.h"'), 'Portable config quotes the current-copy forced-include path.');
check(cflagsLine.includes('-I"' + root + '/csnn_cpp/external/json/include"'), 'Portable config quotes the current-copy JSON include path.');
check(/package\.output\.file=.*engineering_guide\/qcsnn_topFunction_ip\.zip/.test(config), 'Portable IP output is within the independent engineering guide directory.');

function runMode(reduced) {
  const runtimeErrors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => {
    // JSDOM's CSS parser does not support every modern browser CSS construct.
    // Layout is outside this suite; runtime errors must still fail it.
    if (error.type !== 'css parsing') runtimeErrors.push(error.stack || error.message);
  });
  const dom = new JSDOM(html, {
    url: 'http://127.0.0.1:8765/qcsnn_engineering_guide.html',
    runScripts: 'dangerously', virtualConsole: console,
    beforeParse(window) {
      window.matchMedia = query => ({ matches: reduced && query.includes('prefers-reduced-motion'), media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      window.HTMLElement.prototype.scrollIntoView = function () {};
      window.CSS = window.CSS || {};
      window.CSS.escape = window.CSS.escape || (value => String(value).replace(/[^a-zA-Z0-9_-]/g, char => '\\' + char));
    }
  });
  const window = dom.window;
  const document = window.document;
  const prefix = reduced ? '[reduced] ' : '[normal] ';
  const verify = (condition, description) => check(condition, prefix + description);
  verify(Boolean(window.ENG_UI), 'UI initializes from generated complete HTML.');
  if (!window.ENG_UI) { failures.push(...runtimeErrors); dom.window.close(); return; }
  const embedded = JSON.parse(JSON.stringify(window.eval('ENG')));
  verify(JSON.stringify(embedded) === JSON.stringify(reference), 'Embedded data is identical to engineering.json.');
  verify(document.getElementById('repo-root').textContent === reference.root, 'Visible root is the current repository.');
  const ids = Array.from(document.querySelectorAll('[id]'), element => element.id);
  verify(new Set(ids).size === ids.length, 'No duplicate HTML IDs.');

  for (const file of reference.files) {
    for (let index = 0; index < file.sections.length; index += 1) {
      const section = file.sections[index];
      verify(window.ENG_UI.selectFile(file.id, index), 'Select source ' + file.id + ':' + index);
      verify(document.getElementById('snippet-title').textContent === section.title, 'Source section title ' + file.id + ':' + index);
      const lines = section.code.replace(/\r\n/g, '\n').split('\n');
      const rendered = Array.from(document.querySelectorAll('#code-view .code-line'));
      verify(rendered.length === lines.length, 'Source line count including final blank lines ' + file.id + ':' + index);
      const renderedText = rendered.map((line, position) => {
        const text = line.querySelector('.code-text').textContent;
        return lines[position] === '' && text === ' ' ? '' : text;
      }).join('\n');
      verify(renderedText === section.code.replace(/\r\n/g, '\n'), 'Rendered source text preserves the actual snippet ' + file.id + ':' + index);
      verify(rendered.length && Number(rendered[0].querySelector('.line-number').textContent) === section.start && Number(rendered[rendered.length - 1].querySelector('.line-number').textContent) === section.end, 'Displayed first/last line numbers ' + file.id + ':' + index);
      if (file.sourceType === 'notebook') {
        verify(document.getElementById('snippet-range').textContent.startsWith('单元 ' + (section.cell + 1) + ' · L'), 'Notebook uses code-cell number and cell-internal lines.');
        verify(document.getElementById('snippet-note').textContent.includes('不是.ipynb JSON文件行'), 'Notebook source note distinguishes JSON file lines.');
      }
    }
  }
  for (const pragma of reference.pragmas) {
    verify(window.ENG_UI.selectPragma(pragma.id), 'Select HLS entry ' + pragma.id);
    verify(document.getElementById('pragma-name').textContent === pragma.name, 'HLS entry name ' + pragma.id);
    verify(document.querySelectorAll('#pragma-code .code-line').length > 0, 'HLS entry embeds real source ' + pragma.id);
    const link = document.querySelector('#pragma-evidence [data-pragma-file]');
    verify(Boolean(link) && link.dataset.pragmaFile === pragma.fileId, 'HLS entry links to matching source ' + pragma.id);
  }
  for (const step of reference.workflow) {
    verify(window.ENG_UI.selectWorkflow(step.id), 'Select workflow ' + step.id);
    verify(document.getElementById('workflow-title').textContent === step.title, 'Workflow title ' + step.id);
    const expected = step.commands.join('\n');
    verify(document.getElementById('workflow-command').textContent === expected, 'Workflow command preserves real newlines ' + step.id);
    verify(document.getElementById('workflow-command').hidden === !Boolean(expected), 'Empty/nonempty command visibility ' + step.id);
    if (step.commands.length > 1) verify(document.getElementById('workflow-command').textContent.split('\n').length === step.commands.length, 'Workflow has one actual line per command ' + step.id);
  }
  const filter = document.getElementById('domain-filter');
  for (const role of ['kernel', 'params', 'host', 'build', 'training']) {
    filter.value = role;
    filter.dispatchEvent(new window.Event('change', { bubbles: true }));
    verify(document.querySelectorAll('#file-tree [data-file-id]').length > 0, 'Role filter ' + role + ' has actual files.');
  }
  const search = document.getElementById('file-search');
  search.value = 'no such file qcsnn xxyyzz';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  verify(document.querySelectorAll('#file-tree [data-file-id]').length === 0, 'Empty file search shows no result.');
  filter.value = 'all'; filter.dispatchEvent(new window.Event('change', { bubbles: true }));
  search.value = 'lif1d_integer'; search.dispatchEvent(new window.Event('input', { bubbles: true }));
  verify(Array.from(document.querySelectorAll('#file-tree [data-file-id]')).some(button => button.dataset.fileId === 'lif'), 'Filename search locates LIF source.');
  document.querySelector('[data-map-file="lif"]').click();
  verify(window.ENG_UI.snapshot().fileId === 'lif', 'Call-chain node selects the actual LIF source.');
  verify(document.activeElement.id === 'code-view', 'Call-chain navigation places keyboard focus in source pane.');
  verify(window.ENG_UI.snapshot().filter === 'all' && !window.ENG_UI.snapshot().search, 'Source navigation reveals the selected file.');
  document.querySelector('[data-pragma-id="binding"]').click();
  verify(document.activeElement.dataset.pragmaId === 'binding', 'HLS selection preserves keyboard focus.');
  const evidence = document.querySelector('#pragma-evidence [data-pragma-file]');
  evidence.click();
  verify(window.ENG_UI.snapshot().fileId === 'lif' && window.ENG_UI.snapshot().sectionIndex === 1, 'HLS evidence link selects exact LIF storage source section.');
  window.ENG_UI.selectFile('network', 0);
  const tab = document.querySelector('[data-section="0"]'); tab.focus();
  tab.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  verify(window.ENG_UI.snapshot().sectionIndex === 1 && document.activeElement.dataset.section === '1', 'Source tabs support arrow-key navigation and focus.');
  const lastTab = document.activeElement;
  lastTab.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  verify(window.ENG_UI.snapshot().sectionIndex === reference.files.find(file => file.id === 'network').sections.length - 1, 'Source tabs support End.');
  window.ENG_UI.selectWorkflow(reference.workflow[0].id);
  const step = document.querySelector('[data-workflow-id="' + reference.workflow[0].id + '"]'); step.focus();
  step.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  verify(window.ENG_UI.snapshot().workflowId === reference.workflow[1].id && document.activeElement.dataset.workflowId === reference.workflow[1].id, 'Workflow supports vertical arrow-key navigation and focus.');
  document.getElementById('theme-toggle').click();
  verify(window.ENG_UI.snapshot().theme === 'dark' && document.documentElement.dataset.theme === 'dark', 'Dark theme toggles.');
  document.getElementById('theme-toggle').click();
  verify(window.ENG_UI.snapshot().theme === 'light', 'Light theme toggles back.');
  verify(document.querySelectorAll('#change-cards .change-card').length === 6, 'Six change routes are rendered.');
  for (const link of document.querySelectorAll('#change-cards [data-change-file]')) {
    const target = link.dataset.changeFile;
    link.click();
    verify(window.ENG_UI.snapshot().fileId === target, 'Change route navigates to source ' + target);
  }
  verify(document.getElementById('config-warning').textContent.includes('hls_current.cfg'), 'Visible config warning points to the portable config.');
  verify(document.getElementById('board-boundary').textContent.includes('OOC') && document.getElementById('board-boundary').textContent.includes('待完成'), 'OOC and incomplete board integration are distinguished.');
  verify(document.getElementById('lif-storage-note').textContent.includes('注释'), 'Commented LIF BIND_STORAGE is explicitly identified.');
  verify(runtimeErrors.length === 0, 'No JavaScript runtime errors: ' + runtimeErrors.join('; '));
  dom.window.close();
}
runMode(false);
runMode(true);
console.log(JSON.stringify({ suite: 'generated-engineering-html-jsdom', checks, failures, files: reference.files.length, pragmas: reference.pragmas.length, workflow: reference.workflow.length, visualVerification: false }, null, 2));
if (failures.length) process.exitCode = 1;
