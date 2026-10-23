'use strict';
(function () {
  var h = U.h, api = U.api, safe = U.safe;

  Pages.backup = async function (root) {
    var ver = await U.ipc(window.desktop.getVersion());
    var info = await api.getDataInfo();
    var fmtTime = function (ms) { var d = new Date(ms); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString(); };

    U.fill(root,
      h('div', { class: 'card', style: { maxWidth: '760px' } }, h('h3', null, 'Your data'),
        h('p', null, 'Everything is saved automatically on this computer, in this folder:'),
        h('p', { class: 'small', style: { wordBreak: 'break-all', background: 'var(--tint)', padding: '8px 10px', borderRadius: '8px' } }, info.dir),
        h('div', { class: 'row' }, h('button', { class: 'btn light', onclick: safe(function () { return U.ipc(window.desktop.openDataFolder()); }) }, 'Open data folder'))),
      h('div', { class: 'card', style: { maxWidth: '760px' } }, h('h3', null, 'Backup and restore'),
        h('p', { class: 'muted' }, 'A backup is one file with all students, scores, settings and the logo. Keep a copy on a flash drive or another computer every week.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn gold', onclick: safe(async function () { var r = await U.ipc(window.desktop.backupNow()); if (r) U.toast('Backup saved: ' + r.path); }) }, 'Backup now'),
          h('button', { class: 'btn light', onclick: safe(async function () {
            var r = await U.ipc(window.desktop.restoreBackup());
            if (r) { U.toast('Backup restored. Reloading...'); setTimeout(function () { location.reload(); }, 800); }
          }) }, 'Restore from a backup file...'),
          h('button', { class: 'btn light', onclick: safe(function () { return Pages._saveExport('exportEverything', []); }) }, 'Export all students and scores to Excel'))),
      h('div', { class: 'card', style: { maxWidth: '760px' } }, h('h3', null, 'Automatic backups'),
        h('p', { class: 'muted small' }, 'The app saves one backup copy each day it is opened (the newest 14 are kept) in the Backups folder inside the data folder.'),
        info.backups.length ? h('table', null, h('tbody', null, info.backups.map(function (b) { return h('tr', null, h('td', null, b.name), h('td', { class: 'muted small' }, fmtTime(b.mtime))); })))
          : h('div', { class: 'muted' }, 'No automatic backups yet.')),
      h('div', { class: 'card', style: { maxWidth: '760px' } }, h('h3', null, 'About'),
        h('div', null, 'GDSS Dutse Results \u2022 version ' + ver.version), h('div', { class: 'muted small' }, 'Works fully offline. No account or internet connection is needed.')));
  };
})();
