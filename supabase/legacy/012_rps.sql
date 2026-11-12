-- ============================================================
-- SYSTRACT: RPS & AI Slide Generator Database Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Tambah kolom di tabel courses untuk CPL, CPMK, Referensi Pustaka, dan Draf Silabus
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS cpl JSONB DEFAULT '[]';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS cpmk JSONB DEFAULT '[]';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS referensi JSONB DEFAULT '[]';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS weekly_plan JSONB DEFAULT '[]';

-- 2. Tambah kolom di tabel materials untuk Outline Slide AI dan WebSlide Layout
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS slide_content JSONB DEFAULT '[]';
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS webslide_content JSONB DEFAULT 'null';
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
