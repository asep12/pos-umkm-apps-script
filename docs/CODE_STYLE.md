# CODE_STYLE.md

## 1. Stack
- Google Apps Script runtime **V8** (ES2019+: `const/let`, arrow function, destructuring, template string).
- Tanpa build, tanpa npm di runtime. Frontend HTML/CSS/JS vanilla di HTML Service.
- File lokal `.js` (clasp → `.gs`). Semua file `.js` berbagi satu namespace global — tidak ada `import`.

## 2. Penamaan
| Jenis | Gaya | Contoh |
|---|---|---|
| Fungsi API publik | camelCase, Bahasa Indonesia, sesuai `API.md` | `buatTransaksi` |
| Fungsi internal | camelCase + akhiran `_` | `bacaTabel_`, `hitungTransaksi_` |
| Konstanta | UPPER_SNAKE | `VERSI`, `SKEMA`, `ROLE` |
| Nama kolom | string persis header sheet | `'Harga Jual'` |
| Frontend | camelCase; fungsi render diawali `render` | `renderKeranjang()` |

Tidak ada variabel global yang bermutasi. Konstanta global boleh (`Object.freeze`).

## 3. Pola Backend
```js
// API publik: tipis, hanya pembungkus
function stokMasuk(token, data) {
  return jalankan_(token, ROLE.KASIR, (sesi) => prosesStokMasuk_(sesi, data));
}

// Error bisnis dilempar dengan kode, ditangkap jalankan_
throw galat_('STOK_KURANG', 'Stok Gula Pasir kurang 1,5 kg');

// Semua perubahan Item/stok/nota
return denganKunci_(() => { ... });
```
- Akses sheet **hanya** lewat `Db.js`. `Logika.js` tidak boleh memanggil `SpreadsheetApp`, `CacheService`, dsb.
- Satu fungsi = satu tugas, idealnya < 40 baris. Pisahkan: validasi → baca → hitung (murni) → tulis.
- Objek baris diubah ke objek bernama kolom lewat `keObjek_`, tidak mengakses `row[7]`.

## 4. Pola Frontend
- Satu pintu ke server: `api(nama, ...args)` (sisip token, spinner, tangani `kode`).
- Buat elemen dengan helper `h(tag, atribut, ...anak)`; teks via `textContent`.
- Format tampilan: `rupiah(n)` (`Intl.NumberFormat('id-ID')`), `angka(n)` untuk qty.
- Mobile-first: target sentuh ≥ 44px, font ≥ 16px pada input (hindari zoom iOS), layout satu kolom < 768px.
- Tangani state loading, kosong, dan error di setiap layar.
- Warna hanya lewat token CSS (`var(--...)`); pasangan baru wajib dicek kontras WCAG. Kuning/merah hanya untuk status.
- Ikon: SVG garis sekeluarga (`ikon()`), bukan emoji/glyph. Tombol ikon wajib `aria-label`; menu aktif `aria-current`.
- Keputusan UI baru: cari dulu dengan skill `ui-ux-pro-max` (`.claude/skills/`), verifikasi kecocokannya, jangan telan mentah.

## 5. Komentar
Bahasa Indonesia, jelaskan **mengapa**, bukan apa.
- Baik: `// Tulis seluruh kolom Stok sekaligus: getRange per baris di loop terlalu lambat.`
- Hindari: `// tambah 1 ke i`

## 6. Tes
- Setiap fungsi di `Logika.js` punya kasus di `Tes.js` (`jalankanTes()` mencetak ✔/✘ per kasus dan total).
- Kasus wajib: pembulatan uang, diskon persen/nominal, kebutuhan stok gabungan (menu + barang berbagi bahan),
  stok kurang, nomor nota berurutan & reset harian, HPP menu.

## 7. Sebelum Menyatakan Selesai
1. `node dev/uji-e2e.js`: semua ✔ (tambah skenario untuk fitur baru; perluas `dev/emulator.js` bila memakai layanan baru).
2. `clasp push` tanpa error; `jalankanTes` di editor: semua ✔.
3. Jalankan checklist uji manual fase terkait di `README.md` pada Web App (deployment *test*/@HEAD).
4. Cek tampilan di lebar HP (360px) dan cetak struk.
5. Perbarui `docs/*` bila skema/kontrak berubah. Hapus `console.log` debug.
