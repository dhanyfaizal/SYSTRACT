-- Uji perilaku progres materi di server (20261113090000_progres_materi_server.sql).
-- Dijalankan oleh terapkan_semua.sh setelah semua migrasi; gagal (exit ≠ 0) bila ada pernyataan yang salah.
\set ON_ERROR_STOP 1
SET client_min_messages = warning;
BEGIN;

INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b1')
ON CONFLICT DO NOTHING;
INSERT INTO profiles (id, full_name, role) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'Dosen Uji', 'dosen'),
  ('00000000-0000-0000-0000-0000000000a1', 'Peserta A', 'mahasiswa'),
  ('00000000-0000-0000-0000-0000000000b1', 'Peserta B', 'mahasiswa')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name;
INSERT INTO courses (id, code, name, dosen_id) VALUES ('10000000-0000-0000-0000-000000000001', 'UJI', 'Kursus Uji', '00000000-0000-0000-0000-0000000000d1');
INSERT INTO enrollments (course_id, student_id, status) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'approved'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'pending');
INSERT INTO materials (id, course_id, title, webslide_content) VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Materi Uji',
 '{"slides":[{"layout":"cover","title":"Sampul"},
   {"layout":"list","title":"Isi","list_items":[{"text":"satu dua tiga","color":"blue"}]},
   {"layout":"media","title":"Video","image_url":"https://youtu.be/a88k2tsrMs4","soal_video":[
      {"detik":66,"pertanyaan":"Q kedua","opsi":["a","b","c","d","e"],"jawaban":1},
      {"detik":18,"pertanyaan":"Q pertama","opsi":["a","b","c","d","e"],"jawaban":3},
      {"detik":40,"pertanyaan":"","opsi":["a","b"],"jawaban":0}]},
   {"layout":"quiz","title":"Latihan","quiz_items":[{"question":"L1","options":["a","b","c","d","e"],"answer":2},{"question":"L2","options":["a","b"],"answer":9}]}]}');

DO $$
DECLARE ws jsonb := (SELECT webslide_content FROM materials WHERE id = '20000000-0000-0000-0000-000000000001');
BEGIN
  ASSERT public.target_baca_total(ws) = 12, 'target baca: sampul 4 + daftar 8';
  ASSERT public.jumlah_soal_materi(ws, 'video') = 2, 'soal video tidak lengkap tidak dihitung';
  ASSERT public.jumlah_soal_materi(ws, 'latihan') = 2, 'jumlah latihan';
  ASSERT public.kunci_soal_materi(ws, 2, 'video', 0) = 3, 'soal video diurutkan menurut detik';
  ASSERT public.kunci_soal_materi(ws, 2, 'video', 1) = 1, 'soal video kedua';
  ASSERT public.kunci_soal_materi(ws, 2, 'video', 2) IS NULL, 'soal tidak lengkap dilewati';
  ASSERT public.kunci_soal_materi(ws, 3, 'latihan', 1) = 0, 'kunci latihan tidak valid → pilihan pertama';
  ASSERT public.kunci_soal_materi(ws, 1, 'video', 0) IS NULL, 'bagian bukan video';
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

DO $$
DECLARE m uuid := '20000000-0000-0000-0000-000000000001'; ditolak boolean;
BEGIN
  -- Tandai selesai sebelum syarat: ditolak
  ditolak := false;
  BEGIN PERFORM public.klaim_poin_materi(m, 0); EXCEPTION WHEN raise_exception THEN ditolak := true; END;
  ASSERT ditolak, 'klaim sebelum syarat harus ditolak';

  ASSERT NOT public.jawab_soal_materi(m, 2, 'video', 0, 0), 'jawaban salah';
  ASSERT public.jawab_soal_materi(m, 2, 'video', 0, 3), 'jawaban benar';

  ditolak := false;
  BEGIN PERFORM public.jawab_soal_materi(m, 2, 'video', 5, 0); EXCEPTION WHEN invalid_parameter_value THEN ditolak := true; END;
  ASSERT ditolak, 'soal yang tidak ada harus ditolak';

  -- Laporan baca pertama dibatasi 20 detik per bagian
  ASSERT public.catat_baca_materi(m, ARRAY[999, 999, 0, 0]) = 40, 'baca dibatasi waktu nyata';

  ditolak := false;
  BEGIN
    INSERT INTO jawaban_materi (student_id, material_id, course_id, bagian, jenis, soal, pilihan, benar)
    VALUES ('00000000-0000-0000-0000-0000000000a1', m, '10000000-0000-0000-0000-000000000001', 2, 'video', 1, 1, true);
  EXCEPTION WHEN insufficient_privilege THEN ditolak := true; END;
  ASSERT ditolak, 'tulis langsung ke jawaban_materi harus ditolak';

  ASSERT public.jawab_soal_materi(m, 2, 'video', 1, 1), 'soal video kedua';
  ASSERT public.jawab_soal_materi(m, 3, 'latihan', 0, 2), 'latihan pertama';

  ditolak := false;
  BEGIN PERFORM public.klaim_poin_materi(m, 0); EXCEPTION WHEN raise_exception THEN ditolak := true; END;
  ASSERT ditolak, 'masih kurang satu latihan';

  ASSERT public.jawab_soal_materi(m, 3, 'latihan', 1, 0), 'latihan kedua';
  ASSERT public.klaim_poin_materi(m, 0), 'syarat terpenuhi → selesai';
  ASSERT jsonb_array_length(public.progres_saya_materi(m)->'benar') = 4, 'progres saya berisi 4 soal benar';

  ditolak := false;
  BEGIN PERFORM * FROM public.laporan_progres_materi(m); EXCEPTION WHEN insufficient_privilege THEN ditolak := true; END;
  ASSERT ditolak, 'peserta tidak boleh membuka laporan dosen';
END $$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
DO $$
DECLARE ditolak boolean := false;
BEGIN
  BEGIN PERFORM public.jawab_soal_materi('20000000-0000-0000-0000-000000000001', 2, 'video', 0, 3);
  EXCEPTION WHEN insufficient_privilege THEN ditolak := true; END;
  ASSERT ditolak, 'peserta yang belum disetujui tidak boleh menjawab';
END $$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.laporan_progres_materi('20000000-0000-0000-0000-000000000001');
  ASSERT r.nama = 'Peserta A' AND r.video_benar = 2 AND r.latihan_benar = 2 AND r.jawaban_salah = 1
         AND r.syarat_terpenuhi AND r.selesai, 'laporan dosen';
END $$;

ROLLBACK;
\echo 'Uji progres materi: lulus.'
