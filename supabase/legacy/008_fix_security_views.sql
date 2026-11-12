-- ============================================================
-- EduSYS: Fix Security Definer Views → Security Invoker
-- Jalankan di Supabase SQL Editor
--
-- SECURITY DEFINER = view berjalan dengan hak superuser (berbahaya)
-- SECURITY INVOKER = view berjalan dengan hak user yang sedang login (aman)
--
-- Menggunakan CREATE OR REPLACE dengan WITH (security_invoker = on)
-- yang didukung PostgreSQL 15+ (versi Supabase saat ini)
-- ============================================================

-- ── 1. leaderboard ──────────────────────────────────────────
CREATE OR REPLACE VIEW public.leaderboard
  WITH (security_invoker = on)
AS
  SELECT
    p.id AS user_id,
    p.full_name,
    p.nim,
    p.avatar_url,
    p.program_studi,
    COALESCE(sum(pl.points), 0::bigint) AS total_points,
    rank() OVER (ORDER BY COALESCE(sum(pl.points), 0::bigint) DESC) AS rank
  FROM profiles p
    LEFT JOIN points_log pl ON pl.user_id = p.id
  WHERE p.role = 'mahasiswa'::user_role
  GROUP BY p.id, p.full_name, p.nim, p.avatar_url, p.program_studi;

-- ── 2. course_leaderboard ────────────────────────────────────
CREATE OR REPLACE VIEW public.course_leaderboard
  WITH (security_invoker = on)
AS
  SELECT
    pl.course_id,
    pl.semester_id,
    p.id AS user_id,
    p.full_name,
    p.nim,
    p.avatar_url,
    p.angkatan,
    p.program_studi,
    sum(pl.points) AS total_points,
    sum(CASE WHEN pl.source = 'materi' THEN pl.points ELSE 0 END) AS materi_pts,
    sum(CASE WHEN pl.source = 'tugas'  THEN pl.points ELSE 0 END) AS tugas_pts,
    sum(CASE WHEN pl.source = 'forum'  THEN pl.points ELSE 0 END) AS forum_pts,
    sum(CASE WHEN pl.source = 'ujian'  THEN pl.points ELSE 0 END) AS ujian_pts,
    rank() OVER (
      PARTITION BY pl.course_id, pl.semester_id
      ORDER BY sum(pl.points) DESC
    ) AS rank
  FROM points_log pl
    JOIN profiles p ON p.id = pl.user_id
  WHERE pl.course_id IS NOT NULL
    AND pl.semester_id IS NOT NULL
  GROUP BY
    pl.course_id, pl.semester_id,
    p.id, p.full_name, p.nim, p.avatar_url, p.angkatan, p.program_studi;

-- ── 3. attendance_summary ────────────────────────────────────
CREATE OR REPLACE VIEW public.attendance_summary
  WITH (security_invoker = on)
AS
  SELECT
    s.course_id,
    a.student_id,
    p.full_name,
    p.nim,
    p.avatar_url,
    count(*) FILTER (WHERE a.status = 'hadir'::attendance_status)  AS hadir,
    count(*) FILTER (WHERE a.status = 'izin'::attendance_status)   AS izin,
    count(*) FILTER (WHERE a.status = 'sakit'::attendance_status)  AS sakit,
    count(*) FILTER (WHERE a.status = 'alpha'::attendance_status)  AS alpha,
    count(*)                                                        AS total_pertemuan,
    round(
      (count(*) FILTER (WHERE a.status = 'hadir'::attendance_status))::numeric
      / NULLIF(count(*), 0)::numeric * 100::numeric,
      1
    ) AS pct_hadir
  FROM attendances a
    JOIN attendance_sessions s ON s.id = a.session_id
    JOIN profiles p ON p.id = a.student_id
  GROUP BY s.course_id, a.student_id, p.full_name, p.nim, p.avatar_url;

-- ── Verifikasi: cek security_invoker sudah aktif ─────────────
SELECT
  c.relname  AS view_name,
  c.reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
  AND c.relname IN ('leaderboard', 'course_leaderboard', 'attendance_summary')
ORDER BY c.relname;
