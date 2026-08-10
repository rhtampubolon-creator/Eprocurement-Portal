# Perbaikan Procurement Year & Super Admin Workspace (V7)

## Dasar file
Perubahan dibuat di atas `EProcurement_Round_PO_View_Only_GAS_Fallback_V6.zip`.

## Perubahan

1. **Procurement Admin — Procurement Review per tahun**
   - Menambahkan pilihan `Procurement Year` seperti pada dashboard Buyer.
   - Tahun dibaca dari kolom `Assign Date` / `Assign PR Date` agar dasar perhitungan Admin dan Buyer sama.
   - Pilihan `All` menampilkan seluruh data, termasuk data dengan Assign Date kosong.
   - Saat tahun dipilih, kartu ringkasan, Procurement Review, dan Overdue ikut difilter.
   - Filter kolom Procurement Review direset ketika berpindah tahun agar perbandingan jumlah tidak tertutup filter lama.

2. **Super Admin — Procurement Review & Overdue di Workspace**
   - Super Admin sekarang dapat melihat Procurement Review dan Overdue langsung pada halaman Workspace.
   - Tampilan bersifat view only.
   - Kartu ringkasan Procurement Admin disembunyikan untuk Super Admin sehingga yang ditampilkan khusus Procurement Review dan Overdue.
   - Super Admin juga dapat memilih Procurement Year.

3. **Tidak mengubah backend**
   - `codegs.js` tidak diubah.
   - Perubahan hanya pada `index.html`, `style.css`, dan `script.js`.

## Catatan perbedaan angka Admin dan Buyer
Angka dapat berbeda karena Admin/Super Admin melihat data seluruh Buyer, sedangkan Buyer hanya melihat data yang terhubung ke akun Buyer tersebut. Data dengan Assign Date kosong hanya muncul pada pilihan `All`, bukan pada tahun tertentu.
