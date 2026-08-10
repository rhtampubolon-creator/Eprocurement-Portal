# Perbaikan V6 — Google Apps Script 404 dan Fallback Cache

- Round PO tetap view-only dan tidak melakukan POST.
- Dashboard tidak lagi langsung menjalankan `response.json()` ketika endpoint mengembalikan HTML/404.
- Jika Google Apps Script gagal, Dashboard dan Procurement Management menggunakan `MSW_PROCUREMENT_CACHE`.
- Status menampilkan `Mode cache — Google Sheet tidak terhubung`.
- URL deployment Google Apps Script tetap harus diperbaiki agar sinkronisasi live, login refresh, dan dokumen Google Drive kembali aktif.
- `codegs.js` tidak diubah.
