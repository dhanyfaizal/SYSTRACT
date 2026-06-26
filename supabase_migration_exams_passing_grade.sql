-- ============================================================
-- SYSTRACT: Add passing_grade to exams table
-- Run this script in the Supabase SQL Editor
-- ============================================================

-- 1. Add passing_grade column to exams if it does not exist
ALTER TABLE public.exams 
  ADD COLUMN IF NOT EXISTS passing_grade INTEGER DEFAULT 70;
