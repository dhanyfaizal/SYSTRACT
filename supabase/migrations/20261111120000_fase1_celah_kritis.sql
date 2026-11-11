-- ============================================================
-- SYSTRACT · Fase 1: menutup celah kritis RLS
-- ------------------------------------------------------------
-- Dasar: supabase/scripts/hasil_audit_2026-11-11.md (K1–K6, ditambah T5–T7
-- karena satu paket dengan poin).
--
-- Jalankan SETELAH kode klien versi branch ini ter-deploy (atau bersamaan),
-- karena mahasiswa tidak lagi boleh menulis exam_answers / points_log langsung.
--
-- Seluruh isi berjalan dalam satu transaksi: bila ada error, tidak ada yang berubah.
-- Aman dijalankan ulang (idempotent).
-- ============================================================

BEGIN;

-- ── 0. Helper ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;


-- ══ K1 · Peran (profiles.role) hanya bisa diubah admin ══════
CREATE OR REPLACE FUNCTION public.lindungi_peran_profil()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- auth.uid() kosong = service role / SQL Editor / trigger pendaftaran (handle_new_user).
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.role := 'mahasiswa';
  ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Peran pengguna hanya bisa diubah oleh admin' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lindungi_peran_profil ON public.profiles;
CREATE TRIGGER trg_lindungi_peran_profil
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.lindungi_peran_profil();

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);


-- ══ K6 · Tutup tabel sisa sistem lama dari API ══════════════
-- Tidak dipakai kode SYSTRACT. Data TIDAK dihapus; hanya akses API dicabut.
-- (Penghapusan tabel menyusul setelah jumlah barisnya dicek.)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','institutions','classes','modules','sections','content_items',
                           'final_exams','exam_attempts','formative_logs','learning_paths',
                           'portfolio_submissions','user_progress']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;


-- ══ K5 · Pendaftaran mandiri selalu 'pending' ═══════════════
DROP POLICY IF EXISTS "Students self enroll" ON public.enrollments;
CREATE POLICY "Students self enroll" ON public.enrollments
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND status = 'pending'
    AND coalesce(certificate_status, 'unvalidated') = 'unvalidated'
    AND certificate_notes IS NULL
    AND certificate_validated_at IS NULL
    AND certificate_validated_by IS NULL
    AND EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.is_active)
  );


-- ══ K4, T5, T6, T7 · Poin, inventaris, lencana ══════════════
-- Klien tidak lagi boleh menulis points_log / user_inventory / user_badges langsung.
DROP POLICY IF EXISTS "System inserts points"     ON public.points_log;
DROP POLICY IF EXISTS "points_log_service_insert" ON public.points_log;
DROP POLICY IF EXISTS "inventory_own_insert"      ON public.user_inventory;
DROP POLICY IF EXISTS "System awards badges"      ON public.user_badges;

