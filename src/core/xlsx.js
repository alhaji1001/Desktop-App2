'use strict';
// Reads and writes real Excel workbooks (.xlsx) with no dependencies.
// Written files: styled headers, frozen panes, column widths, data validation.
// Read files: any .xlsx saved by Excel, Google Sheets, WPS Office or LibreOffice (first sheet).
const { createZip, readZip } = require('./zip');

// Style ids used by the writer (see STYLES_XML below)
const S = { NORMAL: 0, HEADER: 1, IDENT: 2, CA_HEAD: 3, EXAM_HEAD: 4, CA: 5, EXAM: 6, CELL: 7, BOLD: 8, CENTER: 9 };

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const STYLES_XML = XML_HEAD +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="3">' +
  '<font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
  '</fonts>' +
  '<fills count="8">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF0B1F4B"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF15803D"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE0EAFF"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF1F4F9"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left style="thin"><color rgb="FFC7CEDA"/></left><right style="thin"><color rgb="FFC7CEDA"/></right>' +
  '<top style="thin"><color rgb="FFC7CEDA"/></top><bottom style="thin"><color rgb="FFC7CEDA"/></bottom><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="10">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
  '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // strip characters that are illegal in XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function colName(index) { // 0 -> A
  let n = index + 1, s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function colIndex(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function safeSheetName(name, used) {
  let n = String(name || 'Sheet').replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let base = n, i = 2;
  while (used.has(n.toLowerCase())) { n = base.slice(0, 28) + ' ' + i++; }
  used.add(n.toLowerCase());
  return n;
}

/**
 * sheets: [{ name, rows, colWidths?, freeze?: {cols, rows}, validations?: [{sqref, type, min, max, list, title, message}], rowHeights?: {rowIndex: pts} }]
 * A cell is a primitive (string/number/null) or {v, s}.
 */
function buildWorkbook(sheets) {
  const used = new Set();
  const names = sheets.map(sh => safeSheetName(sh.name, used));
  const files = [];
  files.push({ name: '[Content_Types].xml', data: XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>' });
  files.push({ name: '_rels/.rels', data: XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>' });
  files.push({ name: 'xl/workbook.xml', data: XML_HEAD +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    names.map((n, i) => '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') +
    '</sheets></workbook>' });
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
    '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>' });
  files.push({ name: 'xl/styles.xml', data: STYLES_XML });

  sheets.forEach((sh, si) => {
    const x = [XML_HEAD, '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'];
    const fr = sh.freeze;
    x.push('<sheetViews><sheetView workbookViewId="0"' + (si === 0 ? ' tabSelected="1"' : '') + '>');
    if (fr && (fr.cols || fr.rows)) {
      const tl = colName(fr.cols || 0) + ((fr.rows || 0) + 1);
      const pane = fr.cols && fr.rows ? 'bottomRight' : (fr.rows ? 'bottomLeft' : 'topRight');
      x.push('<pane' + (fr.cols ? ' xSplit="' + fr.cols + '"' : '') + (fr.rows ? ' ySplit="' + fr.rows + '"' : '') +
        ' topLeftCell="' + tl + '" activePane="' + pane + '" state="frozen"/>' +
        '<selection pane="' + pane + '" activeCell="' + tl + '" sqref="' + tl + '"/>');
    }
    x.push('</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/>');
    if (sh.colWidths && sh.colWidths.length) {
      x.push('<cols>' + sh.colWidths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>');
    }
    x.push('<sheetData>');
    sh.rows.forEach((row, ri) => {
      const ht = sh.rowHeights && sh.rowHeights[ri];
      x.push('<row r="' + (ri + 1) + '"' + (ht ? ' ht="' + ht + '" customHeight="1"' : '') + '>');
      row.forEach((cell, ci) => {
        let v = cell, s = 0;
        if (cell && typeof cell === 'object') { v = cell.v; s = cell.s || 0; }
        const ref = colName(ci) + (ri + 1);
        const sa = s ? ' s="' + s + '"' : '';
        if (v === null || v === undefined || v === '') {
          if (s) x.push('<c r="' + ref + '"' + sa + '/>');
        } else if (typeof v === 'number' && isFinite(v)) {
          x.push('<c r="' + ref + '"' + sa + '><v>' + v + '</v></c>');
        } else {
          x.push('<c r="' + ref + '"' + sa + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>');
        }
      });
      x.push('</row>');
    });
    x.push('</sheetData>');
    if (sh.validations && sh.validations.length) {
      x.push('<dataValidations count="' + sh.validations.length + '">');
      for (const v of sh.validations) {
        if (v.list) {
          x.push('<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="' + esc(v.title || 'Invalid value') + '" error="' + esc(v.message || 'Pick a value from the list.') + '" sqref="' + v.sqref + '"><formula1>"' + esc(v.list) + '"</formula1></dataValidation>');
        } else {
          x.push('<dataValidation type="decimal" operator="between" allowBlank="1" showErrorMessage="1" errorTitle="' + esc(v.title || 'Invalid score') + '" error="' + esc(v.message || ('Enter a number from ' + v.min + ' to ' + v.max + '.')) + '" sqref="' + v.sqref + '"><formula1>' + v.min + '</formula1><formula2>' + v.max + '</formula2></dataValidation>');
        }
      }
      x.push('</dataValidations>');
    }
    x.push('</worksheet>');
    files.push({ name: 'xl/worksheets/sheet' + (si + 1) + '.xml', data: x.join('') });
  });
  return createZip(files);
}

// ---------------------------------------------------------------- reading
function decodeEntities(s) {
  return s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function textOf(fragment) {
  // all <t> ... </t> pieces (skip phonetic <rPh> runs)
  const cleaned = fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  const out = [];
  const re = /<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g;
  let m;
  while ((m = re.exec(cleaned))) out.push(m[1] ? decodeEntities(m[1]) : '');
  return out.join('');
}

function attr(attrs, name) {
  const m = new RegExp('(?:^|\\s)' + name + '="([^"]*)"').exec(attrs);
  return m ? decodeEntities(m[1]) : null;
}

function isXlsx(buf) {
  return buf && buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4B;
}
function isLegacyXls(buf) {
  return buf && buf.length > 4 && buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0;
}

// Returns [{line, cells:[string]}] for the first sheet; fully blank rows are removed.
function readXlsx(buf) {
  const parts = readZip(buf);
  const get = n => { const b = parts.get(n); return b ? b.toString('utf8') : null; };

  const shared = [];
  const sst = get('xl/sharedStrings.xml');
  if (sst) {
    const re = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g;
    let m;
    while ((m = re.exec(sst))) shared.push(m[1] ? textOf(m[1]) : '');
  }

  // find the first sheet's path
  let sheetPath = null;
  const wb = get('xl/workbook.xml'), rels = get('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const sm = /<sheet\b([^>]*)\/?>/.exec(wb);
    if (sm) {
      const rid = attr(sm[1], 'r:id');
      const re = /<Relationship\b([^>]*)\/?>/g;
      let rm;
      while ((rm = re.exec(rels))) {
        if (attr(rm[1], 'Id') === rid) {
          let t = attr(rm[1], 'Target') || '';
          t = t.replace(/^\//, '');
          sheetPath = t.startsWith('xl/') ? t : 'xl/' + t;
        }
      }
    }
  }
  let xml = sheetPath ? get(sheetPath) : null;
  if (!xml) xml = get('xl/worksheets/sheet1.xml');
  if (!xml) throw new Error('No worksheet was found in this Excel file.');

  const records = [];
  const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rm, seq = 0;
  while ((rm = rowRe.exec(xml))) {
    seq++;
    const line = parseInt(attr(rm[1], 'r') || String(seq), 10);
    const cells = [];
    if (rm[2]) {
      const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let cm, next = 0;
      while ((cm = cRe.exec(rm[2]))) {
        const ref = attr(cm[1], 'r');
        let idx = next;
        if (ref) { const lm = /^([A-Za-z]+)/.exec(ref); if (lm) idx = colIndex(lm[1]); }
        if (idx > 16383) throw new Error('The Excel file has too many columns.');
        while (cells.length < idx) cells.push('');
        const t = attr(cm[1], 't');
        const inner = cm[2] || '';
        let val = '';
        if (t === 'inlineStr') {
          val = textOf(inner);
        } else {
          const vm = /<v\b[^>]*?>([\s\S]*?)<\/v>/.exec(inner);
          const raw = vm ? decodeEntities(vm[1]) : '';
          if (t === 's') val = shared[parseInt(raw, 10)] || '';
          else if (t === 'b') val = raw === '1' ? 'TRUE' : 'FALSE';
          else val = raw;
        }
        cells[idx] = String(val).trim();
        next = idx + 1;
      }
    }
    records.push({ line, cells });
  }
  return records.filter(r => r.cells.some(c => c !== ''));
}

module.exports = { buildWorkbook, readXlsx, isXlsx, isLegacyXls, S, colName };
