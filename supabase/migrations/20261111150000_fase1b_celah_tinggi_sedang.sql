-- ============================================================
-- SYSTRACT · Fase 1b: celah tingkat tinggi & sedang
-- ------------------------------------------------------------
-- Dasar: supabase/scripts/hasil_audit_2026-11-11.md (T1–T4, S1–S7)
-- ditambah temuan baru saat penulisan:
--   T8  semua tabel public terbaca tanpa login (anon) — termasuk email & NIM di profiles
--   T9  mahasiswa bisa membuat kursus dengan dirinya sebagai dosen
--   T10 dosen bisa memasang pengumuman di kursus yang bukan miliknya
--   S8  course_progress bisa diisi untuk kursus yang tidak diikuti
--
-- Prasyarat: 20261111120000_fase1_celah_kritis.sql sudah dijalankan (memakai is_admin()).
-- Jalankan bersamaan dengan deploy kode versi branch ini.
-- Satu transaksi; aman dijalankan ulang.
-- ============================================================

BEGIN;

-- ── Helper ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_staf()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'dosen'));
$$;

CREATE OR REPLACE FUNCTION public.is_pengampu(p_course uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.courses WHERE id = p_course AND dosen_id = auth.uid());
$$;

-- Admin, dosen pengampu, atau peserta yang pendaftarannya disetujui.
CREATE OR REPLACE FUNCTION public.anggota_kursus(p_course uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR public.is_pengampu(p_course) OR EXISTS (
    SELECT 1 FROM public.enrollments
     WHERE course_id = p_course AND student_id = auth.uid() AND status = 'approved');
$$;

REVOKE ALL ON FUNCTION public.is_staf(), public.is_pengampu(uuid), public.anggota_kursus(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staf(), public.is_pengampu(uuid), public.anggota_kursus(uuid) TO authenticated;


-- ══ T8 · Tidak ada akses tabel tanpa login ══════════════════
-- Seluruh aplikasi mensyaratkan login; kunci anon tertanam di browser dan bisa dipakai siapa pun.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;


-- ══ T1 · Presensi tidak bisa dipalsukan ═════════════════════
-- Mahasiswa tidak lagi membaca attendance_sessions (kolom code = kode presensi).
DROP POLICY IF EXISTS "att_session_student_read" ON public.attendance_sessions;
-- Mahasiswa tidak lagi mencatat kehadirannya sendiri secara langsung.
DROP POLICY IF EXISTS "att_student_insert" ON public.attendances;

-- Daftar pertemuan untuk peserta (tanpa kode). Penyaringan baris lewat anggota_kursus().
CREATE OR REPLACE VIEW public.sesi_presensi_peserta WITH (security_barrier = true) AS
SELECT s.id, s.course_id, s.meeting_number, s.title, s.expires_at, s.is_active, s.created_at
  FROM public.attendance_sessions s
 WHERE public.anggota_kursus(s.course_id);
REVOKE ALL ON public.sesi_presensi_peserta FROM anon;
GRANT SELECT ON public.sesi_presensi_peserta TO authenticated;

-- Presensi mandiri dengan kode (untuk fitur check-in mahasiswa; dicek di server).
CREATE OR REPLACE FUNCTION public.presensi_dengan_kode(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ses attendance_sessions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Silakan masuk terlebih dahulu' USING ERRCODE = '42501';
  END IF;
  SELECT s.* INTO v_ses
    FROM attendance_sessions s
    JOIN enrollments e ON e.course_id = s.course_id AND e.student_id = v_uid AND e.status = 'approved'
   WHERE upper(s.code) = upper(trim(p_code)) AND s.is_active AND s.expires_at > now()
   ORDER BY s.created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kode presensi tidak valid atau sudah kedaluwarsa' USING ERRCODE = '22023';
  END IF;
  INSERT INTO attendances (session_id, student_id, status, checked_in_at)
  VALUES (v_ses.id, v_uid, 'hadir', now())
  ON CONFLICT (session_id, student_id) DO NOTHING;
  RETURN jsonb_build_object('session_id', v_ses.id, 'course_id', v_ses.course_id,
                            'meeting_number', v_ses.meeting_number, 'title', v_ses.title);
END;
$$;
REVOKE ALL ON FUNCTION public.presensi_dengan_kode(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.presensi_dengan_kode(text) TO authenticated;


-- ══ T2 · View mengikuti RLS pemanggil ═══════════════════════
ALTER VIEW IF EXISTS public.attendance_summary SET (security_invoker = on);
ALTER VIEW IF EXISTS public.leaderboard        SET (security_invoker = on);
ALTER VIEW IF EXISTS public.course_leaderboard SET (security_invoker = on);


-- ══ T3 · Dosen hanya mengelola enrollment kursusnya ═════════
DROP POLICY IF EXISTS "Admin/Dosen manage enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Students see own enrollments"   ON public.enrollments;
DROP POLICY IF EXISTS "Admin kelola enrollment"        ON public.enrollments;
DROP POLICY IF EXISTS "Pengampu kelola enrollment"     ON public.enrollments;
DROP POLICY IF EXISTS "Peserta lihat enrollment sendiri" ON public.enrollments;

CREATE POLICY "Admin kelola enrollment" ON public.enrollments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Pengampu kelola enrollment" ON public.enrollments
  FOR ALL USING (public.is_pengampu(course_id)) WITH CHECK (public.is_pengampu(course_id));
CREATE POLICY "Peserta lihat enrollment sendiri" ON public.enrollments
  FOR SELECT USING (student_id = auth.uid());


-- ══ T4 · Nilai akhir ════════════════════════════════════════
DROP POLICY IF EXISTS "dosen_final_grades"                 ON public.final_grades;
DROP POLICY IF EXISTS "Pengampu kelola nilai akhir"        ON public.final_grades;
DROP POLICY IF EXISTS "Peserta lihat nilai akhir terbit"   ON public.final_grades;

CREATE POLICY "Pengampu kelola nilai akhir" ON public.final_grades
  FOR ALL USING (public.is_admin() OR public.is_pengampu(course_id))
  WITH CHECK (public.is_admin() OR public.is_pengampu(course_id));
CREATE POLICY "Peserta lihat nilai akhir terbit" ON public.final_grades
  FOR SELECT USING (student_id = auth.uid() AND coalesce(published, false));


-- ══ T9 · Hanya dosen/admin yang membuat kursus ══════════════
DROP POLICY IF EXISTS "Dosen can insert courses" ON public.courses;
CREATE POLICY "Dosen can insert courses" ON public.courses
  FOR INSERT WITH CHECK (public.is_admin() OR (public.is_staf() AND dosen_id = auth.uid()));


-- ══ T10, S6 · Pengumuman ════════════════════════════════════
DROP POLICY IF EXISTS "announcement_dosen_own" ON public.announcements;
CREATE POLICY "announcement_dosen_own" ON public.announcements
  FOR ALL USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid() AND type = 'course' AND public.is_pengampu(course_id));

DROP POLICY IF EXISTS "announcement_read_active" ON public.announcements;
CREATE POLICY "announcement_read_active" ON public.announcements
  FOR SELECT TO authenticated USING (
    is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (type = 'global' OR public.anggota_kursus(course_id))
  );


-- ══ S1 · Pengajuan sertifikat lewat server ══════════════════
-- Syarat sama dengan tampilan kursus: semua lampiran materi selesai, semua ujian
-- terbit lulus KKM, semua tugas sudah dikumpulkan.
CREATE OR REPLACE FUNCTION public.ajukan_sertifikat(p_course_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_enr enrollments%ROWTYPE;
  v_kurang integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Silakan masuk terlebih dahulu' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_enr FROM enrollments
   WHERE course_id = p_course_id AND student_id = v_uid AND status = 'approved'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anda belum terdaftar di kursus ini' USING ERRCODE = '42501';
  END IF;
  IF coalesce(v_enr.certificate_status, 'unvalidated') NOT IN ('unvalidated', 'returned') THEN
    RETURN v_enr.certificate_status;
  END IF;

  -- Lampiran materi yang belum selesai.
  SELECT count(*) INTO v_kurang
    FROM materials m
    CROSS JOIN LATERAL generate_series(0,
      CASE WHEN jsonb_typeof(m.attachments) = 'array' AND jsonb_array_length(m.attachments) > 0
             THEN jsonb_array_length(m.attachments)
           WHEN m.webview_link IS NOT NULL OR (m.webslide_content IS NOT NULL AND m.webslide_content <> 'null'::jsonb)
             THEN 1
           ELSE 0 END - 1) AS idx
   WHERE m.course_id = p_course_id
     AND NOT EXISTS (SELECT 1 FROM points_log p
                      WHERE p.user_id = v_uid AND p.source = 'materi'
                        AND p.reason = format('Selesai lampiran %s materi %s', idx + 1, m.id));
  IF v_kurang > 0 THEN
    RAISE EXCEPTION 'Masih ada % bagian materi yang belum selesai', v_kurang USING ERRCODE = '22023';
  END IF;

  -- Ujian terbit yang belum lulus.
  SELECT count(*) INTO v_kurang
    FROM exams e
   WHERE e.course_id = p_course_id AND e.is_published
     AND coalesce((SELECT max(a.score) FROM exam_answers a
                    WHERE a.exam_id = e.id AND a.student_id = v_uid AND a.submitted_at IS NOT NULL), -1)
         < coalesce(e.passing_grade, 70);
  IF v_kurang > 0 THEN
    RAISE EXCEPTION 'Masih ada % ujian yang belum lulus', v_kurang USING ERRCODE = '22023';
  END IF;

  -- Tugas yang belum dikumpulkan.
  SELECT count(*) INTO v_kurang
    FROM assignments t
   WHERE t.course_id = p_course_id
     AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id = t.id AND s.student_id = v_uid);
  IF v_kurang > 0 THEN
    RAISE EXCEPTION 'Masih ada % tugas yang belum dikumpulkan', v_kurang USING ERRCODE = '22023';
  END IF;

  UPDATE enrollments SET certificate_status = 'pending' WHERE id = v_enr.id;
  RETURN 'pending';
END;
$$;
REVOKE ALL ON FUNCTION public.ajukan_sertifikat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ajukan_sertifikat(uuid) TO authenticated;


-- ══ S8 · Progres hanya untuk kursus yang diikuti ════════════
DROP POLICY IF EXISTS "manage_own_progress" ON public.course_progress;
CREATE POLICY "manage_own_progress" ON public.course_progress
  FOR ALL USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid() AND public.anggota_kursus(course_id)
              AND EXISTS (SELECT 1 FROM public.materials m WHERE m.id = material_id AND m.course_id = course_progress.course_id));


-- ══ S2 · Bucket foto profil ═════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Path yang dipakai kode: avatars/<user_id>.<ext> dan avatars/<user_id>_custom_<waktu>.<ext>
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
DROP POLICY IF EXISTS "avatars_own_insert"  ON storage.objects;
DROP POLICY IF EXISTS "avatars_own_update"  ON storage.objects;
DROP POLICY IF EXISTS "avatars_own_delete"  ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "avatars_own_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND name LIKE 'avatars/' || auth.uid()::text || '%');
CREATE POLICY "avatars_own_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND name LIKE 'avatars/' || auth.uid()::text || '%')
  WITH CHECK (bucket_id = 'avatars' AND name LIKE 'avatars/' || auth.uid()::text || '%');
CREATE POLICY "avatars_own_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND name LIKE 'avatars/' || auth.uid()::text || '%');


-- ══ S4 · Gambar pengumuman hanya diubah admin/dosen ═════════
DROP POLICY IF EXISTS "announcement_images_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "announcement_images_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "announcement_images_auth_delete" ON storage.objects;
CREATE POLICY "announcement_images_auth_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'announcement-images' AND public.is_staf());
CREATE POLICY "announcement_images_auth_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'announcement-images' AND public.is_staf())
  WITH CHECK (bucket_id = 'announcement-images' AND public.is_staf());
CREATE POLICY "announcement_images_auth_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'announcement-images' AND public.is_staf());


-- ══ S5 · Forum hanya untuk anggota kursus ═══════════════════
DROP POLICY IF EXISTS "Enrolled users post in forums" ON public.forums;
CREATE POLICY "Enrolled users post in forums" ON public.forums
  FOR INSERT WITH CHECK (author_id = auth.uid() AND public.anggota_kursus(course_id));

DROP POLICY IF EXISTS "Authenticated can reply"        ON public.forum_replies;
DROP POLICY IF EXISTS "Everyone can see forum replies" ON public.forum_replies;
DROP POLICY IF EXISTS "Anggota kursus balas forum"     ON public.forum_replies;
DROP POLICY IF EXISTS "Anggota kursus lihat balasan"   ON public.forum_replies;
CREATE POLICY "Anggota kursus balas forum" ON public.forum_replies
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.forums f WHERE f.id = forum_id AND public.anggota_kursus(f.course_id)));
CREATE POLICY "Anggota kursus lihat balasan" ON public.forum_replies
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.forums f WHERE f.id = forum_id AND public.anggota_kursus(f.course_id)));


