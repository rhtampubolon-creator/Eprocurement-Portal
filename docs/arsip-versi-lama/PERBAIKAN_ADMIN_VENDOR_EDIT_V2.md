# Perbaikan Admin Vendor Edit V2

## Penyebab utama
`common.js` mendeklarasikan `const MSW = {}` tetapi tidak mengekspornya ke `window.MSW`.
Vendor Management memeriksa role melalui `window.MSW.auth`, sehingga role selalu terbaca kosong dan fungsi edit ditolak.

## Perbaikan
- `MSW` sekarang diekspos sebagai `window.MSW`.
- Cache-buster JavaScript dinaikkan ke `20260806-admin-vendor-edit-fix-v2`.
- Perbaikan role Admin/Super Admin dari versi sebelumnya tetap dipertahankan.

## Hak akses
- SUPER_ADMIN: tambah, import, edit, simpan, hapus.
- PROCUREMENT_ADMIN: tambah, import, edit, simpan, hapus.
- BUYER: view only.
