'use strict';
// Runs the real screen code against a tiny fake DOM and the real service, to catch typos and crashes.
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/core/store');
const { createService } = require('../src/core/service');
const { buildWorkbook } = require('../src/core/xlsx');

class Node {
  constructor(tag) { this.tagName = tag; this.nodeType = 1; this.children = []; this.attrs = {}; this.style = {}; this.listeners = {}; this.className = ''; this.parentNode = null; this._text = ''; this.value = ''; this.id = ''; }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  append(...kids) { kids.forEach(k => { if (typeof k === 'string') k = { nodeType: 3, text: k, children: [], parentNode: null }; k.parentNode = this; this.children.push(k); }); }
  removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(k, v) { this.attrs[k] = v; if (k === 'id') this.id = v; }
  getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  async fire(t, ev) { for (const fn of this.listeners[t] || []) await fn(Object.assign({ target: this, preventDefault() {}, key: '' }, ev || {})); }
  dispatchEvent(ev) { return this.fire(ev.type); }
  focus() {} select() {} setSelectionRange() {}
  set textContent(v) { this.children = []; this._text = String(v); }
  get textContent() { return this._text + this.children.map(c => (c.nodeType === 3 ? c.text : c.textContent)).join(''); }
}
const walk = (n, fn) => { fn(n); (n.children || []).forEach(c => walk(c, fn)); };
const findAll = (root, pred) => { const out = []; walk(root, n => { if (n.nodeType === 1 && pred(n)) out.push(n); }); return out; };
const btn = (root, label) => { const b = findAll(root, n => n.tagName === 'button' && n.textContent.trim() === label)[0]; if (!b) throw new Error('No button "' + label + '"'); return b; };
const click = async (root, label) => { await btn(root, label).fire('click'); await tick(); };
const tick = () => new Promise(r => setTimeout(r, 25));

function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdss-ui-'));
  const store = new Store(dir); store.load();
  const svc = createService(store);
  const body = new Node('body');
  ['app', 'modals', 'toasts'].forEach(id => { const d = new Node('div'); d.setAttribute('id', id); body.append(d); });
  const doc = { body, createElement: t => new Node(t), createTextNode: t => ({ nodeType: 3, text: String(t), children: [], parentNode: null }),
    getElementById: id => findAll(body, n => n.id === id)[0] || null, addEventListener() {} };
  const state = { nextFile: null, exported: [], pdf: [], printed: 0 };
  const dispatch = (name, args) => { try { return { ok: true, data: svc[name].apply(null, args) }; } catch (e) { return { ok: false, error: e.message }; } };
  const desktop = {
    call: async (name, ...args) => dispatch(name, args),
    exportFile: async (name, args) => { const r = svc[name].apply(null, args); state.exported.push(r.fileName); return { ok: true, data: { path: 'C:\\x\\' + r.fileName } }; },
    pickFile: async () => ({ ok: true, data: state.nextFile }), pickLogo: async () => ({ ok: true, data: null }),
    generatePdf: async opts => { const r = svc.buildReport(opts); state.pdf.push(r.count); return { ok: true, data: { path: 'C:\\x\\' + r.fileName, count: r.count } }; },
    cancelPdf: async () => ({ ok: true }), onPdfProgress() {}, openPath: async () => ({ ok: true }), showInFolder: async () => ({ ok: true }),
    printHtml: async () => { state.printed++; return { ok: true }; }, backupNow: async () => ({ ok: true, data: { path: 'b.json' } }), restoreBackup: async () => ({ ok: true, data: null }),
    openDataFolder: async () => ({ ok: true }), getVersion: async () => ({ ok: true, data: { version: '1.0.0', dir } })
  };
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Promise, Object, Array, JSON, Math, Date, Number, String, Proxy, Error, Event: class { constructor(t) { this.type = t; } } });
  Object.assign(ctx, { window: ctx, self: ctx, document: doc, desktop, location: { reload() {} } });
  ['../src/core/calc.js', '../src/ui/util.js', '../src/ui/page-dashboard.js', '../src/ui/page-classes.js', '../src/ui/page-students.js', '../src/ui/page-scores.js',
    '../src/ui/page-results.js', '../src/ui/page-settings.js', '../src/ui/page-backup.js', '../src/ui/app.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f }));
  return { ctx, svc, store, body, state };
}
const content = body => findAll(body, n => n.id === 'content')[0];

