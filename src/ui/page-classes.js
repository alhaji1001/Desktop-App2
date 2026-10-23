'use strict';
(function () {
  var h = U.h, api = U.api, safe = U.safe;
  Pages.classes = async function (root) {
    var common = await App.common();
    var levels = await api.getLevels();
    var suggestions = await api.suggestedSubjects();
    var listBox = h('div', { class: 'list' }), detail = h('div');
    var classes = common.classes;

    async function reload() { classes = await api.listClasses(); drawList(); await drawDetail(); }

    function drawList() {
      U.clear(listBox);
      var levelSel = U.select(levels.map(function (l) { return { value: l, label: l }; }), 'SS1');
      var stream = h('input', { type: 'text', placeholder: 'Stream (A, B...)', style: { width: '120px' } });
      listBox.append(h('div', { class: 'card' }, h('h3', null, 'Add a class'), h('div', { class: 'row' }, levelSel, stream,
        h('button', { class: 'btn sm', onclick: safe(async function () { await api.addClass({ level: levelSel.value, stream: stream.value }); stream.value = ''; await reload(); }) }, 'Add'))));
      levels.forEach(function (lv) {
        var inLevel = classes.filter(function (c) { return c.level === lv; });
        if (!inLevel.length) return;
        listBox.append(h('div', { class: 'grp' }, lv));
        inLevel.forEach(function (c) {
          listBox.append(h('div', { class: 'item' + (c.id === App.state.classId ? ' active' : ''), onclick: function () { App.state.classId = c.id; drawList(); drawDetail(); } },
            h('b', null, c.name), h('span', { class: 'muted small' }, c.students + ' students \u2022 ' + c.subjects + ' subjects')));
        });
      });
      if (!classes.length) listBox.append(U.empty('No classes yet.'));
    }

    async function drawDetail() {
      var c = classes.filter(function (x) { return x.id === App.state.classId; })[0];
      if (!c) { U.fill(detail, U.empty('Select or add a class.')); return; }
      var subjects = await api.listSubjects(c.id);
      var master = h('input', { type: 'text', value: c.class_master_name, placeholder: 'Optional, printed on report cards', style: { width: '320px' } });
      var newSub = h('input', { type: 'text', placeholder: 'New subject name', style: { width: '260px' } });
      var addSub = safe(async function () { if (!newSub.value.trim()) return; await api.addSubject(c.id, newSub.value); newSub.value = ''; await reload(); });
      newSub.addEventListener('keydown', function (e) { if (e.key === 'Enter') addSub(); });
      var have = {}; subjects.forEach(function (s) { have[s.name.toLowerCase()] = 1; });

      U.fill(detail,
        h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { class: 'grow', style: { margin: 0 } }, c.name),
          h('button', { class: 'btn light sm', onclick: function () { App.go('students'); } }, 'Students'),
          h('button', { class: 'btn light sm', onclick: function () { App.go('scores'); } }, 'Scores'),
          h('button', { class: 'btn danger sm', onclick: safe(async function () {
            if (await U.confirmBox('Delete the class ' + c.name + ' and its subjects? This only works when the class has no students.', 'Delete class', true)) { await api.deleteClass(c.id); App.state.classId = null; await App.common(); await reload(); }
          }) }, 'Delete class')),
          h('div', { class: 'row', style: { marginTop: '10px' } }, h('span', { class: 'muted' }, 'Class master name:'), master,
            h('button', { class: 'btn sm', onclick: safe(async function () { await api.updateClass(c.id, { class_master_name: master.value }); U.toast('Saved'); await reload(); }) }, 'Save'))),
        h('div', { class: 'card' }, h('div', { class: 'row' }, h('h3', { class: 'grow', style: { margin: 0 } }, 'Subjects (' + subjects.length + ')'),
          h('button', { class: 'btn light sm', onclick: function () { copyDialog(c, subjects); } }, 'Copy subjects to other classes')),
          h('div', { class: 'row', style: { margin: '12px 0' } }, newSub, h('button', { class: 'btn sm', onclick: addSub }, 'Add subject')),
          subjects.length ? h('table', null, h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Subject'), h('th', { style: { width: '260px' } }, 'Actions'))),
            h('tbody', null, subjects.map(function (s, i) {
              return h('tr', null, h('td', null, i + 1), h('td', null, s.name), h('td', null, h('div', { class: 'row' },
                h('button', { class: 'btn light sm', disabled: i === 0, onclick: safe(async function () { await api.moveSubject(s.id, -1); await reload(); }) }, '\u2191'),
                h('button', { class: 'btn light sm', disabled: i === subjects.length - 1, onclick: safe(async function () { await api.moveSubject(s.id, 1); await reload(); }) }, '\u2193'),
                h('button', { class: 'btn light sm', onclick: safe(async function () {
                  var n = await U.promptBox('Rename subject', 'Subject name', s.name); if (n !== null) { await api.renameSubject(s.id, n); await reload(); }
                }) }, 'Rename'),
                h('button', { class: 'btn danger sm', onclick: safe(async function () {
                  if (await U.confirmBox('Delete ' + s.name + '? Scores entered for this subject will also be deleted.', 'Delete', true)) { await api.deleteSubject(s.id); await reload(); }
                }) }, 'Delete'))));
            }))) : U.empty('No subjects yet. Add some below or tap the suggestions.'),
          h('div', { style: { marginTop: '14px' } }, h('div', { class: 'muted small', style: { marginBottom: '6px' } }, 'Quick add (click to add):'),
            h('div', { class: 'row' }, suggestions.filter(function (n) { return !have[n.toLowerCase()]; }).map(function (n) {
              return h('button', { class: 'btn light sm', onclick: safe(async function () { await api.addSubject(c.id, n); await reload(); }) }, '+ ' + n);
            })))));
    }

    function copyDialog(c, subjects) {
      var others = classes.filter(function (x) { return x.id !== c.id; });
      if (!others.length) { U.toast('Add another class first.', true); return; }
      var checks = others.map(function (o) { return { o: o, box: h('input', { type: 'checkbox' }) }; });
      U.modal('Copy subjects from ' + c.name, h('div', null, h('p', { class: 'muted' }, 'Subjects that a class already has are skipped.'),
        checks.map(function (k) { return h('label', { class: 'row', style: { marginBottom: '6px' } }, k.box, k.o.name); })), [
        { label: 'Cancel', kind: 'light' },
        { label: 'Copy ' + subjects.length + ' subjects', onclick: async function () {
          var ids = checks.filter(function (k) { return k.box.checked; }).map(function (k) { return k.o.id; });
          if (!ids.length) { U.toast('Tick at least one class.', true); return false; }
          var r = await api.copySubjects(c.id, ids); U.toast(r.added + ' subjects added'); await reload();
        } }]);
    }

    U.fill(root, h('div', { class: 'split' }, listBox, detail));
    drawList();
    await drawDetail();
  };
})();
