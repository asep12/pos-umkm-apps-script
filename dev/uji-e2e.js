/**
 * dev/uji-e2e.js — uji ujung-ke-ujung backend Fase 1 memakai emulator.
 * Jalankan: node dev/uji-e2e.js
 */
const { buatProyek } = require('./emulator');

let lulus = 0;
const gagal = [];
function uji(nama, fn) {
  try {
    fn();
    lulus++;
    console.log('✔ ' + nama);
  } catch (e) {
    gagal.push(nama);
    console.log('✘ ' + nama + '\n    ' + e.message);
  }
}
function pastikan(kondisi, pesan) { if (!kondisi) throw new Error(pesan); }
function sama(a, b, pesan) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((pesan || '') + ' dapat ' + JSON.stringify(a) + ', harap ' + JSON.stringify(b));
}

const P = buatProyek({ diam: true });
const api = (nama, ...args) => P.panggilKlien(nama, args);
const ok = (res, pesan) => { pastikan(res && res.ok, (pesan || 'harus ok') + ': ' + JSON.stringify(res)); return res.data; };
const galat = (res, kode) => { pastikan(res && !res.ok && res.kode === kode, 'harap kode ' + kode + ', dapat ' + JSON.stringify(res)); return res; };
const barisData = (nama) => P.sheet(nama).getDataRange().getValues().slice(1).filter((r) => r.some((v) => v !== ''));
const kolom = (nama, kol) => P.sheet(nama).getRange(1, 1, 1, P.sheet(nama).getLastColumn()).getValues()[0].indexOf(kol);
const itemById = (id) => { const r = barisData('Item').find((x) => x[0] === id); return r; };
const stokItem = (id) => itemById(id)[kolom('Item', 'Stok')];

let pinAdmin;
let token;
let tokenKasir;

uji('Setup Awal di Spreadsheet kosong membuat semua sheet + admin', () => {
  const h = P.jalankan('denganKunci_(jalankanSetup_)');
  pastikan(h.admin && /^\d{6}$/.test(h.admin.pin), 'PIN admin 6 digit');
  pinAdmin = h.admin.pin;
  ['Item', 'Resep', 'Transaksi', 'Detail', 'Stok_Log', 'Harga_Log', 'Pengguna', 'Pengaturan'].forEach((n) => pastikan(P.sheet(n), 'sheet ' + n));
  pastikan(!P.sheet('Sheet1'), 'Sheet1 kosong dihapus');
  sama(barisData('Pengguna').length, 1);
});

uji('Setup Awal aman dijalankan ulang (idempotent)', () => {
  const jumlahAtur = barisData('Pengaturan').length;
  const h = P.jalankan('denganKunci_(jalankanSetup_)');
  sama(h.admin, null, 'tidak ada admin baru');
  sama(barisData('Pengguna').length, 1);
  sama(barisData('Pengaturan').length, jumlahAtur);
});

uji('Setup Awal menambah kolom yang hilang (migrasi)', () => {
  const sh = P.sheet('Transaksi');
  const i = kolom('Transaksi', 'Pajak');
  sh.getRange(1, i + 1).setValue('');
  P.jalankan('denganKunci_(jalankanSetup_)');
  pastikan(kolom('Transaksi', 'Pajak') !== -1, 'kolom Pajak kembali');
});

uji('setupAwal / fungsi privat tidak bisa dipanggil dari Web App', () => {
  let ditolak = false;
  try { api('setupAwal'); } catch (e) { ditolak = true; }
  pastikan(ditolak, 'setupAwal harus ditolak');
  let ditolak2 = false;
  try { api('jalankanSetup_'); } catch (e) { ditolak2 = true; }
  pastikan(ditolak2, 'fungsi privat harus ditolak');
});

uji('Login admin -> wajib ganti PIN sebelum memakai aplikasi', () => {
  galat(api('login', 'admin', '0000'), 'VALIDASI');
  const d = ok(api('login', 'ADMIN', pinAdmin), 'login');
  sama(d.wajibGantiPin, true);
  token = d.token;
  galat(api('muatAwal', token), 'WAJIB_GANTI_PIN');
  galat(api('gantiPin', token, pinAdmin, '123456'), 'VALIDASI'); // PIN lemah
  galat(api('gantiPin', token, '999999', '481937'), 'VALIDASI'); // PIN lama salah
  ok(api('gantiPin', token, pinAdmin, '481937'));
  ok(api('muatAwal', token));
  pastikan(!JSON.stringify(barisData('Pengguna')).includes('481937'), 'PIN tidak disimpan polos');
});

uji('Token palsu / kosong ditolak dengan SESI_HABIS', () => {
  galat(api('muatAwal', 'bukan-token'), 'SESI_HABIS');
  galat(api('muatAwal', '00000000-0000-0000-0000-000000000000'), 'SESI_HABIS');
});

uji('5x PIN salah -> terkunci, walau PIN benar', () => {
  for (let i = 0; i < 5; i++) galat(api('login', 'admin', '1111'), 'VALIDASI');
  galat(api('login', 'admin', '481937'), 'TERKUNCI');
  P.cache.remove('gagal:admin'); // simulasi 10 menit berlalu
  ok(api('login', 'admin', '481937'));
});

const kat = P.jalankan('katalogContoh_()');
uji('Contoh Data mengisi item + resep (katalog lengkap, barcode EAN-13 valid)', () => {
  const n = P.jalankan('denganKunci_(isiContohData_)');
  sama(n, kat.item.length);
  sama(barisData('Resep').length, kat.resep.length, 'semua resep');
  const d = ok(api('muatAwal', token));
  pastikan(d.items.every((i) => i.tipe !== 'Bahan'), 'bahan tidak tampil di kasir');
  pastikan(d.items.find((i) => i.nama === 'Kopi Susu').hargaBeli === 150 * 15 + 40 * 30, 'HPP kopi susu');
  pastikan(d.items.find((i) => i.nama === 'Es Kopi Susu Gula Aren').hargaBeli === 18 * 150 + 120 * 18 + 25 * 50 + 4 * 200, 'HPP es kopi gula aren');
  const kode = barisData('Item').filter((r) => r[kolom('Item', 'Tipe')] === 'Barang').map((r) => String(r[kolom('Item', 'Kode')]));
  pastikan(kode.every((k) => /^200\d{10}$/.test(k) && P.jalankan("ean13_('" + k.slice(0, 12) + "')") === k), 'barcode valid');
  sama(new Set(kode).size, kode.length, 'barcode unik');
  pastikan(ok(api('listStokMenipis', token)).length >= 2, 'ada contoh stok menipis');
});

uji('Contoh Data aman dijalankan ulang (hanya menambah yang belum ada)', () => {
  let pesan = '';
  try { P.jalankan('denganKunci_(isiContohData_)'); } catch (e) { pesan = e.message; }
  pastikan(/sudah ada/.test(pesan), 'harus menolak: ' + pesan);
  sama(barisData('Item').length, kat.item.length, 'tidak ada duplikat');
});

uji('Jual 1 Barang: stok berkurang + Stok_Log Jual', () => {
  const sebelum = stokItem('ITM-0001');
  const nota = ok(api('buatTransaksi', token, { items: [{ idItem: 'ITM-0001', qty: 1 }], metode: 'Tunai', bayar: 20000 }));
  sama(stokItem('ITM-0001'), sebelum - 1);
  sama([nota.total, nota.kembalian], [17000, 3000]);
  const log = barisData('Stok_Log').filter((r) => r[kolom('Stok_Log', 'Ref')] === nota.noNota);
  sama(log.length, 1);
  sama([log[0][kolom('Stok_Log', 'Jenis')], log[0][kolom('Stok_Log', 'Qty')]], ['Jual', -1]);
  sama(nota.stokBaru['ITM-0001'], sebelum - 1);
});

