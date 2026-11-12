-- ============================================================
-- SYSTRACT · Sertifikat bernomor & verifikasi publik
-- ------------------------------------------------------------
-- Saat instruktur memvalidasi sertifikat (enrollments.certificate_status = 'validated'),
-- server menerbitkan satu baris di `certificates` dengan nomor unik acak, mis.
--   SYSTC.2026.11.7F3A9C21B4
-- Nomor ini dicetak di sertifikat beserta QR ke halaman /verifikasi/<nomor>.
-- Bila validasi dibatalkan, sertifikat ditandai dicabut (nomor tetap, revoked_at diisi);
-- bila divalidasi lagi, sertifikat yang sama aktif kembali.
--
-- verifikasi_sertifikat(nomor) bisa dipanggil tanpa login dan hanya mengembalikan
-- data yang tercetak di sertifikat (nama, kursus, instruktur, tanggal, status).
-- Satu transaksi; aman dijalankan ulang.
-- ============================================================

BEGIN;

ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE SET NULL;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS revoked_at   timestamptz;
-- Biasanya sudah ada sebagai constraint UNIQUE dari legacy/011 (nama sama → dilewati).
CREATE UNIQUE INDEX IF NOT EXISTS certificates_certificate_code_key      ON public.certificates (certificate_code);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_student_id_course_id_key  ON public.certificates (student_id, course_id);

-- Nomor acak 40-bit (dari gen_random_uuid, acak secara kriptografis) agar tidak bisa ditebak berurutan.
CREATE OR REPLACE FUNCTION public.buat_nomor_sertifikat()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'SYSTC.' || to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY.MM') || '.'
         || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;
REVOKE ALL ON FUNCTION public.buat_nomor_sertifikat() FROM PUBLIC, anon, authenticated;

-- Skor di sertifikat: rata-rata skor terbaik tiap ujian terbit di kursus (null bila tidak ada ujian).
CREATE OR REPLACE FUNCTION public.skor_sertifikat(p_student uuid, p_course uuid)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT round(avg(t.terbaik), 1)
    FROM (SELECT max(a.score) AS terbaik
            FROM exams e
            JOIN exam_answers a ON a.exam_id = e.id AND a.student_id = p_student AND a.submitted_at IS NOT NULL
           WHERE e.course_id = p_course AND e.is_published
           GROUP BY e.id) t;
$$;
REVOKE ALL ON FUNCTION public.skor_sertifikat(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.terbitkan_sertifikat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.certificate_status = 'validated'
     AND (TG_OP = 'INSERT' OR OLD.certificate_status IS DISTINCT FROM 'validated') THEN
    INSERT INTO certificates (student_id, course_id, enrollment_id, certificate_code, score, issued_at)
    VALUES (NEW.student_id, NEW.course_id, NEW.id, public.buat_nomor_sertifikat(),
            public.skor_sertifikat(NEW.student_id, NEW.course_id),
            coalesce(NEW.certificate_validated_at, now()))
    ON CONFLICT (student_id, course_id) DO UPDATE
      SET revoked_at = NULL, enrollment_id = EXCLUDED.enrollment_id, score = EXCLUDED.score;
  ELSIF TG_OP = 'UPDATE' AND OLD.certificate_status = 'validated'
        AND NEW.certificate_status IS DISTINCT FROM 'validated' THEN
    UPDATE certificates SET revoked_at = now()
     WHERE student_id = NEW.student_id AND course_id = NEW.course_id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.terbitkan_sertifikat() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_terbitkan_sertifikat ON public.enrollments;
CREATE TRIGGER trg_terbitkan_sertifikat
  AFTER INSERT OR UPDATE OF certificate_status ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.terbitkan_sertifikat();

-- Terbitkan untuk validasi yang sudah ada sebelum migrasi ini.
INSERT INTO public.certificates (student_id, course_id, enrollment_id, certificate_code, score, issued_at)
SELECT e.student_id, e.course_id, e.id, public.buat_nomor_sertifikat(),
       public.skor_sertifikat(e.student_id, e.course_id), coalesce(e.certificate_validated_at, now())
  FROM public.enrollments e
 WHERE e.certificate_status = 'validated'
ON CONFLICT (student_id, course_id) DO NOTHING;

-- Verifikasi publik (tanpa login).
CREATE OR REPLACE FUNCTION public.verifikasi_sertifikat(p_kode text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
           'nomor',       c.certificate_code,
           'valid',       c.revoked_at IS NULL,
           'dicabut_pada', c.revoked_at,
           'nama',        p.full_name,
           'kursus',      k.name,
           'kode_kursus', k.code,
           'instruktur',  d.full_name,
           'terbit',      c.issued_at,
           'skor',        c.score)
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
