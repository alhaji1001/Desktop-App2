'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/core/store');
const { createService } = require('../src/core/service');
const { readXlsx, buildWorkbook, S: XS } = require('../src/core/xlsx');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdss-'));
  const store = new Store(dir); store.load();
  const svc = createService(store);
  svc.saveSettings({ school_name: 'Test School', board_name: 'Board', address: 'Dutse' });
  svc.createSession('2026/2027');
  const term = svc.getAppInfo().current_term;
  svc.addClass({ level: 'SS1', stream: 'A' });
  const cls = svc.listClasses()[0];
  ['Mathematics', 'English Language'].forEach(n => svc.addSubject(cls.id, n));
  const subjects = svc.listSubjects(cls.id);
  return { dir, store, svc, term, cls, subjects };
}
const file = (name, data) => ({ name, data: Buffer.isBuffer(data) ? data : Buffer.from(data) });

test('session creation, current term and validation', () => {
  const { svc, term } = setup();
  assert.strictEqual(term.name, 'First Term');
  assert.throws(() => svc.createSession('2026/2028'), /consecutive/);
  assert.throws(() => svc.createSession('2026/2027'), /already exists/);
  svc.createSession('2027/2028');
  assert.strictEqual(svc.listSessions().length, 2);
  assert.strictEqual(svc.listTerms().filter(t => t.is_current).length, 1);
});

test('grading scale validation', () => {
  const { svc } = setup();
  assert.throws(() => svc.saveGrading([{ grade: 'A', min_score: 70, remark: '' }]), /start at 0/);
  assert.throws(() => svc.saveGrading([{ grade: 'A', min_score: 0, remark: '' }, { grade: 'a', min_score: 50, remark: '' }]), /twice/);
  assert.throws(() => svc.saveGrading([{ grade: 'A', min_score: 0, remark: '' }, { grade: 'B', min_score: 0, remark: '' }]), /different/);
  assert.strictEqual(svc.saveGrading([{ grade: 'P', min_score: 0, remark: 'Pass' }, { grade: 'D', min_score: 80, remark: 'Distinction' }])[0].grade, 'D');
});

test('student import: csv with problems, then commit', () => {
  const { svc, cls } = setup();
  svc.addStudent({ class_id: cls.id, full_name: 'Existing One', gender: 'M', admission_no: 'ADM1' });
  const csv = 'full_name,gender,admission_no\nAmina Musa,F,ADM2\nBad Gender,X,ADM3\n,M,ADM4\nDup Adm,M,ADM1\nExisting One,M,\nAmina Musa,F,ADM9\nSani Lawal,male,\n';
  const prev = svc.previewStudentImport({ classId: cls.id, file: file('s.csv', csv) });
  assert.strictEqual(prev.summary.total, 7);
  assert.strictEqual(prev.summary.ok, 2); // Amina (first) and Sani
  const r = svc.commitStudentImport({ classId: cls.id, rows: prev.rows });
  assert.deepStrictEqual(r, { imported: 2, skipped: 5 });
  assert.strictEqual(svc.listStudents({ classId: cls.id }).length, 3);
  assert.throws(() => svc.previewStudentImport({ classId: cls.id, file: file('x.csv', 'a,b\n1,2\n') }), /full_name/);
});

test('student template (xlsx and csv) can be re-imported', () => {
  const { svc, cls } = setup();
  const t = svc.buildStudentTemplate({ format: 'xlsx' });
  const rows = readXlsx(t.data);
  assert.deepStrictEqual(rows[0].cells, ['full_name', 'gender', 'admission_no']);
  const filled = buildWorkbook([{ name: 'S', rows: [['full_name', 'gender', 'admission_no'], ['Bala Ibrahim', 'M', 'G1'], ['Hauwa Sani', 'F', 'G2']] }]);
  const prev = svc.previewStudentImport({ classId: cls.id, file: file('s.xlsx', filled) });
  assert.strictEqual(prev.summary.ok, 2);
  assert.match(svc.buildStudentTemplate({ format: 'csv' }).data.toString('utf8'), /full_name,gender,admission_no/);
  assert.throws(() => svc.previewStudentImport({ classId: cls.id, file: file('old.xls', Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0, 0, 0, 0])) }), /old Excel/);
});

test('score saving validates and computes totals', () => {
  const { svc, cls, term, subjects } = setup();
  svc.addStudent({ class_id: cls.id, full_name: 'Zed', gender: 'M', admission_no: '' });
  const stu = svc.listStudents({ classId: cls.id })[0];
  assert.throws(() => svc.saveScore(stu.id, subjects[0].id, term.id, '31', ''), /between 0 and 30/);
  assert.throws(() => svc.saveScore(stu.id, subjects[0].id, term.id, '10', '71'), /between 0 and 70/);
  assert.deepStrictEqual(svc.saveScore(stu.id, subjects[0].id, term.id, '25.5', '60'), { ca: 25.5, exam: 60, total: 85.5 });
  assert.strictEqual(svc.getScoreSheet(cls.id, term.id).scores[stu.id][subjects[0].id].exam, 60);
  svc.saveScore(stu.id, subjects[0].id, term.id, '', '');
  assert.strictEqual(svc.getScoreSheet(cls.id, term.id).scores[stu.id], undefined);
});

