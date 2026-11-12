-- ============================================================
-- EduSYS: Fix Security Definer Views
-- Jalankan di Supabase SQL Editor
--
-- Masalah: 3 view menggunakan SECURITY DEFINER property
-- yang bisa bypass Row Level Security (RLS).
-- Supabase merekomendasikan SECURITY INVOKER agar view
-- berjalan dengan hak akses user yang sedang login.
--
-- View yang terdampak:
--   1. public.leaderboard
--   2. public.course_leaderboard (jika ada)
--   3. public.attendance_summary (jika ada)
-- ============================================================

-- Cek definisi view yang ada sekarang
SELECT viewname, definition
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN ('leaderboard', 'course_leaderboard', 'attendance_summary');
