# Perbaikan E-Procurement v2 Foundation

Tanggal paket: 4 Agustus 2026

## Ringkasan

Paket ini mempertahankan alur aplikasi yang sudah ada, tetapi memperkuat identitas data, Smart Import, konfigurasi deployment, pembatasan akses, dan keamanan repository sebelum pengujian serta go-live.

## Perubahan yang sudah diterapkan

### 1. Procurement ID dan No. PR lintas tahun

- Setiap record memiliki `Procurement ID` permanen.
- `PR Year` dihitung otomatis dari `Assign PR Date`.
- Duplikat ditentukan berdasarkan kombinasi No. PR dan tahun Assign PR Date.
- Edit dan hapus memprioritaskan Procurement ID sehingga PR bernomor sama pada tahun berbeda tidak tertukar.
- Data lama yang belum memiliki ID dapat dimigrasikan melalui action `MIGRATE_PROCUREMENT_IDENTIFIERS`.

### 2. Smart Import

- File dianalisis sebelum data disimpan.
- Klasifikasi mencakup data baru, update, tidak berubah, invalid, dan duplikat dalam file.
- Data identik dilewati.
- Sel kosong tidak menghapus nilai lama.
- Kolom metadata sistem tidak dapat ditimpa oleh Excel.
- No. PR dan Assign PR Date wajib valid.
- Import memakai No. PR + tahun Assign PR Date sebagai key bisnis.

### 3. Login dan role siap diaktifkan

Role yang tersedia:

- `SUPER_ADMIN`
- `PROCUREMENT_ADMIN`
- `BUYER`
- `VENDOR`

Pembatasan dilakukan di backend. Mode development masih dapat memakai admin penuh dengan `ROLE_ENFORCEMENT_ENABLED=false`. Saat staging atau production, aktifkan enforcement dan isi sheet `Users`.

### 4. Access gate dan tampilan berdasarkan role

- Halaman utama memiliki gerbang akses sebelum front page.
- Menu disesuaikan berdasarkan role pengguna.
- Akses langsung ke URL modul tetap dilindungi oleh pemeriksaan backend ketika enforcement aktif.

### 5. Workspace, Bidder List, dan PR lintas tahun

- Pilihan No. PR menampilkan tahun ketika nomor yang sama ditemukan pada lebih dari satu tahun.
- Workspace menggunakan Procurement ID sebagai key utama.
- Key lama berbasis No. PR masih dapat dibaca dan akan dimigrasikan ketika disimpan ulang.

### 6. Keamanan konfigurasi

- ID Spreadsheet, folder Drive, template, dan spreadsheet referensi dipindahkan ke Apps Script Script Properties.
- URL Apps Script dan Google Sheet dipusatkan di `config.js`.
- URL/ID produksi tidak disertakan dalam paket GitHub.
- Data vendor, email, nomor telepon, dan referensi produksi yang tertanam di HTML Bidder List sudah dibersihkan.
- Request POST dibatasi sekitar 15 MB.
- Upload file dibatasi 10 MB.
- Nama sheet dari client dibatasi dengan whitelist.

### 7. Audit Log

- Operasi perubahan data dicatat otomatis ke sheet `Audit Log`.
- Log berisi waktu, email pengguna, nama, role, action, entitas, record key, status, dan ringkasan hasil.
- Payload lengkap dan isi dokumen tidak disimpan pada log.

### 8. Stabilitas request

- Request baca tidak lagi mengambil global script lock.
- Lock hanya digunakan untuk operasi perubahan data.
- Ini mengurangi risiko antrean dan timeout saat beberapa pengguna membuka data bersamaan.

### 9. Persiapan GitHub

Ditambahkan:

- `.gitignore`
- `README.md`
- `SECURITY.md`
- `CHANGELOG.md`
- `DEPLOYMENT_CHECKLIST.md`
- `TEST_SCENARIOS.md`
- `SCRIPT_PROPERTIES.example.json`
- `Template/Users.csv`
- `package.json`
- `tools/validate-project.mjs`

Jalankan pemeriksaan lokal dengan:

```bash
npm test
```

## Pemeriksaan yang sudah dilakukan

- Seluruh JavaScript lolos `node --check`.
- Seluruh JSON dapat dibaca.
- Referensi JavaScript/CSS lokal pada HTML tidak ada yang putus.
- Embedded JSON Bidder List valid.
- Tidak ditemukan URL deployment Apps Script, Spreadsheet ID, atau Drive folder produksi pada source.
- Validator repository berhasil dijalankan.

## Yang perlu diuji pada environment Google

Pemeriksaan berikut membutuhkan salinan Google Sheet dan deployment Apps Script milik Anda:

1. migrasi data lama;
2. akses setiap role menggunakan akun berbeda;
3. import data nyata dan konflik antar-buyer;
4. upload, export PDF, draft Outlook, serta folder Drive;
5. Bidder List/RFQ/CQS dari awal sampai simpan;
6. performa dengan beberapa pengguna bersamaan;
7. backup dan rollback deployment.

## Batasan paket ini

- Backend belum dipecah menjadi banyak file `.gs` agar risiko perubahan deployment tetap rendah.
- Smart Import menggunakan preview ringkasan konfirmasi, belum berupa tabel modal per-sel.
- Tailwind masih memakai CDN untuk menjaga kompatibilitas tampilan lama; sebelum produksi jangka panjang sebaiknya dibuat build CSS lokal dan Content Security Policy.
- Notifikasi otomatis berbasis jadwal belum diaktifkan karena membutuhkan keputusan penerima, waktu, dan trigger pada environment Google Anda.