-- Fungsi SECURITY DEFINER wajib punya search_path tetap.
ALTER FUNCTION public.award_points_safe(uuid, uuid, integer, text, text, uuid) SET search_path = public;
ALTER FUNCTION public.purchase_item(uuid) SET search_path = public;
-- award_points_safe hanya dipanggil trigger/fungsi server, bukan lewat RPC.
REVOKE EXECUTE ON FUNCTION public.award_points_safe(uuid, uuid, integer, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- Poin materi: +3 per lampiran materi, sekali saja, hanya peserta yang disetujui.
CREATE OR REPLACE FUNCTION public.klaim_poin_materi(p_material_id uuid, p_sub_idx integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_course uuid;
  v_jumlah integer;
  v_reason text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Silakan masuk terlebih dahulu' USING ERRCODE = '42501';
  END IF;

  SELECT course_id,
         greatest(CASE WHEN jsonb_typeof(attachments) = 'array' THEN jsonb_array_length(attachments) ELSE 0 END, 1)
    INTO v_course, v_jumlah
    FROM materials WHERE id = p_material_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Materi tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;
  IF p_sub_idx IS NULL OR p_sub_idx < 0 OR p_sub_idx >= v_jumlah THEN
    RAISE EXCEPTION 'Bagian materi tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM enrollments
                  WHERE course_id = v_course AND student_id = v_uid AND status = 'approved') THEN
    RAISE EXCEPTION 'Anda belum terdaftar di kursus ini' USING ERRCODE = '42501';
  END IF;

  INSERT INTO course_progress (student_id, course_id, material_id)
  VALUES (v_uid, v_course, p_material_id)
  ON CONFLICT (student_id, material_id) DO NOTHING;

  -- Format reason dipakai klien untuk menandai bagian yang sudah selesai.
  v_reason := format('Selesai lampiran %s materi %s', p_sub_idx + 1, p_material_id);
  IF EXISTS (SELECT 1 FROM points_log WHERE user_id = v_uid AND source = 'materi' AND reason = v_reason) THEN
    RETURN false;
  END IF;

  INSERT INTO points_log (user_id, course_id, semester_id, points, source, reason, reference_id)
  VALUES (v_uid, v_course, (SELECT id FROM semesters WHERE is_active LIMIT 1), 3, 'materi', v_reason, p_material_id);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.klaim_poin_materi(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.klaim_poin_materi(uuid, integer) TO authenticated;

-- Poin forum: +3 per balasan mahasiswa, maksimal 10 kali per 24 jam. Diberikan oleh trigger.
CREATE OR REPLACE FUNCTION public.poin_balas_forum()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_course uuid;
BEGIN
  SELECT course_id INTO v_course FROM forums WHERE id = NEW.forum_id;
  IF v_course IS NULL OR NEW.author_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = NEW.author_id AND role = 'mahasiswa') THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM enrollments
                  WHERE course_id = v_course AND student_id = NEW.author_id AND status = 'approved') THEN
    RETURN NEW;
  END IF;
  IF (SELECT count(*) FROM points_log
       WHERE user_id = NEW.author_id AND source = 'forum' AND created_at > now() - interval '1 day') >= 10 THEN
    RETURN NEW;
  END IF;
  PERFORM award_points_safe(NEW.author_id, v_course, 3, 'forum', 'Balas forum: ' || NEW.forum_id::text, NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.poin_balas_forum() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_poin_balas_forum ON public.forum_replies;
CREATE TRIGGER trg_poin_balas_forum
  AFTER INSERT ON public.forum_replies
  FOR EACH ROW EXECUTE FUNCTION public.poin_balas_forum();


-- ══ K2, K3 · Kunci jawaban & penilaian ujian di server ══════

-- Kunci jawaban per percobaan, terpisah dari snapshot yang dibaca mahasiswa.
CREATE TABLE IF NOT EXISTS public.exam_attempt_keys (
  attempt_id uuid PRIMARY KEY REFERENCES public.exam_answers(id) ON DELETE CASCADE,
  keys       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { "<id soal>": { answer, points, type, explanation } }
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.exam_attempt_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.exam_attempt_keys FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.exam_attempt_keys FROM authenticated;

DROP POLICY IF EXISTS "Dosen pengampu lihat kunci jawaban" ON public.exam_attempt_keys;
CREATE POLICY "Dosen pengampu lihat kunci jawaban" ON public.exam_attempt_keys
  FOR SELECT USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM exam_answers a
        JOIN exams e   ON e.id = a.exam_id
        JOIN courses c ON c.id = e.course_id
       WHERE a.id = exam_attempt_keys.attempt_id AND c.dosen_id = auth.uid())
  );

ALTER TABLE public.exam_answers ADD COLUMN IF NOT EXISTS mc_correct integer;
ALTER TABLE public.exam_answers ADD COLUMN IF NOT EXISTS mc_total   integer;

-- Pindahkan kunci dari snapshot lama, lalu hapus kunci dari snapshot.
INSERT INTO public.exam_attempt_keys (attempt_id, keys)
SELECT a.id,
       coalesce((SELECT jsonb_object_agg(q->>'id', jsonb_build_object(
                          'answer', q->'answer', 'points', coalesce(q->'points', '1'::jsonb),
                          'type', q->>'type', 'explanation', q->'explanation'))
                   FROM jsonb_array_elements(a.questions_snapshot) q
                  WHERE q ? 'id'), '{}'::jsonb)
  FROM public.exam_answers a
 WHERE jsonb_typeof(a.questions_snapshot) = 'array' AND jsonb_array_length(a.questions_snapshot) > 0
ON CONFLICT (attempt_id) DO NOTHING;

