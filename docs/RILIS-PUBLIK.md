# RILIS-PUBLIK.md

Rencana membuka source code ini ke publik. **Status: repo masih privat/lokal** (belum ada remote).

## Keputusan (27-09-2026)
- **Lisensi:** MIT (`LICENSE`). Siapa pun boleh memakai, mengubah, dan mendistribusikan, **wajib menyertakan** pemberitahuan
  hak cipta `asep94 (Threads: @asep94)`.
- **Kredit:** pembuat **asep94 — Threads [@asep94](https://www.threads.net/@asep94)**. Tampil di `LICENSE`, `README.md`,
  halaman login, dan bagian bawah layar Admin. Jangan dihapus saat menyunting kode.
- **Identitas commit:** `asep94 <asep94@users.noreply.github.com>` (email noreply; email asli tidak masuk riwayat).

## Checklist sebelum repo dibuat publik
- [ ] Buat repo GitHub (mis. `pos-umkm-apps-script`), sesuaikan email commit dengan email noreply GitHub akun Anda
      (Settings › Emails) bila berbeda; bila perlu tulis ulang riwayat dengan `git filter-repo --mailmap`.
- [x] Jalankan pemindaian data sensitif lagi (lihat perintah di bawah) — hasil harus kosong.
      28-09-2026: kosong di versi terkini **dan seluruh riwayat git**; tidak ada jalur komputer/nama pengguna Windows.
- [x] Pastikan `.clasp.json`, `toko.local.json`, `.claude/settings.local.json`, `.claude/skills/` tidak ter-commit (`git ls-files`).
- [x] Jalankan `node dev/uji-e2e.js` — semua lulus (58 skenario, v1.6.1).
- [x] Tinjau `README.md` untuk pembaca umum: cara pasang (Cara C tanpa clasp), anjuran PIN Admin 6 digit.
- [x] Tangkapan layar di README (`docs/gambar/`) — data uji fiktif, tanpa data toko asli.
- [ ] (Opsional) Bagikan Spreadsheet "Templat POS" publik agar Cara A bisa dipakai orang lain:
      1. Buat Spreadsheet **baru & kosong** (bukan salinan toko yang pernah dipakai berjualan), pasang kode (Cara B/C),
         **jangan** jalankan Setup Awal (agar tidak ada hash PIN/akun di dalamnya).
      2. Share › *Anyone with the link* › **Viewer**.
      3. Ambil tautannya, ganti akhiran `/edit...` menjadi `/copy`, taruh di README Cara A.
      4. Periksa: tidak ada sheet berisi data, tidak ada deployment Web App aktif di templat.
- [ ] Tambahkan `CONTRIBUTING.md` sederhana (opsional) dan template issue.
- [ ] Topik repo: `apps-script`, `google-sheets`, `pos`, `kasir`, `umkm`, `indonesia`.

```bash
git grep -niE "belajar\.id|asephanuryana|serang|@gmail|AKfyc|scriptId\"\s*:\s*\"1" -- . ':!docs/RILIS-PUBLIK.md'
```

## Tinjauan keamanan sebelum rilis (28-09-2026)
- PIN Admin wajib 6 digit (v1.6.2); Admin lama ber-PIN pendek ditandai wajib ganti saat login.
- Diperbaiki: batas percobaan login bisa dilampaui dengan permintaan paralel → kini di dalam `denganKunci_` (v1.6.1).
- Dicek: tidak ada `innerHTML` untuk data dinamis; teks ke sheet dilindungi `amanSel_`; hash/salt tidak pernah dikirim ke klien;
  galat server tidak membocorkan detail teknis; fungsi internal berakhiran `_`.

## Yang TIDAK boleh masuk repo
- ID skrip/deployment toko (`.clasp.json`, `toko.local.json`), data Spreadsheet toko, tangkapan layar berisi data asli.
- Email pribadi/sekolah, nama toko/lokasi asli, PIN asli.
- Skill pihak ketiga (`.claude/skills/ui-ux-pro-max`, lisensi MIT milik Next Level Builder) — cukup sebutkan cara memasangnya.

## Catatan keamanan untuk pemakai publik
- PIN di `dev/server.js` hanya untuk server uji lokal (emulator), bukan untuk toko sungguhan.
- Setiap toko membuat PIN admin sendiri lewat Setup Awal (acak, wajib diganti saat login pertama).
- Lihat `docs/SECURITY.md` untuk model ancaman & aturan (Spreadsheet jangan dibagikan ke kasir).
