'use strict';
(function () {
  var h = U.h, api = U.api, safe = U.safe;
  var NAV = [
    ['dashboard', 'Dashboard', '\u25A6'], ['classes', 'Classes & Subjects', '\u25A4'], ['students', 'Students', '\u263A'],
    ['scores', 'Scores', '\u270E'], ['results', 'Results & Reports', '\u2605'], ['settings', 'Settings', '\u2699'], ['backup', 'Backup & Data', '\u21BB']
  ];
  var App = window.App = { state: { classId: null, termId: null, info: null, page: 'dashboard' } };

  // fresh classes + terms; also repairs the remembered class/term selection
  App.common = async function () {
    var info = await api.getAppInfo();
    var classes = await api.listClasses();
    var terms = await api.listTerms();
    var st = App.state;
    st.info = info;
    if (!classes.some(function (c) { return c.id === st.classId; })) st.classId = classes.length ? classes[0].id : null;
    if (!terms.some(function (t) { return t.id === st.termId; })) st.termId = info.current_term ? info.current_term.id : (terms.length ? terms[0].id : null);
    return { info: info, classes: classes, terms: terms };
  };
  App.termLabel = function (t) { return t.name + ' \u2013 ' + t.session_name + (t.is_current ? ' (current)' : ''); };
  App.classSelect = function (classes, onchange, withAll) {
    var items = (withAll ? [{ value: '', label: 'All classes' }] : []).concat(classes.map(function (c) { return { value: c.id, label: c.name }; }));
    return U.select(items, App.state.classId || '', function (v) { App.state.classId = v || null; onchange(v); });
  };
  App.termSelect = function (terms, onchange) {
    return U.select(terms.map(function (t) { return { value: t.id, label: App.termLabel(t) }; }), App.state.termId, function (v) { App.state.termId = v; onchange(v); });
  };

  var content, topTitle, topChip;

  async function renderShell() {
    var info = App.state.info;
    var app = document.getElementById('app');
    U.clear(app);
    var logo = info.logo ? h('img', { src: info.logo, alt: '' }) : h('div', { class: 'ico', style: { fontSize: '26px' } }, '\uD83C\uDF93');
    var nav = h('div', { class: 'nav' }, NAV.map(function (n) {
      return h('button', { 'data-page': n[0], onclick: function () { App.go(n[0]); } }, h('span', { class: 'ico' }, n[2]), n[1]);
    }));
    var side = h('div', { class: 'side' },
      h('div', { class: 'brand' }, logo, h('div', null, h('div', { class: 'bt' }, info.settings.school_name || 'GDSS Dutse Results'), h('div', { class: 'bs' }, 'Results Manager'))),
      nav, h('div', { class: 'foot' }, 'Works offline. Data is saved on this computer.'));
    topTitle = h('div', { class: 'title' }, '');
    topChip = h('div', { class: 'chip' }, '');
    content = h('div', { id: 'content' });
    app.append(side, h('div', { class: 'main' }, h('div', { class: 'top' }, topTitle, h('div', { class: 'sp' }), topChip), content));
    App.nav = nav;
    updateTop();
  }
  function updateTop() {
    var t = App.state.info && App.state.info.current_term;
    topChip.textContent = t ? t.name + ' \u2022 ' + t.session_name : 'No current term set';
  }
  App.refreshTop = async function () { App.state.info = await api.getAppInfo(); updateTop(); };

  App.go = safe(async function (name, params) {
    if (!Pages[name]) return;
    App.state.page = name;
    Array.prototype.forEach.call(App.nav.children, function (b) { b.className = b.getAttribute('data-page') === name ? 'active' : ''; });
    var label = NAV.filter(function (n) { return n[0] === name; })[0][1];
    topTitle.textContent = label;
    U.fill(content, U.spinner('Loading...'));
    var holder = h('div');
    try {
      await Pages[name](holder, params || {});
      U.fill(content, holder);
    } catch (e) {
      U.fill(content, h('div', { class: 'card' }, h('h3', null, 'Could not open this page'), h('p', { class: 'msg-err' }, e.message || String(e))));
    }
  });

  // ---------------------------------------------------------------- first-run wizard
  function wizard() {
    return new Promise(function (resolve) {
      var data = { school_name: '', board_name: '', address: '' };
      var y = new Date().getFullYear();
      var sessionName = y + '/' + (y + 1), currentTermNo = '1';
      var levelRows = ['SS1', 'SS2', 'SS3'].map(function (l) {
        return { level: l, on: h('input', { type: 'checkbox', checked: true }), streams: h('input', { type: 'text', value: 'A', style: { width: '160px' } }) };
      });
      var overlay = h('div', { class: 'wizard' });
      document.body.append(overlay);

      function stepper(n) { return h('div', { class: 'steps' }, [1, 2, 3].map(function (i) { return h('i', { class: i <= n ? 'on' : '' }); })); }
      function frame(n, title, body, buttons) {
        U.fill(overlay, h('div', { class: 'box' }, stepper(n), h('h2', null, title), body, h('div', { class: 'row end', style: { marginTop: '18px' } }, buttons)));
      }

      function step1() {
        var name = h('input', { type: 'text', value: data.school_name, style: { width: '100%' } });
        var board = h('input', { type: 'text', value: data.board_name, style: { width: '100%' } });
        var addr = h('input', { type: 'text', value: data.address, style: { width: '100%' } });
        var prev = h('div', { class: 'logo-prev' }, 'Logo');
        var pick = h('button', { class: 'btn light sm', onclick: safe(async function () {
          var url = await U.ipc(window.desktop.pickLogo());
          if (url) U.fill(prev, h('img', { src: url, alt: '' }));
        }) }, 'Choose logo (optional)');
        frame(1, 'Welcome. Tell us about your school',
          h('div', null, U.field('School name', name), U.field('Education board / ministry (printed on report cards)', board), U.field('School address', addr),
            h('div', { class: 'row', style: { marginTop: '12px' } }, prev, pick)),
          [h('button', { class: 'btn', onclick: safe(async function () {
            data = { school_name: name.value, board_name: board.value, address: addr.value };
            await api.saveSettings(data);
            step2();
          }) }, 'Next')]);
        setTimeout(function () { name.focus(); }, 30);
      }

      function step2() {
        var sess = h('input', { type: 'text', value: sessionName });
        var term = U.select([{ value: '1', label: 'First Term' }, { value: '2', label: 'Second Term' }, { value: '3', label: 'Third Term' }], currentTermNo);
        frame(2, 'Academic session and term',
          h('div', null, U.field('Session (two consecutive years)', sess), U.field('Which term are you working on now?', term),
            h('p', { class: 'muted small' }, 'You can add dates and more sessions later in Settings.')),
          [h('button', { class: 'btn light', onclick: step1 }, 'Back'), h('button', { class: 'btn', onclick: safe(async function () {
            sessionName = sess.value; currentTermNo = term.value;
            var existing = (await api.listSessions()).filter(function (s) { return s.name === sessionName.trim(); })[0];
            if (!existing) existing = (await api.createSession(sessionName)).filter(function (s) { return s.name === sessionName.trim(); })[0];
            var t = existing.terms.filter(function (x) { return String(x.term_number) === currentTermNo; })[0];
            await api.setCurrentTerm(t.id);
            step3();
          }) }, 'Next')]);
      }

      function step3() {
        frame(3, 'Add your classes',
          h('div', null, h('p', { class: 'muted' }, 'Tick the levels you have and type the streams separated by commas (for example A, B, C). Leave streams empty for a single class.'),
            levelRows.map(function (r) { return h('div', { class: 'row', style: { marginBottom: '8px' } }, r.on, h('b', { style: { width: '50px' } }, r.level), h('span', { class: 'muted' }, 'Streams:'), r.streams); })),
          [h('button', { class: 'btn light', onclick: step2 }, 'Back'), h('button', { class: 'btn gold', onclick: safe(async function () {
            for (var i = 0; i < levelRows.length; i++) {
              var r = levelRows[i];
              if (!r.on.checked) continue;
              var streams = r.streams.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
              if (!streams.length) streams = [''];
              for (var j = 0; j < streams.length; j++) { try { await api.addClass({ level: r.level, stream: streams[j] }); } catch (e) { /* already exists */ } }
            }
            await api.completeSetup();
            overlay.remove();
            resolve();
          }) }, 'Finish and open the app')]);
      }
      step1();
    });
  }

  App.init = async function () {
    try {
      await App.common();
      if (!App.state.info.setup_done) { await wizard(); await App.common(); }
      await renderShell();
      await App.go('dashboard');
    } catch (e) {
      document.body.append(h('div', { class: 'card', style: { margin: '40px' } }, h('h3', null, 'The app could not start'), h('p', { class: 'msg-err' }, e.message || String(e))));
    }
  };

  document.addEventListener('DOMContentLoaded', function () { App.init(); });
})();
