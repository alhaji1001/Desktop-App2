'use strict';
(function () {
  var h = U.h, api = U.api, safe = U.safe;

  Pages.settings = async function (root, params) {
    var tab = (params && params.tab) || 'school';
    var body = h('div'), tabsBox = h('div', { class: 'tabs' });

    async function schoolTab() {
      var info = await api.getAppInfo();
      var s = info.settings;
      var name = h('input', { type: 'text', value: s.school_name, style: { width: '100%' } });
      var board = h('input', { type: 'text', value: s.board_name, style: { width: '100%' } });
      var addr = h('input', { type: 'text', value: s.address, style: { width: '100%' } });
      var prev = h('div', { class: 'logo-prev' }, info.logo ? h('img', { src: info.logo, alt: '' }) : 'No logo');
      return h('div', { class: 'card', style: { maxWidth: '640px' } }, h('h3', null, 'School details (printed on report cards)'),
        U.field('School name', name), U.field('Education board / ministry', board), U.field('Address', addr),
        h('div', { class: 'row', style: { marginTop: '14px' } }, prev,
          h('button', { class: 'btn light sm', onclick: safe(async function () { var url = await U.ipc(window.desktop.pickLogo()); if (url) { U.fill(prev, h('img', { src: url, alt: '' })); await App.refreshTop(); U.toast('Logo saved'); } }) }, 'Choose logo (PNG or JPG, up to 5 MB)'),
          h('button', { class: 'btn light sm', onclick: safe(async function () { await api.removeLogo(); U.fill(prev, 'No logo'); }) }, 'Remove logo')),
        h('div', { class: 'row end', style: { marginTop: '14px' } }, h('button', { class: 'btn', onclick: safe(async function () {
          await api.saveSettings({ school_name: name.value, board_name: board.value, address: addr.value }); await App.refreshTop(); U.toast('School details saved');
        }) }, 'Save')));
    }

    async function sessionsTab() {
      var sessions = await api.listSessions();
      var newName = h('input', { type: 'text', placeholder: 'e.g. 2027/2028' });
      var termCard = function (t) {
        var start = h('input', { type: 'date', value: t.start_date }), end = h('input', { type: 'date', value: t.end_date }), next = h('input', { type: 'date', value: t.next_term_begins });
        return h('tr', null, h('td', null, h('b', null, t.name), t.is_current ? h('span', { class: 'badge ok', style: { marginLeft: '8px' } }, 'Current') : null),
          h('td', null, start), h('td', null, end), h('td', null, next),
          h('td', null, h('div', { class: 'row' },
            h('button', { class: 'btn sm', onclick: safe(async function () { await api.updateTerm(t.id, { start_date: start.value, end_date: end.value, next_term_begins: next.value }); U.toast('Dates saved'); await App.refreshTop(); }) }, 'Save dates'),
            t.is_current ? null : h('button', { class: 'btn light sm', onclick: safe(async function () { await api.setCurrentTerm(t.id); await App.refreshTop(); await drawTab(); U.toast(t.name + ' is now the current term'); }) }, 'Make current'))));
      };
      return h('div', null,
        h('div', { class: 'card' }, h('h3', null, 'Add a session'), h('div', { class: 'row' }, newName,
          h('button', { class: 'btn', onclick: safe(async function () { await api.createSession(newName.value); newName.value = ''; await drawTab(); U.toast('Session created with 3 terms'); }) }, 'Create session'),
          h('span', { class: 'muted small' }, 'Use two consecutive years. Three terms are created automatically.'))),
        sessions.length ? sessions.map(function (s) {
          return h('div', { class: 'card' }, h('h3', null, 'Session ' + s.name), h('table', null,
            h('thead', null, h('tr', null, ['Term', 'Starts', 'Ends', 'Next term begins', ''].map(function (x) { return h('th', null, x); }))),
            h('tbody', null, s.terms.map(termCard))));
        }) : U.empty('No sessions yet. Create one above.'));
    }

    async function gradingTab() {
      var rows = (await api.getGrading()).map(function (g) { return { grade: g.grade, min_score: g.min_score, remark: g.remark }; });
      var tbody = h('tbody');
      function draw() {
        U.fill(tbody, rows.map(function (r, i) {
          var g = h('input', { type: 'text', value: r.grade, style: { width: '70px' } }), m = h('input', { type: 'number', value: r.min_score, style: { width: '90px' }, min: '0', max: '100', step: '1' }), k = h('input', { type: 'text', value: r.remark, style: { width: '220px' } });
          g.addEventListener('input', function () { r.grade = g.value; }); m.addEventListener('input', function () { r.min_score = m.value; }); k.addEventListener('input', function () { r.remark = k.value; });
          return h('tr', null, h('td', null, g), h('td', null, m), h('td', null, k), h('td', null, h('button', { class: 'btn danger sm', onclick: function () { rows.splice(i, 1); draw(); } }, 'Remove')));
        }));
      }
      draw();
      return h('div', { class: 'card', style: { maxWidth: '720px' } }, h('h3', null, 'Grading scale'),
        h('p', { class: 'muted small' }, 'A score gets the grade with the highest minimum score that it reaches. One grade must start at 0. Check these values against your school\u2019s official scale before printing report cards.'),
        h('table', null, h('thead', null, h('tr', null, ['Grade', 'Minimum score', 'Remark', ''].map(function (x) { return h('th', null, x); }))), tbody),
        h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn light', onclick: function () { rows.push({ grade: '', min_score: '', remark: '' }); draw(); } }, '+ Add grade'),
          h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: safe(async function () { await api.saveGrading(rows); U.toast('Grading scale saved'); await drawTab(); }) }, 'Save grading scale')));
    }

    async function traitsTab() {
      var traits = await api.listTraits();
      var col = function (group, title) {
        var items = traits.filter(function (t) { return t.group === group; });
        var input = h('input', { type: 'text', placeholder: 'New item', style: { width: '200px' } });
        var add = safe(async function () { if (!input.value.trim()) return; await api.addTrait(input.value, group); await drawTab(); });
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
        return h('div', { class: 'card grow' }, h('h3', null, title), h('div', { class: 'row', style: { marginBottom: '10px' } }, input, h('button', { class: 'btn sm', onclick: add }, 'Add')),
          items.length ? h('table', null, h('tbody', null, items.map(function (t, i) {
            return h('tr', null, h('td', null, t.name), h('td', null, h('div', { class: 'row' },
              h('button', { class: 'btn light sm', disabled: i === 0, onclick: safe(async function () { await api.moveTrait(t.id, -1); await drawTab(); }) }, '\u2191'),
              h('button', { class: 'btn light sm', disabled: i === items.length - 1, onclick: safe(async function () { await api.moveTrait(t.id, 1); await drawTab(); }) }, '\u2193'),
              h('button', { class: 'btn light sm', onclick: safe(async function () { var n = await U.promptBox('Rename', 'Name', t.name); if (n !== null) { await api.renameTrait(t.id, n); await drawTab(); } }) }, 'Rename'),
              h('button', { class: 'btn danger sm', onclick: safe(async function () { if (await U.confirmBox('Delete "' + t.name + '"? Ratings given for it are deleted too.', 'Delete', true)) { await api.deleteTrait(t.id); await drawTab(); } }) }, 'Delete'))));
          }))) : U.empty('Nothing here yet.'));
      };
      return h('div', { class: 'row', style: { alignItems: 'flex-start' } }, col('skill', 'Skills'), col('behaviour', 'Behaviour'));
    }

    async function promotionTab() {
      var classes = await api.listClasses();
      if (classes.length < 2) return U.empty('Add at least two classes to promote students.');
      var from = U.select(classes.map(function (c) { return { value: c.id, label: c.name + ' (' + c.students + ' students)' }; }), classes[0].id);
      var to = U.select(classes.map(function (c) { return { value: c.id, label: c.name }; }), classes[1].id);
      return h('div', { class: 'card', style: { maxWidth: '620px' } }, h('h3', null, 'Promote students'),
        h('p', { class: 'muted small' }, 'Moves every active student from one class to another (for example at the end of the session). Their old scores stay saved under the old class and term. Inactive students are not moved.'),
        U.field('Move students from', from), U.field('Move them to', to),
        h('div', { class: 'row end', style: { marginTop: '14px' } }, h('button', { class: 'btn gold', onclick: safe(async function () {
          if (from.value === to.value) { U.toast('Choose two different classes.', true); return; }
          if (!(await U.confirmBox('Move all active students from the first class to the second? Make a backup first if you are unsure.', 'Promote', false))) return;
          var r = await api.promoteStudents(from.value, to.value); U.toast(r.moved + ' students moved'); await drawTab();
        }) }, 'Promote students')));
    }

    var TABS = [['school', 'School', schoolTab], ['sessions', 'Sessions & Terms', sessionsTab], ['grading', 'Grading scale', gradingTab], ['traits', 'Skills & Behaviour', traitsTab], ['promotion', 'Promotion', promotionTab]];
    async function drawTab() {
      try {
        U.fill(tabsBox, TABS.map(function (t) { return h('button', { class: tab === t[0] ? 'active' : '', onclick: function () { tab = t[0]; drawTab(); } }, t[1]); }));
        var t = TABS.filter(function (x) { return x[0] === tab; })[0];
        U.fill(body, await t[2]());
      } catch (e) { U.toast(e.message || String(e), true); }
    }
    U.fill(root, tabsBox, body);
    await drawTab();
  };
})();