test('score template -> fill -> import round trip', () => {
  const { svc, cls, term, subjects } = setup();
  ['Ada Obi', 'Bello Musa', 'Chike Eze'].forEach((n, i) => svc.addStudent({ class_id: cls.id, full_name: n, gender: 'M', admission_no: 'A' + i }));
  const tpl = svc.buildScoreTemplate({ classId: cls.id, termId: term.id, subjectId: null, format: 'xlsx' });
  const rows = readXlsx(tpl.data);
  assert.deepStrictEqual(rows[0].cells, ['admission_no', 'full_name', 'Mathematics CA (30)', 'Mathematics Exam (70)', 'English Language CA (30)', 'English Language Exam (70)']);
  assert.strictEqual(rows.length, 4);
  // fill the template like a teacher would
  const filled = [rows[0].cells, ['A0', 'Ada Obi', '20', '50', '25', '40'], ['A1', 'Bello Musa', '35', '10', '', ''], ['', 'chike  eze', '10.5', '60', '30', '70']];
  const buf = buildWorkbook([{ name: 'Scores', rows: filled }]);
  const prev = svc.previewScoreImport({ classId: cls.id, termId: term.id, subjectId: null, replace: true, file: file('f.xlsx', buf) });
  assert.strictEqual(prev.summary.problems, 1); // CA 35
  assert.match(prev.lines.find(l => l.problems.length).problems[0], /between 0 and 30/);
  const res = svc.commitScoreImport({ termId: term.id, lines: prev.lines });
  assert.strictEqual(res.saved, prev.summary.ok);
  const sheet = svc.getScoreSheet(cls.id, term.id);
  const chike = svc.listStudents({ classId: cls.id }).find(s => s.full_name === 'Chike Eze');
  assert.deepStrictEqual(sheet.scores[chike.id][subjects[0].id], { ca: 10.5, exam: 60 });
  const bello = svc.listStudents({ classId: cls.id }).find(s => s.full_name === 'Bello Musa');
  assert.strictEqual(sheet.scores[bello.id], undefined); // bad row not saved
  // template now contains the entered scores
  const again = readXlsx(svc.buildScoreTemplate({ classId: cls.id, termId: term.id, subjectId: null, format: 'xlsx' }).data);
  assert.strictEqual(again[1].cells[2], '20');
});

test('score import: replace off keeps existing, blanks never erase, unknown columns warn, single-subject CSV', () => {
  const { svc, cls, term, subjects } = setup();
  svc.addStudent({ class_id: cls.id, full_name: 'Ada Obi', gender: 'F', admission_no: 'A0' });
  const stu = svc.listStudents({ classId: cls.id })[0];
  svc.saveScore(stu.id, subjects[0].id, term.id, '20', '');
  const csv = 'admission_no,full_name,Mathematics CA,Mathematics Exam (70),Biology CA\nA0,Ada Obi,29,55,10\n';
  let prev = svc.previewScoreImport({ classId: cls.id, termId: term.id, subjectId: null, replace: false, file: file('s.csv', csv) });
  assert.strictEqual(prev.warnings.length, 1);
  assert.match(prev.warnings[0], /Biology/);
  svc.commitScoreImport({ termId: term.id, lines: prev.lines });
  assert.deepStrictEqual(svc.getScoreSheet(cls.id, term.id).scores[stu.id][subjects[0].id], { ca: 20, exam: 55 }); // CA kept, exam filled
  prev = svc.previewScoreImport({ classId: cls.id, termId: term.id, subjectId: subjects[1].id, replace: true, file: file('p.csv', 'full_name;CA;Exam\nAda Obi;12,5;40\n') });
  assert.strictEqual(prev.lines[0].final_ca, '12.5');
  svc.commitScoreImport({ termId: term.id, lines: prev.lines });
  assert.strictEqual(svc.getScoreSheet(cls.id, term.id).scores[stu.id][subjects[1].id].ca, 12.5);
  assert.throws(() => svc.previewScoreImport({ classId: cls.id, termId: term.id, subjectId: null, replace: true, file: file('p.csv', 'full_name,CA,Exam\nAda,1,2\n') }), /Choose the subject/);
});

