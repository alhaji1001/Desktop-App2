# GDSS Dutse Results (Windows desktop app)

Offline school results manager converted from the Android app. No internet, no login, no server.
All data is saved on the computer. One administrator manages classes, subjects, students, scores,
results and PDF report cards.

## What it does
- Dashboard with score-entry progress per class
- Classes and subjects (add, rename, delete, reorder, copy subjects between classes)
- Students (add, edit, delete, move class, **import from .xlsx / .csv with template download**)
- Scores (enter by subject or by student, CA 0-30 and Exam 0-70, ratings, remarks,
  **Excel/CSV score template download and score import with preview**)
- Results (positions with ties, class statistics, broadsheet export to Excel/CSV, print)
- **PDF report cards: whole class or one student** (same layout as the Android app)
- Settings: school details + logo, sessions and terms, grading scale, skills/behaviour, promotion
- Backup and restore, automatic daily backups, export everything to Excel

Removed on purpose: Supabase/backend, login and passwords, roles, Form Master accounts and dashboards, sync.

## Build the Windows installer (no Windows PC needed)
1. Push this folder to a GitHub repository (branch `main`).
2. Open the repository > **Actions** > "Build Windows installer". It runs on every push
   (or press *Run workflow*). It runs the tests, then builds the installer.
3. When the run has a green tick, open it and download the artifact **GDSS-Dutse-Windows-Installer**
   (a ZIP containing `GDSS-Dutse-Results-Setup-1.0.0.exe`).
4. Copy the .exe to the Windows PC and run it. Windows may show "Windows protected your PC" because the
   installer is not code-signed: click **More info > Run anyway**.

Requires 64-bit Windows 10 or 11.

## Where the data is
`%APPDATA%\GDSS Dutse Results\` (the Backup & Data page has an "Open data folder" button).
- `data.json` is the live data (written safely: temp file + rename, plus a previous copy)
- `Backups\auto-YYYY-MM-DD.json` is one automatic backup per day (newest 14 kept)
- Uninstalling or updating the app does not delete this folder.

## Report-card PDFs
Created with the built-in Chromium of the app (no extra software). Default folder:
`Documents\GDSS Reports`. Choose "Save a separate PDF for each student" to get one file per student.

## Developing / testing
```
npm install
npm test            # unit tests + UI smoke tests (Node 20 or newer)
npm start           # run the app (Windows/macOS/Linux with a display)
node scripts/make-sample-pdf.js ./out 40 14   # sample report-card HTML (+PDF if wkhtmltopdf exists)
```
Project layout: `electron/` (window, file dialogs, PDF printing) - `src/core/` (all logic: store, service,
calculations, CSV, Excel reader/writer, report-card layout) - `src/ui/` (screens) - `tests/`.

## Things to check before real use
1. **Grading scale**: the app starts with a placeholder scale (A 70, B 60, C 50, D 45, E 40, F 0).
   Open Settings > Grading scale and enter your school's real scale.
2. **Promotion** moves every active student from one class to another. If your Android app did something
   different, tell the developer.
3. **Position rule** (copied from the Android app): position = 1 + number of students with a higher total;
   tied students share a position. Only students with at least one score are ranked.
   "Out of" shows the number of active students in the class.
4. Compare 3 real students' results and PDFs with the Android app before retiring it.