uji('Jual Menu ber-resep: stok tiap bahan berkurang sesuai resep x qty', () => {
  const kopi = stokItem('ITM-0006');
  const susu = stokItem('ITM-0008');
  const gula = stokItem('ITM-0007');
  // 2 Kopi Susu + 1 Kopi Hitam: kopi 3x15, susu 2x30, gula 1x15
  ok(api('buatTransaksi', token, {
    items: [{ idItem: 'ITM-0012', qty: 2 }, { idItem: 'ITM-0011', qty: 1 }], metode: 'QRIS', referensi: 'QR-1',
  }));
  sama([stokItem('ITM-0006'), stokItem('ITM-0008'), stokItem('ITM-0007')], [kopi - 45, susu - 60, gula - 15]);
  sama(stokItem('ITM-0012'), 0, 'stok menu tidak dipakai');
});

uji('Menu tanpa resep / tidak dilacak tetap bisa dijual tanpa potong stok', () => {
  const log = barisData('Stok_Log').length;
  ok(api('buatTransaksi', token, { items: [{ idItem: 'ITM-0014', qty: 3 }], metode: 'Tunai', bayar: 45000 }));
  sama(barisData('Stok_Log').length, log);
});

uji('Penjualan melebihi stok ditolak dengan nama item', () => {
  const res = galat(api('buatTransaksi', token, { items: [{ idItem: 'ITM-0005', qty: 999 }], metode: 'Tunai', bayar: 1e9 }), 'STOK_KURANG');
  pastikan(res.pesan.includes('Telur Ayam'), res.pesan);
  const res2 = galat(api('buatTransaksi', token, { items: [{ idItem: 'ITM-0013', qty: 60 }], metode: 'QRIS' }), 'STOK_KURANG');
  pastikan(res2.pesan.includes('Teh Celup'), res2.pesan);
});

uji('Transaksi beruntun: nomor nota berbeda & berurutan', () => {
  const a = ok(api('buatTransaksi', token, { items: [{ idItem: 'ITM-0003', qty: 1 }], metode: 'Transfer' }));
  const b = ok(api('buatTransaksi', token, { items: [{ idItem: 'ITM-0003', qty: 1 }], metode: 'Transfer' }));
  pastikan(a.noNota !== b.noNota, 'nota harus beda');
  sama(Number(b.noNota.slice(-4)), Number(a.noNota.slice(-4)) + 1);
  pastikan(/^INV-\d{6}-\d{4}$/.test(a.noNota), a.noNota);
});

uji('Harga dari klien diabaikan; diskon & pajak dihitung server', () => {
  P.jalankan("tulisSel_(bacaTabel_('Pengaturan'), bacaTabel_('Pengaturan').baris.findIndex(r => r[0] === 'PAJAK_PERSEN'), 'Nilai', 10); naikkanVersi_('atur')");
  const n = ok(api('buatTransaksi', token, {
    items: [{ idItem: 'ITM-0004', qty: 2, harga: 1 }], diskon: { jenis: 'persen', nilai: 50 }, metode: 'Tunai', bayar: 10000,
  }));
  // 2 x 4000 = 8000, diskon 4000, pajak 400, total 4400
  sama([n.subtotal, n.diskon, n.pajak, n.total, n.kembalian], [8000, 4000, 400, 4400, 5600]);
  const trx = barisData('Transaksi').find((r) => r[0] === n.noNota);
  sama(trx[kolom('Transaksi', 'Pajak')], 400);
});

uji('Bayar tunai kurang ditolak, tanpa efek samping', () => {
  const trx = barisData('Transaksi').length;
  const stok = stokItem('ITM-0002');
  galat(api('buatTransaksi', token, { items: [{ idItem: 'ITM-0002', qty: 1 }], metode: 'Tunai', bayar: 100 }), 'VALIDASI');
  sama([barisData('Transaksi').length, stokItem('ITM-0002')], [trx, stok]);
});

uji('getNota: cetak ulang tanpa Date, isi lengkap', () => {
  const noNota = barisData('Transaksi')[0][0];
  const n = ok(api('getNota', token, noNota.toLowerCase()));
  sama(n.noNota, noNota);
  pastikan(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(n.tanggal), 'tanggal string: ' + n.tanggal);
  sama(n.items.length, 1);
  galat(api('getNota', token, 'INV-000000-9999'), 'TIDAK_ADA');
});

uji('Item baru: kode berawalan 0 & teks "=..." disimpan apa adanya sebagai teks', () => {
  const it = ok(api('simpanItem', token, { nama: '=IMPORTXML("http://x","//a")', tipe: 'Barang', kode: '00123', hargaJual: 5000, hargaBeli: 3000, stokAwal: 10, lacak: true }));
  const r = itemById(it.id);
  sama(r[kolom('Item', 'Kode')], '00123');
  sama(r[kolom('Item', 'Nama')], '=IMPORTXML("http://x","//a")');
  sama(it.id, 'ITM-' + String(kat.item.length + 1).padStart(4, '0'), 'ID berikutnya setelah katalog');
  galat(api('simpanItem', token, { nama: 'Lain', tipe: 'Barang', kode: '00123', hargaJual: 1 }), 'VALIDASI'); // kode kembar
  const logStok = barisData('Stok_Log').filter((x) => x[1] === it.id);
  sama(logStok.length, 1, 'stok awal tercatat');
});

uji('Ubah harga beli bahan -> Harga_Log + HPP menu ikut berubah', () => {
  const d = ok(api('listItem', token, { q: 'kopi bubuk' }));
  const kopi = d[0];
  const logSebelum = barisData('Harga_Log').length;
  ok(api('simpanItem', token, Object.assign({}, kopi, { hargaBeli: 200 })));
  const menu = ok(api('listItem', token, { q: 'kopi susu' }))[0];
  sama(menu.hargaBeli, 200 * 15 + 40 * 30);
  // 1 log bahan + 1 log per menu yang memakai Kopi Bubuk (dihitung dari katalog, bukan angka tetap)
  const menuKopi = new Set(kat.resep.filter((r) => r[1] === 'Kopi Bubuk').map((r) => r[0])).size;
  sama(barisData('Harga_Log').length - logSebelum, 1 + menuKopi);
});

uji('Simpan resep memvalidasi & memperbarui HPP', () => {
  galat(api('simpanResep', token, 'ITM-0013', [{ idBahan: 'ITM-0012', qty: 1 }]), 'VALIDASI');
  const r = ok(api('simpanResep', token, 'ITM-0013', [{ idBahan: 'ITM-0009', qty: 2 }, { idBahan: 'ITM-0007', qty: 25 }]));
  sama(r.hpp, 2 * 400 + 25 * 15);
  sama(barisData('Resep').filter((x) => x[0] === 'ITM-0013').length, 2);
  sama(barisData('Resep').length, kat.resep.length - 1, 'Es Teh: 3 bahan diganti 2');
});

uji('Nonaktifkan item: hilang dari kasir, penjualan ditolak', () => {
  ok(api('setAktifItem', token, 'ITM-0004', false));
  const d = ok(api('muatAwal', token));
  pastikan(!d.items.some((i) => i.id === 'ITM-0004'), 'tidak tampil');
  galat(api('buatTransaksi', token, { items: [{ idItem: 'ITM-0004', qty: 1 }], metode: 'QRIS' }), 'VALIDASI');
  ok(api('setAktifItem', token, 'ITM-0004', true));
});