test('first-run wizard builds the school, then every page opens without errors', async () => {
  const { ctx, svc, body } = boot();
  const init = ctx.App.init();
  await tick();
  const wiz = () => findAll(body, n => n.className === 'wizard')[0];
  let inputs = findAll(wiz(), n => n.tagName === 'input' && !n.attrs.type || n.attrs.type === 'text');
  inputs[0].value = 'Demo Secondary School'; inputs[1].value = 'State Board'; inputs[2].value = 'Dutse';
  await click(wiz(), 'Next');
  await click(wiz(), 'Next');
  await click(wiz(), 'Finish and open the app');
  await init; await tick();
  assert.strictEqual(svc.getAppInfo().settings.school_name, 'Demo Secondary School');
  assert.ok(svc.listClasses().length >= 3);
  assert.ok(svc.getAppInfo().current_term);
  const cls = svc.listClasses()[0];
  ['English Language', 'Mathematics', 'Biology'].forEach(n => svc.addSubject(cls.id, n));
  ['Ada Obi', 'Bello Musa', 'Chike Eze', 'Dara Yusuf'].forEach((n, i) => svc.addStudent({ class_id: cls.id, full_name: n, gender: i % 2 ? 'M' : 'F', admission_no: 'A' + i }));
  ctx.App.state.classId = cls.id;
  for (const p of ['dashboard', 'classes', 'students', 'scores', 'results', 'settings', 'backup']) {
    await ctx.App.go(p); await tick();
    const txt = content(body).textContent;
    assert.ok(!/Could not open this page/.test(txt), p + ' failed: ' + txt.slice(0, 300));
    assert.ok(txt.length > 30, p + ' is empty');
  }
});

test('students page: add student through the dialog, import a file, download template', async () => {
  const { ctx, svc, body, state } = boot();
  svc.saveSettings({ school_name: 'S', board_name: '', address: '' }); svc.completeSetup(); svc.createSession('2026/2027');
  svc.addClass({ level: 'SS1', stream: 'A' });
  const cls = svc.listClasses()[0]; ctx.App.state.classId = cls.id;
  await ctx.App.init(); await tick();
  await ctx.App.go('students'); await tick();
  await click(content(body), '+ Add student');
  const modal = findAll(body, n => n.className === 'modal-bg')[0];
  const nameInput = findAll(modal, n => n.tagName === 'input')[0];
  nameInput.value = 'New Kid';
  await click(modal, 'Save');
  assert.strictEqual(svc.listStudents({}).length, 1);
  // import
  state.nextFile = { name: 's.xlsx', data: buildWorkbook([{ name: 'S', rows: [['full_name', 'gender', 'admission_no'], ['Amina Bala', 'F', 'Z1'], ['Bad', 'Q', '']] }]) };
  await click(content(body), 'Import students');
  const dlg = findAll(body, n => n.className === 'modal-bg').pop();
  await click(dlg, 'Choose file (.xlsx or .csv)...');
  assert.ok(/1 ready/.test(dlg.textContent) && /1 with problems/.test(dlg.textContent), dlg.textContent.slice(0, 400));
  await click(dlg, 'Import 1 students');
  assert.strictEqual(svc.listStudents({}).length, 2);
  await click(content(body), 'Download template');
  assert.ok(state.exported.includes('student-import-template.xlsx'));
});

