# Perbaikan Company Status Otomatis Saat Import Vendor (V3)

- `Company Status` dihitung ulang dari kolom `Core Business`.
- Hanya Core Business yang ditemukan pada `CORE_BUSINESS_OPTIONS` yang menghasilkan Company Status.
- Core Business yang tidak terdapat pada daftar tetap dapat terlihat untuk pemeriksaan, tetapi Company Status akan kosong.
- Pemisah `;`, koma, `|`, dan baris baru didukung.
- Penulisan huruf kecil/besar, spasi di sekitar tanda hubung, serta en dash/em dash dinormalisasi.
- `Description Core Business` ikut dihitung ulang dari daftar resmi.
- Berlaku pada import Excel, cache lokal, data yang dimuat dari Google Sheet, dan sebelum proses simpan.
- `codegs.js` tidak diubah.
