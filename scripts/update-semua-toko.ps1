# update-semua-toko.ps1 — push kode & perbarui Web App di semua salinan toko.
# Pemakaian (dari folder proyek):  powershell -ExecutionPolicy Bypass -File scripts\update-semua-toko.ps1 -Keterangan "v1.0.1"
# Daftar toko dibaca dari toko.local.json (lihat toko.local.json.example). File itu tidak di-push/di-commit.
param([string]$Keterangan = "update")

$ErrorActionPreference = 'Stop'
if (-not (Test-Path 'toko.local.json')) { throw 'toko.local.json tidak ada. Salin dari toko.local.json.example lalu isi.' }

$daftar = Get-Content 'toko.local.json' -Raw | ConvertFrom-Json
$templat = Get-Content '.clasp.json.example' -Raw | ConvertFrom-Json
$adaAsli = Test-Path '.clasp.json'
if ($adaAsli) { Copy-Item '.clasp.json' '.clasp.json.bak' -Force }

$gagal = @()
try {
  foreach ($toko in $daftar) {
    Write-Host "== $($toko.nama)" -ForegroundColor Cyan
    try {
      $templat.scriptId = $toko.scriptId
      # Tulis UTF-8 tanpa BOM: clasp gagal membaca JSON ber-BOM.
      [IO.File]::WriteAllText((Join-Path (Get-Location) '.clasp.json'), ($templat | ConvertTo-Json))
      clasp push --force
      if ($LASTEXITCODE -ne 0) { throw 'clasp push gagal' }
      clasp update-deployment $toko.deploymentId --description $Keterangan
      if ($LASTEXITCODE -ne 0) { throw 'clasp update-deployment gagal' }
      Write-Host "   OK. Jangan lupa jalankan POS > Setup Awal di Spreadsheet toko ini bila ada kolom baru." -ForegroundColor Green
    } catch {
      Write-Host "   GAGAL: $_" -ForegroundColor Red
      $gagal += $toko.nama
    }
  }
} finally {
  if ($adaAsli) { Move-Item '.clasp.json.bak' '.clasp.json' -Force } else { Remove-Item '.clasp.json' -ErrorAction SilentlyContinue }
}

if ($gagal.Count) { Write-Host "Gagal: $($gagal -join ', ')" -ForegroundColor Red; exit 1 }
Write-Host 'Semua toko berhasil diperbarui.' -ForegroundColor Green
