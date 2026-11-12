-- Fix RLS: izinkan Admin menghapus, update, dan insert mata kuliah
-- Jalankan di Supabase SQL Editor

-- 1. Cek policy yang ada
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE tablename = 'courses';

-- 2. Tambah/replace policy DELETE untuk admin
DROP POLICY IF EXISTS "Admin can delete courses" ON courses;
CREATE POLICY "Admin can delete courses"
  ON courses FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- 3. Tambah/replace policy UPDATE untuk admin (jika belum ada)
DROP POLICY IF EXISTS "Admin can update courses" ON courses;
CREATE POLICY "Admin can update courses"
  ON courses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- 4. Tambah/replace policy INSERT untuk admin (jika belum ada)
DROP POLICY IF EXISTS "Admin can insert courses" ON courses;
CREATE POLICY "Admin can insert courses"
  ON courses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- 5. Verifikasi semua policy pada tabel courses
SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'courses'
ORDER BY cmd;
