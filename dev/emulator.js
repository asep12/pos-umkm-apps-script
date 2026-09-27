/**
 * dev/emulator.js — emulator minimal layanan Apps Script untuk uji lokal (Node >= 18).
 * BUKAN bagian aplikasi (tidak di-push clasp). Meniru perilaku yang relevan:
 *  - setValues: teks berawalan apostrof disimpan tanpa apostrof; teks angka polos jadi Number.
 *  - Fungsi berakhiran "_" tidak bisa dipanggil dari klien.
 *  - Nilai kembalian berisi Date menjadi null (seperti google.script.run).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const FILE_GS = ['Code.js', 'Db.js', 'Logika.js', 'Pengaturan.js', 'Auth.js', 'Item.js', 'Resep.js', 'Transaksi.js', 'Stok.js', 'Laporan.js', 'Kas.js', 'Bill.js', 'Contoh.js', 'Setup.js', 'Tes.js'];

function nilaiSel(v) {
  if (typeof v === 'string') {
    if (v.startsWith("'")) return v.slice(1);
    if (/^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  }
  return v === undefined || v === null ? '' : v;
}

class Sheet {
  constructor(nama, id) { this.nama = nama; this.id = id; this.data = []; this.maxRows = 1000; }
  getSheetId() { return this.id; }
  setColumnWidth() { return this; }
  getRangeList(a1) {
    const rs = a1.map((a) => { const m = /^([A-Z])(\d+)$/.exec(a); return this.getRange(Number(m[2]), m[1].charCodeAt(0) - 64); });
    return { setFontWeight: () => rs };
  }
  getName() { return this.nama; }
  getLastRow() {
    for (let r = this.data.length - 1; r >= 0; r--) if ((this.data[r] || []).some((v) => v !== '')) return r + 1;
    return 0;
  }
  getLastColumn() {
    let m = 0;
    this.data.forEach((row) => { for (let c = row.length - 1; c >= 0; c--) if (row[c] !== '') { m = Math.max(m, c + 1); break; } });
    return m;
  }
  getMaxRows() { return Math.max(this.maxRows, this.data.length); }
  getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  getRange(r, c, nr, nc) {
    if (!(r >= 1 && c >= 1)) throw new Error('Range tidak valid: ' + r + ',' + c);
    return new Range(this, r, c, nr || 1, nc || 1);
  }
  setFrozenRows() { return this; }
  sel(r, c) { return (this.data[r - 1] || [])[c - 1] ?? ''; }
  tulis(r, c, v) {
    while (this.data.length < r) this.data.push([]);
    const row = this.data[r - 1];
    while (row.length < c) row.push('');
    row[c - 1] = v;
  }
}

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push(this.sheet.sel(this.r + i, this.c + j));
      out.push(row);
    }
    return out;
  }
  setValues(v) {
    if (v.length !== this.nr || v.some((row) => row.length !== this.nc)) {
      throw new Error(`Exception: The number of rows/columns in the data does not match the range (${v.length}x${v[0] && v[0].length} vs ${this.nr}x${this.nc})`);
    }
    v.forEach((row, i) => row.forEach((x, j) => this.sheet.tulis(this.r + i, this.c + j, nilaiSel(x))));
    return this;
  }
  setValue(x) { this.sheet.tulis(this.r, this.c, nilaiSel(x)); return this; }
  clearContent() {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet.tulis(this.r + i, this.c + j, '');
    return this;
  }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setDataValidation() { return this; }
  setNumberFormat() { return this; }
}

function buatSpreadsheet() {
  let nextId = 1;
  const sheets = [new Sheet('Sheet1', 0)];
  return {
    sheets,
    getSheetByName: (n) => sheets.find((s) => s.nama === n) || null,
    insertSheet: (n, idx) => {
      if (sheets.some((s) => s.nama === n)) throw new Error('A sheet with the name "' + n + '" already exists.');
      const s = new Sheet(n, nextId++);
      sheets.splice(idx === undefined ? sheets.length : idx, 0, s);
      return s;
    },
    getUrl: () => 'https://docs.google.com/spreadsheets/d/EMULATOR/edit',
    getSheets: () => sheets.slice(),
    deleteSheet: (s) => { sheets.splice(sheets.indexOf(s), 1); },
  };
}

function buatCache() {
  const m = new Map();
  const hidup = (k) => { const e = m.get(k); if (!e) return undefined; if (e.exp < Date.now()) { m.delete(k); return undefined; } return e.v; };
  return {
    get: (k) => { const v = hidup(k); return v === undefined ? null : v; },
    put: (k, v, ttl) => {
      if (String(v).length > 100000) throw new Error('Argument too large');
      m.set(k, { v: String(v), exp: Date.now() + (ttl || 600) * 1000 });
    },
    remove: (k) => m.delete(k),
    getAll: (ks) => { const o = {}; ks.forEach((k) => { const v = hidup(k); if (v !== undefined) o[k] = v; }); return o; },
    putAll: function (o, ttl) { Object.keys(o).forEach((k) => this.put(k, o[k], ttl)); },
    _map: m,
  };
}

function formatDate(d, tz, pola) {
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  return pola.replace(/yyyy|yy|MM|dd|HH|mm|ss/g, (t) => ({
    yyyy: p.year, yy: p.year.slice(2), MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second,
  })[t]);
}

/** Buat satu "proyek Apps Script" terisolasi dengan Spreadsheet kosong. */
function buatProyek(opsi) {
  const o = opsi || {};
  const ss = buatSpreadsheet();
  const cache = buatCache();
  const props = new Map();
  let terkunci = false;
  const ctx = {
    console: o.diam ? { log() {}, warn() {}, error: (...a) => console.error('[server]', ...a) } : console,
    SpreadsheetApp: {
      getActive: () => ss,
      getActiveSpreadsheet: () => ss,
      flush: () => {},
      getUi: () => { throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); },
      newDataValidation: () => {
        const b = { requireValueInList: () => b, setAllowInvalid: () => b, build: () => ({}) };
        return b;
      },
    },
    CacheService: { getScriptCache: () => cache },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => { if (terkunci) return false; terkunci = true; return true; },
        releaseLock: () => { terkunci = false; },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => { props.set(k, String(v)); },
      }),
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => Array.from(crypto.createHash(alg).update(s, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      formatDate,
    },
    Session: { getScriptTimeZone: () => 'Asia/Jakarta' },
    HtmlService: {
      createHtmlOutput: (s) => ({ setWidth() { return this; }, setHeight() { return this; }, getContent: () => s }),
      createHtmlOutputFromFile: (n) => ({ getContent: () => fs.readFileSync(path.join(ROOT, n + '.html'), 'utf8') }),
    },
  };
  vm.createContext(ctx);
  FILE_GS.forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));

  function adaDate(v) {
    if (v instanceof Date || Object.prototype.toString.call(v) === '[object Date]') return true;
    if (v && typeof v === 'object') return Object.values(v).some(adaDate);
    return false;
  }

  return {
    ctx, ss, cache, props,
    /** Panggil seperti google.script.run: hanya fungsi publik, hasil ber-Date -> null. */
    panggilKlien(nama, args) {
      if (/_$/.test(nama) || typeof ctx[nama] !== 'function') throw new Error('Script function not found: ' + nama);
      const hasil = ctx[nama].apply(null, args || []);
      if (adaDate(hasil)) {
        console.error('!! Nilai kembalian ' + nama + ' berisi Date -> klien menerima null');
        return null;
      }
      return JSON.parse(JSON.stringify(hasil === undefined ? null : hasil));
    },
    /** Jalankan kode server langsung (setara menjalankan dari editor/menu). */
    jalankan(kode) { return vm.runInContext(kode, ctx); },
    sheet(nama) { return ss.getSheetByName(nama); },
  };
}

module.exports = { buatProyek, formatDate };
