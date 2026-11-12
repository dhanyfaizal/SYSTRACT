-- ============================================================
-- SYSTRACT: Enrollment Confirmation Database Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Tambah kolom status di tabel enrollments
ALTER TABLE public.enrollments ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';

-- 2. Update pendaftaran yang sudah ada agar berstatus 'approved'
UPDATE public.enrollments SET status = 'approved' WHERE status IS NULL OR status = 'pending';

-- 3. Perbarui RLS Policies agar membatasi akses materi/tugas/ujian/diskusi/soal
-- hanya bagi mahasiswa dengan status enrollment 'approved'.

-- RLS untuk public.materials
DROP POLICY IF EXISTS "Enrolled users see materials" ON public.materials;
CREATE POLICY "Enrolled users see materials" ON public.materials FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.enrollments WHERE course_id = materials.course_id AND student_id = auth.uid() AND status = 'approved')
    OR EXISTS (SELECT 1 FROM public.courses WHERE id = materials.course_id AND dosen_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- RLS untuk public.assignments
DROP POLICY IF EXISTS "Enrolled users see assignments" ON public.assignments;
CREATE POLICY "Enrolled users see assignments" ON public.assignments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.enrollments WHERE course_id = assignments.course_id AND student_id = auth.uid() AND status = 'approved')
    OR EXISTS (SELECT 1 FROM public.courses WHERE id = assignments.course_id AND dosen_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- RLS untuk public.forums
DROP POLICY IF EXISTS "Enrolled users see forums" ON public.forums;
CREATE POLICY "Enrolled users see forums" ON public.forums FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.enrollments WHERE course_id = forums.course_id AND student_id = auth.uid() AND status = 'approved')
    OR EXISTS (SELECT 1 FROM public.courses WHERE id = forums.course_id AND dosen_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- RLS untuk public.exams
DROP POLICY IF EXISTS "Enrolled users see exams" ON public.exams;
CREATE POLICY "Enrolled users see exams" ON public.exams FOR SELECT
  USING ((is_published AND EXISTS (SELECT 1 FROM public.enrollments WHERE course_id = exams.course_id AND student_id = auth.uid() AND status = 'approved'))
    OR EXISTS (SELECT 1 FROM public.courses WHERE id = exams.course_id AND dosen_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- RLS untuk public.questions (Bank Soal)
DROP POLICY IF EXISTS "Enrolled students see questions" ON public.questions;
CREATE POLICY "Enrolled students see questions" ON public.questions FOR SELECT
  USING (course_id IN (SELECT course_id FROM public.enrollments WHERE student_id = auth.uid() AND status = 'approved'));
