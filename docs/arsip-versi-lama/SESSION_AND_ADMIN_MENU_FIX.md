# Session and Super Admin Menu Fix

Perubahan:

1. Token disimpan ke `localStorage` hanya ketika **Remember me** dicentang.
2. Token disimpan ke `sessionStorage` ketika **Remember me** tidak dicentang.
3. Saat halaman di-refresh, frontend mengirim `authToken` ke `getCurrentUserProfile` untuk memulihkan sesi.
4. Dropdown akun menampilkan **Google Sheet** dan **Apps Script** hanya untuk role `SUPER_ADMIN`.
5. Tombol **Sign Out** menghapus token dari localStorage/sessionStorage dan menghapus sesi backend.

Tidak diperlukan perubahan pada `codegs.js` untuk perbaikan ini, selama backend login versi terbaru sudah aktif.
