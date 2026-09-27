/**
 * Bill.js — bill terbuka (pesanan per meja/pelanggan yang dibayar belakangan).
 * Bill hanya "keranjang tersimpan": stok belum dipotong dan harga dihitung ulang saat dibayar.
 * Konkurensi antarperangkat memakai versi (waktu Diperbarui): simpan/bayar dengan versi usang ditolak (KONFLIK).
 */

function listBill(token) {
  return jalankan_(token, ROLE.KASIR, function () {
    const tz = zonaWaktu_(bacaPengaturan_());
    const petaItem = {};
    daftarItemCache_().forEach(function (i) { petaItem[i.id] = i; });
    const pengguna = petaPengguna_();
    const t = bacaTabel_(SHEET.BILL);
    const hasil = [];
    t.baris.forEach(function (r, idx) {
      const b = billDariBaris_(t, r, idx);
      if (!b.id || b.status !== 'Terbuka') return;
      hasil.push(billUntukKlien_(b, petaItem, pengguna, tz));
    });
    return hasil.reverse();
  });
}

function simpanBill(token, data) {
  return jalankan_(token, ROLE.KASIR, function (sesi) {
    const d = normalisasiBill_(data);
    const tz = zonaWaktu_(bacaPengaturan_());
    return denganKunci_(function () {
      const it = bacaItem_();
      cekItemBill_(d.items, it.peta);
      const t = bacaTabel_(SHEET.BILL);
      const sekarang = new Date();
      const items = amanSel_(JSON.stringify(d.items));
      let bill;
      if (d.id) {
        const temu = cariBillTerbuka_(t, d.id, d.versi);
        tulisBaris_(t, temu.idx, keBaris_(t, {
          Nama: amanSel_(d.nama), Items: items, Catatan: amanSel_(d.catatan), Diperbarui: sekarang,
        }, t.baris[temu.idx]));
        bill = Object.assign(temu.bill, { nama: d.nama, items: d.items, catatan: d.catatan, diperbarui: sekarang });
      } else {
        const id = nomorUrut_('BILL_URUT', 'BILL', sekarang, tz);
        tambahObjek_(t, [{
          ID: id, Nama: amanSel_(d.nama), Items: items, Catatan: amanSel_(d.catatan), Status: 'Terbuka',
          Dibuat: sekarang, Diperbarui: sekarang, Kasir: sesi.u,
        }]);
        bill = { id: id, nama: d.nama, items: d.items, catatan: d.catatan, status: 'Terbuka', dibuat: sekarang, diperbarui: sekarang, kasir: sesi.u };
      }
      return billUntukKlien_(bill, it.peta, petaPengguna_(), tz);
    });
  });
}

function batalBill(token, id, versi) {
  return jalankan_(token, ROLE.KASIR, function (sesi) {
    return denganKunci_(function () {
      const t = bacaTabel_(SHEET.BILL);
      const temu = cariBillTerbuka_(t, String(id || ''), String(versi || ''));
      tulisBaris_(t, temu.idx, keBaris_(t, {
        Status: 'Batal', Diperbarui: new Date(),
        Catatan: amanSel_((temu.bill.catatan ? temu.bill.catatan + ' | ' : '') + 'dibatalkan oleh ' + sesi.u),
      }, t.baris[temu.idx]));
      return true;
    });
  });
}

// ---------- Internal ----------

function billDariBaris_(t, r, idx) {
  const k = t.kol;
  let items = [];
  try { items = JSON.parse(String(r[k.Items] || '[]')); } catch (e) { items = []; }
  return {
    idx: idx, id: String(r[k.ID]).trim(), nama: String(r[k.Nama] || ''), items: Array.isArray(items) ? items : [],
    catatan: String(r[k.Catatan] || ''), status: String(r[k.Status]), dibuat: r[k.Dibuat], diperbarui: r[k.Diperbarui],
    kasir: String(r[k.Kasir] || '').toLowerCase(), noNota: String(r[k['No Nota']] || ''),
  };
}

/**
 * Versi = waktu Diperbarui dalam DETIK (bukan ms): presisi waktu di Sheets bisa dibulatkan, dan versi ms
 * akan memicu konflik palsu. Dibandingkan untuk mendeteksi perubahan dari perangkat lain.
 */
function versiBill_(b) {
  return b.diperbarui instanceof Date ? String(Math.floor(b.diperbarui.getTime() / 1000)) : '';
}

function cariBillTerbuka_(t, id, versi) {
  for (let i = t.baris.length - 1; i >= 0; i--) {
    const b = billDariBaris_(t, t.baris[i], i);
    if (b.id !== id) continue;
    if (b.status !== 'Terbuka') throw galat_('KONFLIK', 'Bill ' + b.nama + ' sudah ' + b.status.toLowerCase() + ' di perangkat lain.');
    if (versi && versi !== versiBill_(b)) {
      throw galat_('KONFLIK', 'Bill ' + b.nama + ' baru saja diubah di perangkat lain. Buka ulang bill untuk melihat isi terbaru.');
    }
    return { idx: i, bill: b };
  }
  throw galat_('TIDAK_ADA', 'Bill tidak ditemukan.');
}

function cekItemBill_(items, petaItem) {
  items.forEach(function (b) {
    const it = petaItem[b.idItem];
    if (!it) throw galat_('TIDAK_ADA', 'Item ' + b.idItem + ' tidak ditemukan.');
    if (!it.aktif) throw galat_('VALIDASI', it.nama + ' sudah tidak aktif.');
    if (it.tipe === 'Bahan') throw galat_('VALIDASI', it.nama + ' adalah bahan dan tidak dijual.');
  });
}

/** Bentuk bill untuk klien: nama & harga item terbaru, estimasi total (sebelum diskon/pajak). */
function billUntukKlien_(b, petaItem, pengguna, tz) {
  const items = b.items.map(function (x) {
    const it = petaItem[x.idItem];
    return { idItem: x.idItem, qty: x.qty, nama: it ? it.nama : '(item hilang)', harga: it ? it.hargaJual : 0, satuan: it ? it.satuan : '' };
  });
  return {
    id: b.id, nama: b.nama, catatan: b.catatan, items: items,
    jumlahItem: items.reduce(function (s, x) { return s + x.qty; }, 0),
    estimasi: items.reduce(function (s, x) { return s + bulatUang_(x.harga * x.qty); }, 0),
    dibuat: formatWaktu_(b.dibuat, tz), diperbarui: formatWaktu_(b.diperbarui, tz), versi: versiBill_(b),
    kasir: pengguna[b.kasir] ? pengguna[b.kasir].nama : b.kasir,
  };
}
