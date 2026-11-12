-- ============================================================
-- SYSTRACT · Fase B: jam belajar & rincian modul dibekukan di sertifikat
-- ------------------------------------------------------------
-- Saat sertifikat terbit (atau aktif kembali), server menyimpan:
--   total_menit  : jumlah estimasi waktu belajar seluruh aktivitas kursus
--   sks_setara   : floor(total_menit / 2700)  — 1 SKS = 45 jam (Permendikbudristek 53/2023)
--   rincian      : baris sisi belakang sertifikat (modul + topik + menit, lalu tugas/forum/kuis/evaluasi)
-- Disimpan (bukan dihitung ulang) agar sertifikat lama tidak berubah bila kursus diubah kemudian.
-- Pengelompokan pertemuan → modul sama dengan src/lib/modules.js.
-- Prasyarat: 20261112140000_sertifikat_bernomor.sql, 20261112170000_beban_belajar_cpmk.sql.
-- Satu transaksi; aman dijalankan ulang.
-- ============================================================

BEGIN;

ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS total_menit integer;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS sks_setara  integer;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS rincian     jsonb;

-- Nama modul dari nomor pertemuan (selaras dengan MODULES di src/lib/modules.js).
CREATE OR REPLACE FUNCTION public.modul_dari_pertemuan(p_week integer)
RETURNS TABLE (urut integer, nama text) LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT * FROM (VALUES
    (CASE WHEN coalesce(p_week, 0) = 0 THEN 0
          WHEN p_week BETWEEN 1 AND 4 THEN 1  WHEN p_week BETWEEN 5 AND 7 THEN 2
          WHEN p_week = 8 THEN 3              WHEN p_week BETWEEN 9 AND 12 THEN 4
          WHEN p_week BETWEEN 13 AND 15 THEN 5 WHEN p_week = 16 THEN 6 ELSE 99 END,
     CASE WHEN coalesce(p_week, 0) = 0 THEN 'Pengantar'
          WHEN p_week BETWEEN 1 AND 4 THEN 'Modul 1 · Fondasi & Konsep Dasar'
          WHEN p_week BETWEEN 5 AND 7 THEN 'Modul 2 · Penerapan & Analisis Praktis'
          WHEN p_week = 8 THEN 'Evaluasi Tengah'
          WHEN p_week BETWEEN 9 AND 12 THEN 'Modul 3 · Pengembangan Sistem & Desain Lanjut'
          WHEN p_week BETWEEN 13 AND 15 THEN 'Modul 4 · Integrasi & Pengujian Akhir'
          WHEN p_week = 16 THEN 'Evaluasi Akhir'
          ELSE 'Materi Tambahan' END)
  ) v(urut, nama);
$$;
REVOKE ALL ON FUNCTION public.modul_dari_pertemuan(integer) FROM PUBLIC, anon, authenticated;