uji('Role Kasir: boleh jual & lihat nota, tidak boleh ubah item/resep, tanpa harga beli', () => {
  P.jalankan(`(function(){ const t = bacaTabel_('Pengguna'); const s = Utilities.getUuid();
    tambahObjek_(t, [{ Username: 'budi', Nama: 'Budi', 'PIN Hash': hashPin_(s, '2468'), Salt: s, Role: 'Kasir', Aktif: 'Ya', 'Ganti PIN': 'Tidak' }]);
    naikkanVersi_('user'); })()`);
  tokenKasir = ok(api('login', 'budi', '2468')).token;
  const d = ok(api('muatAwal', tokenKasir));
  pastikan(d.items.every((i) => i.hargaBeli === undefined && i.margin === undefined), 'harga beli disembunyikan');
  const n = ok(api('buatTransaksi', tokenKasir, { items: [{ idItem: 'ITM-0003', qty: 1 }], metode: 'Tunai', bayar: 5000 }));
  const trx = barisData('Transaksi').find((r) => r[0] === n.noNota);
  sama(trx[kolom('Transaksi', 'Kasir')], 'budi', 'kasir dari sesi');
  sama(n.kasir, 'Budi');
  galat(api('simpanItem', tokenKasir, { nama: 'X', tipe: 'Barang', hargaJual: 1 }), 'AKSES_DITOLAK');
  galat(api('simpanResep', tokenKasir, 'ITM-0011', []), 'AKSES_DITOLAK');
  galat(api('getResep', tokenKasir, 'ITM-0011'), 'AKSES_DITOLAK');
  galat(api('setAktifItem', tokenKasir, 'ITM-0001', false), 'AKSES_DITOLAK');
  ok(api('getNota', tokenKasir, n.noNota));
});

uji('Kasir dinonaktifkan -> sesinya langsung berakhir', () => {
  P.jalankan(`(function(){ const t = bacaTabel_('Pengguna'); const i = t.baris.findIndex(r => r[0] === 'budi');
    tulisSel_(t, i, 'Aktif', 'Tidak'); naikkanVersi_('user'); })()`);
  galat(api('muatAwal', tokenKasir), 'SESI_HABIS');
});

uji('Cache item diperbarui setelah transaksi', () => {
  const sebelum = ok(api('muatAwal', token)).items.find((i) => i.id === 'ITM-0002').stok;
  ok(api('buatTransaksi', token, { items: [{ idItem: 'ITM-0002', qty: 2 }], metode: 'QRIS' }));
  const sesudah = ok(api('muatAwal', token)).items.find((i) => i.id === 'ITM-0002').stok;
  sama(sesudah, sebelum - 2);
});

uji('Transaksi saat kunci dipegang proses lain -> SIBUK', () => {
  P.jalankan('LockService.getScriptLock().tryLock(0)');
  galat(api('buatTransaksi', token, { items: [{ idItem: 'ITM-0003', qty: 1 }], metode: 'QRIS' }), 'SIBUK');
  P.jalankan('LockService.getScriptLock().releaseLock()');
});

// ======================= FASE 2 =======================
let tokenSiti;
const hariIni = () => P.jalankan("Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd')");
const logStok = (id, jenis) => barisData('Stok_Log').filter((r) => r[kolom('Stok_Log', 'ID Item')] === id && (!jenis || r[kolom('Stok_Log', 'Jenis')] === jenis));
const hargaBeli = (id) => itemById(id)[kolom('Item', 'Harga Beli')];

uji('[F2] Kelola pengguna: buat kasir -> PIN sementara -> wajib ganti PIN', () => {
  const r = ok(api('simpanPengguna', token, { baru: true, username: 'Siti', nama: 'Siti Aminah', role: 'Kasir' }));
  pastikan(/^\d{6}$/.test(r.pinSementara), 'PIN sementara 6 digit');
  sama(r.pengguna.username, 'siti');
  galat(api('simpanPengguna', token, { baru: true, username: 'siti', nama: 'Lain', role: 'Kasir' }), 'VALIDASI');
  const d = ok(api('login', 'siti', r.pinSementara));
  sama(d.wajibGantiPin, true);
  ok(api('gantiPin', d.token, r.pinSementara, '395172'));
  tokenSiti = d.token;
  const daftar = ok(api('listPengguna', token));
  pastikan(daftar.some((p) => p.username === 'siti') && !JSON.stringify(daftar).match(/hash|salt/i), 'tanpa hash/salt');
  galat(api('listPengguna', tokenSiti), 'AKSES_DITOLAK');
});

uji('[F2] Reset PIN, pengaman akun sendiri & minimal satu Admin aktif', () => {
  const r = ok(api('simpanPengguna', token, { username: 'siti', nama: 'Siti Aminah', role: 'Kasir', aktif: true, resetPin: true }));
  pastikan(/^\d{6}$/.test(r.pinSementara), 'PIN baru');
  galat(api('login', 'siti', '395172'), 'VALIDASI'); // PIN lama tidak berlaku lagi
  galat(api('simpanPengguna', token, { username: 'admin', nama: 'Administrator', role: 'Kasir' }), 'VALIDASI');
  galat(api('simpanPengguna', token, { username: 'admin', nama: 'Administrator', role: 'Admin', aktif: false }), 'VALIDASI');
  const r2 = ok(api('simpanPengguna', token, { username: 'siti', nama: 'Siti A.', role: 'Kasir', aktif: true }));
  sama(r2.pinSementara, null, 'ubah nama tidak mereset PIN');
  const s = ok(api('login', 'siti', r.pinSementara));
  ok(api('gantiPin', s.token, r.pinSementara, '395172'));
  tokenSiti = s.token;
});

uji('[F2] Stok masuk: stok bertambah, log Masuk, harga beli baru -> Harga_Log + HPP menu', () => {
  const stok = stokItem('ITM-0006');
  const hppKopiHitam = hargaBeli('ITM-0011');
  const r = ok(api('stokMasuk', token, { idItem: 'ITM-0006', qty: 500, hargaBeli: 180, ref: 'FAK-01', ket: 'Toko grosir' }));
  sama(r.stok, stok + 500);
  sama(stokItem('ITM-0006'), stok + 500);
  const log = logStok('ITM-0006', 'Masuk').pop();
  sama([log[kolom('Stok_Log', 'Qty')], log[kolom('Stok_Log', 'Ref')]], [500, 'FAK-01']);
  sama(hargaBeli('ITM-0006'), 180);
  pastikan(hargaBeli('ITM-0011') === hppKopiHitam + (180 - 200) * 15, 'HPP kopi hitam ikut turun');
  pastikan(r.hppMenuBerubah >= 2, 'menu terdampak dilaporkan');
  const s2 = stokItem('ITM-0001');
  ok(api('stokMasuk', token, { idItem: 'ITM-0001', qty: 1 }));
  sama(hargaBeli('ITM-0001'), 14500, 'tanpa harga -> harga tetap');
  sama(stokItem('ITM-0001'), s2 + 1);
});

uji('[F2] Stok masuk ditolak: Menu, qty 0, dan Kasir', () => {
  galat(api('stokMasuk', token, { idItem: 'ITM-0011', qty: 1 }), 'VALIDASI');
  galat(api('stokMasuk', token, { idItem: 'ITM-0001', qty: 0 }), 'VALIDASI');
  galat(api('stokMasuk', tokenSiti, { idItem: 'ITM-0001', qty: 1 }), 'AKSES_DITOLAK');
});

