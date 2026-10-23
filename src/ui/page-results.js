'use strict';
(function () {
  var h = U.h, api = U.api, safe = U.safe, fmt = U.fmt;

  Pages.results = async function (root) {
    var common = await App.common();
    var tab = 'class', res = null, detailId = null, search = '';
    var body = h('div'), tabsBox = h('div', { class: 'tabs' });

    var avg = function (v) { return v === null || v === undefined ? '\u2014' : Calc.formatAverage(v); };
    var pos = function (p) { return p ? Calc.ordinal(p) : '\u2014'; };

    async function load() {
      if (!App.state.classId || !App.state.termId) { U.fill(body, U.empty('Add a class and a term first.')); return; }
      res = await api.getClassResults(App.state.classId, App.state.termId);
      if (!res.students.some(function (s) { return s.student_id === detailId; })) detailId = res.students.length ? res.students[0].student_id : null;
      await draw();
    }

    function sortedByPosition() {
      return res.students.slice().sort(function (a, b) { return (a.position || 9999) - (b.position || 9999) || a.full_name.localeCompare(b.full_name); });
    }

    function classTab() {
      var q = search.trim().toLowerCase();
      var rows = sortedByPosition().filter(function (r) { return !q || r.full_name.toLowerCase().indexOf(q) >= 0 || (r.admission_no || '').toLowerCase().indexOf(q) >= 0; });
      var incomplete = res.students.filter(function (r) { return r.incomplete; });
      var searchBox = h('input', { type: 'text', placeholder: 'Search student', value: search, style: { width: '240px' } });
      searchBox.id = 'res-search';
      searchBox.addEventListener('input', U.debounce(function () { search = searchBox.value; draw().then(function () { var el = document.getElementById('res-search'); if (el) { el.focus(); var n = el.value.length; if (el.setSelectionRange) el.setSelectionRange(n, n); } }); }, 250));
      return h('div', null,
        h('div', { class: 'cards' },
          h('div', { class: 'stat' }, h('div', { class: 'muted small' }, 'Highest total'), h('div', { class: 'n' }, res.stats.highest === null ? '\u2014' : fmt(res.stats.highest))),
          h('div', { class: 'stat' }, h('div', { class: 'muted small' }, 'Lowest total'), h('div', { class: 'n' }, res.stats.lowest === null ? '\u2014' : fmt(res.stats.lowest))),
          h('div', { class: 'stat' }, h('div', { class: 'muted small' }, 'Class average'), h('div', { class: 'n' }, avg(res.stats.class_average))),
          h('div', { class: 'stat' }, h('div', { class: 'muted small' }, 'Students with scores'), h('div', { class: 'n' }, res.stats.ranked + ' / ' + res.class_size))),
        incomplete.length ? h('div', { class: 'card', style: { background: '#FFF9EC', borderColor: 'var(--gold)' } }, h('b', null, '\u26A0 ' + incomplete.length + ' student(s) have missing scores: '),
          h('span', { class: 'small' }, incomplete.slice(0, 12).map(function (r) { return r.full_name; }).join(', ') + (incomplete.length > 12 ? ' and ' + (incomplete.length - 12) + ' more' : ''))) : null,
        h('div', { class: 'row', style: { marginBottom: '8px' } }, searchBox),
        res.students.length ? h('div', { class: 'tw' }, h('table', null,
          h('thead', null, h('tr', null, ['Position', 'Student', 'Admission No', 'Subjects scored', 'Total', 'Average', ''].map(function (t, i) { return h('th', { class: i === 0 || i >= 3 ? 'c' : '' }, t); }))),
          h('tbody', null, rows.map(function (r) {
            return h('tr', { class: r.position && r.position <= 3 ? 'top3' : '' }, h('td', { class: 'c' }, h('b', null, pos(r.position))), h('td', null, r.full_name), h('td', null, r.admission_no || '\u2014'),
              h('td', { class: 'c' }, r.subject_count + ' / ' + res.subjects.length), h('td', { class: 'c' }, r.subject_count ? fmt(r.total) : '\u2014'), h('td', { class: 'c' }, avg(r.average)),
              h('td', { class: 'c' }, r.incomplete ? h('span', { class: 'badge warn' }, 'Incomplete') : h('span', { class: 'badge ok' }, 'Complete')));
          })))) : U.empty('No students in this class yet.'));
    }

    async function detailTab() {
      if (!detailId) return U.empty('No students in this class yet.');
      var r = res.students.filter(function (s) { return s.student_id === detailId; })[0];
      var extras = await api.getStudentExtras(detailId, App.state.termId);
      var traits = await api.listTraits();
      var traitList = function (group, title) {
        var items = traits.filter(function (t) { return t.group === group && extras.ratings[t.id]; });
        return h('div', { class: 'card grow' }, h('h3', null, title), items.length ? items.map(function (t) { return h('div', { class: 'row small' }, h('span', { class: 'grow' }, t.name), h('b', null, extras.ratings[t.id] + ' / 5')); }) : h('span', { class: 'muted small' }, 'No ratings entered.'));
      };
      return h('div', null,
        h('div', { class: 'row', style: { marginBottom: '10px' } }, h('b', null, 'Student:'),
          U.select(res.students.map(function (s) { return { value: s.student_id, label: s.full_name }; }), detailId, function (v) { detailId = v; draw(); }, { style: { minWidth: '280px' } }),
          h('button', { class: 'btn gold sm', onclick: function () { reportDialog(detailId); } }, 'Print this report card')),
        h('div', { class: 'cards' },
          h('div', { class: 'stat' }, h('div', { class: 'muted small' }, 'Marks obtained'), h('div', { class: 'n' }, fmt(r.total)), h('div', { class: 'muted small' }, 'out of ' + res.subjects.length * 100)),
          h('div', { class: 'stat' }, h('div', { class: 'muted small' }, 'Average'), h('div', { class: 'n' }, avg(r.average) + '%')),
          h('div', { class: 'stat' }, h('div', { class: 'muted small' }, 'Position'), h('div', { class: 'n' }, pos(r.position)), h('div', { class: 'muted small' }, 'out of ' + res.class_size))),
        h('div', { class: 'tw', style: { maxHeight: 'none', marginBottom: '14px' } }, h('table', null,
          h('thead', null, h('tr', null, ['Subject', 'CA', 'Exam', 'Total', 'Grade', 'Remark'].map(function (t, i) { return h('th', { class: i && i < 5 ? 'c' : '' }, t); }))),
          h('tbody', null, r.subjects.map(function (s) {
            return h('tr', null, h('td', null, s.name), h('td', { class: 'c' }, s.ca === null ? '' : fmt(s.ca)), h('td', { class: 'c' }, s.exam === null ? '' : fmt(s.exam)), h('td', { class: 'c' }, s.total === null ? '' : h('b', null, fmt(s.total))),
              h('td', { class: 'c' + (s.grade.toUpperCase() === 'F' ? ' fail' : '') }, s.grade), h('td', null, s.remark));
          })))),
        h('div', { class: 'row', style: { alignItems: 'flex-start' } }, traitList('skill', 'Skills'), traitList('behaviour', 'Behaviour')),
        h('div', { class: 'card' }, h('h3', null, 'Remarks'), h('div', { class: 'small' }, h('b', null, "Class master: "), extras.remarks.class_master || '(none, will be left blank for handwriting)'),
          h('div', { class: 'small', style: { marginTop: '6px' } }, h('b', null, "Director: "), extras.remarks.director || '(none, will be left blank for handwriting)')));
    }

    function broadsheetRows() { return sortedByPosition(); }
    function broadsheetTab() {
      if (!res.students.length) return U.empty('No students in this class yet.');
      var rows = broadsheetRows();
      var stick = function (left, w) { return { position: 'sticky', left: left + 'px', background: '#fff', minWidth: w + 'px', zIndex: 1 }; };
      return h('div', null,
        h('div', { class: 'row', style: { marginBottom: '10px' } },
          h('button', { class: 'btn', onclick: safe(function () { return Pages._saveExport('buildBroadsheet', [{ classId: App.state.classId, termId: App.state.termId, format: 'xlsx' }]); }) }, 'Export to Excel'),
          h('button', { class: 'btn light', onclick: safe(function () { return Pages._saveExport('buildBroadsheet', [{ classId: App.state.classId, termId: App.state.termId, format: 'csv' }]); }) }, 'Export CSV'),
          h('button', { class: 'btn light', onclick: safe(printBroadsheet) }, 'Print')),
        h('div', { class: 'tw' }, h('table', null,
          h('thead', null, h('tr', null, h('th', { class: 'c', style: Object.assign(stick(0, 70), { background: 'var(--navy)', zIndex: 3 }) }, 'Pos'), h('th', { style: Object.assign(stick(70, 200), { background: 'var(--navy)', zIndex: 3 }) }, 'Student'),
            res.subjects.map(function (s) { return h('th', { class: 'c' }, s.name); }), h('th', { class: 'c' }, 'Total'), h('th', { class: 'c' }, 'Average'))),
          h('tbody', null, rows.map(function (r) {
            return h('tr', null, h('td', { class: 'c', style: stick(0, 70) }, h('b', null, pos(r.position))), h('td', { style: stick(70, 200) }, r.full_name),
              r.subjects.map(function (s) { return h('td', { class: 'c' + (s.grade.toUpperCase() === 'F' ? ' fail' : '') }, s.total === null ? '' : fmt(s.total)); }),
              h('td', { class: 'c' }, h('b', null, r.subject_count ? fmt(r.total) : '')), h('td', { class: 'c' }, avg(r.average)));
          })))));
    }

    async function printBroadsheet() {
      var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
      var rows = broadsheetRows();
      var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;font-size:9pt}h3{margin:0 0 6px}' +
        'table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:3px 4px;text-align:center}th{background:#0B1F4B;color:#fff}td.l{text-align:left}</style></head><body>' +
        '<h3>' + esc(res.class.name) + ' broadsheet \u2013 ' + esc(res.term.name) + ', ' + esc(res.term.session_name) + '</h3><table><tr><th>Pos</th><th>Student</th>' +
        res.subjects.map(function (s) { return '<th>' + esc(s.name) + '</th>'; }).join('') + '<th>Total</th><th>Average</th></tr>' +
        rows.map(function (r) {
          return '<tr><td>' + esc(pos(r.position)) + '</td><td class="l">' + esc(r.full_name) + '</td>' + r.subjects.map(function (s) { return '<td>' + (s.total === null ? '' : fmt(s.total)) + '</td>'; }).join('') +
            '<td><b>' + (r.subject_count ? fmt(r.total) : '') + '</b></td><td>' + avg(r.average) + '</td></tr>';
        }).join('') + '</table></body></html>';
      await U.ipc(window.desktop.printHtml(html));
    }

    function reportDialog(oneId) {
      if (!res || !res.students.length) { U.toast('There are no students in this class.', true); return; }
      var scope = U.select([{ value: 'class', label: 'Whole class (' + res.students.length + ' students)' }, { value: 'one', label: 'One student' }], oneId ? 'one' : 'class');
      var stu = U.select(res.students.map(function (s) { return { value: s.student_id, label: s.full_name }; }), oneId || detailId || res.students[0].student_id, null, { style: { width: '100%' } });
      var order = U.select([{ value: 'name', label: 'By name (A to Z)' }, { value: 'position', label: 'By position (1st first)' }], 'name');
      var rem = h('input', { type: 'checkbox', checked: true });
      var separate = h('input', { type: 'checkbox' });
      var stuField = U.field('Student', stu), sepRow = h('label', { class: 'row', style: { marginTop: '10px' } }, separate, 'Save a separate PDF file for each student (into a folder)');
      var status = h('div', { style: { marginTop: '12px' } });
      function sync() { stuField.style.display = scope.value === 'one' ? 'block' : 'none'; sepRow.style.display = scope.value === 'class' ? 'flex' : 'none'; }
      scope.addEventListener('change', sync); sync();
      var cancelBtn = null;
      var gen = { label: 'Generate PDF', kind: 'gold', keepOpen: true, onclick: async function (close, btn) {
        btn.disabled = true;
        U.fill(status, h('div', null, h('span', { class: 'spin' }), h('span', { id: 'pdfmsg' }, 'Creating report cards, please wait...')));
        var msgEl = status.firstChild.lastChild;
        window.desktop.onPdfProgress(function (p) { msgEl.textContent = 'Creating report cards: ' + p.done + ' of ' + p.total; });
        try {
          var r = await U.ipc(window.desktop.generatePdf({ classId: App.state.classId, termId: App.state.termId, studentIds: scope.value === 'one' ? [stu.value] : null,
            order: order.value, includeRemarks: rem.checked, separate: scope.value === 'class' && separate.checked }));
          if (!r) { U.clear(status); btn.disabled = false; return false; }
          var isFolder = !!r.folder;
          U.fill(status, h('div', { class: 'card', style: { background: '#F0FDF4', borderColor: '#86EFAC' } },
            h('b', null, '\u2713 ' + r.count + ' report card' + (r.count === 1 ? '' : 's') + ' saved' + (r.cancelled ? ' (stopped early)' : '')), h('div', { class: 'small muted', style: { margin: '4px 0 8px', wordBreak: 'break-all' } }, r.path),
            h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: safe(function () { return U.ipc(window.desktop.openPath(r.path)); }) }, isFolder ? 'Open folder' : 'Open PDF (print from there)'),
              isFolder ? null : h('button', { class: 'btn light sm', onclick: safe(function () { return U.ipc(window.desktop.showInFolder(r.path)); }) }, 'Show in folder'))));
          btn.disabled = false;
        } catch (e) { U.clear(status); btn.disabled = false; throw e; }
        return false;
      } };
      U.modal('Generate report cards', h('div', null, U.field('Print', scope), stuField, U.field('Order', order),
        h('label', { class: 'row', style: { marginTop: '10px' } }, rem, 'Include the typed remarks (otherwise leave lines for handwriting)'), sepRow, status,
        h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn light sm', onclick: function () { window.desktop.cancelPdf(); } }, 'Stop a running batch'))),
        [{ label: 'Close', kind: 'light' }, gen]);
    }

    async function draw() {
      U.fill(tabsBox, [['class', 'Class results'], ['detail', 'Student detail'], ['sheet', 'Broadsheet']].map(function (t) {
        return h('button', { class: tab === t[0] ? 'active' : '', onclick: function () { tab = t[0]; draw(); } }, t[1]);
      }));
      if (tab === 'class') U.fill(body, classTab());
      else if (tab === 'sheet') U.fill(body, broadsheetTab());
      else U.fill(body, await detailTab());
    }

    U.fill(root,
      h('div', { class: 'row', style: { marginBottom: '10px' } }, App.classSelect(common.classes, load), App.termSelect(common.terms, load), h('span', { class: 'grow' }),
        h('button', { class: 'btn gold', onclick: function () { reportDialog(null); } }, 'Generate report cards (PDF)')),
      tabsBox, body);
    await load();
  };
})();
