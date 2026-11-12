-- ============================================================
-- Migration: Certificate Validation & Assignment Revision System
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add certificate tracking columns to enrollments table
ALTER TABLE public.enrollments ADD COLUMN IF NOT EXISTS certificate_status VARCHAR(50) DEFAULT 'unvalidated';
ALTER TABLE public.enrollments ADD COLUMN IF NOT EXISTS certificate_notes TEXT;
ALTER TABLE public.enrollments ADD COLUMN IF NOT EXISTS certificate_validated_at TIMESTAMPTZ;
ALTER TABLE public.enrollments ADD COLUMN IF NOT EXISTS certificate_validated_by UUID REFERENCES public.profiles(id);

-- 2. Add 'revision' state to submission_status enum if not exists
-- PostgreSQL allows adding enum values. Note: In some environments,
-- running this inside a transaction block might fail, so run it independently.
ALTER TYPE public.submission_status ADD VALUE IF NOT EXISTS 'revision';