uji('[F2] Opname: selisih tercatat, stok = fisik, selisih 0 tidak dicatat', () => {
  const stokMinyak = stokItem('ITM-0002');
  const logSebelum = logStok('ITM-0002').length;
  const h = ok(api('opname', token, [{ idItem: 'ITM-0001', stokFisik: 3 }, { idItem: 'ITM-0002', stokFisik: stokMinyak }], 'Hitung bulanan'));
  sama(stokItem('ITM-0001'), 3);
  sama(h.find((x) => x.idItem === 'ITM-0002').selisih, 0);
  sama(logStok('ITM-0002').length, logSebelum, 'selisih 0 tanpa log');
  const log = logStok('ITM-0001', 'Opname').pop();
  sama(log[kolom('Stok_Log', 'Stok Sesudah')], 3);
  pastikan(String(log[kolom('Stok_Log', 'Keterangan')]).includes('Hitung bulanan'), 'keterangan');
  galat(api('opname', tokenSiti, [{ idItem: 'ITM-0001', stokFisik: 1 }], ''), 'AKSES_DITOLAK');
});

uji('[F2] Stok menipis & badge jumlah (Admin saja)', () => {
  const d = ok(api('listStokMenipis', token));
  pastikan(d.some((i) => i.id === 'ITM-0001'), 'Gula (3 <= min 5) menipis');
  pastikan(d.every((i) => i.menipis), 'semua menipis');
  pastikan(ok(api('muatAwal', token)).jumlahMenipis >= 1, 'badge admin');
  sama(ok(api('muatAwal', tokenSiti)).jumlahMenipis, 0, 'kasir tanpa badge');
});

uji('[F2] Riwayat stok: filter jenis/item/tanggal, tanggal berupa teks', () => {
  const r = ok(api('listStokLog', token, { jenis: 'Opname' }));
  pastikan(r.baris.length >= 1 && r.baris.every((b) => b.jenis === 'Opname'), 'hanya opname');
  pastikan(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(r.baris[0].tanggal), 'tanggal teks');
  const semua = ok(api('listStokLog', token, { idItem: 'ITM-0006' }));
  pastikan(semua.baris.every((b) => b.idItem === 'ITM-0006') && semua.baris[0].jenis === 'Masuk', 'terbaru dulu');
  sama(ok(api('listStokLog', token, { dari: '2020-01-01', sampai: '2020-01-31' })).baris.length, 0);
  galat(api('listStokLog', token, { jenis: 'Hilang' }), 'VALIDASI');
});

uji('[F2] Riwayat harga per item, terbaru dulu', () => {
  const r = ok(api('riwayatHarga', token, 'ITM-0006'));
  sama([r[0].hargaBeliLama, r[0].hargaBeliBaru], [200, 180]);
  sama(r.length, 2, 'ubah harga (Fase 1) + stok masuk; contoh data tidak mencatat harga awal');
  galat(api('riwayatHarga', tokenSiti, 'ITM-0006'), 'AKSES_DITOLAK');
});

let notaVoid;
uji('[F2] Void: stok bahan kembali persis walau resep sudah berubah', () => {
  const kopi = stokItem('ITM-0006');
  const susu = stokItem('ITM-0008');
  const n = ok(api('buatTransaksi', tokenSiti, { items: [{ idItem: 'ITM-0012', qty: 2 }, { idItem: 'ITM-0001', qty: 1 }], metode: 'Tunai', bayar: 100000 }));
  notaVoid = n.noNota;
  const gula = stokItem('ITM-0001');
  // Resep diubah setelah transaksi: void harus tetap mengembalikan 30 g kopi & 60 g susu.
  ok(api('simpanResep', token, 'ITM-0012', [{ idBahan: 'ITM-0006', qty: 99 }]));
  galat(api('voidTransaksi', tokenSiti, notaVoid, 'salah input'), 'AKSES_DITOLAK');
  galat(api('voidTransaksi', token, notaVoid, ''), 'VALIDASI');
  const v = ok(api('voidTransaksi', token, notaVoid, 'Pelanggan batal'));
  sama(v.status, 'Batal');
  sama([stokItem('ITM-0006'), stokItem('ITM-0008'), stokItem('ITM-0001')], [kopi, susu, gula + 1]);
  sama(logStok('ITM-0006', 'Void').length, 1);
  const trx = barisData('Transaksi').find((r) => r[0] === notaVoid);
  sama(trx[kolom('Transaksi', 'Status')], 'Batal');
  pastikan(String(trx[kolom('Transaksi', 'Catatan')]).includes('Pelanggan batal'), 'alasan tercatat');
  sama(barisData('Detail').filter((r) => r[0] === notaVoid).length, 2, 'detail tidak dihapus');
  galat(api('voidTransaksi', token, notaVoid, 'lagi'), 'VALIDASI');
  ok(api('simpanResep', token, 'ITM-0012', [{ idBahan: 'ITM-0006', qty: 15 }, { idBahan: 'ITM-0008', qty: 30 }]));
});

uji('[F2] Daftar transaksi: Kasir hanya miliknya hari ini, Admin semua + ringkasan', () => {
  const k = ok(api('listTransaksi', tokenSiti, { kasir: 'admin', dari: '2020-01-01' }));
  pastikan(k.baris.length >= 1 && k.baris.every((b) => b.kasir === 'Siti A.'), 'kasir: hanya miliknya');
  sama(k.rentang, { dari: hariIni(), sampai: hariIni() });
  const a = ok(api('listTransaksi', token, {}));
  pastikan(a.baris.length > k.baris.length, 'admin melihat semua');
  pastikan(a.ringkas.batal >= 1, 'nota batal terhitung');
  const lunas = barisData('Transaksi').filter((r) => r[kolom('Transaksi', 'Status')] === 'Lunas')
    .reduce((s, r) => s + r[kolom('Transaksi', 'Total')], 0);
  sama(a.ringkas.total, lunas, 'total tidak termasuk batal');
  const b = ok(api('listTransaksi', token, { status: 'Batal' }));
  pastikan(b.baris.every((x) => x.status === 'Batal') && b.baris.some((x) => x.noNota === notaVoid), 'filter status');
  sama(ok(api('listTransaksi', token, { q: notaVoid.slice(-4) })).baris.every((x) => x.noNota.endsWith(notaVoid.slice(-4))), true);
});

uji('[F2] Simpan pengaturan: validasi, nilai baru langsung dipakai (prefix nota, nama)', () => {
  const dasar = ok(api('getPengaturan', token));
  galat(api('simpanPengaturan', tokenSiti, dasar), 'AKSES_DITOLAK');
  galat(api('simpanPengaturan', token, Object.assign({}, dasar, { prefixNota: 'A B' })), 'VALIDASI');
  const baru = ok(api('simpanPengaturan', token, Object.assign({}, dasar, {
    nama: '=Warung Sri', prefixNota: 'tko', pajakPersen: 0, mode: 'Retail', lebarStruk: 80,
  })));
  sama([baru.nama, baru.prefixNota, baru.mode, baru.lebarStruk], ['=Warung Sri', 'TKO', 'Retail', 80]);
  const n = ok(api('buatTransaksi', tokenSiti, { items: [{ idItem: 'ITM-0003', qty: 1 }], metode: 'QRIS' }));
  pastikan(n.noNota.startsWith('TKO-'), n.noNota);
  sama(n.toko.nama, '=Warung Sri');
  sama(ok(api('muatAwal', tokenSiti)).toko.mode, 'Retail');
  sama(barisData('Pengaturan').filter((r) => r[0] === 'NAMA_USAHA').length, 1, 'tidak menggandakan kunci');
});

