# Perbaikan Round PO View Only V5

## Masalah
Dropdown Round PO pada Procurement Management memanggil `saveToGoogleSheet()` setiap kali pilihan diubah. Fungsi tersebut mengirim aksi `BATCH_REPLACE_PROCUREMENT`, sedangkan role Buyer tidak memiliki permission `procurement.import`. Akibatnya muncul pesan Google Sheet error walaupun pengguna hanya bermaksud melihat round lain.

## Perbaikan
- Pilihan Round PO sekarang hanya menjadi state tampilan di browser.
- Tidak mengubah `row.roundpo` atau field data lainnya.
- Tidak menyimpan cache.
- Tidak mengirim POST ke Google Apps Script.
- Tidak mengubah revision Google Sheet.
- Kolom Company Name, Submit Company, Start Date, Finish Date, Final Vendor List, dan Final Submit Vendor mengikuti round yang dipilih untuk tampilan.
- Berlaku untuk Buyer, Procurement Admin, dan Super Admin.

## Backend
`codegs.js` tidak berubah.