UPDATE public.exam_answers a
   SET questions_snapshot = (SELECT jsonb_agg(q - 'answer' - 'explanation' ORDER BY i)
                               FROM jsonb_array_elements(a.questions_snapshot) WITH ORDINALITY t(q, i))
 WHERE jsonb_typeof(a.questions_snapshot) = 'array' AND jsonb_array_length(a.questions_snapshot) > 0
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(a.questions_snapshot) q WHERE q ? 'answer' OR q ? 'explanation');

-- Isi jumlah benar untuk percobaan lama yang sudah dikumpulkan.
UPDATE public.exam_answers a
   SET mc_total = s.total, mc_correct = s.benar
  FROM (SELECT k.attempt_id,
               count(*)::int AS total,
               count(*) FILTER (WHERE x.answers->>kv.key = kv.value->>'answer')::int AS benar
          FROM public.exam_attempt_keys k
          JOIN public.exam_answers x ON x.id = k.attempt_id
          CROSS JOIN LATERAL jsonb_each(k.keys) kv
         WHERE kv.value->>'type' = 'multiple_choice'
         GROUP BY k.attempt_id) s
 WHERE a.id = s.attempt_id AND a.submitted_at IS NOT NULL AND a.mc_total IS NULL;

-- Mahasiswa tidak lagi menulis exam_answers langsung; lewat RPC di bawah.
DROP POLICY IF EXISTS "Students submit answers"    ON public.exam_answers;
DROP POLICY IF EXISTS "Students update own answers" ON public.exam_answers;

-- Mahasiswa tidak lagi membaca bank soal (berisi correct_answer).
DROP POLICY IF EXISTS "Enrolled students see questions" ON public.questions;

-- Mahasiswa tidak lagi membaca tabel exams (kolom questions berisi kunci).
-- Dosen pengampu & admin tetap lewat "Dosen manage exams".
DROP POLICY IF EXISTS "Enrolled users see exams"            ON public.exams;
DROP POLICY IF EXISTS "Published exams visible to enrolled" ON public.exams;

-- Daftar ujian untuk peserta, tanpa kolom questions.
-- Sengaja tanpa security_invoker: view membaca exams sebagai pemilik,
-- dan penyaringan baris dilakukan di WHERE berdasarkan auth.uid().
CREATE OR REPLACE VIEW public.exams_peserta WITH (security_barrier = true) AS
SELECT e.id, e.course_id, e.title, e.type, e.duration_minutes, e.start_at, e.end_at,
       e.is_published, e.use_question_bank, e.question_config, e.exam_mode,
       e.max_attempts, e.passing_grade, e.created_at,
       CASE WHEN NOT coalesce(e.use_question_bank, false) AND jsonb_typeof(e.questions) = 'array'
            THEN jsonb_array_length(e.questions) END AS jumlah_soal
  FROM public.exams e
 WHERE (e.is_published AND EXISTS (SELECT 1 FROM public.enrollments en
                                    WHERE en.course_id = e.course_id
                                      AND en.student_id = auth.uid()
                                      AND en.status = 'approved'))
    OR EXISTS (SELECT 1 FROM public.courses c WHERE c.id = e.course_id AND c.dosen_id = auth.uid())
    OR public.is_admin();
REVOKE ALL ON public.exams_peserta FROM anon;
GRANT SELECT ON public.exams_peserta TO authenticated;

