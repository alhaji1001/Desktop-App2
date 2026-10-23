'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('GDSS Dutse Results');
app.setPath('userData', path.join(app.getPath('appData'), 'GDSS Dutse Results'));

const { Store } = require('../src/core/store');
const { createService } = require('../src/core/service');

let win = null, store = null, service = null, busy = 0, pdfCancelled = false;

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

const friendly = err => {
  if (err && (err instanceof TypeError || err instanceof ReferenceError || err instanceof RangeError)) {
    console.error(err);
    return 'Something unexpected went wrong (' + err.message + '). Your data is safe. If this keeps happening, make a backup and restart the app.';
  }
  return (err && err.message) || String(err);
};

function windowState() {
  const f = path.join(app.getPath('userData'), 'window.json');
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return {}; }
}
function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(path.join(app.getPath('userData'), 'window.json'), JSON.stringify({ x: b.x, y: b.y, width: b.width, height: b.height, max: win.isMaximized() }));
  } catch (e) { /* ignore */ }
}

function createWindow() {
  const st = windowState();
  win = new BrowserWindow({
    width: st.width || 1280, height: st.height || 800, x: st.x, y: st.y, minWidth: 1000, minHeight: 640,
    backgroundColor: '#F1F4F9', show: false, title: 'GDSS Dutse Results', autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  Menu.setApplicationMenu(null);
  if (st.max) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('close', e => {
    if (busy > 0) {
      const r = dialog.showMessageBoxSync(win, { type: 'warning', buttons: ['Keep working', 'Close anyway'], defaultId: 0, cancelId: 0,
        title: 'Still working', message: 'A save or PDF job is still running. Close anyway?' });
      if (r === 0) { e.preventDefault(); return; }
    }
    saveWindowState();
  });
  win.on('closed', () => { win = null; });
  win.loadFile(path.join(__dirname, '..', 'src', 'ui', 'index.html'));
}

// ------------------------------------------------------------------ helpers
const docsDir = () => app.getPath('documents');
const reportsDir = () => { const d = path.join(docsDir(), 'GDSS Reports'); try { fs.mkdirSync(d, { recursive: true }); } catch (e) { return docsDir(); } return d; };

async function htmlToPdf(html) {
  const tmp = path.join(app.getPath('temp'), 'gdss-report-' + Date.now() + '-' + Math.floor(Math.random() * 1e6) + '.html');
  fs.writeFileSync(tmp, html);
  const w = new BrowserWindow({ show: false, width: 794, height: 1123, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await w.loadFile(tmp);
    await w.webContents.executeJavaScript('new Promise(function(r){ if (document.title === "ready") r(true); else { window.addEventListener("load", function(){ setTimeout(function(){ r(true); }, 100); }); setTimeout(function(){ r(true); }, 4000); } })');
    return await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  } finally {
    if (!w.isDestroyed()) w.destroy();
    fs.unlink(tmp, () => {});
  }
}

const track = async fn => { busy++; try { return await fn(); } finally { busy--; } };
const ok = data => ({ ok: true, data });
const bad = err => ({ ok: false, error: friendly(err) });

// ------------------------------------------------------------------ IPC
function registerIpc() {
  ipcMain.handle('svc', (_e, name, args) => {
    try {
      if (typeof name !== 'string' || name.startsWith('_') || !Object.prototype.hasOwnProperty.call(service, name) || typeof service[name] !== 'function') throw new Error('Unknown action.');
      return ok(service[name].apply(null, args || []));
    } catch (err) { return bad(err); }
  });

  const EXPORTS = { buildScoreTemplate: 1, buildStudentTemplate: 1, buildBroadsheet: 1, exportEverything: 1 };
  ipcMain.handle('export', async (_e, name, args) => {
    try {
      if (!EXPORTS[name]) throw new Error('Unknown export.');
      const r = service[name].apply(null, args || []);
      const ext = path.extname(r.fileName).replace('.', '') || 'xlsx';
      const res = await dialog.showSaveDialog(win, { title: 'Save file', defaultPath: path.join(docsDir(), r.fileName),
        filters: [{ name: ext === 'csv' ? 'CSV file' : 'Excel workbook', extensions: [ext] }] });
      if (res.canceled || !res.filePath) return ok(null);
      fs.writeFileSync(res.filePath, r.data);
      return ok({ path: res.filePath });
    } catch (err) { return bad(err); }
  });

  ipcMain.handle('pickFile', async () => {
    try {
      const res = await dialog.showOpenDialog(win, { title: 'Choose a file', properties: ['openFile'],
        filters: [{ name: 'Excel or CSV', extensions: ['xlsx', 'csv', 'xls', 'txt'] }, { name: 'All files', extensions: ['*'] }] });
      if (res.canceled || !res.filePaths.length) return ok(null);
      const p = res.filePaths[0];
      if (fs.statSync(p).size > 25 * 1024 * 1024) throw new Error('That file is larger than 25 MB.');
      return ok({ name: path.basename(p), data: fs.readFileSync(p) });
    } catch (err) { return bad(err); }
  });

  ipcMain.handle('pickLogo', async () => {
    try {
      const res = await dialog.showOpenDialog(win, { title: 'Choose the school logo', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }] });
      if (res.canceled || !res.filePaths.length) return ok(null);
      const p = res.filePaths[0];
      store.setLogo(path.extname(p), fs.readFileSync(p));
      return ok(store.getLogoDataUrl());
    } catch (err) { return bad(err); }
  });

  ipcMain.handle('pdfCancel', () => { pdfCancelled = true; return ok(true); });
  ipcMain.handle('pdf', (_e, opts) => track(async () => {
    try {
      pdfCancelled = false;
      const send = p => { if (win && !win.isDestroyed()) win.webContents.send('pdf:progress', p); };
      if (opts.separate) {
        const first = service.buildReport(Object.assign({}, opts, { studentIds: null }));
        const res = await dialog.showOpenDialog(win, { title: 'Choose the folder for the report cards', defaultPath: reportsDir(), properties: ['openDirectory', 'createDirectory'] });
        if (res.canceled || !res.filePaths.length) return ok(null);
        const folder = res.filePaths[0];
        const ids = service.getClassResults(opts.classId, opts.termId).students.map(s => s.student_id);
        let done = 0;
        for (const id of ids) {
          if (pdfCancelled) break;
          const r = service.buildReport(Object.assign({}, opts, { studentIds: [id] }));
          const pdf = await htmlToPdf(r.html);
          let name = r.fileName, n = 2;
          while (fs.existsSync(path.join(folder, name))) name = r.fileName.replace(/\.pdf$/, '') + '_' + (n++) + '.pdf';
          fs.writeFileSync(path.join(folder, name), pdf);
          done++; send({ done, total: ids.length });
        }
        return ok({ folder, path: folder, count: done, total: first.count, cancelled: pdfCancelled });
      }
      const r = service.buildReport(opts);
      send({ done: 0, total: r.count });
      const pdf = await htmlToPdf(r.html);
      const res = await dialog.showSaveDialog(win, { title: 'Save report cards', defaultPath: path.join(reportsDir(), r.fileName), filters: [{ name: 'PDF document', extensions: ['pdf'] }] });
      if (res.canceled || !res.filePath) return ok(null);
      fs.writeFileSync(res.filePath, pdf);
      return ok({ path: res.filePath, count: r.count });
    } catch (err) { return bad(err); }
  }));

  ipcMain.handle('openPath', async (_e, p) => { const r = await shell.openPath(p); return r ? bad(new Error(r)) : ok(true); });
  ipcMain.handle('showInFolder', (_e, p) => { shell.showItemInFolder(p); return ok(true); });

  ipcMain.handle('printHtml', (_e, html) => track(async () => {
    try {
      const tmp = path.join(app.getPath('temp'), 'gdss-print-' + Date.now() + '.html');
      fs.writeFileSync(tmp, String(html));
      const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
      await w.loadFile(tmp);
      await new Promise(resolve => w.webContents.print({ silent: false, printBackground: true, landscape: true }, () => resolve()));
      w.destroy(); fs.unlink(tmp, () => {});
      return ok(true);
    } catch (err) { return bad(err); }
  }));

  ipcMain.handle('backupNow', async () => {
    try {
      store.flush();
      const name = 'GDSS-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      const res = await dialog.showSaveDialog(win, { title: 'Save a backup copy', defaultPath: path.join(docsDir(), name), filters: [{ name: 'GDSS backup', extensions: ['json'] }] });
      if (res.canceled || !res.filePath) return ok(null);
      fs.writeFileSync(res.filePath, store.exportBackupJson());
      return ok({ path: res.filePath });
    } catch (err) { return bad(err); }
  });

  ipcMain.handle('restoreBackup', async () => {
    try {
      const res = await dialog.showOpenDialog(win, { title: 'Choose a backup file', properties: ['openFile'], filters: [{ name: 'GDSS backup', extensions: ['json'] }] });
      if (res.canceled || !res.filePaths.length) return ok(null);
      const text = fs.readFileSync(res.filePaths[0], 'utf8');
      JSON.parse(text); // early check
      const c = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Cancel', 'Restore'], defaultId: 0, cancelId: 0, title: 'Restore backup',
        message: 'Replace all current data with this backup?', detail: 'A safety copy of your current data is saved first, so you can undo this.' });
      if (c.response !== 1) return ok(null);
      const r = store.restoreFromJson(text);
      return ok({ safety: r.safety });
    } catch (err) { return bad(err); }
  });

  ipcMain.handle('openDataFolder', () => { shell.openPath(store.dir); return ok(true); });
  ipcMain.handle('getVersion', () => ok({ version: app.getVersion(), dir: store.dir }));
}

// ------------------------------------------------------------------ start
app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  let info;
  try { info = store.load(); } catch (err) {
    dialog.showErrorBox('GDSS Dutse Results', 'The data file is damaged and no backup could be read.\n\nYour files were NOT changed. Folder:\n' + store.dir + '\n\nCopy that folder somewhere safe and ask for help before reinstalling.');
    app.exit(1); return;
  }
  try { store.autoBackup(); } catch (e) { console.error('auto backup failed', e); }
  service = createService(store);
  registerIpc();
  process.on('uncaughtException', err => { console.error(err); try { dialog.showErrorBox('GDSS Dutse Results', 'An unexpected error happened. Your data was saved.\n\n' + (err && err.message)); } catch (e) { /* ignore */ } });
  createWindow();
  if (info.recoveredFrom) {
    win.webContents.once('did-finish-load', () => dialog.showMessageBox(win, { type: 'info', title: 'Data recovered', message: 'The main data file was damaged, so the app restored your data from: ' + info.recoveredFrom + '.', detail: 'Recent entries may need to be re-checked.' }));
  }
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('before-quit', () => { try { if (store) store.flush(); } catch (e) { /* ignore */ } });
app.on('window-all-closed', () => { app.quit(); });
