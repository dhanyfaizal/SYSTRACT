-- ============================================================
-- EduSYS — PostgreSQL Schema (Supabase)
-- STIKOM Yos Sudarso | Version: 1.2  |  IDEMPOTENT (safe to re-run)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS  (safe to re-run via DO/EXCEPTION)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'dosen', 'mahasiswa', 'guest');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE exam_type AS ENUM ('uts', 'uas', 'kuis');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE submission_status AS ENUM ('draft', 'submitted', 'graded', 'late');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TABLE: profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT,
  email         TEXT,
  avatar_url    TEXT,
  role          user_role NOT NULL DEFAULT 'mahasiswa',
  nim           TEXT,
  nidn          TEXT,
  program_studi TEXT,
  angkatan      SMALLINT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABLE: courses
-- ============================================================
CREATE TABLE IF NOT EXISTS courses (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                   TEXT NOT NULL,
  name                   TEXT NOT NULL,
  description            TEXT,
  credits                SMALLINT DEFAULT 3,
  semester               TEXT,
  dosen_id               UUID REFERENCES profiles(id) ON DELETE SET NULL,
  google_drive_folder_id TEXT,
  cover_color            TEXT DEFAULT '#4F46E5',
  is_active              BOOLEAN DEFAULT TRUE,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABLE: enrollments
-- ============================================================
CREATE TABLE IF NOT EXISTS enrollments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (course_id, student_id)
);
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABLE: materials
-- ============================================================
CREATE TABLE IF NOT EXISTS materials (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id            UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title                TEXT NOT NULL,
  description          TEXT,
  week_number          SMALLINT,
  google_drive_file_id TEXT,
  webview_link         TEXT,
  download_link        TEXT,
  mime_type            TEXT,
  file_size_bytes      BIGINT,
  uploaded_by          UUID REFERENCES profiles(id),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABLE: assignments
-- ============================================================
CREATE TABLE IF NOT EXISTS assignments (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id              UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title                  TEXT NOT NULL,
  description            TEXT,
  rubric                 JSONB,
  max_score              NUMERIC(5,2) DEFAULT 100,
  due_date               TIMESTAMPTZ,
  google_drive_folder_id TEXT,
  allow_late_submission  BOOLEAN DEFAULT FALSE,
  created_by             UUID REFERENCES profiles(id),
  created_at             TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABLE: submissions
-- ============================================================
CREATE TABLE IF NOT EXISTS submissions (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id        UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  google_drive_file_id TEXT,
  webview_link         TEXT,
  file_name            TEXT,
  status               submission_status DEFAULT 'draft',
  grade                NUMERIC(5,2),
  feedback             TEXT,
  graded_by            UUID REFERENCES profiles(id),
  graded_at            TIMESTAMPTZ,
  submitted_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (assignment_id, student_id)
);
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABLE: forums
-- ============================================================
CREATE TABLE IF NOT EXISTS forums (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id  UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT,
  author_id  UUID REFERENCES profiles(id),
  is_pinned  BOOLEAN DEFAULT FALSE,
  views      INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE forums ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABLE: forum_replies
-- ============================================================
CREATE TABLE IF NOT EXISTS forum_replies (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  forum_id   UUID NOT NULL REFERENCES forums(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES profiles(id),
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE forum_replies ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABLE: exams
-- ============================================================
CREATE TABLE IF NOT EXISTS exams (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id        UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  type             exam_type NOT NULL,
  questions        JSONB NOT NULL DEFAULT '[]',
  duration_minutes SMALLINT DEFAULT 90,
  start_at         TIMESTAMPTZ,
  end_at           TIMESTAMPTZ,
  is_published     BOOLEAN DEFAULT FALSE,
  use_question_bank BOOLEAN DEFAULT FALSE,
  question_config   JSONB   DEFAULT '{"mudah":0,"sedang":0,"sulit":0}',
  exam_mode        TEXT DEFAULT 'ujian',
  max_attempts     INTEGER DEFAULT 5,
  passing_grade    INTEGER DEFAULT 70,
  created_by       UUID REFERENCES profiles(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
-- v1.2 columns (safe on existing DB)
ALTER TABLE exams ADD COLUMN IF NOT EXISTS use_question_bank BOOLEAN DEFAULT FALSE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS question_config   JSONB   DEFAULT '{"mudah":0,"sedang":0,"sulit":0}';
ALTER TABLE exams ADD COLUMN IF NOT EXISTS exam_mode TEXT DEFAULT 'ujian';
ALTER TABLE exams ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 5;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS passing_grade INTEGER DEFAULT 70;

-- ============================================================
-- TABLE: exam_answers
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_answers (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id            UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  answers            JSONB NOT NULL DEFAULT '{}',
  score              NUMERIC(5,2),
  started_at         TIMESTAMPTZ DEFAULT NOW(),
  submitted_at       TIMESTAMPTZ,
  questions_snapshot JSONB DEFAULT '[]',
  attempt_number     INTEGER DEFAULT 1,
  UNIQUE (exam_id, student_id, attempt_number)
);
ALTER TABLE exam_answers ENABLE ROW LEVEL SECURITY;
-- v1.2 columns (safe on existing DB)
ALTER TABLE exam_answers ADD COLUMN IF NOT EXISTS questions_snapshot JSONB DEFAULT '[]';
ALTER TABLE exam_answers ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1;
ALTER TABLE exam_answers DROP CONSTRAINT IF EXISTS exam_answers_exam_id_student_id_key;
ALTER TABLE exam_answers DROP CONSTRAINT IF EXISTS exam_answers_exam_id_student_id_attempt_number_key;
ALTER TABLE exam_answers ADD CONSTRAINT exam_answers_exam_id_student_id_attempt_number_key UNIQUE (exam_id, student_id, attempt_number);

-- ============================================================
-- TABLE: questions (Bank Soal — v1.2)
-- ============================================================
CREATE TABLE IF NOT EXISTS questions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id      UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  created_by     UUID REFERENCES profiles(id),
  question_text  TEXT NOT NULL,
  difficulty     TEXT NOT NULL DEFAULT 'sedang'
                   CHECK (difficulty IN ('mudah', 'sedang', 'sulit')),
  category       TEXT,
  options        JSONB NOT NULL DEFAULT '[]',
  correct_answer SMALLINT NOT NULL,
  explanation    TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- GAMIFICATION TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS badges (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT,
  icon_url    TEXT,
  icon_emoji  TEXT,
  criteria    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_badges (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id   UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, badge_id)
);
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS points_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  points       INT NOT NULL,
  reason       TEXT NOT NULL,
  reference_id UUID,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE points_log ENABLE ROW LEVEL SECURITY;

-- VIEW: leaderboard
CREATE OR REPLACE VIEW leaderboard AS
  SELECT
    p.id          AS user_id,
    p.full_name,
    p.nim,
    p.avatar_url,
    p.program_studi,
    COALESCE(SUM(pl.points), 0)                             AS total_points,
    RANK() OVER (ORDER BY COALESCE(SUM(pl.points), 0) DESC) AS rank
  FROM profiles p
  LEFT JOIN points_log pl ON pl.user_id = p.id
  WHERE p.role = 'mahasiswa'
  GROUP BY p.id, p.full_name, p.nim, p.avatar_url, p.program_studi;

-- ============================================================
-- SEED: Default Badges  (skip if already seeded)
-- ============================================================
INSERT INTO badges (name, description, icon_emoji, criteria)
SELECT * FROM (VALUES
  ('Pelajar Rajin',  'Kumpulkan 5 tugas tepat waktu',             '📚', '{"type":"submissions_on_time","value":5}'::jsonb),
  ('Juara Kelas',    'Raih peringkat #1 di Leaderboard',          '🏆', '{"type":"leaderboard_rank","value":1}'::jsonb),
  ('Aktif Forum',    'Buat 10 postingan di Forum',                '💬', '{"type":"forum_posts","value":10}'::jsonb),
  ('Nilai Sempurna', 'Raih nilai 100 pada sebuah tugas',          '⭐', '{"type":"perfect_score","value":100}'::jsonb),
  ('Cepat Tanggap',  'Kumpulkan tugas < 1 jam sebelum deadline',  '⚡', '{"type":"early_submission","value":1}'::jsonb),
  ('Explorer',       'Ikuti lebih dari 5 mata kuliah',            '🗺️', '{"type":"enrollments","value":5}'::jsonb)
) AS v(name, description, icon_emoji, criteria)
WHERE NOT EXISTS (SELECT 1 FROM badges WHERE badges.name = v.name);

-- ============================================================
-- TRIGGER: Auto-create profile on new user signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    CASE 
      WHEN NEW.email IN ('dhany.faizal@stikomyos.ac.id', 'danizsheila@gmail.com') THEN 'admin'::user_role
      ELSE 'mahasiswa'::user_role
    END
  )
  ON CONFLICT (id) DO UPDATE
  SET role = CASE 
    WHEN EXCLUDED.email IN ('dhany.faizal@stikomyos.ac.id', 'danizsheila@gmail.com') THEN 'admin'::user_role
    ELSE profiles.role
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- TRIGGER: Award points when submission is graded
-- ============================================================
CREATE OR REPLACE FUNCTION public.award_submission_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'graded' AND OLD.status <> 'graded' THEN
    INSERT INTO public.points_log (user_id, points, reason, reference_id)
    VALUES (NEW.student_id, 10, 'Tugas dinilai: ' || NEW.id::text, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_submission_graded ON submissions;
CREATE TRIGGER on_submission_graded
  AFTER UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION public.award_submission_points();

-- ============================================================
-- RLS POLICIES  (DROP IF EXISTS first to avoid duplicates)
-- ============================================================

-- profiles
DROP POLICY IF EXISTS "Public profiles are viewable" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile"  ON profiles;
DROP POLICY IF EXISTS "Users can update own profile"  ON profiles;
CREATE POLICY "Public profiles are viewable" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile"  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile"  ON profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Admin can update any profile" ON profiles;
CREATE POLICY "Admin can update any profile" ON profiles
  FOR UPDATE
  USING     (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- courses
DROP POLICY IF EXISTS "Enrolled users see courses"    ON courses;
DROP POLICY IF EXISTS "Anyone authenticated can see courses" ON courses;
DROP POLICY IF EXISTS "Dosen can insert courses"      ON courses;
DROP POLICY IF EXISTS "Dosen can update own courses"  ON courses;
CREATE POLICY "Anyone authenticated can see courses" ON courses FOR SELECT TO authenticated
  USING (
    is_active = true
    OR dosen_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Dosen can insert courses" ON courses FOR INSERT
  WITH CHECK (dosen_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Dosen can update own courses" ON courses FOR UPDATE
  USING (dosen_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- enrollments
DROP POLICY IF EXISTS "Students see own enrollments"   ON enrollments;
DROP POLICY IF EXISTS "Admin/Dosen manage enrollments" ON enrollments;
CREATE POLICY "Students see own enrollments" ON enrollments FOR SELECT
  USING (student_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','dosen')));
CREATE POLICY "Admin/Dosen manage enrollments" ON enrollments FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','dosen')));

-- materials
DROP POLICY IF EXISTS "Enrolled users see materials" ON materials;
DROP POLICY IF EXISTS "Dosen can manage materials"   ON materials;
CREATE POLICY "Enrolled users see materials" ON materials FOR SELECT
  USING (EXISTS (SELECT 1 FROM enrollments WHERE course_id = materials.course_id AND student_id = auth.uid())
    OR EXISTS (SELECT 1 FROM courses WHERE id = materials.course_id AND dosen_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Dosen can manage materials" ON materials FOR ALL
  USING (EXISTS (SELECT 1 FROM courses WHERE id = materials.course_id AND dosen_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- assignments
DROP POLICY IF EXISTS "Enrolled users see assignments" ON assignments;
DROP POLICY IF EXISTS "Dosen manage assignments"       ON assignments;
CREATE POLICY "Enrolled users see assignments" ON assignments FOR SELECT
  USING (EXISTS (SELECT 1 FROM enrollments WHERE course_id = assignments.course_id AND student_id = auth.uid())
    OR EXISTS (SELECT 1 FROM courses WHERE id = assignments.course_id AND dosen_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Dosen manage assignments" ON assignments FOR ALL
  USING (EXISTS (SELECT 1 FROM courses WHERE id = assignments.course_id AND dosen_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- submissions
DROP POLICY IF EXISTS "Students see own submissions"    ON submissions;
DROP POLICY IF EXISTS "Students insert own submissions" ON submissions;
DROP POLICY IF EXISTS "Students update own submissions" ON submissions;
DROP POLICY IF EXISTS "Dosen grade submissions"         ON submissions;
CREATE POLICY "Students see own submissions" ON submissions FOR SELECT
  USING (student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM assignments a JOIN courses c ON a.course_id = c.id WHERE a.id = submissions.assignment_id AND c.dosen_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Students insert own submissions" ON submissions FOR INSERT
  WITH CHECK (student_id = auth.uid());
CREATE POLICY "Students update own submissions" ON submissions FOR UPDATE
  USING (student_id = auth.uid() AND status IN ('draft','submitted'));
CREATE POLICY "Dosen grade submissions" ON submissions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM assignments a JOIN courses c ON a.course_id = c.id WHERE a.id = submissions.assignment_id AND c.dosen_id = auth.uid()));

-- forums & replies
DROP POLICY IF EXISTS "Enrolled users see forums"     ON forums;
DROP POLICY IF EXISTS "Enrolled users post in forums" ON forums;
DROP POLICY IF EXISTS "Everyone can see forum replies" ON forum_replies;
DROP POLICY IF EXISTS "Authenticated can reply"        ON forum_replies;
CREATE POLICY "Enrolled users see forums" ON forums FOR SELECT
  USING (EXISTS (SELECT 1 FROM enrollments WHERE course_id = forums.course_id AND student_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','dosen')));
CREATE POLICY "Enrolled users post in forums" ON forums FOR INSERT WITH CHECK (author_id = auth.uid());
DROP POLICY IF EXISTS "Dosen manage forums" ON forums;
CREATE POLICY "Dosen manage forums" ON forums FOR ALL
  USING (EXISTS (SELECT 1 FROM courses WHERE id = forums.course_id AND dosen_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Everyone can see forum replies" ON forum_replies FOR SELECT USING (true);
CREATE POLICY "Authenticated can reply" ON forum_replies FOR INSERT WITH CHECK (author_id = auth.uid());

-- exams
DROP POLICY IF EXISTS "Published exams visible to enrolled" ON exams;
DROP POLICY IF EXISTS "Dosen manage exams"                  ON exams;
CREATE POLICY "Published exams visible to enrolled" ON exams FOR SELECT
  USING ((is_published AND EXISTS (SELECT 1 FROM enrollments WHERE course_id = exams.course_id AND student_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','dosen')));
CREATE POLICY "Dosen manage exams" ON exams FOR ALL
  USING (EXISTS (SELECT 1 FROM courses WHERE id = exams.course_id AND dosen_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- exam_answers
DROP POLICY IF EXISTS "Students see own answers"    ON exam_answers;
DROP POLICY IF EXISTS "Students submit answers"     ON exam_answers;
DROP POLICY IF EXISTS "Students update own answers" ON exam_answers;
CREATE POLICY "Students see own answers" ON exam_answers FOR SELECT
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM exams e
      JOIN courses c ON e.course_id = c.id
      WHERE e.id = exam_answers.exam_id
        AND c.dosen_id = auth.uid()
    )
  );
CREATE POLICY "Students submit answers"     ON exam_answers FOR INSERT WITH CHECK (student_id = auth.uid());
CREATE POLICY "Students update own answers" ON exam_answers FOR UPDATE
  USING  (student_id = auth.uid() AND submitted_at IS NULL)
  WITH CHECK (student_id = auth.uid());

-- questions (Bank Soal)
DROP POLICY IF EXISTS "Dosen manage questions"        ON questions;
DROP POLICY IF EXISTS "Enrolled students see questions" ON questions;
CREATE POLICY "Dosen manage questions" ON questions FOR ALL
  USING (course_id IN (SELECT id FROM courses WHERE dosen_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Enrolled students see questions" ON questions FOR SELECT
  USING (course_id IN (SELECT course_id FROM enrollments WHERE student_id = auth.uid()));

-- gamification
DROP POLICY IF EXISTS "All can see user_badges" ON user_badges;
DROP POLICY IF EXISTS "All can see points_log"  ON points_log;
DROP POLICY IF EXISTS "System inserts points"   ON points_log;
DROP POLICY IF EXISTS "System awards badges"    ON user_badges;
CREATE POLICY "All can see user_badges" ON user_badges FOR SELECT USING (true);
CREATE POLICY "All can see points_log"  ON points_log  FOR SELECT USING (true);
CREATE POLICY "System inserts points"   ON points_log  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "System awards badges"    ON user_badges FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- TABLE: program_studi
-- ============================================================
CREATE TABLE IF NOT EXISTS public.program_studi (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  code       TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.program_studi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "program_studi_public_read" ON public.program_studi;
CREATE POLICY "program_studi_public_read" ON public.program_studi FOR SELECT USING (true);

DROP POLICY IF EXISTS "program_studi_admin_all" ON public.program_studi;
CREATE POLICY "program_studi_admin_all" ON public.program_studi FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

