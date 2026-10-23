'use strict';
// Local data store: one JSON file on the computer, written safely (temp file + rename),
// with a rolling previous copy and automatic daily backups. No network, no database server.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const APP_MARK = 'gdss-dutse-results';
const DATA_VERSION = 1;

function newId() { return crypto.randomUUID(); }

function defaultTraits() {
  const skills = ['Handwriting', 'Games', 'Sports', 'Drawing and Painting', 'Crafts', 'Musical Skills'];
  const behaviours = ['Punctuality', 'Neatness', 'Honesty', 'Cooperation with Others', 'Leadership', 'Attentiveness', 'Perseverance', 'Politeness', 'Self Control'];
  const out = [];
  skills.forEach((name, i) => out.push({ id: newId(), name, group: 'skill', sort_order: i }));
  behaviours.forEach((name, i) => out.push({ id: newId(), name, group: 'behaviour', sort_order: i }));
  return out;
}

function emptyDb() {
  return {
    app: APP_MARK, version: DATA_VERSION, setup_done: false,
    settings: { school_name: '', board_name: '', address: '', logo_file: '' },
    sessions: [], terms: [], classes: [], subjects: [], students: [],
    scores: {}, ratings: {}, remarks: {},
    // PLACEHOLDER grading scale: replace with your school's scale in Settings > Grading scale
    grading: [
      { grade: 'A', min_score: 70, remark: 'Excellent' }, { grade: 'B', min_score: 60, remark: 'Very Good' },
      { grade: 'C', min_score: 50, remark: 'Good' }, { grade: 'D', min_score: 45, remark: 'Fair' },
      { grade: 'E', min_score: 40, remark: 'Pass' }, { grade: 'F', min_score: 0, remark: 'Fail' }
    ],
    traits: defaultTraits()
  };
}

