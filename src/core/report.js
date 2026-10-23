'use strict';
// Builds the report-card HTML (one A4 page per student). The layout is a direct port of the
// Android ReportCardPdfService (595 x 842 pt page, same colours, same coordinates).
// The Electron main process prints this HTML to PDF with Chromium.
const Calc = require('./calc');

const NAVY = '#0B1F4B', GOLD = '#B8923A', GOLD_SOFT = '#E8DFC6', TINT = '#F4F6FA', INK = '#1B2438', MUTED = '#5F6B80', RED = '#B91C1C';
const PAGE_W = 595, PAGE_H = 842;

function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const f1 = n => Math.round(n * 100) / 100;
const num = n => (n % 1 === 0 ? String(n) : (Math.round(n * 10) / 10).toFixed(1));

// rough text width in pt (Helvetica-like). The page script fine-tunes anything this misjudges.
function estWidth(text, size, bold, upper) {
  const per = upper ? (bold ? 0.70 : 0.66) : (bold ? 0.58 : 0.54);
  return String(text).length * size * per;
}

// text box: single line (vertically centred with line-height) unless o.multi
function txt(x, y, w, h, text, o) {
  o = o || {};
  const size = o.size || 9, min = o.min || 5;
  let st = 'left:' + f1(x) + 'pt;top:' + f1(y) + 'pt;width:' + f1(w) + 'pt;height:' + f1(h) + 'pt;font-size:' + size + 'pt;color:' + (o.color || INK) + ';text-align:' + (o.align || 'left') + ';';
  if (o.bold) st += 'font-weight:bold;';
  if (o.ls) st += 'letter-spacing:' + o.ls + 'em;';
  if (o.multi) st += 'line-height:1.12;padding-top:' + f1(o.padTop || 0) + 'pt;box-sizing:border-box;';
  else st += 'line-height:' + f1(h) + 'pt;white-space:nowrap;text-overflow:ellipsis;';
  return '<div class="abs fit" data-size="' + size + '" data-min="' + min + '" style="' + st + '">' + esc(text) + '</div>';
}

function rrect(x, y, w, h, r, o) {
  return '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(w) + '" height="' + f1(h) + '" rx="' + r + '" ' +
    'fill="' + (o.fill || 'none') + '"' + (o.stroke ? ' stroke="' + o.stroke + '" stroke-width="' + (o.sw || 1) + '"' : '') + '/>';
}
function line(x1, y1, x2, y2, color, w) {
  return '<line x1="' + f1(x1) + '" y1="' + f1(y1) + '" x2="' + f1(x2) + '" y2="' + f1(y2) + '" stroke="' + color + '" stroke-width="' + w + '"/>';
}
function rect(x, y, w, h, fill) { return '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(w) + '" height="' + f1(h) + '" fill="' + fill + '"/>'; }

function icon(kind, cx, cy) {
  const L = 'fill="none" stroke="' + GOLD + '" stroke-width="1.4"';
  switch (kind) {
    case 0: return '<rect x="' + (cx - 8) + '" y="' + (cy - 10) + '" width="16" height="20" rx="2" ' + L + '/>' +
      '<rect x="' + (cx - 3.5) + '" y="' + (cy - 12) + '" width="7" height="4" fill="' + GOLD + '"/>' +
      [0, 1, 2].map(i => line(cx - 4.5, cy - 3 + i * 5, cx + 4.5, cy - 3 + i * 5, GOLD, 1)).join('');
    case 1: {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = (-90 + i * 36) * Math.PI / 180, r = i % 2 === 0 ? 10 : 4.4;
        pts.push(f1(cx + r * Math.cos(a)) + ',' + f1(cy + r * Math.sin(a)));
      }
      return '<polygon points="' + pts.join(' ') + '" fill="' + GOLD + '"/>';
    }
    case 2: return '<circle cx="' + cx + '" cy="' + (cy - 3) + '" r="7" ' + L + '/><circle cx="' + cx + '" cy="' + (cy - 3) + '" r="2.6" fill="' + GOLD + '"/>' +
      '<polygon points="' + (cx - 5) + ',' + (cy + 2) + ' ' + (cx - 8) + ',' + (cy + 11) + ' ' + (cx - 3) + ',' + (cy + 8) + '" fill="' + GOLD + '"/>' +
      '<polygon points="' + (cx + 5) + ',' + (cy + 2) + ' ' + (cx + 8) + ',' + (cy + 11) + ' ' + (cx + 3) + ',' + (cy + 8) + '" fill="' + GOLD + '"/>';
    case 3: return '<circle cx="' + cx + '" cy="' + (cy - 4) + '" r="4.2" ' + L + '/>' +
      '<path d="M ' + (cx - 8) + ' ' + (cy + 9) + ' A 8 8 0 0 1 ' + (cx + 8) + ' ' + (cy + 9) + '" ' + L + '/>';
    default: return line(cx - 7, cy + 8, cx + 6, cy - 5, GOLD, 2.6) + line(cx - 8, cy + 9, cx - 4, cy + 9, GOLD, 1.4);
  }
}

