-- ============================================================
-- SYSTRACT · Fase 0: Audit kondisi database produksi
-- ------------------------------------------------------------
-- HANYA MEMBACA. Tidak ada INSERT/UPDATE/DELETE/DDL di file ini.
--
-- Cara pakai:
--   1. Buka Supabase → SQL Editor → New query.
--   2. Tempel SELURUH isi file ini, lalu Run.
--   3. Hasilnya satu baris dengan dua kolom:
--        - temuan : ringkasan masalah yang terdeteksi otomatis
--        - detail : isi lengkap skema (tabel, kolom, policy, fungsi, dst.)
--      Salin kedua nilai (klik sel → Copy) dan simpan sebagai
--      supabase/scripts/hasil_audit_<tanggal>.json, atau tempel ke Claude.
--
-- Daftar "yang diharapkan" di bawah diambil dari kode (src/) dan file
-- supabase_*.sql per 2026-11-11. Perbarui bila kode berubah.
-- ============================================================

WITH
-- ── Yang diharapkan oleh kode ────────────────────────────────
expected_tables(name) AS (VALUES
  ('profiles'),('courses'),('enrollments'),('materials'),('assignments'),
  ('submissions'),('exams'),('questions'),('exam_answers'),('forums'),
  ('forum_replies'),('forum_posts'),('announcements'),('semesters'),
  ('program_studi'),('attendance_sessions'),('attendances'),
  ('course_progress'),('material_views'),('final_grades'),('grade_configs'),
  ('course_grading_config'),('student_keaktifan'),('points_log'),
  ('shop_items'),('user_inventory'),('user_avatar_config'),
  ('course_leaderboard'),('exam_attempt_keys'),('exams_peserta')
),
-- View yang sengaja tanpa security_invoker (menyaring baris sendiri lewat auth.uid()).
intended_definer_views(name) AS (VALUES ('exams_peserta')),
-- Tabel sisa sistem lama: akses API anon/authenticated harus sudah dicabut (Fase 1, K6).
legacy_tables(name) AS (VALUES
  ('users'),('institutions'),('classes'),('modules'),('sections'),('content_items'),
  ('final_exams'),('exam_attempts'),('formative_logs'),('learning_paths'),
  ('portfolio_submissions'),('user_progress')
),
expected_columns(tbl, col) AS (VALUES
  ('courses','cpl'),('courses','cpmk'),('courses','referensi'),('courses','weekly_plan'),
  ('enrollments','status'),('enrollments','certificate_status'),('enrollments','certificate_notes'),
  ('enrollments','certificate_validated_at'),('enrollments','certificate_validated_by'),
  ('exam_answers','attempt_number'),('exam_answers','questions_snapshot'),
  ('exams','exam_mode'),('exams','max_attempts'),('exams','passing_grade'),
  ('exams','question_config'),('exams','use_question_bank'),
  ('materials','attachments'),('materials','slide_content'),('materials','webslide_content'),
  ('points_log','course_id'),('points_log','semester_id'),('points_log','source')
),
expected_functions(name) AS (VALUES
  ('purchase_item'),('award_points_safe'),('award_exam_complete_points'),
  ('award_submission_graded_points'),('award_submission_points'),
  ('get_active_semester'),('handle_new_user'),('update_grading_config_timestamp')
),
expected_buckets(id) AS (VALUES ('avatars'),('announcement-images')),

-- ── Kondisi sebenarnya ───────────────────────────────────────
rels AS (
  SELECT c.oid, c.relname AS name, c.relkind, c.relrowsecurity AS rls, c.relforcerowsecurity AS rls_force,
         c.reltuples::bigint AS est_rows, c.reloptions
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','p')
),
cols AS (
  SELECT table_name, column_name, data_type, is_nullable, column_default, ordinal_position
  FROM information_schema.columns WHERE table_schema = 'public'
),
pols AS (
  SELECT schemaname, tablename, policyname, permissive, roles::text[] AS roles, cmd,
         qual, with_check
  FROM pg_policies WHERE schemaname IN ('public','storage')
),
funcs AS (
  SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args,
         pg_get_function_result(p.oid) AS returns, p.prosecdef AS security_definer,
         p.proconfig AS config
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
),
trigs AS (
  SELECT c.relname AS table_name, n.nspname AS schema, t.tgname AS name,
         pg_get_triggerdef(t.oid) AS definition, t.tgenabled AS enabled
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth')
),

