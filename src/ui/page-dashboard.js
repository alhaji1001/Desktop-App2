'use strict';
(function () {
  var h = U.h, api = U.api;
  Pages.dashboard = async function (root) {
    var d = await api.getDashboard();
    var t = d.current_term;
    var go = function (page, classId) { return function () { if (classId) App.state.classId = classId; App.go(page); }; };
    U.fill(root,
      h('div', { class: 'cards' },
        h('div', { class: 'stat' }, h('div', { class: 'muted small' }, 'Students'), h('div', { class: 'n' }, d.totals.students)),
        h('div', { class: 'stat' }, h('div', { class: 'muted small' }, 'Classes'), h('div', { class: 'n' }, d.totals.classes)),
        h('div', { class: 'stat' }, h('div', { class: 'muted small' }, 'Subjects (all classes)'), h('div', { class: 'n' }, d.totals.subjects)),
        h('div', { class: 'stat' }, h('div', { class: 'muted small' }, 'Current term'), h('div', { style: { fontSize: '17px', fontWeight: 700, color: 'var(--navy)', marginTop: '6px' } }, t ? t.name : 'Not set'), h('div', { class: 'muted small' }, t ? t.session_name : 'Set it in Settings'))),
      h('div', { class: 'card' }, h('h3', null, 'Quick actions'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: go('students') }, 'Add or import students'),
          h('button', { class: 'btn', onclick: go('scores') }, 'Enter scores'),
          h('button', { class: 'btn gold', onclick: go('results') }, 'Generate report cards'),
          h('button', { class: 'btn light', onclick: go('backup') }, 'Backup now'))),
      h('div', { class: 'card' }, h('h3', null, 'Score entry progress' + (t ? ' \u2013 ' + t.name + ', ' + t.session_name : '')),
        d.classes.length ? h('div', null, d.classes.map(function (c) {
          return h('div', { style: { marginBottom: '12px' } },
            h('div', { class: 'row' }, h('b', { class: 'grow' }, c.name), h('span', { class: 'muted small' }, c.students + ' students \u2022 ' + c.subjects + ' subjects \u2022 ' + c.filled + ' of ' + c.expected + ' scores'),
              h('button', { class: 'btn light sm', onclick: go('scores', c.id) }, 'Open scores')),
            h('div', { class: 'bar' + (c.percent === 100 ? ' green' : ''), style: { marginTop: '6px' } }, h('i', { style: { width: c.percent + '%' } })));
        })) : U.empty('No classes yet. Add them under Classes & Subjects.')));
  };
})();