-- ══ S7 · Mahasiswa tidak bisa mengisi nilai tugasnya ════════
CREATE OR REPLACE FUNCTION public.lindungi_nilai_tugas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_course uuid;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  SELECT course_id INTO v_course FROM assignments WHERE id = NEW.assignment_id;
  IF public.is_pengampu(v_course) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.grade := NULL; NEW.feedback := NULL; NEW.graded_by := NULL; NEW.graded_at := NULL;
    IF NEW.status = 'graded' THEN NEW.status := 'submitted'; END IF;
  ELSE
    NEW.student_id    := OLD.student_id;
    NEW.assignment_id := OLD.assignment_id;
    NEW.grade     := OLD.grade;
    NEW.feedback  := OLD.feedback;
    NEW.graded_by := OLD.graded_by;
    NEW.graded_at := OLD.graded_at;
    IF NEW.status = 'graded' AND OLD.status IS DISTINCT FROM 'graded' THEN
      NEW.status := OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.lindungi_nilai_tugas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lindungi_nilai_tugas ON public.submissions;
CREATE TRIGGER trg_lindungi_nilai_tugas
  BEFORE INSERT OR UPDATE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.lindungi_nilai_tugas();

-- Kumpul tugas hanya ke kursus yang diikuti.
DROP POLICY IF EXISTS "Students insert own submissions" ON public.submissions;
CREATE POLICY "Students insert own submissions" ON public.submissions
  FOR INSERT WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_id AND public.anggota_kursus(a.course_id)));

COMMIT;
