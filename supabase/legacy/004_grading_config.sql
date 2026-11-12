-- ============================================================
-- Migration: course_grading_config
-- Jalankan di Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS course_grading_config (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  uuid NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
  dosen_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  config     jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (course_id, dosen_id)
);

-- Row Level Security
ALTER TABLE course_grading_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dosen_own_grading_config"
  ON course_grading_config
  FOR ALL
  USING  (dosen_id = auth.uid())
  WITH CHECK (dosen_id = auth.uid());

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_grading_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_grading_config_updated
  BEFORE UPDATE ON course_grading_config
  FOR EACH ROW EXECUTE FUNCTION update_grading_config_timestamp();

-- ============================================================
-- Tabel: student_keaktifan (nilai partisipasi/keaktifan kelas)
-- ============================================================

CREATE TABLE IF NOT EXISTS student_keaktifan (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  uuid NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dosen_id   uuid NOT NULL REFERENCES profiles(id),
  score      numeric(5,2) CHECK (score >= 0 AND score <= 100),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (course_id, student_id)
);

ALTER TABLE student_keaktifan ENABLE ROW LEVEL SECURITY;

-- Dosen bisa baca & tulis keaktifan mahasiswa di matakuliah miliknya
CREATE POLICY "dosen_keaktifan_all"
  ON student_keaktifan FOR ALL
  USING  (dosen_id = auth.uid())
  WITH CHECK (dosen_id = auth.uid());

-- Mahasiswa hanya baca nilai keaktifan sendiri
CREATE POLICY "mahasiswa_read_own_keaktifan"
  ON student_keaktifan FOR SELECT
  USING (student_id = auth.uid());
