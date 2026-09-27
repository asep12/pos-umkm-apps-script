# CLAUDE.md — POS UMKM (Google Apps Script)

Aplikasi kasir untuk satu UMKM per salinan Spreadsheet. Backend Apps Script (container-bound),
frontend Web App HTML Service vanilla, database Google Sheets. Bahasa antarmuka & komentar: Indonesia.

## Baca dulu sebelum mengubah kode
- `spek.md` — sumber kebenaran fitur & aturan bisnis.
- `docs/ARCHITECTURE.md` — peta file, alur request, alur transaksi, cache.
- `docs/DATABASE.md` — skema sheet, relasi, aturan tulis.
- `docs/API.md` — kontrak fungsi backend (`google.script.run`).
- `docs/SECURITY.md` — auth PIN, sesi, role, validasi, larangan.
- `docs/CODE_STYLE.md` — konvensi penamaan & pola kode.
- `docs/PLAN.md` — rencana per fase & status.

## Aturan kerja
1. Kerjakan **satu fase** saja (lihat `docs/PLAN.md`), berhenti di akhir fase untuk diuji pengguna.
2. Bila permintaan bertentangan dengan dokumen di atas, **tanyakan dulu**, jangan diam-diam menyimpang.
3. Setiap perubahan skema/kontrak/aturan → perbarui dokumen terkait di commit yang sama.

## Rilis publik & kredit (wajib)
- Kode ini akan dibuka publik (lisensi MIT, lihat `LICENSE` & `docs/RILIS-PUBLIK.md`). Pembuat: **asep94 — Threads @asep94**.
- Jangan menghapus/mengubah kredit di `LICENSE`, `README.md`, halaman login, dan layar Admin.
- Jangan memasukkan data pribadi ke repo: email, nama/lokasi toko asli, ID skrip/deployment, PIN asli, data Spreadsheet.

## Aturan yang paling sering dilanggar (wajib)
- Fungsi yang **bukan** API publik harus berakhiran `_` (agar tidak bisa dipanggil lewat `google.script.run`).
- Semua akses sheet lewat `Db.js`; tidak ada `getRange` di dalam loop.
- Semua operasi yang mengubah stok/Item/nomor nota berjalan di dalam `denganKunci_()`.
- Nilai kembalian ke klien tidak boleh berisi objek `Date` (hasil jadi `null`) — ubah ke string dulu.
- Frontend: data dinamis dirender dengan `textContent`, **tidak pernah** `innerHTML`.

## Perintah
```bash
node dev/uji-e2e.js   # uji ujung-ke-ujung backend di emulator lokal (wajib lulus sebelum selesai)
node dev/server.js    # Web App lokal http://localhost:8787 (akun uji di AKUN_UJI)
clasp push            # unggah kode ke proyek Apps Script
clasp open-script     # buka editor Apps Script
```
Tes fungsi murni di Google: menu POS › Jalankan Tes Logika, atau `jalankanTes` di editor.
Desain UI: skill `.claude/skills/ui-ux-pro-max` (pihak ketiga, sudah diperiksa: tanpa jaringan/eksekusi). Jalankan
`python .claude/skills/ui-ux-pro-max/scripts/search.py "<kueri>" --domain <domain>`; verifikasi hasil sebelum dipakai (DB-nya tak punya profil POS).
`dev/emulator.js` meniru layanan Apps Script; bila kode memakai layanan/metode baru, perluas emulatornya.
Konstanta top-level tidak boleh merujuk konstanta file lain (urutan muat file Apps Script tidak dijamin) — pakai fungsi.
