-- ============================================================
-- SYSTRACT: Add exam_mode and max_attempts to exams table
-- Run this script in the Supabase SQL Editor
-- ============================================================

-- 1. Add exam_mode column to exams if it does not exist
ALTER TABLE public.exams 
  ADD COLUMN IF NOT EXISTS exam_mode TEXT DEFAULT 'ujian';

-- 2. Add max_attempts column to exams if it does not exist
ALTER TABLE public.exams 
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 5;