test('scores page: typing saves, bad values are refused, template download, import', async () => {
  const { ctx, svc, body, state } = boot();
  svc.saveSettings({ school_name: 'S', board_name: '', address: '' }); svc.completeSetup(); svc.createSession('2026/2027');
  svc.addClass({ level: 'SS2', stream: 'B' });
  const cls = svc.listClasses()[0];
  const sub = svc.addSubject(cls.id, 'Mathematics')[0];
  ['Ada Obi', 'Bello Musa'].forEach((n, i) => svc.addStudent({ class_id: cls.id, full_name: n, gender: 'F', admission_no: 'A' + i }));
  ctx.App.state.classId = cls.id;
  await ctx.App.init(); await tick();
  await ctx.App.go('scores'); await tick();
  const cells = findAll(content(body), n => n.tagName === 'input' && n.parentNode && /sc/.test(n.parentNode.className));
  assert.strictEqual(cells.length, 4);
  cells[0].value = '25'; await cells[0].fire('input'); await cells[0].fire('change');
  cells[1].value = '60'; await cells[1].fire('input'); await cells[1].fire('change'); await tick();
  const termId = ctx.App.state.termId;
  const sheet = svc.getScoreSheet(cls.id, termId);
  const ada = sheet.students.find(s => s.full_name === 'Ada Obi');
  assert.deepStrictEqual(sheet.scores[ada.id][sub.id], { ca: 25, exam: 60 });
  cells[2].value = '45'; await cells[2].fire('input'); await cells[2].fire('change'); await tick();
  assert.ok(cells[2].className === 'err');
  assert.strictEqual(svc.getScoreSheet(cls.id, termId).scores[sheet.students[1].id], undefined);
  // student view
  await click(content(body), 'Enter by student'); await tick();
  assert.ok(/Skills \(1 to 5\)/.test(content(body).textContent));
  const radios = findAll(content(body), n => n.attrs.type === 'radio');
  assert.ok(radios.length > 5);
  radios[2].checked = true; await radios[2].fire('change'); await tick();
  assert.ok(Object.keys(svc.getStudentExtras(ada.id, termId).ratings).length === 1);
  // template + import
  await click(content(body), 'Download template');
  let dlg = findAll(body, n => n.className === 'modal-bg').pop();
  await click(dlg, 'Download');
  assert.ok(state.exported.some(n => /^Scores_SS2_B_First_Term_All-subjects\.xlsx$/.test(n)), state.exported.join(','));
  state.nextFile = { name: 'f.csv', data: Buffer.from('admission_no,full_name,Mathematics CA (30),Mathematics Exam (70)\nA1,Bello Musa,18,55\n') };
  await click(content(body), 'Import scores');
  dlg = findAll(body, n => n.className === 'modal-bg').pop();
  await click(dlg, 'Choose file (.xlsx or .csv)...');
  assert.ok(/1 will be saved/.test(dlg.textContent), dlg.textContent.slice(0, 500));
  await click(dlg, 'Import 1 scores');
  assert.deepStrictEqual(svc.getScoreSheet(cls.id, termId).scores[sheet.students[1].id][sub.id], { ca: 18, exam: 55 });
});

test('results page: tabs, broadsheet export, report-card dialog', async () => {
  const { ctx, svc, body, state } = boot();
  svc.saveSettings({ school_name: 'S', board_name: 'B', address: 'A' }); svc.completeSetup(); svc.createSession('2026/2027');
  svc.addClass({ level: 'SS3', stream: '' });
  const cls = svc.listClasses()[0];
  const sub = svc.addSubject(cls.id, 'Physics')[0];
  ['Ada Obi', 'Bello Musa', 'Chike Eze'].forEach(n => svc.addStudent({ class_id: cls.id, full_name: n, gender: 'F', admission_no: '' }));
  ctx.App.state.classId = cls.id;
  await ctx.App.init(); await tick();
  const term = svc.getAppInfo().current_term;
  svc.listStudents({ classId: cls.id }).forEach((s, i) => svc.saveScore(s.id, sub.id, term.id, String(10 + i), String(40 + i)));
  await ctx.App.go('results'); await tick();
  assert.ok(/Highest total/.test(content(body).textContent));
  await click(content(body), 'Student detail'); assert.ok(/Marks obtained/.test(content(body).textContent));
  await click(content(body), 'Broadsheet');
  await click(content(body), 'Export to Excel'); assert.ok(state.exported.some(n => /^Broadsheet_/.test(n)));
  await click(content(body), 'Print'); assert.strictEqual(state.printed, 1);
  await click(content(body), 'Generate report cards (PDF)');
  const dlg = findAll(body, n => n.className === 'modal-bg').pop();
  await click(dlg, 'Generate PDF');
  assert.deepStrictEqual(state.pdf, [3]);
  assert.ok(/3 report cards saved/.test(dlg.textContent));
});

test('settings and backup pages: tabs work, grading and traits can be edited', async () => {
  const { ctx, svc, body } = boot();
  svc.saveSettings({ school_name: 'S', board_name: '', address: '' }); svc.completeSetup(); svc.createSession('2026/2027');
  svc.addClass({ level: 'SS1', stream: 'A' }); svc.addClass({ level: 'SS2', stream: 'A' });
  await ctx.App.init(); await tick();
  await ctx.App.go('settings'); await tick();
  for (const tabName of ['Sessions & Terms', 'Grading scale', 'Skills & Behaviour', 'Promotion', 'School']) {
    await click(content(body), tabName);
    assert.ok(content(body).textContent.length > 40, tabName);
  }
  await click(content(body), 'Sessions & Terms');
  await click(content(body), 'Skills & Behaviour');
  const before = svc.listTraits().length;
  const input = findAll(content(body), n => n.tagName === 'input' && n.attrs.placeholder === 'New item')[0];
  input.value = 'Public Speaking'; await click(content(body), 'Add');
  assert.strictEqual(svc.listTraits().length, before + 1);
  await ctx.App.go('backup'); await tick();
  assert.ok(/Backup now/.test(content(body).textContent));
});
