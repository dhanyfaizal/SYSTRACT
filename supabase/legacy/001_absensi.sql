-- ============================================================
-- EduSYS: Absensi Digital Migration
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- ── ENUM: attendance status ──────────────────────────────────
DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('hadir','izin','sakit','alpha');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── TABLE: attendance_sessions ───────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id      uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  dosen_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  meeting_number smallint NOT NULL DEFAULT 1,
  title          text NOT NULL,
  code           text NOT NULL,            -- kode 6 digit unik
  expires_at     timestamptz NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (course_id, code)
);
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;

-- Dosen bisa CRUD sesi miliknya
DROP POLICY IF EXISTS "att_session_dosen_all" ON attendance_sessions;
CREATE POLICY "att_session_dosen_all" ON attendance_sessions
  FOR ALL USING (dosen_id = auth.uid());

-- Mahasiswa bisa SELECT sesi kursus yang diikuti (untuk validasi kode)
DROP POLICY IF EXISTS "att_session_student_read" ON attendance_sessions;
CREATE POLICY "att_session_student_read" ON attendance_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM enrollments
      WHERE course_id = attendance_sessions.course_id
        AND student_id = auth.uid()
    )
  );

-- Admin read all
DROP POLICY IF EXISTS "att_session_admin_all" ON attendance_sessions;
CREATE POLICY "att_session_admin_all" ON attendance_sessions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── TABLE: attendances ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendances (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status        attendance_status NOT NULL DEFAULT 'hadir',
  checked_in_at timestamptz DEFAULT now(),
  notes         text,
  UNIQUE (session_id, student_id)
);
ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;

-- Mahasiswa bisa INSERT dan SELECT miliknya
DROP POLICY IF EXISTS "att_student_insert" ON attendances;
CREATE POLICY "att_student_insert" ON attendances
  FOR INSERT WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "att_student_select" ON attendances;
CREATE POLICY "att_student_select" ON attendances
  FOR SELECT USING (student_id = auth.uid());

-- Dosen bisa SELECT + UPDATE di sesi miliknya
DROP POLICY IF EXISTS "att_dosen_all" ON attendances;
CREATE POLICY "att_dosen_all" ON attendances
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM attendance_sessions s
      WHERE s.id = attendances.session_id AND s.dosen_id = auth.uid()
    )
  );

-- Admin
DROP POLICY IF EXISTS "att_admin_all" ON attendances;
CREATE POLICY "att_admin_all" ON attendances
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── VIEW: attendance_summary ─────────────────────────────────
CREATE OR REPLACE VIEW attendance_summary AS
SELECT
  s.course_id,
  a.student_id,
  p.full_name,
  p.nim,
  p.avatar_url,
  COUNT(*) FILTER (WHERE a.status = 'hadir') AS hadir,
  COUNT(*) FILTER (WHERE a.status = 'izin')  AS izin,
  COUNT(*) FILTER (WHERE a.status = 'sakit') AS sakit,
  COUNT(*) FILTER (WHERE a.status = 'alpha') AS alpha,
  COUNT(*)                                    AS total_pertemuan,
  ROUND(
    COUNT(*) FILTER (WHERE a.status = 'hadir')::numeric /
    NULLIF(COUNT(*), 0) * 100, 1
  ) AS pct_hadir
FROM attendances a
JOIN attendance_sessions s ON s.id = a.session_id
JOIN profiles p             ON p.id = a.student_id
GROUP BY s.course_id, a.student_id, p.full_name, p.nim, p.avatar_url;
