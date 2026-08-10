# Perbaikan Admin Tidak Bisa Edit Vendor Management

## Penyebab
Profil lama dapat tersimpan bersamaan di `sessionStorage` dan `localStorage`. Halaman utama memakai profil login terbaru, tetapi iframe Vendor Management sebelumnya selalu membaca `sessionStorage` lebih dahulu. Jika profil Buyer lama masih ada, iframe menganggap Admin sebagai Buyer dan mengaktifkan mode View Only.

## Perbaikan
- Profil pada kedua storage dibersihkan setiap kali login/token baru disimpan.
- Profil aktif disimpan hanya pada storage yang sama dengan token aktif.
- `common.js` membaca profil berdasarkan lokasi token aktif.
- Alias role `ADMIN`, `SUPERADMIN`, `PROCUREMENT`, dan `PROCUREMENTADMIN` dinormalisasi.
- Vendor Management menerima akses berdasarkan role Admin atau permission `company.manage`.
- Class `msw-view-only` lama dilepas ketika halaman dibuka oleh Admin.

## Hak akses akhir
- `SUPER_ADMIN`: dapat tambah, edit, import, hapus, dan clear Vendor Management.
- `PROCUREMENT_ADMIN`: dapat tambah, edit, import, hapus, dan clear Vendor Management.
- `BUYER`: hanya melihat, mencari, memfilter, dan export.

Setelah mengganti file frontend, lakukan logout lalu login kembali dan hard refresh (`Ctrl+F5`). Jika backend `codegs.js` ikut diperbarui, deploy ulang Apps Script sebagai versi baru.
