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
- [ ] Jalankan pemindaian data sensitif lagi (lihat perintah di bawah) — hasil harus kosong.
- [ ] Pastikan `.clasp.json`, `toko.local.json`, `.claude/settings.local.json`, `.claude/skills/` tidak ter-commit (`git ls-files`).
- [ ] Jalankan `node dev/uji-e2e.js` — semua lulus.
- [ ] Tinjau `README.md` untuk pembaca umum: cara pasang, cara pakai, tangkapan layar (tanpa data toko asli).
- [ ] Tambahkan `CONTRIBUTING.md` sederhana (opsional) dan template issue.
- [ ] Topik repo: `apps-script`, `google-sheets`, `pos`, `kasir`, `umkm`, `indonesia`.

```bash
git grep -niE "belajar\.id|asephanuryana|serang|@gmail|AKfyc|scriptId\"\s*:\s*\"1" -- . ':!docs/RILIS-PUBLIK.md'
```

## Yang TIDAK boleh masuk repo
- ID skrip/deployment toko (`.clasp.json`, `toko.local.json`), data Spreadsheet toko, tangkapan layar berisi data asli.
- Email pribadi/sekolah, nama toko/lokasi asli, PIN asli.
- Skill pihak ketiga (`.claude/skills/ui-ux-pro-max`, lisensi MIT milik Next Level Builder) — cukup sebutkan cara memasangnya.

## Catatan keamanan untuk pemakai publik
- PIN di `dev/server.js` hanya untuk server uji lokal (emulator), bukan untuk toko sungguhan.
- Setiap toko membuat PIN admin sendiri lewat Setup Awal (acak, wajib diganti saat login pertama).
- Lihat `docs/SECURITY.md` untuk model ancaman & aturan (Spreadsheet jangan dibagikan ke kasir).
