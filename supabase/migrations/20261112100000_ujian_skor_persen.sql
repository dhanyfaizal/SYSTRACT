-- ============================================================
-- SYSTRACT · Skor ujian selalu persen (0–100)
-- ------------------------------------------------------------
-- Sebelumnya: ujian bank soal → persen, ujian soal manual (mis. hasil AI) → jumlah poin
-- mentah (25 soal benar semua = 25), sehingga tidak pernah mencapai KKM 70 dan nilai akhir
-- / analitik dosen (yang menganggap skala 100) ikut salah.
-- Sekarang: skor = poin benar / total poin soal pilihan ganda × 100, dibulatkan.
-- Untuk bank soal (tiap soal 1 poin) hasilnya sama persis dengan sebelumnya.
--
-- Juga menghitung ulang skor percobaan ujian manual yang sudah dikumpulkan.
-- Bonus poin "skor ≥ 90" tidak diberikan surut.
-- Satu transaksi; aman dijalankan ulang (skor dihitung ulang dari jawaban, bukan dari skor lama).
-- ============================================================

BEGIN;

-- Hitung skor dari kunci & jawaban. Kunci: { "<id soal>": { answer, points, type } }.
CREATE OR REPLACE FUNCTION public.hitung_skor_ujian(p_keys jsonb, p_answers jsonb,
                                                    OUT skor numeric, OUT benar integer, OUT total integer)
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN coalesce(sum(s.poin), 0) > 0
              THEN round(coalesce(sum(s.poin) FILTER (WHERE s.ok), 0) / sum(s.poin) * 100)
              ELSE 0 END,
         (count(*) FILTER (WHERE s.ok))::integer,
         count(*)::integer
    FROM (SELECT coalesce((kv.value->>'points')::numeric, 1) AS poin,
                 coalesce(p_answers->>kv.key = kv.value->>'answer', false) AS ok
            FROM jsonb_each(coalesce(p_keys, '{}'::jsonb)) kv
           WHERE kv.value->>'type' = 'multiple_choice') s;
$$;
REVOKE ALL ON FUNCTION public.hitung_skor_ujian(jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- Kunci cadangan dari exams.questions (untuk percobaan lama yang tidak punya baris kunci).
CREATE OR REPLACE FUNCTION public.kunci_dari_soal_ujian(p_questions jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(jsonb_object_agg(q->>'id', jsonb_build_object(
           'answer', q->'answer', 'points', coalesce(q->'points', '1'::jsonb), 'type', q->>'type'))
           FILTER (WHERE q ? 'id'), '{}'::jsonb)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_questions) = 'array' THEN p_questions ELSE '[]'::jsonb END) q;
$$;
REVOKE ALL ON FUNCTION public.kunci_dari_soal_ujian(jsonb) FROM PUBLIC, anon, authenticated;

-- kumpulkan_ujian: sama seperti Fase 1, tetapi skor selalu persen.
CREATE OR REPLACE FUNCTION public.kumpulkan_ujian(p_attempt_id uuid, p_answers jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row     exam_answers%ROWTYPE;
  v_exam    exams%ROWTYPE;
  v_keys    jsonb;
  v_answers jsonb;
  v_hasil   record;
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
    v_keys := public.kunci_dari_soal_ujian(v_exam.questions);
  END IF;

  v_answers := CASE WHEN jsonb_typeof(p_answers) = 'object' THEN p_answers ELSE '{}'::jsonb END;
  SELECT * INTO v_hasil FROM public.hitung_skor_ujian(v_keys, v_answers);

  IF v_exam.duration_minutes IS NOT NULL THEN
    v_telat := extract(epoch FROM now() - (v_row.started_at + make_interval(mins => v_exam.duration_minutes + 2)))::integer;
    IF v_telat > 0 THEN
      v_answers := v_answers || jsonb_build_object('_terlambat_detik', v_telat);
    END IF;
  END IF;

  UPDATE exam_answers
     SET answers = v_answers, score = v_hasil.skor, submitted_at = now(),
         mc_correct = v_hasil.benar, mc_total = v_hasil.total
   WHERE id = p_attempt_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.kumpulkan_ujian(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kumpulkan_ujian(uuid, jsonb) TO authenticated;

-- Hitung ulang percobaan ujian soal manual yang sudah dikumpulkan.
-- Dilewati bila kunci tidak bisa ditemukan (total soal 0), agar skor lama tidak tertimpa 0.
UPDATE public.exam_answers a
   SET score = s.skor, mc_correct = s.benar, mc_total = s.total
  FROM (SELECT x.id, h.skor, h.benar, h.total
          FROM public.exam_answers x
          JOIN public.exams e ON e.id = x.exam_id
          CROSS JOIN LATERAL public.hitung_skor_ujian(
            coalesce((SELECT k.keys FROM public.exam_attempt_keys k WHERE k.attempt_id = x.id),
                     public.kunci_dari_soal_ujian(e.questions)),
            x.answers) h
         WHERE x.submitted_at IS NOT NULL
           AND NOT coalesce(e.use_question_bank, false)) s
 WHERE a.id = s.id
   AND s.total > 0;

COMMIT;