-- ── Temuan otomatis ──────────────────────────────────────────
f_missing_tables AS (
  SELECT coalesce(jsonb_agg(e.name ORDER BY e.name), '[]') AS v
  FROM expected_tables e WHERE NOT EXISTS (SELECT 1 FROM rels r WHERE r.name = e.name)
),
f_missing_columns AS (
  SELECT coalesce(jsonb_agg(e.tbl || '.' || e.col ORDER BY e.tbl, e.col), '[]') AS v
  FROM expected_columns e
  WHERE NOT EXISTS (SELECT 1 FROM cols c WHERE c.table_name = e.tbl AND c.column_name = e.col)
),
f_missing_functions AS (
  SELECT coalesce(jsonb_agg(e.name ORDER BY e.name), '[]') AS v
  FROM expected_functions e WHERE NOT EXISTS (SELECT 1 FROM funcs f WHERE f.name = e.name)
),
f_missing_buckets AS (
  SELECT coalesce(jsonb_agg(e.id), '[]') AS v
  FROM expected_buckets e WHERE NOT EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = e.id)
),
f_unused_tables AS (
  SELECT coalesce(jsonb_agg(r.name ORDER BY r.name), '[]') AS v
  FROM rels r WHERE r.relkind IN ('r','p')
    AND NOT EXISTS (SELECT 1 FROM expected_tables e WHERE e.name = r.name)
),
f_rls_off AS (
  SELECT coalesce(jsonb_agg(r.name ORDER BY r.name), '[]') AS v
  FROM rels r WHERE r.relkind IN ('r','p') AND NOT r.rls
),
f_rls_on_no_policy AS (
  SELECT coalesce(jsonb_agg(r.name ORDER BY r.name), '[]') AS v
  FROM rels r WHERE r.relkind IN ('r','p') AND r.rls
    AND NOT EXISTS (SELECT 1 FROM pols p WHERE p.schemaname = 'public' AND p.tablename = r.name)
),
f_views_no_invoker AS (
  SELECT coalesce(jsonb_agg(r.name ORDER BY r.name), '[]') AS v
  FROM rels r WHERE r.relkind IN ('v','m')
    AND NOT coalesce(r.reloptions::text[] && ARRAY['security_invoker=on','security_invoker=true'], false)
    AND NOT EXISTS (SELECT 1 FROM intended_definer_views d WHERE d.name = r.name)
),
f_legacy_grants AS (
  SELECT coalesce(jsonb_agg(DISTINCT g.table_name || ':' || g.grantee || ':' || g.privilege_type), '[]') AS v
  FROM information_schema.role_table_grants g
  JOIN legacy_tables l ON l.name = g.table_name
  WHERE g.table_schema = 'public' AND g.grantee IN ('anon','authenticated')
),
-- Fungsi yang hanya boleh dipanggil server, bukan lewat RPC oleh pengguna.
f_internal_fn_exec AS (
  SELECT coalesce(jsonb_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'), '[]') AS v
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('award_points_safe')
    AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
      OR has_function_privilege('anon', p.oid, 'EXECUTE'))
),
f_secdef_no_search_path AS (
  SELECT coalesce(jsonb_agg(f.name || '(' || f.args || ')' ORDER BY f.name), '[]') AS v
  FROM funcs f WHERE f.security_definer
    AND NOT coalesce(EXISTS (SELECT 1 FROM unnest(f.config) c WHERE c LIKE 'search_path=%'), false)
),
-- Policy INSERT/ALL di enrollments yang bisa dipakai mahasiswa tanpa membatasi kolom status.
f_enroll_insert AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'policy', p.policyname, 'cmd', p.cmd, 'with_check', p.with_check, 'qual', p.qual)), '[]') AS v
  FROM pols p
  WHERE p.schemaname = 'public' AND p.tablename = 'enrollments' AND p.cmd IN ('INSERT','ALL')
    AND coalesce(p.with_check, p.qual, '') NOT ILIKE '%role%'
    AND coalesce(p.with_check, '') NOT ILIKE '%status%'
),
-- Policy UPDATE/ALL di enrollments yang tidak terbatas pada admin/dosen
-- (bisa berarti mahasiswa dapat mengubah certificate_status sendiri).
f_enroll_update AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'policy', p.policyname, 'cmd', p.cmd, 'qual', p.qual, 'with_check', p.with_check)), '[]') AS v
  FROM pols p
  WHERE p.schemaname = 'public' AND p.tablename = 'enrollments' AND p.cmd IN ('UPDATE','ALL')
    AND coalesce(p.qual, '') NOT ILIKE '%role%'
),
f_public_buckets AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'file_size_limit', b.file_size_limit,
           'allowed_mime_types', b.allowed_mime_types)), '[]') AS v
  FROM storage.buckets b WHERE b.public
),
f_roles AS (
  SELECT coalesce(jsonb_object_agg(coalesce(role::text, '(null)'), n), '{}') AS v
  FROM (SELECT role, count(*) n FROM public.profiles GROUP BY role) s
),
f_enroll_status AS (
  SELECT coalesce(jsonb_object_agg(k, n), '{}') AS v
  FROM (SELECT coalesce(status::text, '(null)') || ' / sertifikat:' || coalesce(certificate_status::text, '(null)') AS k,
               count(*) n
        FROM public.enrollments GROUP BY 1) s
)

