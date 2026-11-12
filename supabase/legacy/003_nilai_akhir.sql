-- ============================================================
-- Migration: Grade Config & Final Grade System
-- Run in Supabase SQL Editor
-- ============================================================

-- Grade component weights per course
CREATE TABLE IF NOT EXISTS grade_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       UUID REFERENCES courses(id) ON DELETE CASCADE UNIQUE,
  tugas_weight    NUMERIC(5,2) DEFAULT 30  CHECK (tugas_weight    >= 0),
  uts_weight      NUMERIC(5,2) DEFAULT 35  CHECK (uts_weight      >= 0),
  uas_weight      NUMERIC(5,2) DEFAULT 35  CHECK (uas_weight      >= 0),
  attendance_weight NUMERIC(5,2) DEFAULT 0 CHECK (attendance_weight >= 0),
  passing_score   NUMERIC(5,2) DEFAULT 55,
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Override / manual final grade (optional per student per course)
CREATE TABLE IF NOT EXISTS final_grades (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID REFERENCES profiles(id) ON DELETE CASCADE,
  course_id   UUID REFERENCES courses(id)  ON DELETE CASCADE,
  tugas_avg   NUMERIC(6,2),
  uts_avg     NUMERIC(6,2),
  uas_avg     NUMERIC(6,2),
  attendance_pct NUMERIC(5,2),
  final_score NUMERIC(6,2),
  grade_letter VARCHAR(2),
  is_manual   BOOLEAN DEFAULT false,
  notes       TEXT,
  published   BOOLEAN DEFAULT false,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, course_id)
);

-- RLS
ALTER TABLE grade_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_grades  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dosen_grade_configs" ON grade_configs;
CREATE POLICY "dosen_grade_configs" ON grade_configs
  USING (
    EXISTS (SELECT 1 FROM courses WHERE id = course_id AND dosen_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM courses WHERE id = course_id AND dosen_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "read_grade_configs" ON grade_configs;
CREATE POLICY "read_grade_configs" ON grade_configs FOR SELECT USING (true);

DROP POLICY IF EXISTS "dosen_final_grades" ON final_grades;
CREATE POLICY "dosen_final_grades" ON final_grades
  USING (
    EXISTS (SELECT 1 FROM courses WHERE id = course_id AND dosen_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR student_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM courses WHERE id = course_id AND dosen_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
