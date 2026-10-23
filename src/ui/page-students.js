'use strict';
(function () {
  var h = U.h, api = U.api, safe = U.safe;

  async function saveExport(name, args) {
    var r = await U.ipc(window.desktop.exportFile(name, args));
    if (r) U.toast('Saved: ' + r.path);
    return r;
  }
  Pages._saveExport = saveExport;

  Pages.students = async function (root) {
    var common = await App.common();
    var classes = common.classes;
    var search = '', list = [];
    var tableBox = h('div'), countLbl = h('span', { class: 'muted' });

    async function load() {
      list = await api.listStudents({ classId: App.state.classId || undefined, search: search });
      countLbl.textContent = list.length + ' students';
      drawTable();
    }

    function drawTable() {
      if (!list.length) { U.fill(tableBox, U.empty('No students found. Add a student or import a list.')); return; }
      U.fill(tableBox, h('div', { class: 'tw' }, h('table', null,
        h('thead', null, h('tr', null, ['#', 'Admission No', 'Full name', 'Gender', 'Class', 'Status', 'Actions'].map(function (t) { return h('th', null, t); }))),
        h('tbody', null, list.map(function (s, i) {
          return h('tr', null, h('td', null, i + 1), h('td', null, s.admission_no || '\u2014'), h('td', null, h('b', null, s.full_name)), h('td', null, s.gender), h('td', null, s.class_name),
            h('td', null, h('span', { class: 'badge ' + (s.is_active ? 'ok' : 'warn') }, s.is_active ? 'Active' : 'Inactive')),
            h('td', null, h('div', { class: 'row' },
              h('button', { class: 'btn light sm', onclick: function () { editDialog(s); } }, 'Edit'),
              h('button', { class: 'btn danger sm', onclick: safe(async function () {
                if (await U.confirmBox('Delete ' + s.full_name + '? Their scores, ratings and remarks are deleted too. This cannot be undone.', 'Delete', true)) { await api.deleteStudent(s.id); await App.common(); await load(); }
              }) }, 'Delete'))));
        })))));
    }

    function editDialog(s) {
      var isNew = !s;
      s = s || { full_name: '', gender: 'M', admission_no: '', class_id: App.state.classId || (classes[0] && classes[0].id), is_active: true };
      var name = h('input', { type: 'text', value: s.full_name, style: { width: '100%' } });
      var gender = U.select([{ value: 'M', label: 'Male (M)' }, { value: 'F', label: 'Female (F)' }], s.gender);
      var adm = h('input', { type: 'text', value: s.admission_no || '', style: { width: '100%' }, placeholder: 'Optional' });
      var cls = U.select(classes.map(function (c) { return { value: c.id, label: c.name }; }), s.class_id);
      var active = h('input', { type: 'checkbox', checked: s.is_active });
      var body = h('div', null, U.field('Full name', name), U.field('Gender', gender), U.field('Admission number', adm), U.field('Class', cls),
        isNew ? null : h('label', { class: 'row', style: { marginTop: '10px' } }, active, 'Active student (inactive students are left out of scores and results)'));
      U.modal(isNew ? 'Add student' : 'Edit student', body, [{ label: 'Cancel', kind: 'light' }, { label: 'Save', onclick: async function () {
        var f = { full_name: name.value, gender: gender.value, admission_no: adm.value, class_id: cls.value };
        if (isNew) await api.addStudent(f); else { f.is_active = active.checked; await api.updateStudent(s.id, f); }
        await App.common(); await load();
      } }]);
      setTimeout(function () { name.focus(); }, 30);
    }

    function importDialog() {
      if (!classes.length) { U.toast('Add a class first.', true); return; }
      var clsSel = U.select(classes.map(function (c) { return { value: c.id, label: c.name }; }), App.state.classId || classes[0].id);
      var area = h('div', null, U.empty('Choose a file to see a preview before anything is saved.'));
      var rows = [], onlyProblems = h('input', { type: 'checkbox' }), summary = h('div', { class: 'row', style: { margin: '8px 0' } });
      var importBtn;
      function drawPreview() {
        var shown = rows.filter(function (r) { return !onlyProblems.checked || !r.ok; });
        U.fill(area, summary, h('label', { class: 'row small' }, onlyProblems, 'Show problems only'),
          h('div', { class: 'tw', style: { maxHeight: '340px', marginTop: '8px' } }, h('table', null,
            h('thead', null, h('tr', null, ['Line', 'Full name', 'Gender', 'Admission No', 'Status'].map(function (t) { return h('th', null, t); }))),
            h('tbody', null, shown.map(function (r) {
              return h('tr', { class: r.ok ? '' : 'bad' }, h('td', null, r.line), h('td', null, r.full_name), h('td', null, r.gender), h('td', null, r.admission_no),
                h('td', null, r.ok ? h('span', { class: 'badge ok' }, 'OK') : h('span', { class: 'msg-err' }, r.problems.join('; '))));
            })))));
      }
      onlyProblems.addEventListener('change', drawPreview);
      var chooseBtn = h('button', { class: 'btn', onclick: safe(async function () {
        var file = await U.ipc(window.desktop.pickFile('sheet'));
        if (!file) return;
        var prev = await api.previewStudentImport({ classId: clsSel.value, file: file });
        rows = prev.rows;
        U.fill(summary, h('b', null, prev.summary.total + ' rows'), h('span', { class: 'badge ok' }, prev.summary.ok + ' ready'), h('span', { class: 'badge ' + (prev.summary.problems ? 'bad' : 'ok') }, prev.summary.problems + ' with problems'));
        importBtn.el.disabled = prev.summary.ok === 0;
        importBtn.label = 'Import ' + prev.summary.ok + ' students';
        importBtn.el.textContent = importBtn.label;
        drawPreview();
      }) }, 'Choose file (.xlsx or .csv)...');
      var tplX = h('button', { class: 'btn light sm', onclick: safe(function () { return saveExport('buildStudentTemplate', [{ format: 'xlsx' }]); }) }, 'Download template (.xlsx)');
      var tplC = h('button', { class: 'btn light sm', onclick: safe(function () { return saveExport('buildStudentTemplate', [{ format: 'csv' }]); }) }, 'Template (.csv)');
      importBtn = { label: 'Import', kind: 'gold', disabled: true, onclick: async function () {
        var r = await api.commitStudentImport({ classId: clsSel.value, rows: rows });
        U.toast(r.imported + ' students imported' + (r.skipped ? ', ' + r.skipped + ' skipped' : ''));
        await App.common(); await load();
      } };
      U.modal('Import students', h('div', null, h('div', { class: 'row' }, h('span', null, 'Into class:'), clsSel, h('span', { class: 'grow' }), tplX, tplC),
        h('div', { class: 'row', style: { margin: '12px 0' } }, chooseBtn), area), [{ label: 'Close', kind: 'light' }, importBtn], { wide: true });
    }

    var searchBox = h('input', { type: 'text', placeholder: 'Search name or admission number', style: { width: '260px' } });
    searchBox.addEventListener('input', U.debounce(function () { search = searchBox.value; load(); }, 200));
    U.fill(root,
      h('div', { class: 'row', style: { marginBottom: '12px' } }, App.classSelect(classes, load, true), searchBox, countLbl, h('span', { class: 'grow' }),
        h('button', { class: 'btn light', onclick: safe(function () { return saveExport('buildStudentTemplate', [{ format: 'xlsx' }]); }) }, 'Download template'),
        h('button', { class: 'btn light', onclick: importDialog }, 'Import students'),
        h('button', { class: 'btn', onclick: function () { if (!classes.length) U.toast('Add a class first.', true); else editDialog(null); } }, '+ Add student')),
      tableBox);
    await load();
  };
})();