SELECT
  jsonb_build_object(
    'diaudit_pada',                 now(),
    'versi_postgres',               current_setting('server_version'),
    'tabel_hilang',                 (SELECT v FROM f_missing_tables),
    'kolom_hilang',                 (SELECT v FROM f_missing_columns),
    'fungsi_hilang',                (SELECT v FROM f_missing_functions),
    'bucket_hilang',                (SELECT v FROM f_missing_buckets),
    'tabel_tidak_dipakai_kode',     (SELECT v FROM f_unused_tables),
    'tabel_rls_mati',               (SELECT v FROM f_rls_off),
    'tabel_rls_tanpa_policy',       (SELECT v FROM f_rls_on_no_policy),
    'view_tanpa_security_invoker',  (SELECT v FROM f_views_no_invoker),
    'security_definer_tanpa_search_path', (SELECT v FROM f_secdef_no_search_path),
    'enrollments_insert_status_bebas',    (SELECT v FROM f_enroll_insert),
    'enrollments_update_non_admin',       (SELECT v FROM f_enroll_update),
    'tabel_lama_masih_bisa_diakses_api', (SELECT v FROM f_legacy_grants),
    'fungsi_internal_bisa_dipanggil_rpc', (SELECT v FROM f_internal_fn_exec),
    'bucket_publik',                (SELECT v FROM f_public_buckets),
    'jumlah_profil_per_peran',      (SELECT v FROM f_roles),
    'jumlah_enrollment_per_status', (SELECT v FROM f_enroll_status)
  ) AS temuan,
  jsonb_build_object(
    'tabel', (SELECT jsonb_agg(jsonb_build_object(
                'nama', name,
                'jenis', CASE relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'table' WHEN 'v' THEN 'view' ELSE 'matview' END,
                'rls', rls, 'rls_force', rls_force, 'perkiraan_baris', est_rows, 'opsi', reloptions)
              ORDER BY name) FROM rels),
    'kolom', (SELECT jsonb_object_agg(table_name, k) FROM (
                SELECT table_name, jsonb_agg(jsonb_build_object(
                  'kolom', column_name, 'tipe', data_type, 'null', is_nullable, 'default', column_default)
                  ORDER BY ordinal_position) k
                FROM cols GROUP BY table_name) s),
    'policy', (SELECT jsonb_agg(jsonb_build_object(
                'skema', schemaname, 'tabel', tablename, 'nama', policyname, 'permissive', permissive,
                'roles', roles, 'cmd', cmd, 'using', qual, 'with_check', with_check)
              ORDER BY schemaname, tablename, policyname) FROM pols),
    'fungsi', (SELECT jsonb_agg(jsonb_build_object(
                'nama', name, 'argumen', args, 'hasil', returns,
                'security_definer', security_definer, 'config', config)
              ORDER BY name) FROM funcs),
    'trigger', (SELECT jsonb_agg(jsonb_build_object(
                'skema', schema, 'tabel', table_name, 'nama', name, 'aktif', enabled, 'definisi', definition)
              ORDER BY schema, table_name, name) FROM trigs),
    'bucket', (SELECT jsonb_agg(jsonb_build_object('id', id, 'publik', public,
                'batas_ukuran', file_size_limit, 'mime', allowed_mime_types)) FROM storage.buckets)
  ) AS detail;
