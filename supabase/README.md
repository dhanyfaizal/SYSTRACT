# Database SYSTRACT (Supabase)

## Struktur folder

| Folder | Isi | Boleh dijalankan ulang? |
|---|---|---|
| `legacy/` | SQL lama (April–Juli 2026), diurutkan menurut tanggal masuk ke git. **Sudah dijalankan di produksi.** Disimpan sebagai riwayat dan untuk membangun database uji dari nol. | Ya, untuk database baru/uji. Jangan dijalankan ke produksi. |
| `migrations/` | Perubahan sejak audit 2026-11-11. Satu file = satu perubahan, nama diawali waktu (`YYYYMMDDHHMMSS_`). Tiap file satu transaksi dan idempotent. | Ya |
| `scripts/` | Alat bantu: audit, cek index, dan skrip berbahaya (diberi awalan `BAHAYA_`). Bukan migrasi. | Lihat header tiap file |

## Membangun database dari nol (uji/lokal)

1. Jalankan semua file `legacy/` berurutan (`000` → `018`).
   `014_exam_attempts.sql` memberi satu error "already exists" untuk constraint yang sudah dibuat
   file sebelumnya — bisa diabaikan.
2. Jalankan semua file `migrations/` berurutan.
3. Jalankan `scripts/audit_produksi.sql`; kolom `temuan` seharusnya tanpa masalah keamanan.

## Mengubah database produksi

1. Tulis file baru di `migrations/` (jangan mengubah file yang sudah dijalankan).
   Bungkus dengan `BEGIN; … COMMIT;` dan pakai `IF NOT EXISTS` / `DROP … IF EXISTS` agar aman diulang.
2. Uji di database lokal (langkah di atas) termasuk skenario serangan sebagai `authenticated`.
3. Backup produksi, deploy kode yang membutuhkan perubahan itu, lalu jalankan file di Supabase SQL Editor.
4. Jalankan ulang `scripts/audit_produksi.sql` dan catat hasilnya di `scripts/hasil_audit_*.md`.

## Riwayat migrasi produksi

| File | Isi | Dijalankan |
|---|---|---|
| `20261111120000_fase1_celah_kritis.sql` | Peran, ujian & kunci jawaban di server, poin, pendaftaran, tabel lama dikunci | 2026-11-11 |
| `20261111150000_fase1b_celah_tinggi_sedang.sql` | Presensi, enrollment per pengampu, nilai akhir, forum, storage, akses anon dicabut | 2026-11-11 |
| `20261112090000_fase2_arsip_tabel_lama.sql` | 12 tabel sistem lama dipindah ke skema `arsip`, policy ganda dibuang | 2026-11-12 |
| `20261112100000_ujian_skor_persen.sql` | Skor ujian selalu persen 0–100; skor ujian soal manual lama dihitung ulang | 2026-11-12 |
| `20261112140000_sertifikat_bernomor.sql` | Sertifikat bernomor unik terbit otomatis saat divalidasi; dicabut saat validasi dibatalkan; RPC `verifikasi_sertifikat` publik | belum |

Uji otomatis: `bash supabase/tests/terapkan_semua.sh` (butuh `psql` dan variabel `PG*`) membangun
database dari nol, menerapkan semua migrasi dua kali, lalu menjalankan audit. CI menjalankannya di tiap push.

## Pola keamanan yang dipakai

- Helper `is_admin()`, `is_staf()`, `is_pengampu(course_id)`, `anggota_kursus(course_id)` untuk policy.
- Data yang tidak boleh dilihat mahasiswa (kunci jawaban, kode presensi) dibaca lewat view
  `exams_peserta` / `sesi_presensi_peserta`, bukan tabel aslinya.
- Aksi yang butuh validasi (mulai/kumpul ujian, poin materi, presensi, ajukan sertifikat) lewat RPC
  `SECURITY DEFINER` dengan `SET search_path = public`.
- Kolom yang tidak boleh diubah pengguna sendiri (peran, nilai tugas) dijaga trigger.
