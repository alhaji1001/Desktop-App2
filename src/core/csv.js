'use strict';
// CSV reading/writing (ported from CsvStudentParser.kt): quoted fields, escaped quotes,
// embedded newlines, CRLF/LF, UTF-8 BOM, comma or semicolon delimiters.

function detectDelimiter(text) {
  var commas = 0, semis = 0, quoted = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') i++; else quoted = !quoted;
    } else if (!quoted) {
      if (c === ',') commas++; else if (c === ';') semis++;
      if (c === '\n' || c === '\r') break;
    }
  }
  return semis > commas ? ';' : ',';
}

// Returns [{line, cells:[...]}] ; fully blank records are dropped.
function readRecords(text, delimiter) {
  var records = [], cells = [], cell = '', quoted = false, line = 1, recordLine = 1, i = 0;
  function endCell() { cells.push(cell.trim()); cell = ''; }
  function endRecord() {
    endCell();
    records.push({ line: recordLine, cells: cells });
    cells = [];
  }
  while (i < text.length) {
    var c = text[i];
    if (c === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === delimiter && !quoted) endCell();
    else if ((c === '\n' || c === '\r') && !quoted) {
      endRecord();
      if (c === '\r' && text[i + 1] === '\n') i++;
      line++; recordLine = line;
    } else {
      if (c === '\n') line++;
      cell += c;
    }
    i++;
  }
  if (cell.length || cells.length) endRecord();
  return records.filter(function (r) { return r.cells.some(function (x) { return x.trim() !== ''; }); });
}

function parseCsv(input) {
  var text = String(input).replace(/^\uFEFF/, '');
  if (!text.trim()) throw new Error('The CSV file is empty.');
  var delimiter = detectDelimiter(text);
  return { delimiter: delimiter, records: readRecords(text, delimiter) };
}

function csvCell(v) {
  var s = (v === null || v === undefined) ? '' : String(v);
  return /[",;\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// rows: array of arrays. Adds a BOM so Excel reads UTF-8 correctly.
function toCsv(rows) {
  return '\uFEFF' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
}

module.exports = { detectDelimiter: detectDelimiter, readRecords: readRecords, parseCsv: parseCsv, toCsv: toCsv };
