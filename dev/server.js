/**
 * dev/server.js — jalankan Web App secara lokal dengan backend emulator.
 *   node dev/server.js          -> http://localhost:8787
 * Data hanya di memori (hilang saat server berhenti). Akun uji: lihat AKUN_UJI di bawah.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { buatProyek } = require('./emulator');

const PORT = Number(process.env.PORT) || 8787;
const JEDA_MS = 300; // meniru latensi google.script.run
const ROOT = path.resolve(__dirname, '..');

// Akun uji khusus server lokal. Admin wajib ganti PIN saat login pertama (seperti produksi).
const AKUN_UJI = [
  { username: 'admin', nama: 'Administrator', pin: '482913', role: 'Admin', gantiPin: 'Ya' },
  { username: 'kasir', nama: 'Kasir Uji', pin: '2468', role: 'Kasir', gantiPin: 'Tidak' },
];

const P = buatProyek({ diam: false });
P.jalankan('denganKunci_(jalankanSetup_)');
P.jalankan('denganKunci_(isiContohData_)');
P.jalankan(`(function (akun) {
  const t = bacaTabel_('Pengguna');
  gantiIsiTabel_(t, akun.map(function (a) {
    const s = Utilities.getUuid();
    return keBaris_(t, { Username: a.username, Nama: a.nama, 'PIN Hash': hashPin_(s, a.pin), Salt: s, Role: a.role, Aktif: 'Ya', 'Ganti PIN': a.gantiPin });
  }));
  naikkanVersi_('user');
})(${JSON.stringify(AKUN_UJI)})`);
P.jalankan("(function(){ const t = bacaTabel_('Pengaturan'); const i = t.baris.findIndex(r => r[0] === 'NAMA_USAHA'); tulisSel_(t, i, 'Nilai', 'Toko Uji Lokal'); naikkanVersi_('atur'); })()");

// Riwayat penjualan 13 hari ke belakang (deterministik) agar Beranda & Laporan punya data.
// Hanya mencatat Transaksi/Detail (stok tidak dipotong) — cukup untuk mencoba tampilan laporan.
P.jalankan(`(function () {
  let benih = 7;
  const acak = () => { benih = (benih * 16807) % 2147483647; return (benih - 1) / 2147483646; };
  const it = bacaItem_().daftar.filter((i) => i.tipe !== 'Bahan');
  const trx = [], det = [];
  const hariIni = new Date();
  for (let mundur = 13; mundur >= 1; mundur--) {
    const dasar = new Date(hariIni.getTime() - mundur * 86400000);
    const ymd = Utilities.formatDate(dasar, 'Asia/Jakarta', 'yyMMdd');
    const jumlah = 6 + Math.floor(acak() * 18) + (dasar.getUTCDay() === 6 ? 8 : 0);
    const jamList = [];
    for (let n = 0; n < jumlah; n++) jamList.push(7 + Math.floor(Math.pow(acak(), 0.8) * 14));
    jamList.sort((a, b) => a - b);
    jamList.forEach((jam, n) => {
      const tgl = new Date(Date.UTC(dasar.getUTCFullYear(), dasar.getUTCMonth(), dasar.getUTCDate(), jam - 7, Math.floor(acak() * 60)));
      const no = 'INV-' + ymd + '-' + String(n + 1).padStart(4, '0');
      let subtotal = 0;
      const baris = 1 + Math.floor(acak() * 3);
      for (let b = 0; b < baris; b++) {
        const item = it[Math.floor(acak() * it.length)];
        const qty = 1 + Math.floor(acak() * 3);
        subtotal += item.hargaJual * qty;
        det.push({ 'No Nota': no, 'ID Item': item.id, Nama: item.nama, Qty: qty, Harga: item.hargaJual, Subtotal: item.hargaJual * qty, 'HPP Satuan': item.hargaBeli });
      }
      const metode = acak() < 0.62 ? 'Tunai' : acak() < 0.8 ? 'QRIS' : 'Transfer';
      const batal = acak() < 0.03;
      trx.push({ 'No Nota': no, Tanggal: tgl, Kasir: acak() < 0.6 ? 'kasir' : 'admin', Subtotal: subtotal, Diskon: 0, Pajak: 0, Total: subtotal,
        Metode: metode, Status: batal ? 'Batal' : 'Lunas', Referensi: '', Bayar: subtotal, Kembalian: 0, Catatan: '' });
    });
  }
  tambahObjek_(bacaHeader_('Transaksi'), trx);
  tambahObjek_(bacaHeader_('Detail'), det);
})()`);

const MOCK_RUN = `<script>
(function () {
  function runner(sukses, gagal) {
    return new Proxy({}, { get: function (_, nama, runnerIni) {
      if (nama === 'withSuccessHandler') return function (f) { return runner(f, gagal); };
      if (nama === 'withFailureHandler') return function (f) { return runner(sukses, f); };
      return function () {
        // Seketat runner asli: harus dipanggil sebagai metode runner (this = runner).
        if (this !== runnerIni) throw new TypeError('google.script.run.' + nama + ' dipanggil tanpa this runner');
        var args = Array.prototype.slice.call(arguments);
        fetch('/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nama: nama, args: args }) })
          .then(function (r) { return r.json(); })
          .then(function (j) { if (j.error) { if (gagal) gagal(new Error(j.error)); } else if (sukses) sukses(j.hasil); })
          .catch(function (e) { if (gagal) gagal(e); });
      };
    } });
  }
  window.google = { script: { run: runner(null, null) } };
})();
</script>`;

function renderHalaman() {
  let html = fs.readFileSync(path.join(ROOT, 'Index.html'), 'utf8');
  html = html.replace(/<\?!=\s*include\('(\w+)'\);\s*\?>/g, (_, nama) => fs.readFileSync(path.join(ROOT, nama + '.html'), 'utf8'));
  // Tiru <?= var ?> HtmlService (dengan escape HTML) untuk variabel template dari doGet.
  const varTemplat = { namaToko: P.jalankan('String(bacaPengaturan_().NAMA_USAHA)') };
  html = html.replace(/<\?=\s*(\w+)\s*\?>/g, (_, nama) => String(varTemplat[nama] ?? '')
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]));
  // Meniru addMetaTag('viewport') dari doGet.
  html = html.replace('<head>', '<head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">');
  return html.replace('<body>', '<body>' + MOCK_RUN);
}

http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderHalaman());
    return;
  }
  if (req.method === 'POST' && req.url === '/api') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => setTimeout(() => {
      let keluar;
      try {
        const { nama, args } = JSON.parse(body);
        keluar = { hasil: P.panggilKlien(nama, args) };
        console.log('[api]', nama, keluar.hasil && keluar.hasil.ok === false ? '-> ' + keluar.hasil.kode : '');
      } catch (e) {
        console.error('[api] galat', e.message);
        keluar = { error: e.message };
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(keluar));
    }, JEDA_MS));
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(PORT, () => console.log('POS lokal: http://localhost:' + PORT));
