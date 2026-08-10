# Perbaikan Go-Live

## Perubahan yang diterapkan

1. Identitas bisnis Procurement sekarang menggunakan kombinasi `No PR + tahun Assign PR Date`.
2. Kolom sistem tersembunyi `PR Year` ditambahkan dan dihitung otomatis dari Assign PR Date.
3. Add dan Edit menolak No PR yang sama hanya bila berada pada tahun Assign PR Date yang sama.
4. Smart Import mencocokkan record berdasarkan kombinasi No PR dan tahun Assign PR Date.
5. Smart Import menolak baris tanpa No PR atau Assign PR Date yang valid.
6. Smart Import mendeteksi duplikat No PR dalam tahun yang sama pada file sebelum dikirim ke backend.
7. Saat update dari import, sel kosong tidak lagi menimpa nilai lama yang sudah terisi.
8. Metadata sistem seperti Procurement ID, owner, versi, dan audit timestamp tidak dapat ditimpa langsung oleh file import.

## Catatan migrasi

- Saat backend pertama kali digunakan, kolom `PR Year` akan ditambahkan otomatis di kanan sheet Admin dan disembunyikan.
- Data lama yang Assign PR Date-nya kosong tetap perlu dilengkapi agar dapat dicocokkan secara aman.
- Lakukan pengujian pada salinan spreadsheet sebelum mengganti deployment produksi.

## Skenario uji wajib

- PR-001, Assign PR Date 10/01/2025 dan PR-001, Assign PR Date 10/01/2026 harus dapat disimpan bersamaan.
- PR-001 dua kali pada tahun 2026 harus ditolak.
- Import dengan Assign PR Date kosong harus ditolak.
- Import yang memiliki kolom kosong tidak boleh menghapus nilai lama.
- Import buyer lain harus tetap ditolak oleh pemeriksaan ownership yang sudah ada.
