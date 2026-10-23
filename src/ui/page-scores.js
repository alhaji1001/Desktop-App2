'use strict';
(function () {
  var h = U.h, api = U.api, safe = U.safe, fmt = U.fmt;

  Pages.scores = async function (root) {
    var common = await App.common();
    var mode = 'subject', subjectId = null, studentId = null, sheet = null;
    var body = h('div'), progress = h('span', { class: 'muted' });

    function scoresFilled() {
      var n = 0;
      Object.keys(sheet.scores).forEach(function (sid) { n += Object.keys(sheet.scores[sid]).length; });
      return n;
    }
    function updateProgress() {
      var expected = sheet.students.length * sheet.subjects.length, n = scoresFilled();
      progress.textContent = expected ? n + ' of ' + expected + ' scores entered (' + Math.round(n * 100 / expected) + '%)' : '';
    }

    async function loadSheet() {
      if (!App.state.classId || !App.state.termId) { U.fill(body, U.empty(App.state.classId ? 'Create a session and term in Settings first.' : 'Add a class first.')); return; }
      sheet = await api.getScoreSheet(App.state.classId, App.state.termId);
      if (!sheet.subjects.some(function (s) { return s.id === subjectId; })) subjectId = sheet.subjects.length ? sheet.subjects[0].id : null;
      if (!sheet.students.some(function (s) { return s.id === studentId; })) studentId = sheet.students.length ? sheet.students[0].id : null;
      updateProgress();
      await draw();
    }

    // one editable row: CA + Exam inputs, live total / grade, auto-save
    function makeRow(sid, subId, label) {
      var cur = (sheet.scores[sid] || {})[subId] || {};
      var ca = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', value: cur.ca === null || cur.ca === undefined ? '' : fmt(cur.ca) });
      var ex = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', value: cur.exam === null || cur.exam === undefined ? '' : fmt(cur.exam) });
      var totalTd = h('td', { class: 'c' }), gradeTd = h('td', { class: 'c' }), remarkTd = h('td'), msg = h('td', { class: 'msg-err small' }), savedTd = h('td', { class: 'saved' });
      function live() {
        var e1 = Calc.validateScore(ca.value, 30, 'CA'), e2 = Calc.validateScore(ex.value, 70, 'Exam');
        ca.className = e1 ? 'err' : ''; ex.className = e2 ? 'err' : '';
        msg.textContent = e1 || e2 || '';
        var empty = ca.value.trim() === '' && ex.value.trim() === '';
        if (e1 || e2 || empty) { totalTd.textContent = ''; gradeTd.textContent = ''; remarkTd.textContent = ''; gradeTd.className = 'c'; return; }
        var total = Calc.round1((Number(ca.value) || 0) + (Number(ex.value) || 0));
        var g = Calc.gradeFor(total, sheet.grading);
        totalTd.textContent = fmt(total); totalTd.style.fontWeight = '700';
        gradeTd.textContent = g ? g.grade : ''; gradeTd.className = 'c' + (g && g.grade.toUpperCase() === 'F' ? ' fail' : '');
        remarkTd.textContent = g ? g.remark : '';
      }
      var save = safe(async function () {
        live();
        if (Calc.validateScore(ca.value, 30, 'CA') || Calc.validateScore(ex.value, 70, 'Exam')) return;
        var r = await api.saveScore(sid, subId, App.state.termId, ca.value, ex.value);
        if (r.total === null) { if (sheet.scores[sid]) { delete sheet.scores[sid][subId]; if (!Object.keys(sheet.scores[sid]).length) delete sheet.scores[sid]; } }
        else { (sheet.scores[sid] = sheet.scores[sid] || {})[subId] = { ca: r.ca, exam: r.exam }; }
        updateProgress();
        savedTd.textContent = 'Saved \u2713';
        setTimeout(function () { savedTd.textContent = ''; }, 1500);
      });
      var deb = U.debounce(save, 600);
      [ca, ex].forEach(function (inp) {
        inp.addEventListener('input', function () { live(); deb(); });
        inp.addEventListener('change', save);
        inp.addEventListener('focus', function () { if (inp.select) inp.select(); });
      });
      live();
      var tr = h('tr', null, h('td', null, label), h('td', { class: 'sc ca' }, ca), h('td', { class: 'sc ex' }, ex), totalTd, gradeTd, remarkTd, savedTd, msg);
      return { tr: tr, ca: ca, ex: ex };
    }

    // spreadsheet-style keys and paste
    function wireGrid(rows) {
      rows.forEach(function (row, i) {
        [row.ca, row.ex].forEach(function (inp, col) {
          inp.addEventListener('keydown', function (e) {
            var to = null;
            if (e.key === 'Enter' || e.key === 'ArrowDown') to = rows[i + 1] && [rows[i + 1].ca, rows[i + 1].ex][col];
            else if (e.key === 'ArrowUp') to = rows[i - 1] && [rows[i - 1].ca, rows[i - 1].ex][col];
            else return;
            e.preventDefault();
            if (to) to.focus();
          });
          inp.addEventListener('paste', function (e) {
            var text = e.clipboardData ? e.clipboardData.getData('text') : '';
            if (!/[\r\n\t]/.test(text.trim())) return;
            e.preventDefault();
            var lines = text.replace(/\r/g, '').split('\n');
            while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
            lines.forEach(function (ln, k) {
              ln.split('\t').forEach(function (val, c) {
                var r = rows[i + k]; if (!r) return;
                var target = [r.ca, r.ex][col + c]; if (!target) return;
                target.value = val.trim();
                target.dispatchEvent(new Event('input')); target.dispatchEvent(new Event('change'));
              });
            });
          });
        });
      });
    }

    var head = function () {
      return h('thead', null, h('tr', null, h('th', null, mode === 'subject' ? 'Student' : 'Subject'), h('th', { class: 'th-ca c' }, 'CA (30)'), h('th', { class: 'th-ex c' }, 'Exam (70)'),
        h('th', { class: 'c' }, 'Total'), h('th', { class: 'c' }, 'Grade'), h('th', null, 'Remark'), h('th', null, ''), h('th', null, '')));
    };

    async function drawInner() {
      if (!sheet.subjects.length) { U.fill(body, U.empty('This class has no subjects yet. Add them under Classes & Subjects.')); return; }
      if (!sheet.students.length) { U.fill(body, U.empty('This class has no active students yet. Add or import students first.')); return; }
      if (mode === 'subject') {
        var rows = sheet.students.map(function (s, i) { return makeRow(s.id, subjectId, (i + 1) + '. ' + s.full_name + (s.admission_no ? '  (' + s.admission_no + ')' : '')); });
        wireGrid(rows);
        U.fill(body,
          h('div', { class: 'row', style: { marginBottom: '10px' } }, h('b', null, 'Subject:'),
            U.select(sheet.subjects.map(function (s) { return { value: s.id, label: s.name }; }), subjectId, function (v) { subjectId = v; draw(); }),
            h('span', { class: 'muted small' }, 'Tip: use Enter or the arrow keys to move down, and paste a column of numbers from Excel.')),
          h('div', { class: 'tw' }, h('table', null, head(), h('tbody', null, rows.map(function (r) { return r.tr; })))));
        return;
      }
      // student view
      var idx = sheet.students.findIndex(function (s) { return s.id === studentId; });
      var extras = await api.getStudentExtras(studentId, App.state.termId);
      var traits = await api.listTraits();
      var rows2 = sheet.subjects.map(function (su) { return makeRow(studentId, su.id, su.name); });
      wireGrid(rows2);
      var move = function (d) { return function () { var n = sheet.students[idx + d]; if (n) { studentId = n.id; draw(); } }; };
      var remarks = { class_master: extras.remarks.class_master, director: extras.remarks.director };
      var saveRemarks = U.debounce(safe(async function () { await api.saveRemarks(studentId, App.state.termId, remarks); }), 700);
      var cm = h('textarea', { placeholder: 'Leave empty to write by hand after printing' }), dr = h('textarea', { placeholder: 'Leave empty to write by hand after printing' });
      cm.value = remarks.class_master; dr.value = remarks.director;
      cm.addEventListener('input', function () { remarks.class_master = cm.value; saveRemarks(); });
      dr.addEventListener('input', function () { remarks.director = dr.value; saveRemarks(); });

      var traitTable = function (group, title) {
        var items = traits.filter(function (t) { return t.group === group; });
        return h('div', { class: 'card' }, h('h3', null, title), items.length ? h('table', null, items.map(function (t) {
          var name = 'r' + t.id;
          return h('tr', null, h('td', null, t.name), h('td', null, h('div', { class: 'rate' }, [1, 2, 3, 4, 5].map(function (n) {
            return h('label', null, h('input', { type: 'radio', name: name, value: n, checked: extras.ratings[t.id] === n,
              onchange: safe(async function () { await api.saveRating(studentId, App.state.termId, t.id, n); }) }), String(n));
          }))), h('td', null, h('button', { class: 'btn light sm', onclick: safe(async function () {
            await api.saveRating(studentId, App.state.termId, t.id, null); draw();
          }) }, 'Clear')));
        })) : h('div', { class: 'muted' }, 'None. Add items in Settings.'));
      };
      U.fill(body,
        h('div', { class: 'row', style: { marginBottom: '10px' } }, h('b', null, 'Student:'),
          U.select(sheet.students.map(function (s) { return { value: s.id, label: s.full_name }; }), studentId, function (v) { studentId = v; draw(); }, { style: { minWidth: '260px' } }),
          h('button', { class: 'btn light sm', disabled: idx <= 0, onclick: move(-1) }, '\u2190 Previous'),
          h('button', { class: 'btn light sm', disabled: idx >= sheet.students.length - 1, onclick: move(1) }, 'Next \u2192')),
        h('div', { class: 'tw', style: { maxHeight: 'none', marginBottom: '16px' } }, h('table', null, head(), h('tbody', null, rows2.map(function (r) { return r.tr; })))),
        h('div', { class: 'row', style: { alignItems: 'flex-start' } },
          h('div', { class: 'grow' }, traitTable('skill', 'Skills (1 to 5)')), h('div', { class: 'grow' }, traitTable('behaviour', 'Behaviour (1 to 5)'))),
        h('div', { class: 'card' }, h('h3', null, "Class master's remarks"), cm, h('h3', { style: { marginTop: '10px' } }, "Director's remarks"), dr));
    }

    var draw = safe(drawInner);

    // ---------------------------------------------------------------- template + import
    function templateDialog() {
      var subj = U.select([{ value: '', label: 'All subjects' }].concat(sheet.subjects.map(function (s) { return { value: s.id, label: s.name }; })), '');
      var fmtSel = U.select([{ value: 'xlsx', label: 'Excel (.xlsx), recommended' }, { value: 'csv', label: 'CSV (.csv)' }], 'xlsx');
      U.modal('Download score template', h('div', null, h('p', { class: 'muted' }, 'The template lists every active student of the class, with CA (30) in blue and Exam (70) in green. Scores already entered are included.'),
        U.field('Subjects', subj), U.field('File type', fmtSel)), [{ label: 'Cancel', kind: 'light' }, { label: 'Download', onclick: async function () {
          await Pages._saveExport('buildScoreTemplate', [{ classId: App.state.classId, termId: App.state.termId, subjectId: subj.value || null, format: fmtSel.value }]);
        } }]);
    }

    function importDialog() {
      var subj = U.select([{ value: '', label: '(none, file has subject names)' }].concat(sheet.subjects.map(function (s) { return { value: s.id, label: s.name }; })), '');
      var replace = h('input', { type: 'checkbox', checked: true });
      var onlyProblems = h('input', { type: 'checkbox' });
      var area = h('div', null, U.empty('Choose a file to see a preview. Nothing is saved until you click Import.'));
      var preview = null, importBtn;
      function drawPreview() {
        var lines = preview.lines.filter(function (l) { return !onlyProblems.checked || l.problems.length; });
        U.fill(area,
          h('div', { class: 'row', style: { margin: '8px 0' } }, h('b', null, preview.summary.lines + ' lines'), h('span', { class: 'badge ok' }, preview.summary.ok + ' will be saved'),
            h('span', { class: 'badge ' + (preview.summary.problems ? 'bad' : 'ok') }, preview.summary.problems + ' with problems'), h('span', { class: 'badge warn' }, preview.summary.unchanged + ' unchanged'),
            h('label', { class: 'row small' }, onlyProblems, 'Show problems only')),
          preview.warnings.length ? h('div', { class: 'card', style: { padding: '8px 12px' } }, preview.warnings.map(function (w) { return h('div', { class: 'small', style: { color: '#92400E' } }, '\u26A0 ' + w); })) : null,
          h('div', { class: 'tw', style: { maxHeight: '340px' } }, h('table', null,
            h('thead', null, h('tr', null, ['Line', 'Student', 'Subject', 'Now (CA / Exam)', 'File (CA / Exam)', 'Result'].map(function (t) { return h('th', null, t); }))),
            h('tbody', null, lines.map(function (l) {
              return h('tr', { class: l.problems.length ? 'bad' : '' }, h('td', null, l.line), h('td', null, l.student_name), h('td', null, l.subject_name),
                h('td', null, (l.current_ca || '\u2014') + ' / ' + (l.current_exam || '\u2014')), h('td', null, (l.new_ca || '\u2014') + ' / ' + (l.new_exam || '\u2014')),
                h('td', null, l.problems.length ? h('span', { class: 'msg-err' }, l.problems.join('; ')) : (l.apply ? h('span', { class: 'badge ok' }, 'Will save') : h('span', { class: 'muted small' }, 'No change'))));
            })))));
      }
      onlyProblems.addEventListener('change', function () { if (preview) drawPreview(); });
      var choose = h('button', { class: 'btn', onclick: safe(async function () {
        var file = await U.ipc(window.desktop.pickFile('sheet'));
        if (!file) return;
        preview = await api.previewScoreImport({ classId: App.state.classId, termId: App.state.termId, subjectId: subj.value || null, replace: replace.checked, file: file });
        importBtn.el.disabled = preview.summary.ok === 0;
        importBtn.el.textContent = 'Import ' + preview.summary.ok + ' scores';
        drawPreview();
      }) }, 'Choose file (.xlsx or .csv)...');
      importBtn = { label: 'Import', kind: 'gold', disabled: true, onclick: async function () {
        var r = await api.commitScoreImport({ termId: App.state.termId, lines: preview.lines });
        U.toast(r.saved + ' scores saved'); await loadSheet();
      } };
      U.modal('Import scores', h('div', null,
        h('div', { class: 'row' }, U.field('Subject for plain "CA" / "Exam" columns', subj), h('label', { class: 'row', style: { marginTop: '22px' } }, replace, 'Replace scores already entered')),
        h('p', { class: 'muted small' }, 'Blank cells never erase a score. Students are matched by admission number first, then by name.'),
        h('div', { class: 'row', style: { margin: '8px 0' } }, choose), area), [{ label: 'Close', kind: 'light' }, importBtn], { wide: true });
    }

    var modeTabs = h('div', { class: 'tabs', style: { marginBottom: '10px' } });
    function drawTabs() {
      U.fill(modeTabs, [['subject', 'Enter by subject'], ['student', 'Enter by student']].map(function (m) {
        return h('button', { class: mode === m[0] ? 'active' : '', onclick: function () { mode = m[0]; drawTabs(); draw(); } }, m[1]);
      }));
    }
    drawTabs();
    U.fill(root,
      h('div', { class: 'row', style: { marginBottom: '8px' } }, App.classSelect(common.classes, loadSheet), App.termSelect(common.terms, loadSheet), progress, h('span', { class: 'grow' }),
        h('button', { class: 'btn light', onclick: function () { if (sheet) templateDialog(); } }, 'Download template'),
        h('button', { class: 'btn light', onclick: function () { if (sheet) importDialog(); } }, 'Import scores')),
      modeTabs, body);
    await loadSheet();
  };
})();
