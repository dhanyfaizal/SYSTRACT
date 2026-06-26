-- ============================================================
-- SYSTRACT: Support Multiple Exam/Evaluasi Attempts
-- Run this script in the Supabase SQL Editor
-- ============================================================

-- 1. Add attempt_number column to exam_answers if it does not exist
ALTER TABLE public.exam_answers 
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1;

-- 2. Drop the old unique constraint (which only allowed one attempt per student)
ALTER TABLE public.exam_answers 
  DROP CONSTRAINT IF EXISTS exam_answers_exam_id_student_id_key;

-- 3. Add a new unique constraint including attempt_number
-- This prevents duplicate records for the exact same attempt of the same exam by the same student
ALTER TABLE public.exam_answers 
  ADD CONSTRAINT exam_answers_exam_id_student_id_attempt_number_key 
  UNIQUE (exam_id, student_id, attempt_number);
