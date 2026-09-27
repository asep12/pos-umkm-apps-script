/**
 * Contoh.js — katalog contoh untuk uji coba (menu POS › Contoh Data).
 * Aman dijalankan berulang: hanya menambah item yang NAMANYA belum ada, jadi toko yang sudah berisi
 * contoh lama cukup menjalankannya lagi untuk mendapat item baru. Nama sengaja generik (tanpa merek).
 * Barang diberi barcode EAN-13 awalan 200 (rentang internal toko GS1) agar bisa dipakai uji scanner.
 */

function katalogContoh_() {
  // [nama, tipe, kategori, satuan, hargaBeli, hargaJual, stok, stokMin, lacak]
  // 14 item pertama = katalog lama (urutan & nilai dipertahankan; uji e2e bergantung padanya).
  const item = [
    ['Gula Pasir 1 kg', 'Barang', 'Sembako', 'pcs', 14500, 17000, 20, 5, true],
    ['Minyak Goreng 1 L', 'Barang', 'Sembako', 'pcs', 15000, 18000, 12, 4, true],
    ['Mi Instan Goreng', 'Barang', 'Makanan', 'pcs', 2800, 3500, 40, 10, true],
    ['Air Mineral 600 ml', 'Barang', 'Minuman', 'pcs', 2500, 4000, 24, 6, true],
    ['Telur Ayam', 'Barang', 'Sembako', 'kg', 26000, 30000, 5, 1, true],
    ['Kopi Bubuk', 'Bahan', 'Bahan Minuman', 'gram', 150, 0, 1000, 200, true],
    ['Gula (bahan)', 'Bahan', 'Bahan Minuman', 'gram', 15, 0, 2000, 300, true],
    ['Susu Kental Manis', 'Bahan', 'Bahan Minuman', 'gram', 40, 0, 740, 150, true],
    ['Teh Celup', 'Bahan', 'Bahan Minuman', 'pcs', 400, 0, 50, 10, true],
    ['Es Batu', 'Bahan', 'Bahan Minuman', 'pcs', 200, 0, 100, 20, true],
    ['Kopi Hitam', 'Menu', 'Minuman', 'gelas', 0, 6000, 0, 0, true],
    ['Kopi Susu', 'Menu', 'Minuman', 'gelas', 0, 8000, 0, 0, true],
    ['Es Teh Manis', 'Menu', 'Minuman', 'gelas', 0, 5000, 0, 0, true],
    ['Nasi Goreng', 'Menu', 'Makanan', 'porsi', 9000, 15000, 0, 0, false],

    // Sembako & bumbu dapur
    ['Beras Premium 5 kg', 'Barang', 'Sembako', 'karung', 68000, 75000, 10, 3, true],
    ['Beras Curah', 'Barang', 'Sembako', 'kg', 12500, 14000, 25, 5, true],
    ['Tepung Terigu 1 kg', 'Barang', 'Sembako', 'pcs', 11000, 13000, 10, 3, true],
    ['Garam Dapur 250 g', 'Barang', 'Bumbu Dapur', 'pcs', 2500, 3500, 20, 5, true],
    ['Kecap Manis 520 ml', 'Barang', 'Bumbu Dapur', 'botol', 17500, 21000, 8, 2, true],
    ['Saus Sambal 340 ml', 'Barang', 'Bumbu Dapur', 'botol', 9000, 11500, 8, 2, true],
    ['Bumbu Penyedap Sachet', 'Barang', 'Bumbu Dapur', 'pcs', 400, 1000, 60, 15, true],
    // Makanan & makanan ringan
    ['Mi Instan Kuah Soto', 'Barang', 'Makanan', 'pcs', 2700, 3500, 40, 10, true],
    ['Roti Tawar', 'Barang', 'Makanan', 'pcs', 13000, 16000, 6, 2, true],
    ['Biskuit Kelapa 300 g', 'Barang', 'Makanan Ringan', 'pcs', 9500, 12000, 10, 3, true],
    ['Kacang Garing 200 g', 'Barang', 'Makanan Ringan', 'pcs', 8500, 11000, 10, 3, true],
    ['Keripik Singkong 150 g', 'Barang', 'Makanan Ringan', 'pcs', 6000, 8000, 12, 3, true],
    ['Wafer Cokelat', 'Barang', 'Makanan Ringan', 'pcs', 1500, 2500, 30, 8, true],
    // Minuman kemasan
    ['Teh Kemasan 350 ml', 'Barang', 'Minuman', 'pcs', 3500, 5000, 24, 6, true],
    ['Minuman Isotonik 500 ml', 'Barang', 'Minuman', 'pcs', 5000, 7000, 12, 4, true],
    ['Kopi Sachet 3in1', 'Barang', 'Minuman', 'pcs', 1200, 2000, 60, 20, true],
    ['Susu UHT Cokelat 200 ml', 'Barang', 'Minuman', 'pcs', 3800, 5500, 24, 6, true],
    ['Isi Ulang Galon', 'Barang', 'Minuman', 'galon', 5000, 7000, 0, 0, false],
    // Kebersihan & rumah tangga (sebagian sengaja menipis untuk mencoba badge stok)
    ['Sabun Mandi Batang', 'Barang', 'Kebersihan', 'pcs', 3000, 4500, 20, 5, true],
    ['Sampo Sachet', 'Barang', 'Kebersihan', 'pcs', 900, 1500, 50, 12, true],
    ['Pasta Gigi 75 g', 'Barang', 'Kebersihan', 'pcs', 9000, 12000, 2, 2, true],
    ['Deterjen Bubuk 800 g', 'Barang', 'Kebersihan', 'pcs', 17000, 21000, 8, 2, true],
    ['Sabun Cuci Piring 780 ml', 'Barang', 'Kebersihan', 'pcs', 11500, 15000, 8, 2, true],
    ['Tisu Wajah 250 lembar', 'Barang', 'Rumah Tangga', 'pcs', 11000, 14500, 8, 2, true],
    ['Gas LPG 3 kg', 'Barang', 'Rumah Tangga', 'tabung', 18000, 22000, 3, 3, true],
    ['Baterai AA isi 2', 'Barang', 'Rumah Tangga', 'pcs', 7500, 10000, 10, 3, true],
    ['Korek Api Gas', 'Barang', 'Rumah Tangga', 'pcs', 2000, 3500, 20, 5, true],
    // Bahan kafe & dapur
    ['Susu Cair', 'Bahan', 'Bahan Minuman', 'ml', 18, 0, 3000, 1000, true],
    ['Sirup Gula Aren', 'Bahan', 'Bahan Minuman', 'ml', 50, 0, 1000, 250, true],
    ['Cokelat Bubuk', 'Bahan', 'Bahan Minuman', 'gram', 120, 0, 500, 100, true],
    ['Beras (bahan)', 'Bahan', 'Bahan Makanan', 'gram', 13, 0, 5000, 1000, true],
    ['Telur (bahan)', 'Bahan', 'Bahan Makanan', 'butir', 2000, 0, 30, 10, true],
    ['Minyak (bahan)', 'Bahan', 'Bahan Makanan', 'ml', 17, 0, 2000, 500, true],
    ['Pisang Kepok', 'Bahan', 'Bahan Makanan', 'buah', 1000, 0, 24, 6, true],
    ['Tepung Bumbu (bahan)', 'Bahan', 'Bahan Makanan', 'gram', 25, 0, 1000, 200, true],
    // Menu kafe & warung makan
    ['Es Kopi Susu Gula Aren', 'Menu', 'Minuman', 'gelas', 0, 18000, 0, 0, true],
    ['Cokelat Panas', 'Menu', 'Minuman', 'gelas', 0, 15000, 0, 0, true],
    ['Teh Tarik', 'Menu', 'Minuman', 'gelas', 0, 10000, 0, 0, true],
    ['Mi Goreng Telur', 'Menu', 'Makanan', 'porsi', 0, 12000, 0, 0, true],
    ['Nasi Telur Ceplok', 'Menu', 'Makanan', 'porsi', 0, 12000, 0, 0, true],
    ['Pisang Goreng (3 pcs)', 'Menu', 'Makanan', 'porsi', 0, 10000, 0, 0, true],
  ];
  // [menu, bahan, qty per porsi]
  const resep = [
    ['Kopi Hitam', 'Kopi Bubuk', 15], ['Kopi Hitam', 'Gula (bahan)', 15],
    ['Kopi Susu', 'Kopi Bubuk', 15], ['Kopi Susu', 'Susu Kental Manis', 30],
    ['Es Teh Manis', 'Teh Celup', 1], ['Es Teh Manis', 'Gula (bahan)', 20], ['Es Teh Manis', 'Es Batu', 3],
    ['Es Kopi Susu Gula Aren', 'Kopi Bubuk', 18], ['Es Kopi Susu Gula Aren', 'Susu Cair', 120],
    ['Es Kopi Susu Gula Aren', 'Sirup Gula Aren', 25], ['Es Kopi Susu Gula Aren', 'Es Batu', 4],
    ['Cokelat Panas', 'Cokelat Bubuk', 25], ['Cokelat Panas', 'Susu Cair', 150], ['Cokelat Panas', 'Gula (bahan)', 10],
    ['Teh Tarik', 'Teh Celup', 1], ['Teh Tarik', 'Susu Kental Manis', 35],
    // Barang pun bisa menjadi bahan resep (mi instan dari rak dipakai untuk menu).
    ['Mi Goreng Telur', 'Mi Instan Goreng', 1], ['Mi Goreng Telur', 'Telur (bahan)', 1], ['Mi Goreng Telur', 'Minyak (bahan)', 10],
    ['Nasi Telur Ceplok', 'Beras (bahan)', 150], ['Nasi Telur Ceplok', 'Telur (bahan)', 1], ['Nasi Telur Ceplok', 'Minyak (bahan)', 15],
    ['Pisang Goreng (3 pcs)', 'Pisang Kepok', 3], ['Pisang Goreng (3 pcs)', 'Tepung Bumbu (bahan)', 40], ['Pisang Goreng (3 pcs)', 'Minyak (bahan)', 30],
  ];
  return { item: item, resep: resep };
}

