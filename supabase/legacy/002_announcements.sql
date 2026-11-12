-- ============================================================
-- Migration: announcements
-- Jalankan di Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  content     text NOT NULL,
  image_url   text,
  type        text NOT NULL DEFAULT 'global'
              CHECK (type IN ('global','course')),
  course_id   uuid REFERENCES courses(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES profiles(id),
  is_active   boolean NOT NULL DEFAULT true,
  priority    int NOT NULL DEFAULT 0,
  expires_at  timestamptz,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Admin: akses penuh ke semua pengumuman
CREATE POLICY "announcement_admin_all"
  ON announcements FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Dosen: CRUD milik sendiri
CREATE POLICY "announcement_dosen_own"
  ON announcements FOR ALL
  USING  (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid() AND type = 'course');

-- Semua user login: baca aktif (global + MK yang diikuti)
CREATE POLICY "announcement_read_active"
  ON announcements FOR SELECT
  USING (
    is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (
      type = 'global'
      OR EXISTS (
        SELECT 1 FROM enrollments
        WHERE enrollments.course_id = announcements.course_id
          AND enrollments.student_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM courses
        WHERE courses.id = announcements.course_id
          AND courses.dosen_id = auth.uid()
      )
    )
  );

-- ============================================================
-- Storage: buat bucket announcement-images + policies
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- Buat bucket (public = bisa diakses tanpa login untuk READ)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'announcement-images',
  'announcement-images',
  true,
  5242880,  -- 5 MB
  ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: siapa saja bisa baca (public read)
CREATE POLICY "announcement_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'announcement-images');

-- Policy: user login bisa upload
CREATE POLICY "announcement_images_auth_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'announcement-images');

-- Policy: user login bisa update file miliknya
CREATE POLICY "announcement_images_auth_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'announcement-images');

-- Policy: user login bisa hapus file miliknya
CREATE POLICY "announcement_images_auth_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'announcement-images');
