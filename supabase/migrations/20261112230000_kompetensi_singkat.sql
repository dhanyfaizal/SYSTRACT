-- ============================================================
-- SYSTRACT · Kompetensi singkat per kursus (tercetak di sertifikat)
-- ------------------------------------------------------------
-- Dosen mengisi daftar kompetensi pendek (mis. Excel, Word, PowerPoint) di pengaturan kursus.
-- Saat sertifikat terbit, daftar ini dibekukan ke certificates.competencies (kolom lama
-- dari legacy/011 yang belum pernah terisi) dan ikut dikembalikan verifikasi publik.
-- Prasyarat: 20261112200000_sertifikat_rincian_jam.sql. Satu transaksi; aman diulang.
-- ============================================================

BEGIN;

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS kompetensi_singkat text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS competencies text[] DEFAULT '{}';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'courses_kompetensi_singkat_maks') THEN
    ALTER TABLE public.courses ADD CONSTRAINT courses_kompetensi_singkat_maks
      CHECK (coalesce(array_length(kompetensi_singkat, 1), 0) <= 6);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.terbitkan_sertifikat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_r  jsonb;
  v_k  text[];
BEGIN
  IF NEW.certificate_status = 'validated'
     AND (TG_OP = 'INSERT' OR OLD.certificate_status IS DISTINCT FROM 'validated') THEN
    v_r := public.rincian_beban_sertifikat(NEW.course_id);
    SELECT coalesce(kompetensi_singkat, '{}') INTO v_k FROM courses WHERE id = NEW.course_id;
    INSERT INTO certificates (student_id, course_id, enrollment_id, certificate_code, score, issued_at,
                              total_menit, sks_setara, rincian, competencies)
    VALUES (NEW.student_id, NEW.course_id, NEW.id, public.buat_nomor_sertifikat(),
            public.skor_sertifikat(NEW.student_id, NEW.course_id),
            coalesce(NEW.certificate_validated_at, now()),
            (v_r->>'total_menit')::integer, (v_r->>'sks_setara')::integer, v_r->'baris', v_k)
    ON CONFLICT (student_id, course_id) DO UPDATE
      SET revoked_at = NULL, enrollment_id = EXCLUDED.enrollment_id, score = EXCLUDED.score,
          total_menit = EXCLUDED.total_menit, sks_setara = EXCLUDED.sks_setara,
          rincian = EXCLUDED.rincian, competencies = EXCLUDED.competencies;
  ELSIF TG_OP = 'UPDATE' AND OLD.certificate_status = 'validated'
        AND NEW.certificate_status IS DISTINCT FROM 'validated' THEN
    UPDATE certificates SET revoked_at = now()
     WHERE student_id = NEW.student_id AND course_id = NEW.course_id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

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
           'kompetensi',   to_jsonb(coalesce(c.competencies, '{}')),
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