function migrate(d) {
  const base = emptyDb();
  const out = Object.assign({}, base, d);
  out.settings = Object.assign({}, base.settings, d.settings || {});
  ['sessions', 'terms', 'classes', 'subjects', 'students', 'grading', 'traits'].forEach(k => { if (!Array.isArray(out[k])) out[k] = base[k]; });
  ['scores', 'ratings', 'remarks'].forEach(k => { if (!out[k] || typeof out[k] !== 'object' || Array.isArray(out[k])) out[k] = {}; });
  out.version = DATA_VERSION;
  return out;
}

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'data.json');
    this.prev = path.join(dir, 'data.previous.json');
    this.backupDir = path.join(dir, 'Backups');
    this.data = null;
    this._timer = null;
    this._dirty = false;
    this._lastRotate = 0;
  }

  _readJson(file) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not a data file');
    return migrate(parsed);
  }

  // Returns {fresh:boolean, recoveredFrom:string|null}. Throws (code CORRUPT) rather than ever starting empty over damaged data.
  load() {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.mkdirSync(this.backupDir, { recursive: true });
    if (!fs.existsSync(this.file)) {
      if (fs.existsSync(this.prev)) {
        try { this.data = this._readJson(this.prev); this._writeNow(); return { fresh: false, recoveredFrom: 'previous copy' }; } catch (e) { /* fall through */ }
      }
      this.data = emptyDb();
      this._writeNow();
      return { fresh: true, recoveredFrom: null };
    }
    try { this.data = this._readJson(this.file); return { fresh: false, recoveredFrom: null }; } catch (e) { /* try recovery */ }
    const candidates = [this.prev].concat(this.listBackups().map(b => b.path));
    for (const c of candidates) {
      try {
        if (!fs.existsSync(c)) continue;
        const raw = JSON.parse(fs.readFileSync(c, 'utf8'));
        const d = raw && raw.data && raw.app === APP_MARK ? raw.data : raw;
        this.data = migrate(d);
        fs.copyFileSync(this.file, path.join(this.dir, 'data.damaged-' + Date.now() + '.json'));
        this._writeNow();
        return { fresh: false, recoveredFrom: path.basename(c) };
      } catch (e) { /* next */ }
    }
    const err = new Error('The data file is damaged and no backup could be read.');
    err.code = 'CORRUPT';
    throw err;
  }

  save() {
    this._dirty = true;
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = null; try { this._writeNow(); } catch (e) { console.error('save failed', e); } }, 400);
  }

  flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this._dirty) this._writeNow();
  }

  _writeNow() {
    const json = JSON.stringify(this.data);
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, json);
    const now = Date.now();
    if (fs.existsSync(this.file) && now - this._lastRotate > 60000) {
      try { fs.copyFileSync(this.file, this.prev); this._lastRotate = now; } catch (e) { /* ignore */ }
    }
    let lastErr = null;
    for (let i = 0; i < 5; i++) {
      try { fs.renameSync(tmp, this.file); lastErr = null; break; } catch (e) { lastErr = e; }
    }
    if (lastErr) { fs.writeFileSync(this.file, json); try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ } }
    this._dirty = false;
  }

  // ---- logo
  setLogo(ext, buffer) {
    ext = String(ext).toLowerCase().replace('.', '');
    if (!['png', 'jpg', 'jpeg'].includes(ext)) throw new Error('Choose a PNG or JPG image for the logo.');
    if (buffer.length > 5 * 1024 * 1024) throw new Error('The logo is larger than 5 MB. Choose a smaller image.');
    const name = 'logo.' + (ext === 'jpeg' ? 'jpg' : ext);
    for (const old of ['logo.png', 'logo.jpg']) { try { fs.unlinkSync(path.join(this.dir, old)); } catch (e) { /* none */ } }
    fs.writeFileSync(path.join(this.dir, name), buffer);
    this.data.settings.logo_file = name;
    this.save();
  }
  removeLogo() {
    const n = this.data.settings.logo_file;
    if (n) { try { fs.unlinkSync(path.join(this.dir, n)); } catch (e) { /* none */ } }
    this.data.settings.logo_file = '';
    this.save();
  }
  getLogoDataUrl() {
    const n = this.data.settings.logo_file;
    if (!n) return null;
    try {
      const buf = fs.readFileSync(path.join(this.dir, n));
      return 'data:image/' + (n.endsWith('.png') ? 'png' : 'jpeg') + ';base64,' + buf.toString('base64');
    } catch (e) { return null; }
  }

  // ---- backups
  _exportObject() {
    const logo = this.getLogoDataUrl();
    return { app: APP_MARK, version: DATA_VERSION, exported_at: new Date().toISOString(), data: this.data, logo: logo };
  }
  exportBackupJson() { return JSON.stringify(this._exportObject()); }

  listBackups() {
    try {
      return fs.readdirSync(this.backupDir).filter(f => /\.json$/.test(f))
        .map(f => { const p = path.join(this.backupDir, f); return { name: f, path: p, mtime: fs.statSync(p).mtimeMs }; })
        .sort((a, b) => b.mtime - a.mtime);
    } catch (e) { return []; }
  }

  // one automatic backup per day, keep the newest 14
  autoBackup() {
    const day = new Date().toISOString().slice(0, 10);
    const target = path.join(this.backupDir, 'auto-' + day + '.json');
    if (!fs.existsSync(target)) fs.writeFileSync(target, this.exportBackupJson());
    const autos = this.listBackups().filter(b => /^auto-/.test(b.name));
    autos.slice(14).forEach(b => { try { fs.unlinkSync(b.path); } catch (e) { /* ignore */ } });
    return target;
  }

  restoreFromJson(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error('This file is not a GDSS Dutse Results backup.'); }
    if (!obj || obj.app !== APP_MARK || !obj.data || typeof obj.data !== 'object') throw new Error('This file is not a GDSS Dutse Results backup.');
    const restored = migrate(obj.data);
    // safety copy of the current data first
    const safety = path.join(this.backupDir, 'before-restore-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
    fs.writeFileSync(safety, this.exportBackupJson());
    this.data = restored;
    for (const old of ['logo.png', 'logo.jpg']) { try { fs.unlinkSync(path.join(this.dir, old)); } catch (e) { /* none */ } }
    if (obj.logo && /^data:image\/(png|jpeg);base64,/.test(obj.logo) && restored.settings.logo_file) {
      const b64 = obj.logo.split(',')[1];
      fs.writeFileSync(path.join(this.dir, restored.settings.logo_file), Buffer.from(b64, 'base64'));
    } else {
      restored.settings.logo_file = '';
    }
    this._writeNow();
    return { safety };
  }
}

module.exports = { Store, newId, emptyDb, migrate, APP_MARK };
