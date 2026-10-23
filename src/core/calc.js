'use strict';
// Pure calculation helpers (ported from the Android ResultCalculations.kt).
// Works both in Node (require) and in the browser (window.Calc).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function gradeFor(score, scale) {
    if (score === null || score === undefined || !isFinite(score) || score < 0 || score > 100) return null;
    var sorted = scale.slice().sort(function (a, b) { return b.min_score - a.min_score; });
    for (var i = 0; i < sorted.length; i++) if (score >= sorted[i].min_score) return sorted[i];
    return null;
  }

  function average(values) {
    var v = values.filter(function (x) { return x !== null && x !== undefined && isFinite(x); });
    if (!v.length) return null;
    return v.reduce(function (a, b) { return a + b; }, 0) / v.length;
  }

  function ordinal(n) {
    if (!n || n <= 0) return '\u2014';
    var lastTwo = n % 100, suffix;
    if (lastTwo >= 11 && lastTwo <= 13) suffix = 'th';
    else suffix = ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th';
    return n + suffix;
  }

  // Returns an error message or null. Empty text is allowed.
  function validateScore(text, maximum, label) {
    if (text === null || text === undefined) return null;
    var t = String(text).trim();
    if (t === '') return null;
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return label + ' must be a number.';
    var value = Number(t);
    if (!isFinite(value) || value < 0 || value > maximum) return label + ' must be between 0 and ' + maximum + '.';
    var dec = t.indexOf('.') >= 0 ? t.split('.')[1] : '';
    if (dec.length > 1 || (t.indexOf('.') >= 0 && dec.length === 0)) return label + ' allows one decimal place.';
    return null;
  }

  function formatAverage(v) {
    return (v === null || v === undefined ? 0 : v).toFixed(2);
  }

  // 25 -> "25", 25.5 -> "25.5"
  function formatScore(v) {
    if (v === null || v === undefined || v === '') return '';
    var n = Number(v);
    return n % 1 === 0 ? String(n) : n.toFixed(1);
  }

  // position = 1 + number of students with a strictly higher total (ties share a position)
  function position(total, allTotals) {
    var higher = 0;
    for (var i = 0; i < allTotals.length; i++) if (allTotals[i] > total) higher++;
    return 1 + higher;
  }

  function round1(v) { return Math.round(v * 10) / 10; }

  // "2026-09-14" -> "14th September 2026"
  function formatDateLong(raw) {
    if (!raw) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw));
    if (!m) return String(raw);
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var day = parseInt(m[3], 10), mon = parseInt(m[2], 10) - 1;
    if (mon < 0 || mon > 11) return String(raw);
    var suffix = (day % 100 >= 11 && day % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[day % 10] || 'th';
    return day + suffix + ' ' + months[mon] + ' ' + m[1];
  }

  return { gradeFor: gradeFor, average: average, ordinal: ordinal, validateScore: validateScore,
           formatAverage: formatAverage, formatScore: formatScore, position: position, round1: round1,
           formatDateLong: formatDateLong };
});
