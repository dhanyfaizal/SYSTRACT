-- ============================================================
-- SYSTRACT: MOOC Phase 1 - Database Schema & Security setup
-- Run this in Supabase SQL Editor
-- ============================================================

-- Drop tables if they already exist to avoid column mismatch issues
DROP TABLE IF EXISTS public.certificates CASCADE;
DROP TABLE IF EXISTS public.course_progress CASCADE;


-- ── 1. Enable self-enrollment for students ──────────────────
DROP POLICY IF EXISTS "Students self enroll" ON public.enrollments;
CREATE POLICY "Students self enroll" ON public.enrollments
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

-- ── 2. Table: course_progress (material completions) ─────────
CREATE TABLE IF NOT EXISTS public.course_progress (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id    UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  material_id  UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, material_id)
);

-- Enable RLS
ALTER TABLE public.course_progress ENABLE ROW LEVEL SECURITY;

-- Policies for course_progress
DROP POLICY IF EXISTS "manage_own_progress" ON public.course_progress;
CREATE POLICY "manage_own_progress" ON public.course_progress
  FOR ALL USING (student_id = auth.uid());

DROP POLICY IF EXISTS "instructors_read_progress" ON public.course_progress;
CREATE POLICY "instructors_read_progress" ON public.course_progress
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.courses WHERE id = course_id AND dosen_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── 3. Table: certificates (competency certifications) ─────────
CREATE TABLE IF NOT EXISTS public.certificates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id        UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  score            NUMERIC(5,2),
  certificate_code TEXT UNIQUE NOT NULL,
  competencies     TEXT[] DEFAULT '{}',
  issued_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, course_id)
);

-- Enable RLS
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- Policies for certificates
DROP POLICY IF EXISTS "read_own_certificates" ON public.certificates;
CREATE POLICY "read_own_certificates" ON public.certificates
  FOR SELECT USING (student_id = auth.uid());

DROP POLICY IF EXISTS "instructors_read_certificates" ON public.certificates;
CREATE POLICY "instructors_read_certificates" ON public.certificates
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.courses WHERE id = course_id AND dosen_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