function geometry(subjects, traits, includeRemarks) {
  const left = 28, right = PAGE_W - 28, fullWidth = right - left, center = PAGE_W / 2;
  const infoTop = 162, infoH = 48;
  const tableTop = infoTop + infoH + 10, tableHeight = 348;
  const leftW = fullWidth * 0.60, gap = 8, rightX = left + leftW + gap, rightW = right - rightX;
  const summaryTop = tableTop + tableHeight + 10;
  const remarksTop = summaryTop + 46 + 10;
  const signatureY = remarksTop + 46 * 2 + 38;
  return { left, right, fullWidth, center, infoTop, infoH, tableTop, tableHeight, leftW, rightX, rightW, summaryTop, remarksTop, signatureY };
}

// Everything that is not text: frame, boxes, stripes, grid lines, icons. Identical for every student.
function buildDecor(subjects, skills, behaviours, includeRemarks, G, hasLogo) {
  const p = [];
  const w = PAGE_W, h = PAGE_H;
  p.push('<polygon points="0,0 44,0 0,44" fill="' + NAVY + '"/><polygon points="50,0 62,0 0,62 0,50" fill="' + GOLD + '"/>');
  p.push('<polygon points="' + w + ',' + h + ' ' + (w - 44) + ',' + h + ' ' + w + ',' + (h - 44) + '" fill="' + NAVY + '"/>');
  p.push('<polygon points="' + (w - 50) + ',' + h + ' ' + (w - 62) + ',' + h + ' ' + w + ',' + (h - 62) + ' ' + w + ',' + (h - 50) + '" fill="' + GOLD + '"/>');
  p.push(rrect(14, 14, w - 28, h - 28, 0, { stroke: NAVY, sw: 1.6 }));

  // banner
  p.push(rrect(G.center - 145, 124, 290, 26, 8, { fill: NAVY }));
  // info box
  p.push(rrect(G.left, G.infoTop, G.fullWidth, G.infoH, 8, { fill: '#fff', stroke: GOLD, sw: 1 }));
  const c1 = G.left + G.fullWidth * 0.48, c2 = G.left + G.fullWidth * 0.74;
  p.push(line(c1, G.infoTop + 8, c1, G.infoTop + G.infoH - 8, GOLD_SOFT, 1));
  p.push(line(c2, G.infoTop + 8, c2, G.infoTop + G.infoH - 8, GOLD_SOFT, 1));

  // subject table
  const x = G.left, y = G.tableTop, width = G.leftW;
  const widths = [.33, .10, .11, .10, .10, .26].map(q => q * width);
  const n = subjects.length, headerH = 26, dense = n > 14;
  const rowH = dense ? Math.max(10, Math.min(16, (G.tableHeight - headerH) / Math.max(1, n))) : Math.min(27, (G.tableHeight - headerH) / Math.max(1, n));
  const bodyH = n === 0 ? 24 : rowH * n, tableH = headerH + bodyH;
  p.push(rrect(x, y, width, headerH, 7, { fill: NAVY }) + rect(x, y + headerH / 2, width, headerH / 2, NAVY));
  for (let i = 0; i < n; i++) {
    const top = y + headerH + i * rowH;
    if (i % 2 === 1) p.push(rect(x + 0.5, top, width - 1, rowH, TINT));
    p.push(line(x, top + rowH, x + width, top + rowH, GOLD_SOFT, 0.7));
  }
  let vx = x;
  for (let i = 0; i < widths.length - 1; i++) { vx += widths[i]; p.push(line(vx, y + headerH, vx, y + tableH, GOLD_SOFT, 0.7)); }
  p.push(rrect(x, y, width, tableH, 7, { stroke: GOLD_SOFT, sw: 0.9 }));

  // trait tables
  const tx = G.rightX, tw = G.rightW, labelW = tw * 0.46, ratingW = (tw - labelW) / 5;
  const titleH = 20, numberH = 15, sectionGap = 8;
  const traitRowH = Math.min(24, (G.tableHeight - (titleH + numberH) * 2 - sectionGap) / Math.max(1, skills.length + behaviours.length));
  let cy = G.tableTop;
  const sections = [];
  [skills, behaviours].forEach(rows => {
    const sectionTop = cy;
    p.push(rrect(tx, cy, tw, titleH, 6, { fill: NAVY }) + rect(tx, cy + titleH / 2, tw, titleH / 2, NAVY));
    cy += titleH;
    p.push(rect(tx + 0.5, cy, tw - 1, numberH, TINT));
    const numberTop = cy;
    cy += numberH;
    const gridTop = sectionTop + titleH;
    const rowTops = [];
    rows.forEach((t, i) => {
      if (i % 2 === 1) p.push(rect(tx + 0.5, cy, tw - 1, traitRowH, TINT));
      p.push(line(tx, cy, tx + tw, cy, GOLD_SOFT, 0.7));
      rowTops.push(cy);
      cy += traitRowH;
    });
    if (!rows.length) cy += 6;
    const gridBottom = cy;
    p.push(line(tx + labelW, gridTop, tx + labelW, gridBottom, GOLD_SOFT, 0.7));
    for (let r = 1; r <= 4; r++) p.push(line(tx + labelW + ratingW * r, gridTop, tx + labelW + ratingW * r, gridBottom, GOLD_SOFT, 0.7));
    p.push(rrect(tx, sectionTop, tw, gridBottom - sectionTop, 6, { stroke: GOLD_SOFT, sw: 0.9 }));
    sections.push({ sectionTop, numberTop, rowTops });
    cy += sectionGap;
  });

  // summary
  const st = G.summaryTop, colW = G.fullWidth / 3;
  p.push(rrect(G.left, st, G.fullWidth, 46, 8, { fill: '#fff', stroke: GOLD, sw: 1 }));
  p.push(line(G.left + colW, st + 8, G.left + colW, st + 38, GOLD_SOFT, 1));
  p.push(line(G.left + colW * 2, st + 8, G.left + colW * 2, st + 38, GOLD_SOFT, 1));
  p.push(icon(0, G.left + 24, st + 23), icon(1, G.left + colW + 24, st + 23), icon(2, G.left + colW * 2 + 24, st + 23));

  // remarks
  const rt = G.remarksTop;
  p.push(rrect(G.left, rt, G.fullWidth, 92, 8, { fill: '#fff', stroke: GOLD, sw: 1 }));
  p.push(line(G.left, rt + 46, G.right, rt + 46, GOLD_SOFT, 1));
  p.push(icon(3, G.left + 24, rt + 23), icon(4, G.left + 24, rt + 46 + 23));

  // signatures
  const sy = G.signatureY;
  p.push(line(G.left + 6, sy, G.left + 156, sy, NAVY, 0.8), line(G.center - 55, sy, G.center + 55, sy, NAVY, 0.8), line(G.right - 156, sy, G.right - 6, sy, NAVY, 0.8));

  return { svg: p.join(''), meta: { widths, rowH, n, dense, headerH, labelW, ratingW, titleH, numberH, traitRowH, sections, tx, tw } };
}

