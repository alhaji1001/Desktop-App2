'use strict';
// Small helpers shared by all screens (no frameworks, no network).
(function () {
  function add(el, kids) {
    kids.flat(Infinity).forEach(function (k) {
      if (k === null || k === undefined || k === false) return;
      el.append(k && k.nodeType ? k : document.createTextNode(String(k)));
    });
  }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    add(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function fill(el) { clear(el); add(el, Array.prototype.slice.call(arguments, 1)); return el; }

  async function call(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    var r = await window.desktop.call.apply(null, [name].concat(args));
    if (!r.ok) throw new Error(r.error);
    return r.data;
  }
  var api = new Proxy({}, { get: function (_t, name) { return function () { return call.apply(null, [name].concat(Array.prototype.slice.call(arguments))); }; } });
  async function ipc(promise) { var r = await promise; if (!r.ok) throw new Error(r.error); return r.data; }

  function toast(msg, isErr) {
    var box = document.getElementById('toasts');
    var t = h('div', { class: 'toast' + (isErr ? ' err' : '') }, msg);
    box.append(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, isErr ? 7000 : 3500);
  }
  // wraps an async handler: any error becomes a red message instead of a crash
  function safe(fn) {
    return async function () {
      try { return await fn.apply(this, arguments); } catch (e) { toast(e.message || String(e), true); }
    };
  }

  function modal(title, body, buttons, opts) {
    opts = opts || {};
    var bg = h('div', { class: 'modal-bg' });
    var close = function () { if (bg.parentNode) bg.parentNode.removeChild(bg); if (opts.onclose) opts.onclose(); };
    var foot = h('div', { class: 'mf' });
    (buttons || [{ label: 'Close', kind: 'light' }]).forEach(function (b) {
      var btn = h('button', { class: 'btn ' + (b.kind || ''), disabled: !!b.disabled }, b.label);
      btn.addEventListener('click', safe(async function () {
        if (b.onclick) { var keep = await b.onclick(close, btn); if (keep === false) return; }
        if (!b.keepOpen) close();
      }));
      b.el = btn;
      foot.append(btn);
    });
    var m = h('div', { class: 'modal' + (opts.wide ? ' wide' : '') }, h('div', { class: 'mh' }, title), h('div', { class: 'mb' }, body), foot);
    bg.append(m);
    document.getElementById('modals').append(bg);
    return { close: close, el: m, buttons: buttons };
  }
  function confirmBox(message, okLabel, danger) {
    return new Promise(function (resolve) {
      var done = false;
      modal('Please confirm', h('p', null, message), [
        { label: 'Cancel', kind: 'light', onclick: function () { done = true; resolve(false); } },
        { label: okLabel || 'OK', kind: danger ? 'danger' : '', onclick: function () { done = true; resolve(true); } }
      ], { onclose: function () { if (!done) resolve(false); } });
    });
  }
  function promptBox(title, label, value, okLabel) {
    return new Promise(function (resolve) {
      var input = h('input', { type: 'text', value: value || '', style: { width: '100%' } });
      var done = false;
      var m = modal(title, h('label', { class: 'f' }, label, input), [
        { label: 'Cancel', kind: 'light', onclick: function () { done = true; resolve(null); } },
        { label: okLabel || 'Save', onclick: function () { done = true; resolve(input.value); } }
      ], { onclose: function () { if (!done) resolve(null); } });
      setTimeout(function () { input.focus(); }, 30);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { done = true; resolve(input.value); m.close(); } });
    });
  }

  function option(value, label, selected) { return h('option', { value: value, selected: !!selected }, label); }
  function select(items, value, onchange, attrs) {
    var s = h('select', attrs || {});
    items.forEach(function (it) { s.append(option(it.value, it.label, String(it.value) === String(value))); });
    s.value = value === undefined || value === null ? (items[0] ? items[0].value : '') : value;
    if (onchange) s.addEventListener('change', function () { onchange(s.value); });
    return s;
  }
  function field(label, input) { return h('label', { class: 'f' }, label, input); }
  function debounce(fn, ms) { var t; return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); }; }
  function fmt(v) { return Calc.formatScore(v); }
  function dateLabel(d) { return d ? Calc.formatDateLong(d) : '\u2014'; }
  function empty(msg) { return h('div', { class: 'empty' }, msg); }
  function spinner(text) { return h('div', { class: 'empty' }, h('span', { class: 'spin' }), text || 'Working...'); }

  window.U = { h: h, add: add, clear: clear, fill: fill, api: api, ipc: ipc, toast: toast, safe: safe, modal: modal, confirmBox: confirmBox, promptBox: promptBox,
    select: select, field: field, debounce: debounce, fmt: fmt, dateLabel: dateLabel, empty: empty, spinner: spinner, option: option };
  window.Pages = {};
})();