// ======================= FASE 3 =======================
/** Hitung ulang angka laporan hari ini langsung dari isi sheet (independen dari Laporan.js). */
function hitungManual() {
  const k = (n) => kolom('Transaksi', n);
  const trx = barisData('Transaksi');
  const lunas = trx.filter((r) => r[k('Status')] !== 'Batal');
  const nota = new Set(lunas.map((r) => r[0]));
  const det = barisData('Detail').filter((r) => nota.has(r[0]));
  const kd = (n) => kolom('Detail', n);
  const hpp = det.reduce((s, r) => s + Math.round(r[kd('HPP Satuan')] * r[kd('Qty')]), 0);
  const bersih = lunas.reduce((s, r) => s + r[k('Subtotal')] - r[k('Diskon')], 0);
  const perItem = {};
  det.forEach((r) => { perItem[r[kd('ID Item')]] = (perItem[r[kd('ID Item')]] || 0) + r[kd('Qty')]; });
  return {
    jumlah: lunas.length,
    omzet: lunas.reduce((s, r) => s + r[k('Total')], 0),
    labaKotor: bersih - hpp,
    batal: trx.length - lunas.length,
    perItem,
  };
}

uji('[F3] Laporan hari ini cocok dengan hitungan manual dari sheet', () => {
  const m = hitungManual();
  const r = ok(api('laporanRingkas', token, {}));
  sama([r.jumlah, r.omzet, r.labaKotor, r.batal.jumlah], [m.jumlah, m.omzet, m.labaKotor, m.batal]);
  sama(r.perHari.length, 1);
  sama(r.perHari[0].omzet, m.omzet);
  sama(r.perMetode.reduce((s, x) => s + x.total, 0), m.omzet, 'per metode = total');
  sama(r.perKasir.reduce((s, x) => s + x.jumlah, 0), m.jumlah, 'per kasir = jumlah');
  sama(r.perJam.reduce((s, x) => s + x.jumlah, 0), m.jumlah, 'per jam = jumlah');
  pastikan(r.perKasir.every((x) => x.nama), 'nama kasir terisi');
  const teratas = r.terlaris[0];
  sama(teratas.qty, Math.max(...Object.values(m.perItem)), 'terlaris = qty terbanyak');
  pastikan(r.terlaris.length <= 10, 'dibatasi 10');
});

uji('[F3] Laporan terlaris, rentang kosong, dan validasi rentang', () => {
  const t = ok(api('laporanTerlaris', token, { limit: 3 }));
  pastikan(t.length === 3 && t[0].qty >= t[1].qty && t[1].qty >= t[2].qty, 'urut qty menurun');
  const kosong = ok(api('laporanRingkas', token, { dari: '2020-01-01', sampai: '2020-01-31' }));
  sama([kosong.jumlah, kosong.perHari.length, kosong.margin], [0, 31, null]);
  galat(api('laporanRingkas', token, { dari: '2020-01-01', sampai: '2026-01-01' }), 'VALIDASI');
  galat(api('laporanRingkas', token, { dari: '2026-13-01' }), 'VALIDASI');
});

uji('[F3] Dashboard: hari ini, 7 hari, menipis, transaksi terakhir', () => {
  const m = hitungManual();
  const d = ok(api('dashboard', token));
  sama([d.hariIni.jumlah, d.hariIni.omzet, d.hariIni.labaKotor], [m.jumlah, m.omzet, m.labaKotor]);
  sama(d.kemarin.jumlah, 0);
  sama(d.tujuhHari.length, 7);
  sama(d.tujuhHari[6].tanggal, hariIni());
  sama(d.menipis.jumlah, ok(api('listStokMenipis', token)).length);
  sama(d.terakhir.length, 5);
  sama(d.terakhir[0].noNota, barisData('Transaksi').pop()[0], 'terbaru dulu');
  pastikan(d.terlaris.length <= 5, 'top 5');
});

