-- ============================================================
-- EduSYS: Program Studi Table Creation
-- Jalankan file ini di Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.program_studi (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  code       TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.program_studi ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "program_studi_public_read" ON public.program_studi;
CREATE POLICY "program_studi_public_read" ON public.program_studi
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "program_studi_admin_all" ON public.program_studi;
CREATE POLICY "program_studi_admin_all" ON public.program_studi
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
