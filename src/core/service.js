'use strict';
// All school operations. The Electron window calls these by name; tests call them directly.
const Calc = require('./calc');
const { parseCsv, toCsv } = require('./csv');
const X = require('./xlsx');
const { newId } = require('./store');
const { buildReportHtml } = require('./report');

const LEVELS = ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'];
const SUGGESTED_SUBJECTS = ['English Language', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Further Mathematics', 'Economics', 'Government',
  'Literature in English', 'Geography', 'Civic Education', 'Agricultural Science', 'Computer Studies', 'Commerce', 'Financial Accounting',
  'Christian Religious Studies', 'Islamic Studies', 'Hausa Language', 'Technical Drawing', 'Data Processing', 'History', 'Food and Nutrition'];
const CA_MAX = 30, EXAM_MAX = 70;

const NAME_HEADERS = ['full_name', 'full name', 'name', 'student name', 'student_name', 'fullname'];
const GENDER_HEADERS = ['gender', 'sex'];
const ADMISSION_HEADERS = ['admission_no', 'admission no', 'admission number', 'admission_no.', 'admission number no', 'admission', 'adm no', 'adm. no'];
const SCORE_HEADER = /^(?:(.*\S)\s+)?(ca|exam)(?:\s*(?:\/\s*\d+|\(\s*\d+\s*\)))?$/i;

