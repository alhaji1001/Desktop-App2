'use strict';
// Builds a sample report-card file from fake data so you can check the layout.
// Usage: node scripts/make-sample-pdf.js [output-folder] [students] [subjects] [logo.png]
// Writes sample-report.html (open it in any browser, press Ctrl+P to see it as pages)
// and, if "wkhtmltopdf" is installed, sample-report.pdf as well.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const Calc = require('../src/core/calc');
const { buildReportHtml } = require('../src/core/report');

const outDir = process.argv[2] || process.cwd();
const count = parseInt(process.argv[3] || '3', 10);
const subjCount = parseInt(process.argv[4] || '12', 10);

const names = ['English Language', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Economics', 'Government', 'Literature in English',
  'Civic Education', 'Further Mathematics', 'Geography', 'Agricultural Science', 'Computer Studies', 'Commerce', 'Financial Accounting',
  'Christian Religious Studies', 'Islamic Studies', 'Hausa Language', 'Technical Drawing', 'Data Processing'];
const subjects = names.slice(0, subjCount).map((n, i) => ({ id: 's' + i, name: n }));
const traits = [];
['Handwriting', 'Games', 'Sports', 'Drawing and Painting', 'Crafts'].forEach((n, i) => traits.push({ id: 'k' + i, name: n, group: 'skill', sort_order: i }));
['Punctuality', 'Neatness', 'Honesty', 'Cooperation with Others', 'Leadership', 'Attentiveness', 'Perseverance', 'Politeness'].forEach((n, i) => traits.push({ id: 'b' + i, name: n, group: 'behaviour', sort_order: i }));
const grading = [{ grade: 'A', min_score: 70, remark: 'Excellent' }, { grade: 'B', min_score: 60, remark: 'Very Good' }, { grade: 'C', min_score: 50, remark: 'Good' },
  { grade: 'D', min_score: 45, remark: 'Fair' }, { grade: 'E', min_score: 40, remark: 'Pass' }, { grade: 'F', min_score: 0, remark: 'Fail' }];

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const students = [];
for (let i = 0; i < count; i++) {
  const scores = {}; let total = 0;
  subjects.forEach(s => {
    const ca = Math.round(rnd() * 30 * 10) / 10, exam = Math.round(rnd() * 70 * 10) / 10;
    const t = Calc.round1(ca + exam); const g = Calc.gradeFor(t, grading);
    scores[s.id] = { ca, exam, total: t, grade: g.grade, remark: g.remark }; total += t;
  });
  const ratings = {}; traits.forEach(t => { ratings[t.id] = 1 + Math.floor(rnd() * 5); });
  students.push({
    student: { full_name: i === 1 ? 'Muhammad Abdulrahman Ibrahim Garba-Sulaiman Jr.' : 'Student Number ' + (i + 1) },
    scores, ratings, remarks: i === 0 ? { class_master: 'A hardworking and respectful student. Keep it up.', director: '' } : { class_master: '', director: '' },
    summary: { total: Calc.round1(total), average: total / subjects.length, position: i + 1, class_size: count }
  });
}
const html = buildReportHtml({
  school: { school_name: 'Government Day Science Secondary School Dutse', board_name: 'Jigawa State Ministry of Education', address: 'P.M.B. 1001, Dutse, Jigawa State' },
  class_name: 'SS1 A', term: { name: 'First Term', session_name: '2026/2027', next_term_begins: '2027-01-11' },
  subjects, traits, students, includeRemarks: true, logoDataUrl: process.argv[5] ? "data:image/png;base64,"+fs.readFileSync(process.argv[5]).toString("base64") : null
});
fs.mkdirSync(outDir, { recursive: true });
const htmlPath = path.join(outDir, 'sample-report.html');
fs.writeFileSync(htmlPath, html);
console.log('Wrote ' + htmlPath);
try {
  const pdfPath = path.join(outDir, 'sample-report.pdf');
  execFileSync('wkhtmltopdf', ['--quiet', '--page-size', 'A4', '--disable-smart-shrinking', '-T', '0', '-B', '0', '-L', '0', '-R', '0', htmlPath, pdfPath], { stdio: 'ignore' });
  console.log('Wrote ' + pdfPath);
} catch (e) { /* wkhtmltopdf not installed: the HTML file is enough */ }
