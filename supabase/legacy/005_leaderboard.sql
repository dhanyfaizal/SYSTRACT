-- ============================================================
-- EduSYS: Semester + Points System Migration
-- Jalankan SELURUH file ini di Supabase SQL Editor
-- ============================================================

-- ── 1. TABEL: semesters ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS semesters (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,                          -- contoh: "Genap 2024/2025"
  year       smallint NOT NULL,
  period     text NOT NULL CHECK (period IN ('ganjil','genap')),
  is_active  boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  ended_at   timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "semesters_public_read"
  ON semesters FOR SELECT USING (true);

CREATE POLICY "semesters_admin_all"
  ON semesters FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── 2. UPDATE: points_log — tambah kolom baru ───────────────
ALTER TABLE points_log ADD COLUMN IF NOT EXISTS course_id   uuid REFERENCES courses(id)   ON DELETE SET NULL;
ALTER TABLE points_log ADD COLUMN IF NOT EXISTS semester_id uuid REFERENCES semesters(id) ON DELETE SET NULL;
ALTER TABLE points_log ADD COLUMN IF NOT EXISTS source      text;  -- 'materi','tugas','forum','ujian'

-- Tambah RLS policies untuk points_log
DROP POLICY IF EXISTS "points_log_read_own" ON points_log;
CREATE POLICY "points_log_read_own"
  ON points_log FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "points_log_admin_all" ON points_log;
CREATE POLICY "points_log_admin_all"
  ON points_log FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "points_log_service_insert" ON points_log;
CREATE POLICY "points_log_service_insert"
  ON points_log FOR INSERT WITH CHECK (user_id = auth.uid());

-- ── 3. TABEL: material_views ─────────────────────────────────
CREATE TABLE IF NOT EXISTS material_views (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id    uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  student_id     uuid NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  semester_id    uuid REFERENCES semesters(id),
  points_awarded boolean NOT NULL DEFAULT false,
  viewed_at      timestamptz DEFAULT now(),
  UNIQUE (material_id, student_id)   -- hanya satu record per materi per mahasiswa
);
ALTER TABLE material_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "material_views_own"
  ON material_views FOR ALL USING (student_id = auth.uid());

CREATE POLICY "material_views_dosen_read"
  ON material_views FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM materials m
      JOIN courses c ON c.id = m.course_id
      WHERE m.id = material_id AND c.dosen_id = auth.uid()
    )
  );

-- ── 4. VIEW: course_leaderboard ─────────────────────────────
CREATE OR REPLACE VIEW course_leaderboard AS
SELECT
  pl.course_id,
  pl.semester_id,
  p.id           AS user_id,
  p.full_name,
  p.nim,
  p.avatar_url,
  p.angkatan,
  p.program_studi,
  SUM(pl.points)                                                              AS total_points,
  SUM(CASE WHEN pl.source = 'materi' THEN pl.points ELSE 0 END)              AS materi_pts,
  SUM(CASE WHEN pl.source = 'tugas'  THEN pl.points ELSE 0 END)              AS tugas_pts,
  SUM(CASE WHEN pl.source = 'forum'  THEN pl.points ELSE 0 END)              AS forum_pts,
  SUM(CASE WHEN pl.source = 'ujian'  THEN pl.points ELSE 0 END)              AS ujian_pts,
  RANK() OVER (
    PARTITION BY pl.course_id, pl.semester_id
    ORDER BY SUM(pl.points) DESC
  ) AS rank
FROM points_log pl
JOIN profiles p ON p.id = pl.user_id
WHERE pl.course_id IS NOT NULL
  AND pl.semester_id IS NOT NULL
GROUP BY pl.course_id, pl.semester_id,
         p.id, p.full_name, p.nim, p.avatar_url, p.angkatan, p.program_studi;

-- ── 5. FUNCTION: get_active_semester ────────────────────────
CREATE OR REPLACE FUNCTION get_active_semester()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM semesters WHERE is_active = true LIMIT 1;
$$;

-- ── 6. FUNCTION: award_points_safe ─────────────────────────
-- Inserts ke points_log jika semester aktif ada
CREATE OR REPLACE FUNCTION award_points_safe(
  p_user_id    uuid,
  p_course_id  uuid,
  p_points     int,
  p_source     text,
  p_reason     text,
  p_ref_id     uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_semester_id uuid;
BEGIN
  SELECT id INTO v_semester_id FROM semesters WHERE is_active = true LIMIT 1;
  IF v_semester_id IS NULL THEN RETURN; END IF;

  INSERT INTO points_log (user_id, course_id, semester_id, points, source, reason, reference_id)
  VALUES (p_user_id, p_course_id, v_semester_id, p_points, p_source, p_reason, p_ref_id);
END;
$$;

-- ── 7. TRIGGER: Tugas dinilai → +10 pts ─────────────────────
CREATE OR REPLACE FUNCTION public.award_submission_graded_points()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_course_id uuid;
BEGIN
  IF NEW.status = 'graded' AND OLD.status <> 'graded' THEN
    SELECT course_id INTO v_course_id FROM assignments WHERE id = NEW.assignment_id;
    PERFORM award_points_safe(
      NEW.student_id, v_course_id, 10, 'tugas',
      'Tugas dinilai: ' || NEW.assignment_id::text, NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_submission_graded ON submissions;
CREATE TRIGGER on_submission_graded
  AFTER UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION public.award_submission_graded_points();

-- ── 8. TRIGGER: Ujian selesai → +20 pts (+10 bonus ≥90) ────
CREATE OR REPLACE FUNCTION public.award_exam_complete_points()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_course_id uuid;
BEGIN
  -- Hanya saat submitted_at baru diisi (sebelumnya null)
  IF NEW.submitted_at IS NOT NULL AND OLD.submitted_at IS NULL THEN
    SELECT course_id INTO v_course_id FROM exams WHERE id = NEW.exam_id;
    -- +20 pts selesai ujian
    PERFORM award_points_safe(
      NEW.student_id, v_course_id, 20, 'ujian',
      'Selesai ujian: ' || NEW.exam_id::text, NEW.id
    );
    -- +10 bonus jika skor ≥ 90
    IF NEW.score >= 90 THEN
      PERFORM award_points_safe(
        NEW.student_id, v_course_id, 10, 'ujian',
        'Bonus skor sempurna ujian: ' || NEW.exam_id::text, NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_exam_completed ON exam_answers;
CREATE TRIGGER on_exam_completed
  AFTER UPDATE ON exam_answers
  FOR EACH ROW EXECUTE FUNCTION public.award_exam_complete_points();