const norm = s => String(s === null || s === undefined ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
const clean = s => String(s === null || s === undefined ? '' : s).trim().replace(/\s+/g, ' ');
const fail = msg => { throw new Error(msg); };
const safeName = s => clean(s).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');

function recordsFromFile(file) {
  if (!file || !file.data) fail('No file was chosen.');
  const buf = Buffer.from(file.data);
  if (X.isLegacyXls(buf)) fail('This is an old Excel (.xls) file. Open it, choose Save as and pick Excel Workbook (.xlsx) or CSV, then import that file.');
  if (X.isXlsx(buf)) {
    let records;
    try { records = X.readXlsx(buf); } catch (e) { fail(e.message || 'The Excel file could not be read.'); }
    if (!records.length) fail('The Excel file has no data.');
    return { records, delimiter: ',' };
  }
  return parseCsv(buf.toString('utf8'));
}

function createService(store) {
  const S = {};
  const db = () => store.data;
  const save = () => store.save();

  // ------------------------------------------------------------ helpers
  const classById = id => db().classes.find(c => c.id === id) || fail('That class no longer exists.');
  const termById = id => db().terms.find(t => t.id === id) || fail('That term no longer exists.');
  const sessionOf = term => db().sessions.find(s => s.id === term.session_id);
  const sortedClasses = () => db().classes.slice().sort((a, b) => (LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level)) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  const subjectsOf = classId => db().subjects.filter(s => s.class_id === classId).sort((a, b) => a.sort_order - b.sort_order);
  const activeStudents = classId => db().students.filter(s => s.class_id === classId && s.is_active).sort((a, b) => a.full_name.localeCompare(b.full_name));
  const sk = (stu, sub, term) => stu + '|' + sub + '|' + term;
  function termInfo(t) {
    if (!t) return null;
    const s = sessionOf(t);
    return { id: t.id, name: t.name, term_number: t.term_number, session_id: t.session_id, session_name: s ? s.name : '', is_current: !!t.is_current,
      start_date: t.start_date || '', end_date: t.end_date || '', next_term_begins: t.next_term_begins || '' };
  }
  const currentTerm = () => db().terms.find(t => t.is_current) || null;
  function reindex(list) { list.forEach((x, i) => { x.sort_order = i; }); }

  // ------------------------------------------------------------ app / settings
  S.getAppInfo = () => ({
    settings: Object.assign({}, db().settings), setup_done: !!db().setup_done, current_term: termInfo(currentTerm()),
    logo: store.getLogoDataUrl()
  });
  S.saveSettings = patch => {
    const name = clean(patch.school_name);
    if (!name) fail('Enter the school name.');
    Object.assign(db().settings, { school_name: name, board_name: clean(patch.board_name), address: clean(patch.address) });
    save(); return S.getAppInfo();
  };
  S.completeSetup = () => { db().setup_done = true; save(); return true; };
  S.getLogo = () => store.getLogoDataUrl();
  S.removeLogo = () => { store.removeLogo(); return true; };

  // ------------------------------------------------------------ sessions and terms
  S.listSessions = () => db().sessions.slice().sort((a, b) => b.name.localeCompare(a.name)).map(s => ({
    id: s.id, name: s.name,
    terms: db().terms.filter(t => t.session_id === s.id).sort((a, b) => a.term_number - b.term_number).map(termInfo)
  }));
  S.listTerms = () => S.listSessions().reduce((acc, s) => acc.concat(s.terms), []);
  S.createSession = name => {
    name = clean(name);
    const m = /^(\d{4})\/(\d{4})$/.exec(name);
    if (!m || Number(m[2]) !== Number(m[1]) + 1) fail('Session name must be two consecutive years, for example 2026/2027.');
    if (db().sessions.some(s => s.name === name)) fail('The session ' + name + ' already exists.');
    const session = { id: newId(), name };
    db().sessions.push(session);
    const names = ['First Term', 'Second Term', 'Third Term'];
    const hadCurrent = !!currentTerm();
    names.forEach((n, i) => db().terms.push({ id: newId(), session_id: session.id, term_number: i + 1, name: n, start_date: '', end_date: '', next_term_begins: '', is_current: !hadCurrent && i === 0 }));
    save(); return S.listSessions();
  };
  const validDate = v => {
    v = String(v || '').trim();
    if (!v) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v + 'T00:00:00Z'))) fail('Dates must look like 2026-09-14.');
    return v;
  };
  S.updateTerm = (id, patch) => {
    const t = termById(id);
    const start = validDate(patch.start_date), end = validDate(patch.end_date), next = validDate(patch.next_term_begins);
    if (start && end && start > end) fail('The start date must be before the end date.');
    Object.assign(t, { start_date: start, end_date: end, next_term_begins: next });
    save(); return termInfo(t);
  };
  S.setCurrentTerm = id => {
    termById(id);
    db().terms.forEach(t => { t.is_current = t.id === id; });
    save(); return S.getAppInfo();
  };

  // ------------------------------------------------------------ grading and traits
  S.getGrading = () => db().grading.slice().sort((a, b) => b.min_score - a.min_score);
  S.saveGrading = rows => {
    if (!Array.isArray(rows) || !rows.length) fail('Add at least one grade.');
    const seenG = new Set(), seenM = new Set(), out = [];
    rows.forEach(r => {
      const grade = clean(r.grade), remark = clean(r.remark), min = Number(r.min_score);
      if (!grade) fail('Every grade needs a letter or label.');
      if (grade.length > 6) fail('Grade labels must be 6 characters or less.');
      if (r.min_score === '' || r.min_score === null || !isFinite(min) || min < 0 || min > 100) fail('Minimum scores must be numbers from 0 to 100.');
      if (seenG.has(grade.toLowerCase())) fail('The grade ' + grade + ' appears twice.');
      if (seenM.has(min)) fail('Two grades start at ' + min + '. Each minimum score must be different.');
      seenG.add(grade.toLowerCase()); seenM.add(min);
      out.push({ grade, min_score: min, remark });
    });
    if (!seenM.has(0)) fail('One grade must start at 0 so every score gets a grade.');
    db().grading = out; save(); return S.getGrading();
  };
  S.listTraits = () => db().traits.slice().sort((a, b) => (a.group === b.group ? a.sort_order - b.sort_order : (a.group === 'skill' ? -1 : 1)));
  S.addTrait = (name, group) => {
    name = clean(name);
    if (!name) fail('Enter a name.');
    if (!['skill', 'behaviour'].includes(group)) fail('Choose Skills or Behaviour.');
    if (db().traits.some(t => t.group === group && norm(t.name) === norm(name))) fail('That item already exists.');
    db().traits.push({ id: newId(), name, group, sort_order: db().traits.filter(t => t.group === group).length });
    save(); return S.listTraits();
  };
  S.renameTrait = (id, name) => {
    name = clean(name); if (!name) fail('Enter a name.');
    const t = db().traits.find(x => x.id === id) || fail('Item not found.');
    t.name = name; save(); return S.listTraits();
  };
  S.deleteTrait = id => {
    db().traits = db().traits.filter(t => t.id !== id);
    ['skill', 'behaviour'].forEach(g => reindex(db().traits.filter(t => t.group === g).sort((a, b) => a.sort_order - b.sort_order)));
    Object.keys(db().ratings).forEach(k => { if (k.split('|')[2] === id) delete db().ratings[k]; });
    save(); return S.listTraits();
  };
  S.moveTrait = (id, dir) => {
    const t = db().traits.find(x => x.id === id) || fail('Item not found.');
    const list = db().traits.filter(x => x.group === t.group).sort((a, b) => a.sort_order - b.sort_order);
    const i = list.indexOf(t), j = i + (dir < 0 ? -1 : 1);
    if (j < 0 || j >= list.length) return S.listTraits();
    list.splice(j, 0, list.splice(i, 1)[0]); reindex(list);
    save(); return S.listTraits();
  };

  // ------------------------------------------------------------ classes and subjects
  S.getLevels = () => LEVELS.slice();
  S.listClasses = () => sortedClasses().map(c => ({
    id: c.id, name: c.name, level: c.level, stream: c.stream, class_master_name: c.class_master_name || '',
    students: db().students.filter(s => s.class_id === c.id && s.is_active).length,
    subjects: db().subjects.filter(s => s.class_id === c.id).length
  }));
  S.addClass = ({ level, stream }) => {
    if (!LEVELS.includes(level)) fail('Choose a class level.');
    stream = clean(stream);
    const name = (level + ' ' + stream).trim();
    if (db().classes.some(c => norm(c.name) === norm(name))) fail('The class ' + name + ' already exists.');
    const c = { id: newId(), name, level, stream, class_master_name: '' };
    db().classes.push(c); save(); return S.listClasses();
  };
  S.updateClass = (id, patch) => {
    const c = classById(id);
    c.class_master_name = clean(patch.class_master_name);
    save(); return S.listClasses();
  };
  S.deleteClass = id => {
    const c = classById(id);
    if (db().students.some(s => s.class_id === id)) fail('The class ' + c.name + ' still has students. Move or delete them first.');
    const subIds = new Set(subjectsOf(id).map(s => s.id));
    db().subjects = db().subjects.filter(s => s.class_id !== id);
    Object.keys(db().scores).forEach(k => { if (subIds.has(k.split('|')[1])) delete db().scores[k]; });
    db().classes = db().classes.filter(x => x.id !== id);
    save(); return S.listClasses();
  };
  S.suggestedSubjects = () => SUGGESTED_SUBJECTS.slice();
  S.listSubjects = classId => subjectsOf(classId).map(s => ({ id: s.id, class_id: s.class_id, name: s.name, sort_order: s.sort_order }));
  S.addSubject = (classId, name) => {
    classById(classId); name = clean(name);
    if (!name) fail('Enter the subject name.');
    const list = subjectsOf(classId);
    if (list.some(s => norm(s.name) === norm(name))) fail(name + ' is already in this class.');
    db().subjects.push({ id: newId(), class_id: classId, name, sort_order: list.length });
    save(); return S.listSubjects(classId);
  };
  S.renameSubject = (id, name) => {
    name = clean(name); if (!name) fail('Enter the subject name.');
    const s = db().subjects.find(x => x.id === id) || fail('Subject not found.');
    if (subjectsOf(s.class_id).some(o => o.id !== id && norm(o.name) === norm(name))) fail(name + ' is already in this class.');
    s.name = name; save(); return S.listSubjects(s.class_id);
  };
  S.deleteSubject = id => {
    const s = db().subjects.find(x => x.id === id) || fail('Subject not found.');
    db().subjects = db().subjects.filter(x => x.id !== id);
    Object.keys(db().scores).forEach(k => { if (k.split('|')[1] === id) delete db().scores[k]; });
    reindex(subjectsOf(s.class_id)); save(); return S.listSubjects(s.class_id);
  };
  S.moveSubject = (id, dir) => {
    const s = db().subjects.find(x => x.id === id) || fail('Subject not found.');
    const list = subjectsOf(s.class_id), i = list.indexOf(s), j = i + (dir < 0 ? -1 : 1);
    if (j >= 0 && j < list.length) { list.splice(j, 0, list.splice(i, 1)[0]); reindex(list); save(); }
    return S.listSubjects(s.class_id);
  };
  S.copySubjects = (fromId, toIds) => {
    const src = subjectsOf(fromId);
    let added = 0;
    (toIds || []).forEach(tid => {
      if (tid === fromId) return;
      classById(tid);
      const existing = new Set(subjectsOf(tid).map(s => norm(s.name)));
      let order = subjectsOf(tid).length;
      src.forEach(s => { if (!existing.has(norm(s.name))) { db().subjects.push({ id: newId(), class_id: tid, name: s.name, sort_order: order++ }); added++; } });
    });
    save(); return { added };
  };

  // ------------------------------------------------------------ students
  function normGender(g) {
    const v = norm(g);
    if (['m', 'male', 'boy'].includes(v)) return 'M';
    if (['f', 'female', 'girl'].includes(v)) return 'F';
    return null;
  }
  const withClass = s => Object.assign({}, s, { class_name: (db().classes.find(c => c.id === s.class_id) || {}).name || '' });
  S.listStudents = ({ classId, search, includeInactive } = {}) => {
    const q = norm(search);
    return db().students
      .filter(s => (!classId || s.class_id === classId) && (includeInactive !== false || s.is_active) &&
        (!q || norm(s.full_name).includes(q) || norm(s.admission_no).includes(q)))
      .sort((a, b) => a.full_name.localeCompare(b.full_name)).map(withClass);
  };
  function checkStudent(fields, selfId) {
    const name = clean(fields.full_name);
    if (!name) fail('Enter the student name.');
    const gender = normGender(fields.gender);
    if (!gender) fail('Choose the gender (M or F).');
    const adm = clean(fields.admission_no);
    if (adm) {
      const other = db().students.find(s => s.id !== selfId && s.admission_no && norm(s.admission_no) === norm(adm));
      if (other) fail('Admission number ' + adm + ' is already used by ' + other.full_name + '.');
    }
    return { full_name: name, gender, admission_no: adm };
  }
  S.addStudent = f => {
    classById(f.class_id);
    const v = checkStudent(f, null);
    db().students.push({ id: newId(), class_id: f.class_id, admission_no: v.admission_no, full_name: v.full_name, gender: v.gender, is_active: true, created_at: new Date().toISOString() });
    save(); return true;
  };
  S.updateStudent = (id, f) => {
    const s = db().students.find(x => x.id === id) || fail('Student not found.');
    const v = checkStudent(Object.assign({}, s, f), id);
    Object.assign(s, v);
    if (f.class_id) { classById(f.class_id); s.class_id = f.class_id; }
    if (typeof f.is_active === 'boolean') s.is_active = f.is_active;
    save(); return true;
  };
  S.deleteStudent = id => {
    db().students = db().students.filter(s => s.id !== id);
    [db().scores, db().ratings, db().remarks].forEach(o => Object.keys(o).forEach(k => { if (k.split('|')[0] === id) delete o[k]; }));
    save(); return true;
  };
  S.promoteStudents = (fromId, toId) => {
    if (fromId === toId) fail('Choose two different classes.');
    classById(fromId); classById(toId);
    let n = 0;
    db().students.forEach(s => { if (s.class_id === fromId && s.is_active) { s.class_id = toId; n++; } });
    save(); return { moved: n };
  };

  // ---- student import
  function parseStudentRecords(records) {
    const header = records[0].cells.map(norm);
    const find = list => header.findIndex(h => list.includes(h));
    const iName = find(NAME_HEADERS), iGender = find(GENDER_HEADERS), iAdm = find(ADMISSION_HEADERS);
    if (iName < 0 || iGender < 0) fail('The header row must include full_name (or name / student name) and gender (or sex). Download the template to see the layout.');
    return records.slice(1).map(r => ({
      line: r.line, full_name: clean(r.cells[iName]), gender: clean(r.cells[iGender]), admission_no: iAdm >= 0 ? clean(r.cells[iAdm]) : ''
    })).filter(r => r.full_name || r.gender || r.admission_no);
  }
  function judgeStudentRows(classId, rows) {
    const seenAdm = new Set(), seenName = new Set();
    const existingAdm = new Map();
    db().students.forEach(s => { if (s.admission_no) existingAdm.set(norm(s.admission_no), s); });
    const classNames = new Set(db().students.filter(s => s.class_id === classId).map(s => norm(s.full_name)));
    return rows.map(r => {
      const problems = [];
      const name = clean(r.full_name), g = normGender(r.gender), adm = clean(r.admission_no);
      if (!name) problems.push('Name is missing');
      if (!g) problems.push('Gender must be M or F');
      if (adm) {
        if (existingAdm.has(norm(adm))) problems.push('Admission number already used by ' + existingAdm.get(norm(adm)).full_name);
        else if (seenAdm.has(norm(adm))) problems.push('Admission number repeated in this file');
      }
      if (name && (classNames.has(norm(name)) || seenName.has(norm(name)))) problems.push('A student with this name is already in the class');
      if (!problems.length) { if (adm) seenAdm.add(norm(adm)); seenName.add(norm(name)); }
      return { line: r.line, full_name: name, gender: g || clean(r.gender), admission_no: adm, ok: problems.length === 0, problems };
    });
  }
  S.previewStudentImport = ({ classId, file }) => {
    classById(classId);
    const { records } = recordsFromFile(file);
    const rows = parseStudentRecords(records);
    if (!rows.length) fail('The file has a header but no students.');
    const judged = judgeStudentRows(classId, rows);
    const ok = judged.filter(r => r.ok).length;
    return { rows: judged, summary: { total: judged.length, ok, problems: judged.length - ok } };
  };
  S.commitStudentImport = ({ classId, rows }) => {
    classById(classId);
    const judged = judgeStudentRows(classId, rows.map(r => ({ line: r.line, full_name: r.full_name, gender: r.gender, admission_no: r.admission_no })));
    let imported = 0;
    judged.forEach(r => {
      if (!r.ok) return;
      db().students.push({ id: newId(), class_id: classId, admission_no: r.admission_no, full_name: r.full_name, gender: normGender(r.gender), is_active: true, created_at: new Date().toISOString() });
      imported++;
    });
    save(); return { imported, skipped: judged.length - imported };
  };
  S.buildStudentTemplate = ({ format }) => {
    const header = ['full_name', 'gender', 'admission_no'];
    const ex = [['Example Student One (delete this row)', 'M', 'GDSS/2026/001'], ['Example Student Two (delete this row)', 'F', 'GDSS/2026/002']];
    if (format === 'csv') return { fileName: 'student-import-template.csv', data: Buffer.from(toCsv([header].concat(ex)), 'utf8') };
    const rows = [header.map(h => ({ v: h, s: X.S.HEADER }))].concat(ex.map(r => r.map(v => ({ v, s: X.S.CELL }))));
    for (let i = 0; i < 300; i++) rows.push([{ v: '', s: X.S.CELL }, { v: '', s: X.S.CENTER }, { v: '', s: X.S.CELL }]);
    return { fileName: 'student-import-template.xlsx', data: X.buildWorkbook([{ name: 'Students', rows, colWidths: [38, 12, 22], freeze: { rows: 1 }, rowHeights: { 0: 24 },
      validations: [{ sqref: 'B2:B500', list: 'M,F', title: 'Gender', message: 'Enter M or F.' }] }]) };
  };

  // ------------------------------------------------------------ scores
  const readScore = (stu, sub, term) => db().scores[sk(stu, sub, term)] || null;
  S.getScoreSheet = (classId, termId) => {
    const cls = classById(classId); termById(termId);
    const students = activeStudents(classId), subjects = subjectsOf(classId);
    const scores = {};
    students.forEach(st => {
      subjects.forEach(su => {
        const r = readScore(st.id, su.id, termId);
        if (r) { (scores[st.id] = scores[st.id] || {})[su.id] = { ca: r.ca, exam: r.exam }; }
      });
    });
    return { class_name: cls.name, students: students.map(s => ({ id: s.id, full_name: s.full_name, admission_no: s.admission_no, gender: s.gender })),
      subjects: subjects.map(s => ({ id: s.id, name: s.name })), scores, grading: S.getGrading() };
  };
  function parseScoreInput(v, max, label) {
    const err = Calc.validateScore(v, max, label);
    if (err) fail(err);
    const t = v === null || v === undefined ? '' : String(v).trim();
    return t === '' ? null : Number(t);
  }
  S.saveScore = (studentId, subjectId, termId, ca, exam) => {
    if (!db().students.some(s => s.id === studentId)) fail('Student not found.');
    if (!db().subjects.some(s => s.id === subjectId)) fail('Subject not found.');
    termById(termId);
    const c = parseScoreInput(ca, CA_MAX, 'CA'), e = parseScoreInput(exam, EXAM_MAX, 'Exam');
    const key = sk(studentId, subjectId, termId);
    if (c === null && e === null) delete db().scores[key];
    else db().scores[key] = { ca: c, exam: e };
    save();
    return { ca: c, exam: e, total: c === null && e === null ? null : Calc.round1((c || 0) + (e || 0)) };
  };
  S.getStudentExtras = (studentId, termId) => {
    const ratings = {};
    db().traits.forEach(t => { const v = db().ratings[sk(studentId, termId, t.id)]; if (v) ratings[t.id] = v; });
    const r = db().remarks[studentId + '|' + termId] || {};
    return { ratings, remarks: { class_master: r.class_master || '', director: r.director || '' } };
  };
  S.saveRating = (studentId, termId, traitId, rating) => {
    const key = sk(studentId, termId, traitId);
    if (rating === null || rating === undefined || rating === '') delete db().ratings[key];
    else {
      const n = Number(rating);
      if (!Number.isInteger(n) || n < 1 || n > 5) fail('Ratings are from 1 to 5.');
      db().ratings[key] = n;
    }
    save(); return true;
  };
  S.saveRemarks = (studentId, termId, remarks) => {
    const cm = String(remarks.class_master || '').trim().slice(0, 400), dr = String(remarks.director || '').trim().slice(0, 400);
    const key = studentId + '|' + termId;
    if (!cm && !dr) delete db().remarks[key]; else db().remarks[key] = { class_master: cm, director: dr };
    save(); return true;
  };

  // ---- results
  function computeResults(classId, termId) {
    const cls = classById(classId), term = termById(termId);
    const subjects = subjectsOf(classId), students = activeStudents(classId), grading = S.getGrading();
    const rows = students.map(st => {
      const per = subjects.map(su => {
        const r = readScore(st.id, su.id, termId);
        if (!r) return { subject_id: su.id, name: su.name, ca: null, exam: null, total: null, grade: '', remark: '' };
        const total = Calc.round1((r.ca || 0) + (r.exam || 0));
        const g = Calc.gradeFor(total, grading);
        return { subject_id: su.id, name: su.name, ca: r.ca, exam: r.exam, total, grade: g ? g.grade : '', remark: g ? g.remark : '' };
      });
      const scored = per.filter(p => p.total !== null);
      const total = Calc.round1(scored.reduce((a, p) => a + p.total, 0));
      return { student_id: st.id, full_name: st.full_name, admission_no: st.admission_no, gender: st.gender, subjects: per,
        total, subject_count: scored.length, average: scored.length ? total / scored.length : null, position: null, incomplete: scored.length < subjects.length };
    });
    const ranked = rows.filter(r => r.subject_count > 0).map(r => r.total);
    rows.forEach(r => { if (r.subject_count > 0) r.position = Calc.position(r.total, ranked); });
    const avgs = rows.filter(r => r.subject_count > 0).map(r => r.average);
    const stats = ranked.length ? { highest: Math.max.apply(null, ranked), lowest: Math.min.apply(null, ranked), class_average: Calc.average(avgs), ranked: ranked.length } : { highest: null, lowest: null, class_average: null, ranked: 0 };
    return { class: { id: cls.id, name: cls.name, class_master_name: cls.class_master_name || '' }, term: termInfo(term), subjects: subjects.map(s => ({ id: s.id, name: s.name })),
      students: rows, class_size: rows.length, stats };
  }
  S.getClassResults = (classId, termId) => computeResults(classId, termId);

  S.getDashboard = () => {
    const term = currentTerm();
    const classes = sortedClasses().map(c => {
      const st = activeStudents(c.id), su = subjectsOf(c.id);
      let filled = 0;
      if (term) st.forEach(s => su.forEach(x => { if (readScore(s.id, x.id, term.id)) filled++; }));
      const expected = st.length * su.length;
      return { id: c.id, name: c.name, students: st.length, subjects: su.length, filled, expected, percent: expected ? Math.round(filled * 100 / expected) : 0 };
    });
    return { current_term: termInfo(term), classes, totals: { students: db().students.filter(s => s.is_active).length, classes: db().classes.length, subjects: db().subjects.length } };
  };

  // ---- score template and import
  const scoreHead = (name, isCa) => name + (isCa ? ' CA (30)' : ' Exam (70)');
  S.buildScoreTemplate = ({ classId, termId, subjectId, format }) => {
    const cls = classById(classId), term = termById(termId);
    let subjects = subjectsOf(classId);
    if (subjectId) subjects = subjects.filter(s => s.id === subjectId);
    if (!subjects.length) fail('This class has no subjects yet. Add subjects first.');
    const students = activeStudents(classId);
    const tag = subjectId ? safeName(subjects[0].name) : 'All-subjects';
    const base = 'Scores_' + (safeName(cls.name) || 'Class') + '_' + (safeName(term.name) || 'Term') + '_' + tag;
    const header = ['admission_no', 'full_name'];
    subjects.forEach(s => { header.push(scoreHead(s.name, true), scoreHead(s.name, false)); });
    const body = students.map(st => {
      const row = [st.admission_no || '', st.full_name];
      subjects.forEach(su => { const r = readScore(st.id, su.id, termId); row.push(r && r.ca !== null ? r.ca : '', r && r.exam !== null ? r.exam : ''); });
      return row;
    });
    if (format === 'csv') return { fileName: base + '.csv', data: Buffer.from(toCsv([header].concat(body.map(r => r.map(v => (v === '' ? '' : String(v)))))), 'utf8') };
    const rows = [header.map((h, i) => ({ v: h, s: i < 2 ? X.S.HEADER : ((i - 2) % 2 === 0 ? X.S.CA_HEAD : X.S.EXAM_HEAD) }))];
    body.forEach(r => rows.push(r.map((v, i) => {
      if (i < 2) return { v, s: X.S.IDENT };
      return { v: v === '' ? null : v, s: (i - 2) % 2 === 0 ? X.S.CA : X.S.EXAM };
    })));
    const last = Math.max(rows.length + 100, 200);
    const widths = [18, 34], validations = [];
    subjects.forEach((s, i) => {
      widths.push(Math.max(14, Math.min(26, s.name.length + 8)), Math.max(14, Math.min(26, s.name.length + 10)));
      const caCol = X.colName(2 + i * 2), exCol = X.colName(3 + i * 2);
      validations.push({ sqref: caCol + '2:' + caCol + last, min: 0, max: CA_MAX, title: 'CA score', message: 'CA must be a number from 0 to 30.' });
      validations.push({ sqref: exCol + '2:' + exCol + last, min: 0, max: EXAM_MAX, title: 'Exam score', message: 'Exam must be a number from 0 to 70.' });
    });
    return { fileName: base + '.xlsx', data: X.buildWorkbook([{ name: 'Scores', rows, colWidths: widths, freeze: { cols: 2, rows: 1 }, rowHeights: { 0: 36 }, validations }]) };
  };

  function normalizeScoreText(raw, delimiter) {
    let t = String(raw === undefined || raw === null ? '' : raw).trim();
    if (!t) return '';
    if (delimiter === ';') t = t.replace(',', '.');
    const v = Number(t);
    if (!isFinite(v) || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return t;
    const rounded = Math.round(v * 10) / 10;
    if (Math.abs(v - rounded) > 1e-9) return t;
    return rounded % 1 === 0 ? String(rounded) : String(rounded);
  }

  S.previewScoreImport = ({ classId, termId, subjectId, replace, file }) => {
    classById(classId); termById(termId);
    const subjects = subjectsOf(classId), students = activeStudents(classId);
    const { records, delimiter } = recordsFromFile(file);
    const header = records[0].cells.map(norm);
    const iAdm = header.findIndex(h => ADMISSION_HEADERS.includes(h)), iName = header.findIndex(h => NAME_HEADERS.includes(h));
    if (iAdm < 0 && iName < 0) fail('The header row must include admission_no or full_name so students can be matched.');

    const warnings = [], pairs = new Map(); // subjectId -> {subject, ca, exam}
    const selected = subjectId ? subjects.find(s => s.id === subjectId) : null;
    records[0].cells.forEach((raw, idx) => {
      const h = clean(raw);
      if (!h) return;
      const m = SCORE_HEADER.exec(h);
      if (!m) return;
      const label = m[1] ? clean(m[1]) : '', isCa = m[2].toLowerCase() === 'ca';
      let subject;
      if (!label) {
        if (!selected) fail('This file has plain "CA" / "Exam" columns. Choose the subject they belong to, then try again.');
        subject = selected;
      } else {
        subject = subjects.find(s => norm(s.name) === norm(label));
        if (!subject) { warnings.push('Column "' + h + '" was skipped: this class has no subject called "' + label + '".'); return; }
      }
      const p = pairs.get(subject.id) || { subject, ca: -1, exam: -1 };
      if (isCa) p.ca = idx; else p.exam = idx;
      pairs.set(subject.id, p);
    });
    if (!pairs.size) fail('No score columns were found. Use headers like "Mathematics CA (30)" and "Mathematics Exam (70)", or just "CA" and "Exam". Download the template to see the layout.');

    const byAdm = new Map(), byName = new Map();
    students.forEach(s => {
      if (s.admission_no) byAdm.set(norm(s.admission_no), s);
      const k = norm(s.full_name); byName.set(k, (byName.get(k) || []).concat(s));
    });
    const lines = [], seenStudents = new Set();
    records.slice(1).forEach(rec => {
      const adm = iAdm >= 0 ? clean(rec.cells[iAdm]) : '', nm = iName >= 0 ? clean(rec.cells[iName]) : '';
      if (!adm && !nm) return;
      let student = adm ? byAdm.get(norm(adm)) : null, problem = '';
      if (!student && nm) {
        const found = byName.get(norm(nm)) || [];
        if (found.length === 1) student = found[0];
        else if (found.length > 1) problem = 'More than one student has this name. Add the admission number.';
      }
      if (!student && !problem) problem = 'Student not found in this class';
      if (student && seenStudents.has(student.id)) problem = 'This student appears twice in the file';
      if (student) seenStudents.add(student.id);
      if (!student || problem) { lines.push({ line: rec.line, student_id: null, student_name: nm || adm, admission_no: adm, subject_id: null, subject_name: '\u2014', current_ca: '', current_exam: '', new_ca: '', new_exam: '', final_ca: '', final_exam: '', problems: [problem], apply: false }); return; }
      pairs.forEach(p => {
        const newCa = p.ca >= 0 ? normalizeScoreText(rec.cells[p.ca], delimiter) : '';
        const newExam = p.exam >= 0 ? normalizeScoreText(rec.cells[p.exam], delimiter) : '';
        if (newCa === '' && newExam === '') return;
        const cur = readScore(student.id, p.subject.id, termId) || { ca: null, exam: null };
        const problems = [];
        const e1 = Calc.validateScore(newCa, CA_MAX, 'CA'), e2 = Calc.validateScore(newExam, EXAM_MAX, 'Exam');
        if (e1) problems.push(e1); if (e2) problems.push(e2);
        const pick = (nv, cv) => (nv === '' ? (cv === null ? '' : String(cv)) : (cv !== null && !replace ? String(cv) : nv));
        const finalCa = pick(newCa, cur.ca), finalExam = pick(newExam, cur.exam);
        const changed = finalCa !== (cur.ca === null ? '' : String(cur.ca)) || finalExam !== (cur.exam === null ? '' : String(cur.exam));
        lines.push({ line: rec.line, student_id: student.id, student_name: student.full_name, admission_no: student.admission_no || '', subject_id: p.subject.id, subject_name: p.subject.name,
          current_ca: cur.ca === null ? '' : String(cur.ca), current_exam: cur.exam === null ? '' : String(cur.exam), new_ca: newCa, new_exam: newExam,
          final_ca: finalCa, final_exam: finalExam, problems, apply: problems.length === 0 && changed });
      });
    });
    const problemsN = lines.filter(l => l.problems.length).length, applyN = lines.filter(l => l.apply).length;
    return { lines, warnings, summary: { lines: lines.length, ok: applyN, problems: problemsN, unchanged: lines.length - applyN - problemsN } };
  };
  S.commitScoreImport = ({ termId, lines }) => {
    termById(termId);
    const todo = (lines || []).filter(l => l.apply && l.student_id && l.subject_id);
    const parsed = todo.map(l => {
      if (!db().students.some(s => s.id === l.student_id) || !db().subjects.some(s => s.id === l.subject_id)) fail('The data changed while importing. Please start the import again.');
      return { l, ca: parseScoreInput(l.final_ca, CA_MAX, 'CA'), exam: parseScoreInput(l.final_exam, EXAM_MAX, 'Exam') };
    });
    parsed.forEach(p => {
      const key = sk(p.l.student_id, p.l.subject_id, termId);
      if (p.ca === null && p.exam === null) delete db().scores[key]; else db().scores[key] = { ca: p.ca, exam: p.exam };
    });
    save(); return { saved: parsed.length };
  };

  // ------------------------------------------------------------ exports and reports
  S.buildBroadsheet = ({ classId, termId, format }) => {
    const res = computeResults(classId, termId);
    const header = ['Position', 'Name', 'Admission No'].concat(res.subjects.map(s => s.name), ['Total', 'Average']);
    const rows = res.students.slice().sort((a, b) => (a.position || 9999) - (b.position || 9999) || a.full_name.localeCompare(b.full_name)).map(r =>
      [r.position ? Calc.ordinal(r.position) : '', r.full_name, r.admission_no || ''].concat(r.subjects.map(s => (s.total === null ? '' : s.total)), [r.subject_count ? r.total : '', r.average === null ? '' : Calc.formatAverage(r.average)]));
    const base = 'Broadsheet_' + (safeName(res.class.name) || 'Class') + '_' + (safeName(res.term.name) || 'Term') + '_' + (safeName(res.term.session_name.replace('/', '-')) || 'Session');
    if (format === 'csv') return { fileName: base + '.csv', data: Buffer.from(toCsv([header].concat(rows)), 'utf8') };
    const xr = [header.map(h => ({ v: h, s: X.S.HEADER }))].concat(rows.map(r => r.map((v, i) => ({ v: v === '' ? null : (i >= 3 && i < r.length - 1 ? Number(v) : v), s: i === 1 ? X.S.CELL : X.S.CENTER }))));
    return { fileName: base + '.xlsx', data: X.buildWorkbook([{ name: 'Broadsheet', rows: xr, colWidths: [10, 32, 16].concat(res.subjects.map(() => 13), [10, 10]), freeze: { cols: 2, rows: 1 }, rowHeights: { 0: 36 } }]) };
  };

  S.exportEverything = () => {
    const stuRows = [['Class', 'Admission No', 'Full Name', 'Gender', 'Active'].map(h => ({ v: h, s: X.S.HEADER }))];
    S.listStudents({}).forEach(s => stuRows.push([s.class_name, s.admission_no || '', s.full_name, s.gender, s.is_active ? 'Yes' : 'No']));
    const scoreRows = [['Session', 'Term', 'Class', 'Student', 'Admission No', 'Subject', 'CA', 'Exam', 'Total'].map(h => ({ v: h, s: X.S.HEADER }))];
    const stuMap = new Map(db().students.map(s => [s.id, s])), subMap = new Map(db().subjects.map(s => [s.id, s]));
    Object.keys(db().scores).forEach(k => {
      const [sid, subid, tid] = k.split('|'), st = stuMap.get(sid), su = subMap.get(subid), tm = db().terms.find(t => t.id === tid);
      if (!st || !su || !tm) return;
      const v = db().scores[k], cls = db().classes.find(c => c.id === su.class_id);
      scoreRows.push([(sessionOf(tm) || {}).name || '', tm.name, cls ? cls.name : '', st.full_name, st.admission_no || '', su.name, v.ca, v.exam, Calc.round1((v.ca || 0) + (v.exam || 0))]);
    });
    return { fileName: 'GDSS_all_data_' + new Date().toISOString().slice(0, 10) + '.xlsx', data: X.buildWorkbook([
      { name: 'Students', rows: stuRows, colWidths: [14, 18, 36, 8, 8], freeze: { rows: 1 } },
      { name: 'Scores', rows: scoreRows, colWidths: [12, 14, 12, 34, 18, 28, 8, 8, 8], freeze: { rows: 1 } }]) };
  };

  S.buildReport = ({ classId, termId, studentIds, order, includeRemarks }) => {
    const res = computeResults(classId, termId);
    let list = res.students;
    if (studentIds && studentIds.length) { const set = new Set(studentIds); list = list.filter(r => set.has(r.student_id)); }
    if (!list.length) fail('There are no students to print.');
    list = list.slice().sort(order === 'position'
      ? (a, b) => (a.position || 9999) - (b.position || 9999) || a.full_name.localeCompare(b.full_name)
      : (a, b) => a.full_name.localeCompare(b.full_name));
    const data = {
      school: db().settings, class_name: res.class.name, term: res.term, subjects: res.subjects, traits: db().traits, includeRemarks: !!includeRemarks,
      logoDataUrl: store.getLogoDataUrl(),
      students: list.map(r => {
        const scores = {}; r.subjects.forEach(s => { if (s.total !== null) scores[s.subject_id] = s; });
        const extra = S.getStudentExtras(r.student_id, termId);
        return { student: { full_name: r.full_name }, scores, ratings: extra.ratings, remarks: extra.remarks,
          summary: { total: r.total, average: r.average, position: r.position, class_size: res.class_size } };
      })
    };
    const single = list.length === 1;
    const base = single ? (safeName(list[0].full_name) || 'Student') + '_' + (safeName(res.term.name) || 'Term') : (safeName(res.class.name) || 'Class') + '_' + (safeName(res.term.name) || 'Term') + '_' + (safeName(res.term.session_name.replace('/', '-')) || 'Session');
    return { html: buildReportHtml(data), fileName: base + '.pdf', count: list.length };
  };

  S.getDataInfo = () => ({ dir: store.dir, backup_dir: store.backupDir, backups: store.listBackups().slice(0, 5).map(b => ({ name: b.name, mtime: b.mtime })) });
  return S;
}

module.exports = { createService, LEVELS, CA_MAX, EXAM_MAX };