function buildPage(data, st, G, decor, skills, behaviours, logoUrl) {
  const out = [];
  const school = data.school || {};
  const { widths, rowH, n, dense, headerH, labelW, ratingW, titleH, numberH, traitRowH, sections, tx } = decor.meta;

  // header
  let textX = G.left;
  if (logoUrl) {
    out.push('<img class="abs" src="' + logoUrl + '" style="left:' + (G.left + 4) + 'pt;top:36pt;width:74pt;height:74pt;object-fit:contain"/>');
    textX = G.left + 74 + 20;
  }
  const textW = G.right - textX;
  const name = String(school.school_name || '').toUpperCase();
  let nsize = 19, nlines = 1;
  for (; nsize >= 10; nsize -= 0.5) {
    nlines = Math.max(1, Math.ceil(estWidth(name, nsize, true, true) / textW));
    if (nlines <= 2) break;
  }
  if (nlines > 2) nlines = 2;
  const nameH = nlines * nsize * 1.12;
  out.push(txt(textX, 36, textW, nameH + 1, name, { size: nsize, min: 10, bold: true, color: NAVY, multi: nlines > 1 }));
  let y = 36 + nameH + 3;
  out.push('<div class="abs" style="left:' + textX + 'pt;top:' + f1(y) + 'pt;width:' + f1(textW) + 'pt;height:1.2pt;background:' + GOLD + '"></div>');
  y += 6;
  out.push(txt(textX, y, textW, 13, String(school.board_name || '').toUpperCase(), { size: 10.5, min: 6, bold: true, color: GOLD }));
  y += 15;
  out.push(txt(textX, y, textW, 11, String(school.address || '').toUpperCase(), { size: 9, min: 5.5, color: NAVY }));

  // banner text
  out.push(txt(G.center - 145, 124, 290, 26, 'TERMINAL REPORT SHEET', { size: 11.5, bold: true, color: '#fff', align: 'center', ls: 0.12, min: 8 }));

  // info fields
  const term = data.term || {};
  const c1 = G.left + G.fullWidth * 0.48, c2 = G.left + G.fullWidth * 0.74;
  const field = (label, value, x, base, width) => {
    const lw = estWidth(label, 7.4, true, true) + 6;
    return txt(x, base - 10, lw, 13, label, { size: 7.4, bold: true, color: NAVY, min: 7.4 }) +
      txt(x + lw, base - 10, Math.max(10, width - lw), 13, value, { size: 9.5, min: 5.5, bold: true });
  };
  const session = term.session_name || '\u2014';
  const next = term.next_term_begins ? Calc.formatDateLong(term.next_term_begins) : '\u2014';
  out.push(field('NAME:', st.student.full_name, G.left + 12, G.infoTop + 20, c1 - G.left - 20));
  out.push(field('CLASS:', data.class_name || '', c1 + 12, G.infoTop + 20, c2 - c1 - 18));
  out.push(field('SESSION:', session, c2 + 12, G.infoTop + 20, G.right - c2 - 20));
  out.push(field('TERM:', String(term.name || '').toUpperCase(), G.left + 12, G.infoTop + 39, c1 - G.left - 20));
  out.push(field('NEXT TERM BEGINS:', next, c1 + 12, G.infoTop + 39, G.right - c1 - 20));

  // subject table text
  const heads = ['SUBJECTS', 'CA/30', 'EOT/70', 'TOTAL', 'GRADE', 'REMARK'];
  let cx = G.left;
  heads.forEach((hd, i) => {
    out.push(txt(cx + 2, G.tableTop, widths[i] - 4, headerH, hd, { size: dense ? 6.6 : 7.4, min: 4.5, bold: true, color: '#fff', align: 'center' }));
    cx += widths[i];
  });
  const dataText = dense ? 6 : 8.2;
  data.subjects.forEach((sub, i) => {
    const top = G.tableTop + headerH + i * rowH;
    const sc = st.scores[sub.id];
    const grade = sc && sc.grade ? sc.grade : '';
    const failing = grade.toUpperCase() === 'F';
    const vals = [String(sub.name).toUpperCase(), sc && sc.ca !== null && sc.ca !== undefined ? num(sc.ca) : '', sc && sc.exam !== null && sc.exam !== undefined ? num(sc.exam) : '',
      sc && sc.total !== null && sc.total !== undefined ? num(sc.total) : '', grade, sc && sc.remark ? String(sc.remark).toUpperCase() : ''];
    let vx = G.left;
    vals.forEach((v, col) => {
      const cw = widths[col];
      if (col === 0) {
        const avail = cw - 10;
        if (rowH >= 20 && v && estWidth(v, dataText, true, true) > avail) {
          out.push(txt(vx + 6, top + 1, avail, rowH - 2, v, { size: dataText, min: 4.5, bold: true, color: NAVY, multi: true, padTop: Math.max(0, (rowH - 2 - 2 * dataText * 1.12) / 2) }));
        } else out.push(txt(vx + 6, top, avail, rowH, v, { size: dataText, min: 4.5, bold: true, color: NAVY }));
      } else if (v !== '') {
        const color = failing && col >= 4 ? RED : INK;
        out.push(txt(vx + 3, top, cw - 6, rowH, v, { size: dataText, min: 4.5, bold: col === 3 || col === 4, color, align: 'center' }));
      }
      vx += cw;
    });
  });
  if (!n) out.push(txt(G.left + 8, G.tableTop + headerH, 150, 24, 'No subjects', { size: 8, color: MUTED }));

  // trait tables text
  [[skills, 'SKILLS (1-5)'], [behaviours, 'BEHAVIOUR (1-5)']].forEach((pair, si) => {
    const rows = pair[0], sec = sections[si];
    out.push(txt(G.rightX, sec.sectionTop, G.rightW, titleH, pair[1], { size: 7.2, bold: true, color: '#fff', align: 'center', min: 5 }));
    for (let r = 0; r < 5; r++) out.push(txt(G.rightX + labelW + ratingW * r, sec.numberTop, ratingW, numberH, String(5 - r), { size: 7, bold: true, color: NAVY, align: 'center' }));
    rows.forEach((t, i) => {
      const top = sec.rowTops[i];
      const avail = labelW - 8;
      if (traitRowH >= 19 && estWidth(t.name, 6.8, false, false) > avail) {
        out.push(txt(G.rightX + 5, top + 1, avail, traitRowH - 2, t.name, { size: 6.8, min: 4.2, multi: true, padTop: Math.max(0, (traitRowH - 2 - 2 * 6.8 * 1.12) / 2) }));
      } else out.push(txt(G.rightX + 5, top, avail, traitRowH, t.name, { size: 6.8, min: 4.2 }));
      const rating = st.ratings[t.id];
      if (rating >= 1 && rating <= 5) out.push(txt(G.rightX + labelW + ratingW * (5 - rating), top, ratingW, traitRowH, 'X', { size: 8.5, bold: true, color: NAVY, align: 'center' }));
    });
  });

  // summary text
  const sum = st.summary || {};
  const total = sum.total || 0;
  const maxTotal = data.subjects.length * 100;
  const avg = sum.average !== null && sum.average !== undefined ? sum.average : (data.subjects.length ? total / data.subjects.length : 0);
  const position = sum.position ? Calc.ordinal(sum.position).toUpperCase() : '\u2014';
  const classSize = sum.class_size ? sum.class_size : data.students.length;
  const colW = G.fullWidth / 3, off = 44, sy0 = G.summaryTop;
  const labelBox = (i, text) => txt(G.left + colW * i + off, sy0 + 6, colW - off - 6, 14, text, { size: 7, bold: true, color: NAVY, min: 7 });
  const valueBox = (i, html) => '<div class="abs" style="left:' + f1(G.left + colW * i + off) + 'pt;top:' + (sy0 + 22) + 'pt;width:' + f1(colW - off - 6) + 'pt;height:20pt;line-height:20pt;white-space:nowrap;overflow:hidden;color:' + NAVY + ';font-weight:bold;font-size:16pt">' + html + '</div>';
  const small = t => '<span style="font-size:7.5pt;color:' + MUTED + '">' + esc(t) + '</span>';
  out.push(labelBox(0, 'MARKS OUT OF'), valueBox(0, esc(maxTotal) + ' ' + small('= ' + num(total))));
  out.push(labelBox(1, 'AVERAGE SCORE'), valueBox(1, esc(Calc.formatAverage(avg)) + '%'));
  out.push(labelBox(2, 'POSITION'), valueBox(2, esc(position) + ' ' + small('OUT OF ' + classSize)));

  // remarks
  const rem = data.includeRemarks ? (st.remarks || {}) : {};
  [[0, "CLASS MASTER'S REMARKS:", (rem.class_master || '').trim()], [1, "DIRECTOR'S REMARKS:", (rem.director || '').trim()]].forEach(pair => {
    const top = G.remarksTop + 46 * pair[0];
    const labelX = G.left + 46, textX2 = labelX + 142;
    out.push(txt(labelX, top + 10, 136, 14, pair[1], { size: 8, bold: true, color: NAVY, min: 5.5 }));
    if (pair[2]) {
      out.push(txt(textX2, top + 9, G.right - 14 - textX2, 30, pair[2], { size: 9.5, min: 6, bold: true, color: RED, multi: true }));
    }
  });

  // signature captions + motto
  const sy = G.signatureY;
  const cap = (x, w, t) => txt(x, sy + 3, w, 10, t, { size: 7.2, bold: true, color: MUTED, align: 'center', min: 5 });
  out.push(cap(G.left + 6, 150, "CLASS MASTER'S SIGNATURE"), cap(G.center - 55, 110, 'DATE'), cap(G.right - 156, 150, "DIRECTOR'S SIGNATURE"));
  out.push(txt(G.left, PAGE_H - 36, G.fullWidth, 14, 'DISCIPLINE  |  DILIGENCE  |  EXCELLENCE', { size: 8, bold: true, color: NAVY, align: 'center', ls: 0.16, min: 6 }));

  // ruled lines for handwritten remarks (drawn in a tiny svg on top of the page)
  const ruled = [];
  [[0, (rem.class_master || '').trim()], [1, (rem.director || '').trim()]].forEach(pair => {
    if (pair[1]) return;
    const top = G.remarksTop + 46 * pair[0];
    ruled.push(line(G.left + 46 + 142, top + 22, G.right - 14, top + 22, MUTED, 0.5), line(G.left + 46, top + 39, G.right - 14, top + 39, MUTED, 0.5));
  });
  const ruledSvg = ruled.length ? '<svg class="abs" style="left:0;top:0" width="' + PAGE_W + 'pt" height="' + PAGE_H + 'pt" viewBox="0 0 ' + PAGE_W + ' ' + PAGE_H + '">' + ruled.join('') + '</svg>' : '';

  return '<div class="page"><svg class="abs" style="left:0;top:0" width="' + PAGE_W + 'pt" height="' + PAGE_H + 'pt" viewBox="0 0 ' + PAGE_W + ' ' + PAGE_H + '">' +
    decor.svg + '</svg>' + ruledSvg + out.join('') + '</div>';
}