/** Tambahkan item contoh yang belum ada (berdasarkan nama). Mengembalikan jumlah item baru. */
function isiContohData_() {
  const it = bacaItem_();
  const kat = katalogContoh_();
  const idNama = {};
  it.daftar.forEach(function (i) { idNama[i.nama.toLowerCase()] = i.id; });
  const kodeTerpakai = {};
  it.daftar.forEach(function (i) { if (i.kode) kodeTerpakai[i.kode] = true; });

  const semuaId = it.daftar.map(function (i) { return i.id; });
  const hargaBeli = {};
  it.daftar.forEach(function (i) { hargaBeli[i.nama.toLowerCase()] = i.hargaBeli; });

  const baru = [];
  kat.item.forEach(function (c, urut) {
    const kunci = c[0].toLowerCase();
    if (idNama[kunci]) return;
    const id = idItemBerikut_(semuaId);
    semuaId.push(id);
    idNama[kunci] = id;
    hargaBeli[kunci] = c[4];
    // Barcode stabil per posisi katalog; dilewati bila kebetulan sudah dipakai item lain.
    const kode = c[1] === 'Barang' ? ean13_('200' + String(urut + 1).padStart(9, '0')) : '';
    baru.push({
      ID: id, Kode: kode && !kodeTerpakai[kode] ? amanSel_(kode) : '', Nama: amanSel_(c[0]), Tipe: c[1],
      Kategori: amanSel_(c[2]), Satuan: amanSel_(c[3]), 'Harga Beli': c[4], 'Harga Jual': c[5], Stok: c[6], 'Stok Min': c[7],
      'Lacak Stok': c[8] ? 'Ya' : 'Tidak', Aktif: 'Ya', Foto: '', _nama: kunci,
    });
  });
  if (!baru.length) throw new Error('Semua item contoh sudah ada di sheet Item.');

  // Resep hanya untuk menu yang baru ditambahkan; HPP dihitung dari harga beli bahan.
  const menuBaru = {};
  baru.forEach(function (o) { if (o.Tipe === 'Menu') menuBaru[o._nama] = o; });
  const barisResep = [];
  kat.resep.forEach(function (r) {
    const menu = menuBaru[r[0].toLowerCase()];
    const idBahan = idNama[r[1].toLowerCase()];
    if (!menu || !idBahan) return;
    barisResep.push({ 'ID Menu': menu.ID, 'ID Bahan': idBahan, Qty: r[2] });
    menu['Harga Beli'] = bulatUang_(menu['Harga Beli'] + (hargaBeli[r[1].toLowerCase()] || 0) * r[2]);
  });

  baru.forEach(function (o) { delete o._nama; });
  tambahObjek_(it.tabel, baru);
  tambahObjek_(bacaTabel_(SHEET.RESEP), barisResep);
  const sekarang = new Date();
  tambahObjek_(bacaHeader_(SHEET.STOK_LOG), baru.filter(function (o) { return o.Stok > 0; }).map(function (o) {
    return {
      Tanggal: sekarang, 'ID Item': o.ID, Nama: o.Nama, Jenis: 'Masuk', Qty: o.Stok,
      'Stok Sesudah': o.Stok, Ref: '', 'Kasir/User': 'setup', Keterangan: 'Contoh data',
    };
  }));
  naikkanVersi_('item');
  return baru.length;
}
