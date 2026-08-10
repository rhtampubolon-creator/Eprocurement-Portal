# Dashboard Berbeda Berdasarkan Role

## SUPER_ADMIN
- Tema biru tua dan judul Control Center.
- Seluruh modul dan User Approvals tersedia.
- Label Full Access pada Procurement, Vendor, Contract, dan Vendor Requests.

## PROCUREMENT_ADMIN
- Tema hijau teal dan judul Procurement Operations.
- Fokus mengelola Procurement, Vendor, Contract, serta memproses Vendor Requests.
- Tidak melihat User Approvals dan konfigurasi khusus Super Admin.

## BUYER
- Tema oranye dan judul Buyer Procurement Portal.
- Vendor Management dan Contract Management diberi label View Only.
- Vendor Requests menjadi aksi utama + Request Add Vendor.
- Buyer hanya melihat dan memantau permintaan miliknya sesuai penjagaan backend.

Pembatasan menu frontend menggunakan atribut `data-module`. Keamanan perubahan data tetap wajib dijaga oleh pemeriksaan role pada backend Apps Script.