/**
 * data: { school:{school_name,board_name,address}, class_name, term:{name,session_name,next_term_begins},
 *         subjects:[{id,name}], traits:[{id,name,group,sort_order}], includeRemarks,
 *         students:[{student:{full_name}, scores:{subjectId:{ca,exam,total,grade,remark}}, ratings:{traitId:n},
 *                    remarks:{class_master,director}, summary:{total,average,position,class_size}}],
 *         logoDataUrl }
 */
function buildReportHtml(data) {
  const skills = data.traits.filter(t => t.group === 'skill').sort((a, b) => a.sort_order - b.sort_order);
  const behaviours = data.traits.filter(t => t.group === 'behaviour').sort((a, b) => a.sort_order - b.sort_order);
  const G = geometry(data.subjects, data.traits, data.includeRemarks);
  const decor = buildDecor(data.subjects, skills, behaviours, data.includeRemarks, G, !!data.logoDataUrl);
  const pages = data.students.map(st => buildPage(data, st, G, decor, skills, behaviours, data.logoDataUrl));
  const script = '(function(){function fit(el){var min=parseFloat(el.getAttribute("data-min"))||5;var size=parseFloat(el.getAttribute("data-size"))||9;var g=80;' +
    'while(size>min&&g-->0&&(el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1)){size-=0.5;el.style.fontSize=size+"pt";}}' +
    'function run(){var els=document.getElementsByClassName("fit");for(var i=0;i<els.length;i++)fit(els[i]);document.title="ready";}' +
    'if(document.readyState==="complete")run();else window.addEventListener("load",run);})();';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Report cards</title><style>' +
    '@page{size:595pt 842pt;margin:0}html,body{margin:0;padding:0;background:#fff}' +
    'body{font-family:"Segoe UI",Arial,Helvetica,sans-serif;color:' + INK + ';-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.page{position:relative;width:595pt;height:841pt;overflow:hidden;page-break-after:always;break-after:page;background:#fff}' +
    '.page:last-child{page-break-after:auto;break-after:auto}.abs{position:absolute}.fit{overflow:hidden}' +
    '</style></head><body>' + pages.join('') + '<script>' + script + '</script></body></html>';
}

module.exports = { buildReportHtml, estWidth };