-- Rincian beban belajar untuk sertifikat. SECURITY DEFINER (dipanggil trigger penerbitan):
-- menghitung seluruh aktivitas kursus, ujian hanya yang terbit.
CREATE OR REPLACE FUNCTION public.rincian_beban_sertifikat(p_course uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH materi AS (
    SELECT md.urut, md.nama, m.week_number, m.title, coalesce(m.estimasi_menit, 0) AS menit
      FROM materials m CROSS JOIN LATERAL public.modul_dari_pertemuan(m.week_number) md
     WHERE m.course_id = p_course
  ),
  modul AS (
    SELECT urut, nama,
           min(coalesce(week_number, 0)) AS dari, max(coalesce(week_number, 0)) AS sampai,
           string_agg(title, ', ' ORDER BY week_number, title) AS topik,
           sum(menit) AS menit
      FROM materi GROUP BY urut, nama
  ),
  lain AS (
    SELECT 100 AS urut, 'Tugas & proyek' AS nama, string_agg(title, ', ' ORDER BY created_at) AS topik,
           sum(coalesce(estimasi_menit, 0)) AS menit, count(*) AS n
      FROM assignments WHERE course_id = p_course
    UNION ALL
    SELECT 101, 'Forum diskusi', string_agg(title, ', ' ORDER BY created_at), sum(coalesce(estimasi_menit, 0)), count(*)
      FROM forums WHERE course_id = p_course
    UNION ALL
    SELECT 102, 'Kuis & latihan', string_agg(title, ', ' ORDER BY created_at),
           sum(coalesce(estimasi_menit, duration_minutes, 0)), count(*)
      FROM exams WHERE course_id = p_course AND is_published AND coalesce(exam_mode, 'ujian') <> 'ujian'
    UNION ALL
    SELECT 103, 'Evaluasi', string_agg(title, ', ' ORDER BY created_at),
           sum(coalesce(estimasi_menit, duration_minutes, 0)), count(*)
      FROM exams WHERE course_id = p_course AND is_published AND coalesce(exam_mode, 'ujian') = 'ujian'
  ),
  baris AS (
    SELECT urut, nama,
           CASE WHEN dari = 0 AND sampai = 0 THEN 'Materi umum'
                WHEN dari = sampai THEN 'Pertemuan ' || dari
                ELSE 'Pertemuan ' || dari || '–' || sampai END AS keterangan,
           topik, menit::integer AS menit
      FROM modul
    UNION ALL
    SELECT urut, nama, n || ' aktivitas', topik, menit::integer FROM lain WHERE n > 0
  ),
  total AS (SELECT coalesce(sum(menit), 0)::integer AS menit FROM baris)
  SELECT jsonb_build_object(
    'total_menit', t.menit,
    'sks_setara',  floor(t.menit / 2700.0)::integer,
    'baris',       coalesce((SELECT jsonb_agg(jsonb_build_object('nama', nama, 'keterangan', keterangan, 'topik', topik, 'menit', menit) ORDER BY urut) FROM baris), '[]'::jsonb))
    FROM total t;
$$;
REVOKE ALL ON FUNCTION public.rincian_beban_sertifikat(uuid) FROM PUBLIC, anon, authenticated;

-- Trigger penerbitan: sama seperti sebelumnya + snapshot rincian.
CREATE OR REPLACE FUNCTION public.terbitkan_sertifikat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r jsonb;
BEGIN
  IF NEW.certificate_status = 'validated'
     AND (TG_OP = 'INSERT' OR OLD.certificate_status IS DISTINCT FROM 'validated') THEN
    v_r := public.rincian_beban_sertifikat(NEW.course_id);
    INSERT INTO certificates (student_id, course_id, enrollment_id, certificate_code, score, issued_at,
                              total_menit, sks_setara, rincian)
    VALUES (NEW.student_id, NEW.course_id, NEW.id, public.buat_nomor_sertifikat(),
            public.skor_sertifikat(NEW.student_id, NEW.course_id),
            coalesce(NEW.certificate_validated_at, now()),
            (v_r->>'total_menit')::integer, (v_r->>'sks_setara')::integer, v_r->'baris')
    ON CONFLICT (student_id, course_id) DO UPDATE
      SET revoked_at = NULL, enrollment_id = EXCLUDED.enrollment_id, score = EXCLUDED.score,
          total_menit = EXCLUDED.total_menit, sks_setara = EXCLUDED.sks_setara, rincian = EXCLUDED.rincian;
  ELSIF TG_OP = 'UPDATE' AND OLD.certificate_status = 'validated'
        AND NEW.certificate_status IS DISTINCT FROM 'validated' THEN
    UPDATE certificates SET revoked_at = now()
     WHERE student_id = NEW.student_id AND course_id = NEW.course_id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Lengkapi sertifikat yang sudah terbit sebelum migrasi ini.
UPDATE public.certificates c
   SET total_menit = (r->>'total_menit')::integer, sks_setara = (r->>'sks_setara')::integer, rincian = r->'baris'
  FROM (SELECT id, public.rincian_beban_sertifikat(course_id) AS r FROM public.certificates WHERE rincian IS NULL) s
 WHERE c.id = s.id;

-- Verifikasi publik kini juga memuat jam & SKS setara (dipakai SIRPL di Fase C).
CREATE OR REPLACE FUNCTION public.verifikasi_sertifikat(p_kode text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
           'nomor',        c.certificate_code,
           'valid',        c.revoked_at IS NULL,
           'dicabut_pada', c.revoked_at,
           'nama',         p.full_name,
           'kursus',       k.name,
           'kode_kursus',  k.code,
           'instruktur',   d.full_name,
           'terbit',       c.issued_at,
           'skor',         c.score,
           'total_menit',  c.total_menit,
           'jam',          round(coalesce(c.total_menit, 0) / 60.0, 1),
           'sks_setara',   c.sks_setara,
           'rincian',      c.rincian)
    FROM certificates c
    JOIN profiles p ON p.id = c.student_id
    JOIN courses  k ON k.id = c.course_id
    LEFT JOIN profiles d ON d.id = k.dosen_id
   WHERE c.certificate_code = upper(trim(p_kode))
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.verifikasi_sertifikat(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verifikasi_sertifikat(text) TO anon, authenticated;

COMMIT;
