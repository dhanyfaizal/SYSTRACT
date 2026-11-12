-- ============================================================
-- EduSYS: Performance Indexes Migration
-- Jalankan di Supabase SQL Editor
-- Aman dijalankan berulang (IF NOT EXISTS)
-- ============================================================

-- ── Enrollments ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id
  ON public.enrollments (student_id);

CREATE INDEX IF NOT EXISTS idx_enrollments_course_id
  ON public.enrollments (course_id);

CREATE INDEX IF NOT EXISTS idx_enrollments_course_student
  ON public.enrollments (course_id, student_id);

-- ── Submissions ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_submissions_student_id
  ON public.submissions (student_id);

CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id
  ON public.submissions (assignment_id);

CREATE INDEX IF NOT EXISTS idx_submissions_student_assignment
  ON public.submissions (student_id, assignment_id);

CREATE INDEX IF NOT EXISTS idx_submissions_status
  ON public.submissions (status);

-- ── Points Log ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_points_log_user_id
  ON public.points_log (user_id);

CREATE INDEX IF NOT EXISTS idx_points_log_semester_id
  ON public.points_log (semester_id);

CREATE INDEX IF NOT EXISTS idx_points_log_user_semester
  ON public.points_log (user_id, semester_id);

-- ── Material Views ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_material_views_student_id
  ON public.material_views (student_id);

CREATE INDEX IF NOT EXISTS idx_material_views_material_id
  ON public.material_views (material_id);

-- ── Announcements ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_announcements_active_priority
  ON public.announcements (is_active, priority DESC, created_at DESC)
  WHERE is_active = true;

-- ── Forum Replies ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_forum_replies_forum_id
  ON public.forum_replies (forum_id);

CREATE INDEX IF NOT EXISTS idx_forum_replies_author_id
  ON public.forum_replies (author_id);

-- ── Forums ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_forums_course_id
  ON public.forums (course_id);

-- ── Assignments ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_assignments_course_id
  ON public.assignments (course_id);

-- ── Materials ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_materials_course_id
  ON public.materials (course_id);

CREATE INDEX IF NOT EXISTS idx_materials_course_week
  ON public.materials (course_id, week_number);

-- ── Attendance ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_course_id
  ON public.attendance_sessions (course_id);

CREATE INDEX IF NOT EXISTS idx_attendances_session_id
  ON public.attendances (session_id);

CREATE INDEX IF NOT EXISTS idx_attendances_student_id
  ON public.attendances (student_id);

-- ── Exam Answers ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_exam_answers_student_id
  ON public.exam_answers (student_id);

CREATE INDEX IF NOT EXISTS idx_exam_answers_exam_id
  ON public.exam_answers (exam_id);

CREATE INDEX IF NOT EXISTS idx_exam_answers_exam_student
  ON public.exam_answers (exam_id, student_id);

-- Verifikasi: tampilkan semua index yang baru dibuat
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
