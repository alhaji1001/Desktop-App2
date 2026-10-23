'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Calc = require('../src/core/calc');
const { parseCsv, toCsv } = require('../src/core/csv');
const { buildWorkbook, readXlsx, S } = require('../src/core/xlsx');

test('grade lookup uses the highest matching minimum score', () => {
  const scale = [{ grade: 'F', min_score: 0, remark: 'Fail' }, { grade: 'A', min_score: 70, remark: 'Excellent' }, { grade: 'C', min_score: 50, remark: 'Good' }];
  assert.strictEqual(Calc.gradeFor(70, scale).grade, 'A');
  assert.strictEqual(Calc.gradeFor(69.9, scale).grade, 'C');
  assert.strictEqual(Calc.gradeFor(0, scale).grade, 'F');
  assert.strictEqual(Calc.gradeFor(101, scale), null);
  assert.strictEqual(Calc.gradeFor(null, scale), null);
});

test('average ignores missing values', () => {
  assert.strictEqual(Calc.average([80, null, 60]), 70);
  assert.strictEqual(Calc.average([null]), null);
});

test('ordinals', () => {
  const exp = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 11: '11th', 12: '12th', 13: '13th', 21: '21st', 43: '43rd', 112: '112th' };
  for (const k of Object.keys(exp)) assert.strictEqual(Calc.ordinal(Number(k)), exp[k]);
});

test('score validation matches the Android rules', () => {
  assert.strictEqual(Calc.validateScore('', 30, 'CA'), null);
  assert.strictEqual(Calc.validateScore('30', 30, 'CA'), null);
  assert.strictEqual(Calc.validateScore('25.5', 30, 'CA'), null);
  assert.match(Calc.validateScore('31', 30, 'CA'), /between 0 and 30/);
  assert.match(Calc.validateScore('-1', 30, 'CA'), /between 0 and 30/);
  assert.match(Calc.validateScore('abc', 30, 'CA'), /must be a number/);
  assert.match(Calc.validateScore('12.55', 30, 'CA'), /one decimal/);
  assert.match(Calc.validateScore('12.', 30, 'CA'), /one decimal/);
});

test('positions share ties and skip the next rank', () => {
  const totals = [90, 80, 80, 70];
  assert.deepStrictEqual(totals.map(t => Calc.position(t, totals)), [1, 2, 2, 4]);
});

test('long dates', () => {
  assert.strictEqual(Calc.formatDateLong('2026-09-14'), '14th September 2026');
  assert.strictEqual(Calc.formatDateLong('2027-01-02'), '2nd January 2027');
  assert.strictEqual(Calc.formatDateLong('2027-01-11'), '11th January 2027');
});

test('csv parsing: quotes, BOM, semicolons, embedded newlines', () => {
  let p = parseCsv('\uFEFFfull_name,gender\r\n"Musa, Ali",M\r\n"Line\nBreak",F\r\n');
  assert.strictEqual(p.delimiter, ',');
  assert.deepStrictEqual(p.records.map(r => r.cells), [['full_name', 'gender'], ['Musa, Ali', 'M'], ['Line\nBreak', 'F']]);
  p = parseCsv('name;sex\nAmina;F\n');
  assert.strictEqual(p.delimiter, ';');
  assert.strictEqual(p.records.length, 2);
  assert.throws(() => parseCsv('   '), /empty/);
  const round = parseCsv(toCsv([['a', 'b,c'], ['"q"', 'x']]));
  assert.deepStrictEqual(round.records.map(r => r.cells), [['a', 'b,c'], ['"q"', 'x']]);
});

test('xlsx round trip with styles, numbers and special characters', () => {
  const buf = buildWorkbook([{
    name: 'Scores', freeze: { cols: 2, rows: 1 }, colWidths: [14, 30, 12, 12],
    rows: [
      [{ v: 'admission_no', s: S.HEADER }, { v: 'full_name', s: S.HEADER }, { v: 'Math CA (30)', s: S.CA_HEAD }, { v: 'Math Exam (70)', s: S.EXAM_HEAD }],
      ['A/001', 'Ade & <Sons> "Q"', { v: 25.5, s: S.CA }, { v: 60, s: S.EXAM }],
      ['A/002', 'Zainab \u00C9', { v: null, s: S.CA }, { v: null, s: S.EXAM }]
    ],
    validations: [{ sqref: 'C2:C200', min: 0, max: 30 }, { sqref: 'D2:D200', min: 0, max: 70 }]
  }]);
  const rows = readXlsx(buf);
  assert.deepStrictEqual(rows.map(r => r.cells), [
    ['admission_no', 'full_name', 'Math CA (30)', 'Math Exam (70)'],
    ['A/001', 'Ade & <Sons> "Q"', '25.5', '60'],
    ['A/002', 'Zainab \u00C9', '', '']
  ]);
  assert.strictEqual(rows[1].line, 2);
});
