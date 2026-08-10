# Perubahan Buyer View Only

Tanggal: 4 Agustus 2026

## Aturan akses

- `BUYER` dapat membuka dan melihat Vendor Management serta Contract Management.
- `BUYER` tetap dapat search, filter, scroll, melihat data, dan export.
- `BUYER` tidak dapat add, edit, delete, import, clear, atau save pada kedua modul tersebut.
- `SUPER_ADMIN` dan `PROCUREMENT_ADMIN` tetap dapat mengelola data.
- Backend menolak perubahan Contract oleh role tanpa permission `contract.manage`.

## File yang diubah

1. `common.js`
   - Menambahkan helper `MSW.auth` untuk membaca profil login dan menentukan mode view-only.
   - Menambahkan pesan penolakan dan banner role.
2. `vendor-company/script.js`
   - Menambahkan pemeriksaan izin pada add, edit, save, delete, import, clear, klik kanan, dan klik dua kali.
   - Menyembunyikan kontrol perubahan bagi Buyer.
3. `codegs.js`
   - Menambahkan permission `contract.manage` untuk Super Admin (wildcard) dan Procurement Admin.
   - Sinkronisasi massal sheet `Contract` sekarang diperiksa sebagai `REPLACE_CONTRACTS`.
4. `vendor-company/index.html` dan `detail-contract/index.html`
   - Mengganti versi cache asset agar browser segera mengambil kode terbaru.

## Deployment

Salin `codegs.js` terbaru ke Google Apps Script, buat deployment versi baru, lalu upload ulang file website. Setelah itu lakukan hard refresh (`Ctrl + F5`). Pastikan `ROLE_ENFORCEMENT_ENABLED=true` pada Script Properties.
# Penguncian seluruh perintah Buyer (revisi 4 Agustus 2026)

Pada modul Vendor Company dan Contract, role `BUYER` sekarang tidak dapat
menjalankan perintah perubahan apa pun: tambah, edit, simpan, hapus, hapus
semua, import, double-click untuk edit, klik kanan/Delete Row, serta perubahan
status. Pemblokiran dilakukan pada handler fungsi, event capture di tabel, dan
izin backend. Buyer tetap dapat melihat, mencari, memfilter, scroll, dan
export/download.