test('results: totals, average, tied positions, broadsheet', () => {
  const { svc, cls, term, subjects } = setup();
  ['A One', 'B Two', 'C Three', 'D Four'].forEach(n => svc.addStudent({ class_id: cls.id, full_name: n, gender: 'M', admission_no: '' }));
  const s = svc.listStudents({ classId: cls.id });
  const put = (i, ca1, ex1, ca2, ex2) => { svc.saveScore(s[i].id, subjects[0].id, term.id, ca1, ex1); if (ca2 !== null) svc.saveScore(s[i].id, subjects[1].id, term.id, ca2, ex2); };
  put(0, '30', '70', '30', '60');   // 190
  put(1, '20', '60', '20', '60');   // 160
  put(2, '20', '60', '20', '60');   // 160 (tie)
  // student 3 has no scores
  const res = svc.getClassResults(cls.id, term.id);
  const by = n => res.students.find(r => r.full_name === n);
  assert.strictEqual(by('A One').position, 1);
  assert.strictEqual(by('B Two').position, 2);
  assert.strictEqual(by('C Three').position, 2);
  assert.strictEqual(by('D Four').position, null);
  assert.strictEqual(by('A One').average, 95);
  assert.strictEqual(res.class_size, 4);
  assert.strictEqual(res.stats.highest, 190);
  const bs = readXlsx(svc.buildBroadsheet({ classId: cls.id, termId: term.id, format: 'xlsx' }).data);
  assert.strictEqual(bs[1].cells[1], 'A One');
  assert.strictEqual(bs[1].cells[0], '1st');
});

test('report cards: one page per student and single student', () => {
  const { svc, cls, term, subjects } = setup();
  for (let i = 0; i < 5; i++) svc.addStudent({ class_id: cls.id, full_name: 'Student ' + i, gender: 'F', admission_no: '' });
  const list = svc.listStudents({ classId: cls.id });
  list.forEach((st, i) => { svc.saveScore(st.id, subjects[0].id, term.id, '20', String(40 + i)); svc.saveRemarks(st.id, term.id, { class_master: 'Good <work> & "effort"', director: '' }); });
  const all = svc.buildReport({ classId: cls.id, termId: term.id, studentIds: null, order: 'position', includeRemarks: true });
  assert.strictEqual(all.count, 5);
  assert.strictEqual((all.html.match(/class="page"/g) || []).length, 5);
  assert.match(all.fileName, /^SS1_A_First_Term_2026-2027\.pdf$/);
  assert.ok(all.html.includes('Good &lt;work&gt; &amp; &quot;effort&quot;'));
  const one = svc.buildReport({ classId: cls.id, termId: term.id, studentIds: [list[2].id], order: 'name', includeRemarks: false });
  assert.strictEqual(one.count, 1);
  assert.ok(!one.html.includes('effort'));
  assert.throws(() => svc.buildReport({ classId: cls.id, termId: term.id, studentIds: ['nope'], order: 'name' }), /no students/);
});

test('class and subject management rules', () => {
  const { svc, cls, subjects } = setup();
  svc.addClass({ level: 'SS1', stream: 'B' });
  const b = svc.listClasses().find(c => c.name === 'SS1 B');
  assert.deepStrictEqual(svc.copySubjects(cls.id, [b.id]), { added: 2 });
  assert.deepStrictEqual(svc.copySubjects(cls.id, [b.id]), { added: 0 });
  assert.throws(() => svc.addSubject(cls.id, ' mathematics '), /already/);
  svc.moveSubject(subjects[1].id, -1);
  assert.strictEqual(svc.listSubjects(cls.id)[0].name, 'English Language');
  svc.addStudent({ class_id: b.id, full_name: 'X Y', gender: 'M', admission_no: '' });
  assert.throws(() => svc.deleteClass(b.id), /still has students/);
  const st = svc.listStudents({ classId: b.id })[0];
  assert.deepStrictEqual(svc.promoteStudents(b.id, cls.id), { moved: 1 });
  svc.deleteStudent(st.id);
  svc.deleteClass(b.id);
  assert.strictEqual(svc.listClasses().length, 1);
});

test('store: saves to disk, survives restart, restores from backup, recovers from damage', () => {
  const { dir, store, svc, cls } = setup();
  svc.addStudent({ class_id: cls.id, full_name: 'Persist Me', gender: 'M', admission_no: '' });
  store.flush();
  const backupText = store.exportBackupJson();
  const store2 = new Store(dir); store2.load();
  assert.strictEqual(createService(store2).listStudents({}).length, 1);
  createService(store2).deleteStudent(createService(store2).listStudents({})[0].id);
  store2.restoreFromJson(backupText);
  assert.strictEqual(createService(store2).listStudents({}).length, 1);
  store2.autoBackup();
  assert.ok(store2.listBackups().length >= 2);
  // damage the main file: loading must recover instead of starting empty
  fs.writeFileSync(path.join(dir, 'data.json'), '{ broken');
  const store3 = new Store(dir); const info = store3.load();
  assert.ok(info.recoveredFrom);
  assert.strictEqual(createService(store3).listStudents({}).length, 1);
  assert.throws(() => new Store(dir).restoreFromJson('{"hello":1}'), /not a GDSS/);
});

test('no network code in the source', () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const files = walk(path.join(__dirname, '..', 'src')).concat(walk(path.join(__dirname, '..', 'electron'))).filter(f => /\.(js|html)$/.test(f));
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8');
    assert.ok(!/supabase/i.test(t), f + ' mentions supabase');
    assert.ok(!/fetch\(\s*['"`]https?:/i.test(t), f + ' fetches a remote URL');
    assert.ok(!/<script[^>]+src=["']https?:/i.test(t), f + ' loads a remote script');
  }
});
