'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  call: (name, ...args) => ipcRenderer.invoke('svc', name, args),
  exportFile: (name, args) => ipcRenderer.invoke('export', name, args),
  pickFile: kind => ipcRenderer.invoke('pickFile', kind),
  pickLogo: () => ipcRenderer.invoke('pickLogo'),
  generatePdf: opts => ipcRenderer.invoke('pdf', opts),
  cancelPdf: () => ipcRenderer.invoke('pdfCancel'),
  onPdfProgress: cb => { ipcRenderer.removeAllListeners('pdf:progress'); ipcRenderer.on('pdf:progress', (_e, p) => cb(p)); },
  openPath: p => ipcRenderer.invoke('openPath', p),
  showInFolder: p => ipcRenderer.invoke('showInFolder', p),
  printHtml: html => ipcRenderer.invoke('printHtml', html),
  backupNow: () => ipcRenderer.invoke('backupNow'),
  restoreBackup: () => ipcRenderer.invoke('restoreBackup'),
  openDataFolder: () => ipcRenderer.invoke('openDataFolder'),
  getVersion: () => ipcRenderer.invoke('getVersion')
});
