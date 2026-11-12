-- ⚠️  BAHAYA: MENGHAPUS DATA PERMANEN — seluruh poin materi dan riwayat lihat materi semua mahasiswa.
-- Bukan migrasi. Jangan dijalankan di produksi kecuali memang ingin mengosongkan progres, dan setelah backup.

-- Reset semua progress materi (poin + views)
-- Jalankan di Supabase SQL Editor sebelum deploy fitur baru

DELETE FROM points_log WHERE source = 'materi';
DELETE FROM material_views;

-- Verifikasi
SELECT COUNT(*) AS sisa_points_materi FROM points_log WHERE source = 'materi';
SELECT COUNT(*) AS sisa_material_views FROM material_views;