uji('[F3] Ekspor laporan ke sheet baru (nama unik), isi cocok', () => {
  const m = hitungManual();
  const a = ok(api('eksporLaporan', token, {}));
  const b = ok(api('eksporLaporan', token, {}));
  pastikan(a.nama.startsWith('Lap ') && b.nama === a.nama + ' (2)', a.nama + ' / ' + b.nama);
  pastikan(/#gid=\d+$/.test(a.url), a.url);
  const isi = P.sheet(a.nama).getDataRange().getValues();
  const cari = (label) => isi.find((r) => r[0] === label);
  sama(cari('Laba kotor')[1], m.labaKotor);
  sama(cari('Jumlah transaksi')[1], m.jumlah);
  pastikan(typeof isi.find((r) => r[0] === 'Tanggal')[0] === 'string', 'header tabel');
  pastikan(typeof isi[isi.findIndex((r) => r[0] === 'Tanggal') + 1][0] === 'string', 'tanggal tetap teks');
  // Sheet laporan tidak mengganggu pembacaan tabel aplikasi.
  ok(api('muatAwal', token));
});

uji('[F3] Data multi-hari: rentang terpotong tepat, detail nota lintas blok baca', () => {
  const Q = buatProyek({ diam: true });
  Q.jalankan('denganKunci_(jalankanSetup_)');
  // 10 hari x 3 transaksi, kronologis, masing-masing 2 baris detail. Blok baca dikecilkan agar
  // kelompok detail satu nota terbelah di batas blok.
  Q.jalankan(`(function () {
    const trx = [], det = [];
    for (let d = 0; d < 10; d++) for (let n = 1; n <= 3; n++) {
      const tgl = new Date(Date.UTC(2026, 8, 10 + d, 3 + n, 0, 0)); // 10..19 Sep, jam WIB 10-12
      const no = 'INV-2609' + String(10 + d) + '-000' + n;
      trx.push({ 'No Nota': no, Tanggal: tgl, Kasir: 'admin', Subtotal: 3000, Diskon: 0, Pajak: 0, Total: 3000,
        Metode: 'Tunai', Status: n === 3 && d === 5 ? 'Batal' : 'Lunas', Bayar: 3000, Kembalian: 0 });
      det.push({ 'No Nota': no, 'ID Item': 'X1', Nama: 'A', Qty: 1, Harga: 1000, Subtotal: 1000, 'HPP Satuan': 400 });
      det.push({ 'No Nota': no, 'ID Item': 'X2', Nama: 'B', Qty: 2, Harga: 1000, Subtotal: 2000, 'HPP Satuan': 500 });
    }
    tambahObjek_(bacaHeader_('Transaksi'), trx);
    tambahObjek_(bacaHeader_('Detail'), det);
    const asli = telusuriMundur_;
    telusuriMundur_ = function (nama, fn) { return asli(nama, fn, 7); };
  })()`);
  const r = Q.jalankan(`ringkasPenjualan_.apply(null, (function () {
    const rg = { dari: '2026-09-14', sampai: '2026-09-16' };
    const d = kumpulkanPenjualan_(rg, 'Asia/Jakarta');
    return [d.trx, d.detail, rg];
  })())`);
  // 14–16 Sep = 9 transaksi, 1 batal (15 Sep #3) -> 8 lunas; laba per nota = 3000 − (400 + 1000) = 1600
  sama([r.jumlah, r.batal.jumlah, r.omzet, r.labaKotor], [8, 1, 24000, 12800]);
  sama(r.perHari.map((h) => h.jumlah), [3, 2, 3]);
  sama(r.terlaris.map((t) => [t.idItem, t.qty]), [['X2', 16], ['X1', 8]]);
});

uji('[F3] Semua laporan khusus Admin', () => {
  ['laporanRingkas', 'laporanTerlaris', 'dashboard', 'eksporLaporan'].forEach((f) => galat(api(f, tokenSiti, {}), 'AKSES_DITOLAK'));
});

// ======================= FASE 4: KAS & SHIFT =======================
let idShiftSiti;
uji('[F4] Tanpa shift: kasir tidak bisa catat kas; Admin boleh catat kas toko', () => {
  sama(ok(api('infoShift', tokenSiti)).shift, null);
  galat(api('catatKas', tokenSiti, { jenis: 'Keluar', kategori: 'Operasional', jumlah: 1000 }), 'SHIFT_TUTUP');
  const k = ok(api('catatKas', token, { jenis: 'Keluar', kategori: 'Operasional', jumlah: 25000, keterangan: 'listrik' }));
  pastikan(/^KAS-\d{6}-\d{4}$/.test(k.id) && k.shift === '', JSON.stringify(k));
  galat(api('catatKas', token, { jenis: 'Keluar', kategori: 'Lainnya', jumlah: 1000 }), 'VALIDASI'); // "Lainnya" wajib keterangan
});

uji('[F4] Buka shift, jual, catat kas -> rekap berjalan tepat', () => {
  const s = ok(api('bukaShift', tokenSiti, { modalAwal: 200000 }));
  idShiftSiti = s.id;
  pastikan(/^SFT-\d{6}-\d{4}$/.test(s.id) && s.status === 'Buka', JSON.stringify(s));
  galat(api('bukaShift', tokenSiti, { modalAwal: 0 }), 'VALIDASI'); // dua shift terbuka tidak boleh
  const t1 = ok(api('buatTransaksi', tokenSiti, { items: [{ idItem: 'ITM-0003', qty: 2 }], metode: 'Tunai', bayar: 10000 }));
  const t2 = ok(api('buatTransaksi', tokenSiti, { items: [{ idItem: 'ITM-0004', qty: 1 }], metode: 'QRIS' }));
  const t3 = ok(api('buatTransaksi', tokenSiti, { items: [{ idItem: 'ITM-0004', qty: 3 }], metode: 'Tunai', bayar: 20000 }));
  ok(api('voidTransaksi', token, t3.noNota, 'uji void di shift'));
  ok(api('catatKas', tokenSiti, { jenis: 'Keluar', kategori: 'Operasional', jumlah: 15000, keterangan: 'es batu' }));
  ok(api('catatKas', tokenSiti, { jenis: 'Masuk', kategori: 'Pendapatan lain', jumlah: 5000, keterangan: 'parkir' }));
  const info = ok(api('infoShift', tokenSiti)).shift;
  sama([info.jumlahTrx, info.batal, info.penjualanTunai, info.penjualanNonTunai, info.kasMasuk, info.kasKeluar],
    [2, 1, t1.total, t2.total, 5000, 15000]);
  sama(info.kasSeharusnya, 200000 + t1.total + 5000 - 15000);
  sama(info.kasFisik, null, 'shift terbuka belum punya uang fisik');
});

uji('[F4] Tutup shift dengan hitung pecahan -> selisih & snapshot tersimpan', () => {
  const seharusnya = ok(api('infoShift', tokenSiti)).shift.kasSeharusnya;
  galat(api('tutupShift', tokenSiti, { pecahan: { 75000: 1 } }), 'VALIDASI');
  // Uang fisik kurang Rp 1.000 dari seharusnya.
  const kurang = seharusnya - 1000;
  const pecahan = { 100000: Math.floor(kurang / 100000) };
  let sisa = kurang - pecahan[100000] * 100000;
  [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100].forEach((p) => { pecahan[p] = Math.floor(sisa / p); sisa -= pecahan[p] * p; });
  const r = ok(api('tutupShift', tokenSiti, { pecahan, catatan: 'selesai' }));
  sama([r.status, r.kasFisik, r.selisih, r.kasSeharusnya], ['Tutup', kurang, -1000, seharusnya]);
  pastikan(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(r.tutup), 'waktu tutup teks');
  const row = barisData('Shift').find((x) => x[0] === idShiftSiti);
  sama([row[kolom('Shift', 'Status')], row[kolom('Shift', 'Selisih')]], ['Tutup', -1000]);
  galat(api('tutupShift', tokenSiti, { kasFisik: 0 }), 'TIDAK_ADA');
  sama(ok(api('infoShift', tokenSiti)).shift, null);
  // Snapshot: void nota dari shift ini SETELAH ditutup tidak mengubah rekap tersimpan.
  const notaShift = ok(api('listTransaksi', tokenSiti, {})).baris.find((b) => b.status === 'Lunas' && b.metode === 'Tunai');
  ok(api('voidTransaksi', token, notaShift.noNota, 'uji snapshot'));
  const g = ok(api('getShift', token, idShiftSiti));
  sama([g.kasSeharusnya, g.kasFisik, g.selisih], [seharusnya, kurang, -1000]);
});

uji('[F4] Wajib buka kasir: jual ditolak tanpa shift; Admin menutup shift kasir lain', () => {
  const atur = ok(api('getPengaturan', token));
  ok(api('simpanPengaturan', token, Object.assign({}, atur, { wajibBukaKasir: true })));
  galat(api('buatTransaksi', tokenSiti, { items: [{ idItem: 'ITM-0003', qty: 1 }], metode: 'QRIS' }), 'SHIFT_TUTUP');
  const s = ok(api('bukaShift', tokenSiti, { modalAwal: 50000 }));
  ok(api('buatTransaksi', tokenSiti, { items: [{ idItem: 'ITM-0003', qty: 1 }], metode: 'QRIS' }));
  galat(api('getShift', tokenKasirLain(), s.id), 'AKSES_DITOLAK');
  const daftar = ok(api('listShift', token, {}));
  pastikan(daftar.baris.some((x) => x.id === s.id && x.status === 'Buka'), 'shift terbuka tampil untuk Admin');
  const r = ok(api('tutupShift', token, { idShift: s.id, kasFisik: 50000 }));
  sama([r.kasir, r.status, r.selisih], ['siti', 'Tutup', 0]);
  pastikan(r.catatan.includes('ditutup oleh admin'), r.catatan);
  ok(api('simpanPengaturan', token, Object.assign({}, atur, { wajibBukaKasir: false })));
  galat(api('listShift', tokenSiti, {}), 'AKSES_DITOLAK');
  galat(api('listKas', tokenSiti, {}), 'AKSES_DITOLAK');
});

uji('[F4] Arus kas & laba bersih di laporan', () => {
  const kas = ok(api('listKas', token, {}));
  sama([kas.ringkas.biaya, kas.ringkas.pendapatanLain], [25000 + 15000, 5000]);
  sama(kas.baris.length, 3);
  const lap = ok(api('laporanRingkas', token, {}));
  sama(lap.labaBersih, lap.labaKotor + 5000 - 40000);
  const ekspor = ok(api('eksporLaporan', token, {}));
  const isi = P.sheet(ekspor.nama).getDataRange().getValues();
  sama(isi.find((r) => r[0] === 'Laba bersih (perkiraan)')[1], lap.labaBersih);
});

uji('[F4] Cari nota berdasarkan nama kasir', () => {
  const r = ok(api('listTransaksi', token, { q: 'siti' }));
  pastikan(r.baris.length > 0 && r.baris.every((b) => b.kasir === 'Siti A.'), JSON.stringify(r.baris.slice(0, 2)));
});

// ======================= FASE 4: PRINTER, HARGA MASSAL, BILL =======================
uji('[F4b] Nota & rekap membawa teks struk thermal sesuai lebar kertas', () => {
  const kolom = ok(api('getPengaturan', token)).lebarStruk === 80 ? 48 : 32;
  const n = ok(api('buatTransaksi', token, { items: [{ idItem: 'ITM-0003', qty: 2 }], metode: 'Tunai', bayar: 10000 }));
  pastikan(Array.isArray(n.teks) && n.teks.every((b) => b.length <= kolom), 'lebar baris');
  pastikan(n.teks.join('\n').includes(n.noNota) && n.teks.some((b) => b.startsWith('TOTAL')), 'isi struk');
  sama(ok(api('getNota', token, n.noNota)).teks, n.teks, 'cetak ulang = struk asli');
  const s = ok(api('bukaShift', token, { modalAwal: 10000 }));
  const r = ok(api('tutupShift', token, { kasFisik: 10000 }));
  pastikan(r.teks.some((b) => b.startsWith('UANG FISIK')) && r.teks.some((b) => b.startsWith('Selisih')), JSON.stringify(r.teks));
  pastikan(s.id === r.id, 'shift sama');
});

uji('[F4b] Harga massal: pratinjau tidak menyimpan; simpan + Harga_Log; Bahan & nonaktif tidak tersentuh', () => {
  const sebelum = ok(api('listItem', token, { kategori: 'Sembako' }));
  const pr = ok(api('ubahHargaMassal', token, { kategori: 'Sembako', mode: 'persen', nilai: 10, bulat: 500, pratinjau: true }));
  sama(pr.disimpan, false);
  pastikan(pr.perubahan.length > 0 && pr.perubahan.every((p) => p.baru % 500 === 0 && p.baru > p.lama), 'naik & dibulatkan');
  sama(ok(api('listItem', token, { kategori: 'Sembako' })).map((i) => i.hargaJual), sebelum.map((i) => i.hargaJual), 'pratinjau tidak mengubah');
  const log = barisData('Harga_Log').length;
  const s = ok(api('ubahHargaMassal', token, { kategori: 'Sembako', mode: 'persen', nilai: 10, bulat: 500 }));
  sama(s.perubahan.length, pr.perubahan.length);
  sama(barisData('Harga_Log').length - log, s.perubahan.length, 'tercatat di riwayat');
  const gula = s.perubahan.find((p) => p.nama === 'Gula Pasir 1 kg');
  sama(ok(api('listItem', token, { q: 'Gula Pasir 1 kg' }))[0].hargaJual, gula.baru);
  pastikan(!s.perubahan.some((p) => p.nama === 'Gula (bahan)'), 'bahan tidak ikut');
  galat(api('ubahHargaMassal', tokenSiti, { mode: 'persen', nilai: 5 }), 'AKSES_DITOLAK');
  galat(api('ubahHargaMassal', token, { mode: 'nominal', nilai: -100000000 }), 'VALIDASI');
});

uji('[F4b] Bill terbuka: simpan tanpa potong stok, ubah, konflik versi, bayar menutup bill', () => {
  const stok = stokItem('ITM-0004');
  const b = ok(api('simpanBill', tokenSiti, { nama: 'Meja 3', items: [{ idItem: 'ITM-0004', qty: 2 }, { idItem: 'ITM-0003', qty: 1 }] }));
  pastikan(/^BILL-\d{6}-\d{4}$/.test(b.id) && b.versi, JSON.stringify(b));
  sama(stokItem('ITM-0004'), stok, 'bill tidak memotong stok');
  sama(b.estimasi, b.items.reduce((s, x) => s + x.harga * x.qty, 0));
  pastikan(ok(api('listBill', token)).some((x) => x.id === b.id), 'terlihat di perangkat lain');
  galat(api('simpanBill', tokenSiti, { nama: 'Meja 4', items: [{ idItem: 'ITM-0006', qty: 1 }] }), 'VALIDASI'); // bahan
  // Perangkat A mengubah; perangkat B masih memegang versi lama -> KONFLIK.
  P.jalankan('(function(){ const t = bacaTabel_("Bill"); const i = t.baris.length - 1; tulisSel_(t, i, "Diperbarui", new Date(Date.now() - 5000)); })()');
  const b2 = ok(api('listBill', token)).find((x) => x.id === b.id);
  const b3 = ok(api('simpanBill', token, { id: b.id, versi: b2.versi, nama: 'Meja 3', items: [{ idItem: 'ITM-0004', qty: 3 }] }));
  galat(api('simpanBill', tokenSiti, { id: b.id, versi: b2.versi, nama: 'Meja 3', items: [{ idItem: 'ITM-0004', qty: 9 }] }), 'KONFLIK');
  // Bayar bill dengan versi terbaru.
  const nota = ok(api('buatTransaksi', tokenSiti, { items: [{ idItem: 'ITM-0004', qty: 3 }], metode: 'QRIS', idBill: b.id, versiBill: b3.versi }));
  const row = barisData('Bill').find((r) => r[0] === b.id);
  sama([row[kolom('Bill', 'Status')], row[kolom('Bill', 'No Nota')]], ['Dibayar', nota.noNota]);
  sama(stokItem('ITM-0004'), stok - 3, 'stok dipotong saat dibayar');
  pastikan(!ok(api('listBill', token)).some((x) => x.id === b.id), 'hilang dari daftar terbuka');
  galat(api('buatTransaksi', tokenSiti, { items: [{ idItem: 'ITM-0004', qty: 1 }], metode: 'QRIS', idBill: b.id, versiBill: b3.versi }), 'KONFLIK');
  // Batal bill
  const c = ok(api('simpanBill', tokenSiti, { nama: 'Bu Ani', items: [{ idItem: 'ITM-0003', qty: 1 }] }));
  ok(api('batalBill', tokenSiti, c.id, c.versi));
  sama(barisData('Bill').find((r) => r[0] === c.id)[kolom('Bill', 'Status')], 'Batal');
});

// ======================= IMPOR, PERSEDIAAN, LABEL =======================
uji('[F5] Impor item: pratinjau per baris (baru/lewati/galat) tanpa menyimpan', () => {
  const jumlah = barisData('Item').length;
  const teks = 'Nama Barang;Kategori;HPP;Harga;Stok;Barcode\n' +
    'Sarden Kaleng 155 g;Makanan;8.500;11.000;12;\n' +
    'Gula Pasir 1 kg;Sembako;14.500;17.000;5;\n' +
    'Kerupuk Udang;Makanan Ringan;mahal;5.000;3;\n' +
    'Sarden Kaleng 155 g;Makanan;8.500;11.000;1;\n' +
    'Susu Bubuk 400 g;Minuman;42.000;49.500;6;2000000000213\n';
  const r = ok(api('imporItem', token, { teks, pratinjau: true, buatBarcode: true }));
  sama([r.disimpan, r.baru, r.dilewati, r.galat], [false, 1, 2, 2]);
  sama(r.laporan.map((l) => l.baris + ':' + l.aksi), ['2:Baru', '3:Lewati', '4:Galat', '5:Lewati', '6:Galat']);
  pastikan(r.laporan[4].pesan.includes('sudah dipakai'), 'barcode bentrok terdeteksi');
  sama(barisData('Item').length, jumlah, 'pratinjau tidak menyimpan');
  galat(api('imporItem', tokenSiti, { teks }), 'AKSES_DITOLAK');
  galat(api('imporItem', token, { teks: 'Harga;Stok\n1;2' }), 'VALIDASI');
});

uji('[F5] Impor item: simpan dengan barcode otomatis + stok awal tercatat', () => {
  const jumlah = barisData('Item').length;
  const teks = 'Nama\tKategori\tHarga Beli\tHarga Jual\tStok\tSatuan\n' +
    'Sarden Kaleng 155 g\tMakanan\t8.500\t11.000\t12\tkaleng\n' +
    'Lilin Batang\tRumah Tangga\t1.000\t2.000\t0\tpcs\n';
  const r = ok(api('imporItem', token, { teks, buatBarcode: true }));
  sama([r.disimpan, r.baru], [true, 2]);
  sama(barisData('Item').length, jumlah + 2);
  const sarden = barisData('Item').find((x) => x[kolom('Item', 'Nama')] === 'Sarden Kaleng 155 g');
  sama(String(sarden[kolom('Item', 'Kode')]), P.jalankan("kodeDariIdItem_('" + sarden[0] + "')"), 'barcode dari ID');
  sama([sarden[kolom('Item', 'Stok')], sarden[kolom('Item', 'Satuan')]], [12, 'kaleng']);
  sama(logStok(sarden[0], 'Masuk').length, 1);
  pastikan(ok(api('muatAwal', tokenSiti)).items.some((i) => i.nama === 'Lilin Batang'), 'langsung tampil di kasir');
});

uji('[F5] Impor mode perbarui: hanya kolom yang ada di file; teks khusus tetap utuh setelah tulis ulang', () => {
  const sebelum = barisData('Item').find((x) => x[kolom('Item', 'Nama')] === 'Sarden Kaleng 155 g');
  const log = barisData('Harga_Log').length;
  const r = ok(api('imporItem', token, { teks: 'Nama,Harga Jual\nSarden Kaleng 155 g,12.500\n', mode: 'perbarui' }));
  sama([r.diperbarui, r.baru], [1, 0]);
  const sesudah = barisData('Item').find((x) => x[kolom('Item', 'Nama')] === 'Sarden Kaleng 155 g');
  sama(sesudah[kolom('Item', 'Harga Jual')], 12500);
  sama([sesudah[kolom('Item', 'Harga Beli')], sesudah[kolom('Item', 'Satuan')], sesudah[kolom('Item', 'Stok')], String(sesudah[kolom('Item', 'Kode')])],
    [sebelum[kolom('Item', 'Harga Beli')], 'kaleng', sebelum[kolom('Item', 'Stok')], String(sebelum[kolom('Item', 'Kode')])], 'kolom lain tidak tersentuh');
  sama(barisData('Harga_Log').length - log, 1);
  // Seluruh tabel Item baru saja ditulis ulang: kode berawalan 0 & teks "=..." harus tetap teks apa adanya.
  const khusus = barisData('Item').find((x) => String(x[kolom('Item', 'Nama')]).startsWith('=IMPORTXML'));
  sama(String(khusus[kolom('Item', 'Kode')]), '00123');
  sama(typeof khusus[kolom('Item', 'Kode')], 'string');
});

uji('[F5] Nilai persediaan = Σ stok × harga beli (aktif, dilacak, bukan Menu)', () => {
  const k = (n) => kolom('Item', n);
  const manual = barisData('Item').filter((x) => x[k('Aktif')] === 'Ya' && x[k('Lacak Stok')] === 'Ya' && x[k('Tipe')] !== 'Menu' && x[k('Stok')] > 0)
    .reduce((s, x) => s + Math.round(x[k('Stok')] * x[k('Harga Beli')]), 0);
  const r = ok(api('ringkasPersediaan', token));
  sama(r.nilai, manual);
  sama(r.perKategori.reduce((s, x) => s + x.nilai, 0), manual, 'jumlah per kategori');
  galat(api('ringkasPersediaan', tokenSiti), 'AKSES_DITOLAK');
});

uji('[F5] Label: barcode otomatis untuk item tanpa kode, pola 95 modul; kode non-EAN tanpa pola', () => {
  const lilin = barisData('Item').find((x) => x[kolom('Item', 'Nama')] === 'Lilin Batang');
  const menu = barisData('Item').find((x) => x[kolom('Item', 'Nama')] === 'Kopi Hitam');
  const khusus = barisData('Item').find((x) => String(x[kolom('Item', 'Nama')]).startsWith('=IMPORTXML'));
  const r = ok(api('labelItem', token, { ids: [lilin[0], menu[0], khusus[0]], buatKode: true }));
  pastikan(r[0].kode && r[0].bits.length === 95, 'lilin punya barcode');
  pastikan(/^200\d{10}$/.test(r[1].kode) && r[1].bits.length === 95, 'menu dibuatkan barcode');
  sama([r[2].kode, r[2].bits], ['00123', null]);
  sama(String(barisData('Item').find((x) => x[0] === menu[0])[kolom('Item', 'Kode')]), r[1].kode, 'tersimpan');
  galat(api('labelItem', tokenSiti, { ids: [lilin[0]] }), 'AKSES_DITOLAK');
});

uji('[F6] Beranda "Perlu tindakan": shift lupa ditutup & stok habis muncul, shift hari ini tidak', () => {
  const tanpaShift = ok(api('dashboard', token)).perhatian;
  pastikan(!tanpaShift.some((x) => x.jenis === 'shift' && /Dewi/.test(x.judul)), 'belum ada shift Dewi');
  const tDewi = tokenKasirLain();
  const s = ok(api('bukaShift', tDewi, { modalAwal: 10000 }));
  pastikan(!ok(api('dashboard', token)).perhatian.some((x) => /Dewi/.test(x.judul)), 'shift hari ini = normal');
  // Mundurkan jam buka ke kemarin -> dianggap lupa ditutup.
  const sh = P.sheet('Shift');
  const baris = barisData('Shift').findIndex((r) => r[0] === s.id) + 2;
  // Date harus dari realm sandbox Apps Script (instanceof Date lintas realm bernilai false).
  const kemarin = P.jalankan('new Date(Date.now() - 36 * 3600 * 1000)');
  sh.getRange(baris, kolom('Shift', 'Buka') + 1).setValue(kemarin);
  const p = ok(api('dashboard', token)).perhatian;
  const lupa = p.find((x) => x.jenis === 'shift' && /Dewi/.test(x.judul));
  pastikan(lupa && lupa.tujuan === 'kas' && typeof lupa.ket === 'string', 'shift lupa ditutup muncul');
  pastikan(p.every((x, i) => i === 0 || ['bahaya', 'peringatan', 'info'].indexOf(p[i - 1].tingkat) <= ['bahaya', 'peringatan', 'info'].indexOf(x.tingkat)), 'urut mendesak');
  ok(api('tutupShift', token, { idShift: s.id, kasFisik: 10000 }));
  pastikan(!ok(api('dashboard', token)).perhatian.some((x) => /Dewi/.test(x.judul)), 'hilang setelah ditutup');
});

/** Token kasir kedua (dibuat sekali) untuk uji akses lintas kasir. */
function tokenKasirLain() {
  if (tokenKasirLain.t) return tokenKasirLain.t;
  const r = ok(api('simpanPengguna', token, { baru: true, username: 'dewi', nama: 'Dewi', role: 'Kasir' }));
  const l = ok(api('login', 'dewi', r.pinSementara));
  ok(api('gantiPin', l.token, r.pinSementara, '582914'));
  tokenKasirLain.t = l.token;
  return l.token;
}

uji('Tes logika murni (jalankanTes) lulus semua', () => {
  const h = P.jalankan('jalankanTes()');
  pastikan(/ 0 gagal/.test(h), h);
});

console.log('\n' + lulus + ' lulus, ' + gagal.length + ' gagal');
process.exit(gagal.length ? 1 : 0);
