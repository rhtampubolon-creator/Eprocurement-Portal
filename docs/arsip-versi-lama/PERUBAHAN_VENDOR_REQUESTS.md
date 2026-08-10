# Perubahan Vendor Requests dan Buyer View Only

## Hak akses

- BUYER: Vendor Management dan Contract Management hanya baca. Semua aksi tambah, edit, simpan, hapus, clear, import, double-click, klik kanan, serta perubahan status diblokir.
- BUYER: dapat membuat dan melihat permintaan vendor miliknya sendiri.
- PROCUREMENT_ADMIN: dapat melihat dan memproses seluruh Vendor Requests.
- SUPER_ADMIN: memiliki akses penuh dan dapat menggantikan Procurement Admin.

## Alur Vendor Request

1. Buyer mengisi nama perusahaan, PIC, email, kontak, kategori, alasan, dan prioritas.
2. Status awal: `PENDING REVIEW`.
3. Admin memproses melalui status `IN REVIEW`, `INVITATION SENT`, `WAITING VENDOR DATA`, `UNDER VERIFICATION`, `APPROVED`, `REJECTED`, atau `ACTIVE`.
4. Komunikasi dan permintaan dokumen kepada vendor dilakukan oleh Admin, bukan Buyer.
5. Saat status menjadi `ACTIVE`, data awal otomatis ditambahkan ke sheet `Company` setelah pemeriksaan duplikasi nama/email.
6. Buyer menerima badge dan pemberitahuan ketika membuka aplikasi bila status permintaannya berubah.

## Sheet baru

Backend membuat sheet `Vendor Requests` beserta header secara otomatis saat fitur pertama kali digunakan.

## File diubah

- `codegs.js`
- `index.html`
- `script.js`
- `vendor-company/index.html`
- `detail-contract/index.html`
- `DAFTAR_FILE_BERUBAH.txt`

## File baru

- `vendor-requests/index.html`
- `vendor-requests/style.css`
- `vendor-requests/script.js`
- `PERUBAHAN_VENDOR_REQUESTS.md`

## Deployment

Salin `codegs.js` ke Google Apps Script, buat deployment versi baru, pastikan `GAS_URL` menunjuk URL `/exec` terbaru, upload ulang website, aktifkan `ROLE_ENFORCEMENT_ENABLED=true`, lalu lakukan hard refresh.
