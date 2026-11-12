-- ============================================================
-- SYSTRACT · Fase A: beban belajar (jam) & pemetaan CPMK
-- ------------------------------------------------------------
-- Dasar: Permendikbudristek No. 53 Tahun 2023 — 1 SKS = 45 jam belajar per semester.
-- Jam belajar dihitung dari seluruh aktivitas peserta (student learning time):
-- video, bacaan/modul, praktik, forum diskusi, tugas/proyek, kuis, dan evaluasi akhir.
--
-- Dosen mengisi estimasi menit dan CPMK yang dicapai pada tiap materi, tugas, ujian,
-- dan forum. ringkasan_beban_belajar(course_id) menjumlahkan semuanya dan
-- membandingkan dengan target SKS kursus (courses.credits × 45 jam).
-- Satu transaksi; aman dijalankan ulang.
-- ============================================================

BEGIN;

ALTER TABLE public.materials   ADD COLUMN IF NOT EXISTS estimasi_menit  integer CHECK (estimasi_menit IS NULL OR estimasi_menit BETWEEN 0 AND 6000);
ALTER TABLE public.materials   ADD COLUMN IF NOT EXISTS jenis_aktivitas text    CHECK (jenis_aktivitas IS NULL OR jenis_aktivitas IN ('video', 'bacaan', 'praktik'));
ALTER TABLE public.materials   ADD COLUMN IF NOT EXISTS cpmk_kode       text[]  NOT NULL DEFAULT '{}';
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS estimasi_menit  integer CHECK (estimasi_menit IS NULL OR estimasi_menit BETWEEN 0 AND 6000);
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS cpmk_kode       text[]  NOT NULL DEFAULT '{}';
ALTER TABLE public.exams       ADD COLUMN IF NOT EXISTS estimasi_menit  integer CHECK (estimasi_menit IS NULL OR estimasi_menit BETWEEN 0 AND 6000);
ALTER TABLE public.exams       ADD COLUMN IF NOT EXISTS cpmk_kode       text[]  NOT NULL DEFAULT '{}';
ALTER TABLE public.forums      ADD COLUMN IF NOT EXISTS estimasi_menit  integer CHECK (estimasi_menit IS NULL OR estimasi_menit BETWEEN 0 AND 6000);
ALTER TABLE public.forums      ADD COLUMN IF NOT EXISTS cpmk_kode       text[]  NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.materials.estimasi_menit IS 'Estimasi waktu belajar peserta (menit): menonton, membaca, atau praktik materi ini.';
COMMENT ON COLUMN public.exams.estimasi_menit     IS 'Estimasi waktu belajar (menit) termasuk persiapan; bila kosong dipakai duration_minutes.';
COMMENT ON COLUMN public.forums.estimasi_menit    IS 'Estimasi waktu peserta membaca dan menanggapi diskusi ini (menit).';

-- Ringkasan beban belajar satu kursus. SECURITY INVOKER: mengikuti RLS pemanggil
-- (dosen pengampu & admin melihat semua; peserta hanya yang terbit/terlihat olehnya).
CREATE OR REPLACE FUNCTION public.ringkasan_beban_belajar(p_course uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH aktivitas AS (
    SELECT coalesce(m.jenis_aktivitas,
             CASE WHEN m.mime_type ILIKE 'video%' OR m.webview_link ~* '(youtube\.com|youtu\.be|vimeo\.com)'
                  THEN 'video' ELSE 'bacaan' END) AS jenis,
           m.estimasi_menit AS menit, m.cpmk_kode
      FROM materials m WHERE m.course_id = p_course
    UNION ALL
    SELECT 'tugas', a.estimasi_menit, a.cpmk_kode FROM assignments a WHERE a.course_id = p_course
    UNION ALL
    SELECT CASE WHEN coalesce(e.exam_mode, 'ujian') = 'ujian' THEN 'evaluasi' ELSE 'kuis' END,
           coalesce(e.estimasi_menit, e.duration_minutes), e.cpmk_kode
      FROM exams e WHERE e.course_id = p_course
    UNION ALL
    SELECT 'forum', f.estimasi_menit, f.cpmk_kode FROM forums f WHERE f.course_id = p_course
  ),
  per_jenis AS (
    SELECT jenis, count(*) AS jumlah, coalesce(sum(menit), 0) AS menit,
           count(*) FILTER (WHERE menit IS NULL) AS belum_diisi
      FROM aktivitas GROUP BY jenis
  ),
  cpmk_kursus AS (
    SELECT c->>'kode' AS kode, c->>'deskripsi' AS deskripsi, ord
      FROM courses k, jsonb_array_elements(CASE WHEN jsonb_typeof(k.cpmk) = 'array' THEN k.cpmk ELSE '[]'::jsonb END)
           WITH ORDINALITY AS t(c, ord)
     WHERE k.id = p_course AND c ? 'kode'
  ),
  cakupan AS (
    SELECT ck.kode, ck.deskripsi, ck.ord,
           count(a.jenis) AS jumlah_aktivitas, coalesce(sum(a.menit), 0) AS menit
      FROM cpmk_kursus ck
      LEFT JOIN aktivitas a ON ck.kode = ANY (a.cpmk_kode)
     GROUP BY ck.kode, ck.deskripsi, ck.ord
  ),
  total AS (
    SELECT coalesce(sum(menit), 0) AS menit, coalesce(sum(belum_diisi), 0) AS belum_diisi, coalesce(sum(jumlah), 0) AS jumlah
      FROM per_jenis
  )
  SELECT jsonb_build_object(
    'sks',               k.credits,
    'target_menit',      coalesce(k.credits, 0) * 45 * 60,
    'total_menit',       t.menit,
    'jumlah_aktivitas',  t.jumlah,
    'belum_diisi',       t.belum_diisi,
    'sks_setara',        floor(t.menit / 2700.0)::int,
    'memenuhi_target',   k.credits IS NOT NULL AND k.credits > 0 AND t.menit >= k.credits * 45 * 60,
    'per_jenis',         coalesce((SELECT jsonb_object_agg(jenis, jsonb_build_object('jumlah', jumlah, 'menit', menit, 'belum_diisi', belum_diisi)) FROM per_jenis), '{}'::jsonb),
    'cpmk',              coalesce((SELECT jsonb_agg(jsonb_build_object('kode', kode, 'deskripsi', deskripsi, 'jumlah_aktivitas', jumlah_aktivitas, 'menit', menit) ORDER BY ord) FROM cakupan), '[]'::jsonb)
  )
    FROM courses k CROSS JOIN total t
   WHERE k.id = p_course;
$$;
REVOKE ALL ON FUNCTION public.ringkasan_beban_belajar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ringkasan_beban_belajar(uuid) TO authenticated;

COMMIT;