-- Mulai (atau lanjutkan) percobaan ujian. Soal disusun di server.
CREATE OR REPLACE FUNCTION public.mulai_ujian(p_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_exam   exams%ROWTYPE;
  v_row    exam_answers%ROWTYPE;
  v_mode   text;
  v_done   integer;
  v_last   numeric;
  v_qs     jsonb := '[]'::jsonb;
  v_keys   jsonb := '{}'::jsonb;
  v_cfg    jsonb;
  v_tc     jsonb;
  v_topic  text;
  v_d      text;
  v_need   integer;
  v_opts   jsonb;
  v_pos    integer;
  q        record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Silakan masuk terlebih dahulu' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_exam FROM exams WHERE id = p_exam_id;
  IF NOT FOUND OR NOT coalesce(v_exam.is_published, false) THEN
    RAISE EXCEPTION 'Ujian tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM enrollments
                  WHERE course_id = v_exam.course_id AND student_id = v_uid AND status = 'approved') THEN
    RAISE EXCEPTION 'Anda belum terdaftar di kursus ini' USING ERRCODE = '42501';
  END IF;
  IF v_exam.start_at IS NOT NULL AND now() < v_exam.start_at THEN
    RAISE EXCEPTION 'Ujian belum dibuka' USING ERRCODE = '22023';
  END IF;
  IF v_exam.end_at IS NOT NULL AND now() > v_exam.end_at THEN
    RAISE EXCEPTION 'Ujian sudah ditutup' USING ERRCODE = '22023';
  END IF;

  -- Percobaan yang belum dikumpulkan dilanjutkan, bukan dibuat baru.
  SELECT * INTO v_row FROM exam_answers
   WHERE exam_id = p_exam_id AND student_id = v_uid AND submitted_at IS NULL
   ORDER BY attempt_number DESC LIMIT 1;
  IF FOUND THEN
    RETURN to_jsonb(v_row);
  END IF;

  v_mode := coalesce(v_exam.exam_mode, 'ujian');
  SELECT count(*) INTO v_done FROM exam_answers
   WHERE exam_id = p_exam_id AND student_id = v_uid AND submitted_at IS NOT NULL;
  IF v_mode = 'tryout' AND v_done >= coalesce(v_exam.max_attempts, 1) THEN
    RAISE EXCEPTION 'Batas percobaan (%×) sudah tercapai', coalesce(v_exam.max_attempts, 1) USING ERRCODE = '22023';
  END IF;
  IF v_mode = 'ujian' AND v_done > 0 THEN
    SELECT score INTO v_last FROM exam_answers
     WHERE exam_id = p_exam_id AND student_id = v_uid AND submitted_at IS NOT NULL
     ORDER BY attempt_number DESC LIMIT 1;
    IF v_last IS NULL OR v_last >= coalesce(v_exam.passing_grade, 70) THEN
      RAISE EXCEPTION 'Ujian ini sudah Anda selesaikan' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF coalesce(v_exam.use_question_bank, false) THEN
    v_cfg := v_exam.question_config;
    IF v_cfg IS NULL OR jsonb_typeof(v_cfg) <> 'array' THEN
      v_cfg := jsonb_build_array(coalesce(v_cfg, '{}'::jsonb));
    END IF;

    FOR v_tc IN SELECT value FROM jsonb_array_elements(v_cfg) LOOP
      v_topic := nullif(v_tc->>'topic', '');
      FOREACH v_d IN ARRAY ARRAY['mudah', 'sedang', 'sulit'] LOOP
        v_need := coalesce((v_tc->>v_d)::integer, 0);
        CONTINUE WHEN v_need <= 0;
        FOR q IN
          SELECT qq.id, qq.question_text, qq.options, qq.correct_answer, qq.difficulty, qq.explanation
            FROM questions qq
           WHERE qq.course_id = v_exam.course_id AND qq.difficulty = v_d
             AND (v_topic IS NULL OR qq.category = v_topic)
           ORDER BY random() LIMIT v_need
        LOOP
          -- Acak urutan pilihan, catat posisi baru jawaban benar.
          WITH o AS (
            SELECT e, (i - 1)::integer AS asal, row_number() OVER (ORDER BY random()) - 1 AS pos
              FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, i)
          )
          SELECT jsonb_agg(e ORDER BY pos), max(pos) FILTER (WHERE asal = q.correct_answer)
            INTO v_opts, v_pos FROM o;

          v_qs := v_qs || jsonb_build_array(jsonb_build_object(
                    'id', q.id, 'type', 'multiple_choice', 'text', q.question_text,
                    'options', coalesce(v_opts, '[]'::jsonb), 'difficulty', q.difficulty, 'topic', v_topic));
          v_keys := v_keys || jsonb_build_object(q.id::text, jsonb_build_object(
                    'answer', CASE WHEN v_pos IS NULL THEN NULL ELSE chr(65 + v_pos::integer) END,
                    'points', 1, 'type', 'multiple_choice', 'explanation', q.explanation));
        END LOOP;
      END LOOP;
    END LOOP;

    SELECT coalesce(jsonb_agg(e ORDER BY random()), '[]'::jsonb) INTO v_qs FROM jsonb_array_elements(v_qs) e;
  ELSE
    SELECT coalesce(jsonb_agg(e - 'answer' - 'explanation' ORDER BY i), '[]'::jsonb),
           coalesce(jsonb_object_agg(e->>'id', jsonb_build_object(
                      'answer', e->'answer', 'points', coalesce(e->'points', '1'::jsonb),
                      'type', e->>'type', 'explanation', e->'explanation')) FILTER (WHERE e ? 'id'), '{}'::jsonb)
      INTO v_qs, v_keys
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_exam.questions) = 'array'
                                     THEN v_exam.questions ELSE '[]'::jsonb END) WITH ORDINALITY t(e, i);
  END IF;

  IF jsonb_array_length(v_qs) = 0 THEN
    RAISE EXCEPTION 'Belum ada soal untuk ujian ini' USING ERRCODE = '22023';
  END IF;

  INSERT INTO exam_answers (exam_id, student_id, answers, started_at, questions_snapshot, attempt_number)
  VALUES (p_exam_id, v_uid, '{}'::jsonb, now(), v_qs,
          (SELECT coalesce(max(attempt_number), 0) + 1 FROM exam_answers
            WHERE exam_id = p_exam_id AND student_id = v_uid))
  RETURNING * INTO v_row;

  INSERT INTO exam_attempt_keys (attempt_id, keys) VALUES (v_row.id, v_keys);
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.mulai_ujian(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mulai_ujian(uuid) TO authenticated;

-- Kumpulkan jawaban; skor dihitung di server dari kunci jawaban.
CREATE OR REPLACE FUNCTION public.kumpulkan_ujian(p_attempt_id uuid, p_answers jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row     exam_answers%ROWTYPE;
  v_exam    exams%ROWTYPE;
  v_keys    jsonb;
  v_answers jsonb;
  k         record;
  v_poin    numeric := 0;
  v_benar   integer := 0;
  v_total   integer := 0;
  v_skor    numeric;
  v_telat   integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Silakan masuk terlebih dahulu' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM exam_answers
   WHERE id = p_attempt_id AND student_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Percobaan ujian tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Ujian ini sudah dikumpulkan' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_exam FROM exams WHERE id = v_row.exam_id;
  SELECT keys INTO v_keys FROM exam_attempt_keys WHERE attempt_id = p_attempt_id;
  IF v_keys IS NULL THEN
    -- Percobaan lama (sebelum migrasi ini) tanpa snapshot: pakai kunci dari exams.questions.
    SELECT coalesce(jsonb_object_agg(e->>'id', jsonb_build_object(
                      'answer', e->'answer', 'points', coalesce(e->'points', '1'::jsonb), 'type', e->>'type'))
                    FILTER (WHERE e ? 'id'), '{}'::jsonb)
      INTO v_keys
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_exam.questions) = 'array'
                                     THEN v_exam.questions ELSE '[]'::jsonb END) e;
  END IF;

  v_answers := CASE WHEN jsonb_typeof(p_answers) = 'object' THEN p_answers ELSE '{}'::jsonb END;

  FOR k IN SELECT key, value FROM jsonb_each(v_keys) LOOP
    CONTINUE WHEN k.value->>'type' IS DISTINCT FROM 'multiple_choice';
    v_total := v_total + 1;
    IF v_answers->>k.key IS NOT NULL AND v_answers->>k.key = k.value->>'answer' THEN
      v_benar := v_benar + 1;
      v_poin  := v_poin + coalesce((k.value->>'points')::numeric, 1);
    END IF;
  END LOOP;

  -- Sama dengan perhitungan lama: bank soal → persen; soal manual → jumlah poin.
  v_skor := CASE WHEN coalesce(v_exam.use_question_bank, false) AND v_total > 0
                 THEN round(v_poin / v_total * 100) ELSE v_poin END;

  -- Catat keterlambatan (lewat durasi + 2 menit toleransi) untuk ditinjau dosen.
  IF v_exam.duration_minutes IS NOT NULL THEN
    v_telat := extract(epoch FROM now() - (v_row.started_at + make_interval(mins => v_exam.duration_minutes + 2)))::integer;
    IF v_telat > 0 THEN
      v_answers := v_answers || jsonb_build_object('_terlambat_detik', v_telat);
    END IF;
  END IF;

  UPDATE exam_answers
     SET answers = v_answers, score = v_skor, submitted_at = now(),
         mc_correct = v_benar, mc_total = v_total
   WHERE id = p_attempt_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.kumpulkan_ujian(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kumpulkan_ujian(uuid, jsonb) TO authenticated;

COMMIT;
