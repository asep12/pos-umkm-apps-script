/**
 * Resep.js — resep menu (bahan per 1 porsi) dan HPP menu.
 */

function getResep(token, idMenu) {
  return jalankan_(token, ROLE.ADMIN, function () {
    const it = bacaItem_();
    const menu = it.peta[String(idMenu)];
    if (!menu) throw galat_('TIDAK_ADA', 'Menu tidak ditemukan.');
    const baris = bacaResep_().peta[menu.id] || [];
    return { baris: detailResep_(baris, it.peta), hpp: hitungHppMenu_(baris, it.peta) };
  });
}

function simpanResep(token, idMenu, baris) {
  return jalankan_(token, ROLE.ADMIN, function (sesi) {
    return prosesSimpanResep_(sesi, String(idMenu || ''), baris);
  });
}

// ---------- Internal ----------

/** Peta idMenu -> [{idBahan, qty}] langsung dari sheet. */
function bacaResep_() {
  const t = bacaTabel_(SHEET.RESEP);
  const peta = {};
  t.baris.forEach(function (r) {
    const idMenu = String(r[t.kol['ID Menu']]).trim();
    if (!idMenu) return;
    if (!peta[idMenu]) peta[idMenu] = [];
    peta[idMenu].push({ idBahan: String(r[t.kol['ID Bahan']]).trim(), qty: angka_(r[t.kol.Qty]) });
  });
  return { tabel: t, peta: peta };
}

function detailResep_(baris, petaItem) {
  return baris.map(function (r) {
    const b = petaItem[r.idBahan] || { nama: '(item hilang: ' + r.idBahan + ')', satuan: '', hargaBeli: 0 };
    return {
      idBahan: r.idBahan, nama: b.nama, satuan: b.satuan, qty: r.qty,
      hargaBeli: b.hargaBeli, biaya: bulatUang_(b.hargaBeli * r.qty),
    };
  });
}

function prosesSimpanResep_(sesi, idMenu, baris) {
  return denganKunci_(function () {
    const it = bacaItem_();
    const bersih = normalisasiResep_(idMenu, baris, it.peta);
    const rs = bacaResep_();
    const t = rs.tabel;
    const kolMenu = t.kol['ID Menu'];

    // Tulis ulang seluruh Resep: buang baris menu ini (dan baris kosong), lalu tambahkan yang baru.
    const sisa = t.baris.filter(function (r) {
      const id = String(r[kolMenu]).trim();
      return id && id !== idMenu;
    });
    const baru = bersih.map(function (b) {
      return keBaris_(t, { 'ID Menu': idMenu, 'ID Bahan': b.idBahan, Qty: b.qty });
    });
    gantiIsiTabel_(t, sisa.concat(baru));

    const menu = it.peta[idMenu];
    const hpp = hitungHppMenu_(bersih, it.peta);
    // Resep dikosongkan: HPP terakhir dipertahankan sebagai harga beli manual.
    if (bersih.length && hpp !== menu.hargaBeli) {
      tulisSel_(it.tabel, menu.idx, 'Harga Beli', hpp);
      catatHarga_([{ id: idMenu, hbLama: menu.hargaBeli, hbBaru: hpp, hjLama: menu.hargaJual, hjBaru: menu.hargaJual }], new Date(), sesi.u);
    }
    naikkanVersi_('item');
    return { baris: detailResep_(bersih, it.peta), hpp: bersih.length ? hpp : menu.hargaBeli };
  });
}
