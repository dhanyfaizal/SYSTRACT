-- ════════════════════════════════════════════════════════════════════════
-- Progres belajar materi SPA dicatat dan diperiksa di SERVER.
--
-- Sebelumnya syarat menyelesaikan materi (bagian dibaca, soal video, latihan) hanya
-- tercatat di browser peserta, sehingga bisa diakali dan hilang saat ganti perangkat.
-- Sekarang:
--   • jawaban soal video & latihan dinilai server dari kunci di materials.webslide_content
--     (tabel jawaban_materi, setiap percobaan tercatat — bahan laporan dosen);
--   • detik baca per bagian dilaporkan berkala; server membatasi kenaikannya sesuai waktu
--     yang benar-benar berlalu (tabel progres_materi);
--   • klaim_poin_materi ("Tandai Selesai") menolak materi SPA yang syaratnya belum terpenuhi;
--   • laporan_progres_materi untuk pengampu, progres_saya_materi untuk melanjutkan di perangkat lain.
-- Aman dijalankan ulang.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.progres_materi (
  student_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  material_id      uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  course_id        uuid NOT NULL,
  detik_baca       integer[] NOT NULL DEFAULT '{}',
  detik_total      integer NOT NULL DEFAULT 0,
  dilaporkan_pada  timestamptz,
  dibuat_pada      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, material_id)
);

CREATE TABLE IF NOT EXISTS public.jawaban_materi (
  id            bigserial PRIMARY KEY,
  student_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  material_id   uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  course_id     uuid NOT NULL,
  bagian        integer NOT NULL,
  jenis         text NOT NULL CHECK (jenis IN ('video', 'latihan')),
  soal          integer NOT NULL,
  pilihan       integer NOT NULL,
  benar         boolean NOT NULL,
  dijawab_pada  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jawaban_materi_materi_peserta ON public.jawaban_materi (material_id, student_id);

-- Baca: peserta melihat miliknya; pengampu & admin melihat kursusnya. Tulis hanya lewat RPC di bawah.
ALTER TABLE public.progres_materi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jawaban_materi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS progres_materi_baca ON public.progres_materi;
CREATE POLICY progres_materi_baca ON public.progres_materi FOR SELECT
  USING (student_id = auth.uid() OR public.is_admin() OR public.is_pengampu(course_id));
DROP POLICY IF EXISTS jawaban_materi_baca ON public.jawaban_materi;
CREATE POLICY jawaban_materi_baca ON public.jawaban_materi FOR SELECT
  USING (student_id = auth.uid() OR public.is_admin() OR public.is_pengampu(course_id));
REVOKE INSERT, UPDATE, DELETE ON public.progres_materi, public.jawaban_materi FROM anon, authenticated;
GRANT SELECT ON public.progres_materi, public.jawaban_materi TO authenticated;


-- ── Kunci jawaban (sama dengan logika pemutar: src/lib/videoInteraktif.js rapikanSoal & spaBlocks quiz) ──
-- Soal video: yang lengkap saja, diurutkan menurut detik (lalu urutan asal), maksimal 12.
CREATE OR REPLACE FUNCTION public.soal_video_valid(p_slide jsonb)
RETURNS TABLE (urutan integer, jawaban integer) LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (row_number() OVER (ORDER BY d.detik, d.ord) - 1)::integer, d.jawaban
  FROM (
    SELECT greatest(1, round(CASE WHEN (e->>'detik') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (e->>'detik')::numeric ELSE 0 END)) AS detik,
           t.ord,
           (e->>'jawaban')::integer AS jawaban
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_slide->'soal_video') = 'array' THEN p_slide->'soal_video' ELSE '[]'::jsonb END)
         WITH ORDINALITY AS t(e, ord)
    WHERE coalesce(btrim(e->>'pertanyaan'), '') <> ''
      AND (e->>'jawaban') ~ '^[0-9]+$'
      AND jsonb_typeof(e->'opsi') = 'array'
      AND (SELECT count(*) FROM jsonb_array_elements_text(e->'opsi') o WHERE btrim(o) <> '') >= 2
      AND coalesce(btrim(e->'opsi'->>((e->>'jawaban')::integer)), '') <> ''
  ) d
  ORDER BY d.detik, d.ord
  LIMIT 12
$$;

-- Kunci satu soal; NULL bila bagian/soal tidak ada.
CREATE OR REPLACE FUNCTION public.kunci_soal_materi(p_webslide jsonb, p_bagian integer, p_jenis text, p_soal integer)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_slide jsonb := p_webslide->'slides'->p_bagian;
  v_item  jsonb;
  v_opsi  integer;
  v_ans   jsonb;
BEGIN
  IF v_slide IS NULL OR p_soal IS NULL OR p_soal < 0 THEN RETURN NULL; END IF;
  IF p_jenis = 'video' THEN
    IF v_slide->>'layout' <> 'media' THEN RETURN NULL; END IF;
    RETURN (SELECT jawaban FROM public.soal_video_valid(v_slide) WHERE urutan = p_soal);
  ELSIF p_jenis = 'latihan' THEN
    IF v_slide->>'layout' <> 'quiz' OR p_soal >= 12 THEN RETURN NULL; END IF;
    v_item := v_slide->'quiz_items'->p_soal;
    IF v_item IS NULL THEN RETURN NULL; END IF;
    v_opsi := CASE WHEN jsonb_typeof(v_item->'options') = 'array' THEN least(jsonb_array_length(v_item->'options'), 6) ELSE 0 END;
    v_ans := v_item->'answer';
    -- Sama dengan renderer: jawaban tidak valid dianggap pilihan pertama.
    IF jsonb_typeof(v_ans) = 'number' AND (v_ans #>> '{}') ~ '^[0-9]+$' AND (v_ans #>> '{}')::integer < v_opsi THEN
      RETURN (v_ans #>> '{}')::integer;
    END IF;
    RETURN 0;
  END IF;
  RETURN NULL;
END;
$$;

-- Jumlah soal wajib per jenis dalam satu materi.
CREATE OR REPLACE FUNCTION public.jumlah_soal_materi(p_webslide jsonb, p_jenis text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(sum(
    CASE
      WHEN p_jenis = 'video' AND s->>'layout' = 'media' THEN (SELECT count(*) FROM public.soal_video_valid(s))
      WHEN p_jenis = 'latihan' AND s->>'layout' = 'quiz' AND jsonb_typeof(s->'quiz_items') = 'array'
        THEN least(jsonb_array_length(s->'quiz_items'), 12)
      ELSE 0
    END), 0)::integer
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_webslide->'slides') = 'array' THEN p_webslide->'slides' ELSE '[]'::jsonb END) s
$$;

-- Total detik baca minimal (sama dengan src/lib/bacaBagian.js: ±200 kata/menit, 8–90 detik per bagian,
-- +10 untuk tabel/langkah/angka, 4 untuk sampul/penutup, 0 untuk video & latihan).
CREATE OR REPLACE FUNCTION public.target_baca_total(p_webslide jsonb)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(sum(t), 0)::integer FROM (
    SELECT CASE
      WHEN s->>'layout' IN ('media', 'quiz') THEN 0
      WHEN s->>'layout' IN ('cover', 'thank_you') THEN 4
      ELSE round(least(90, greatest(8,
             (SELECT count(*) FROM regexp_matches(
                regexp_replace(regexp_replace(coalesce((
                  SELECT string_agg(v #>> '{}', ' ')
                  FROM jsonb_path_query(
                    s - 'image_url' - 'layout' - 'media_hint' - 'soal_video' - 'slide_no',
                    'strict $.** ? (@.type() == "string" && !(@ like_regex "^fa-") && !(@ like_regex "^(red|amber|green|blue)$"))') v
                ), ''), '<[^>]+>', ' ', 'g'), '&[a-zA-Z#0-9]+;', ' ', 'g'),
                '[[:alnum:]]+', 'g')) / 200.0 * 60
             + CASE WHEN s->>'layout' IN ('table', 'steps', 'stats') THEN 10 ELSE 0 END)))
    END AS t
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_webslide->'slides') = 'array' THEN p_webslide->'slides' ELSE '[]'::jsonb END) s
  ) x
$$;


-- ── Ringkasan syarat satu peserta untuk satu materi ──
CREATE OR REPLACE FUNCTION public.syarat_materi(p_student uuid, p_material uuid)
RETURNS TABLE (baca_detik integer, baca_target integer, video_benar integer, video_total integer,
               latihan_benar integer, latihan_total integer, terpenuhi boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ws jsonb;
BEGIN
  SELECT webslide_content INTO v_ws FROM materials WHERE id = p_material;
  baca_target   := public.target_baca_total(v_ws);
  video_total   := public.jumlah_soal_materi(v_ws, 'video');
  latihan_total := public.jumlah_soal_materi(v_ws, 'latihan');
  SELECT coalesce(pm.detik_total, 0) INTO baca_detik FROM progres_materi pm
   WHERE pm.student_id = p_student AND pm.material_id = p_material;
  baca_detik := coalesce(baca_detik, 0);
  SELECT count(DISTINCT (j.bagian, j.soal)) FILTER (WHERE j.jenis = 'video'),
         count(DISTINCT (j.bagian, j.soal)) FILTER (WHERE j.jenis = 'latihan')
    INTO video_benar, latihan_benar
    FROM jawaban_materi j
   WHERE j.student_id = p_student AND j.material_id = p_material AND j.benar;
  video_benar   := least(coalesce(video_benar, 0), video_total);
  latihan_benar := least(coalesce(latihan_benar, 0), latihan_total);
  -- Waktu baca: toleransi 25% (penghitung di browser dan server sedikit berbeda, mis. ikon/teks kecil).
  terpenuhi := video_benar >= video_total AND latihan_benar >= latihan_total
               AND baca_detik >= floor(baca_target * 0.75);
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.syarat_materi(uuid, uuid) FROM PUBLIC, anon, authenticated;


-- ── RPC peserta: jawab satu soal (dinilai server) ──
CREATE OR REPLACE FUNCTION public.jawab_soal_materi(p_material_id uuid, p_bagian integer, p_jenis text, p_soal integer, p_pilihan integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_course uuid;
  v_ws     jsonb;
  v_kunci  integer;
  v_benar  boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Silakan masuk terlebih dahulu' USING ERRCODE = '42501'; END IF;
  SELECT course_id, webslide_content INTO v_course, v_ws FROM materials WHERE id = p_material_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Materi tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM enrollments WHERE course_id = v_course AND student_id = v_uid AND status = 'approved') THEN
    RAISE EXCEPTION 'Anda belum terdaftar di kursus ini' USING ERRCODE = '42501';
  END IF;
  v_kunci := public.kunci_soal_materi(v_ws, p_bagian, p_jenis, p_soal);
  IF v_kunci IS NULL OR p_pilihan IS NULL OR p_pilihan < 0 OR p_pilihan > 5 THEN
    RAISE EXCEPTION 'Soal tidak valid' USING ERRCODE = '22023';
  END IF;
  -- Sudah pernah benar: tidak perlu dicatat lagi.
  IF EXISTS (SELECT 1 FROM jawaban_materi WHERE student_id = v_uid AND material_id = p_material_id
               AND bagian = p_bagian AND jenis = p_jenis AND soal = p_soal AND benar) THEN
    RETURN p_pilihan = v_kunci;
  END IF;
  -- Rem untuk tebak-tebakan otomatis.
  IF (SELECT count(*) FROM jawaban_materi WHERE student_id = v_uid AND dijawab_pada > now() - interval '1 minute') >= 60 THEN
    RAISE EXCEPTION 'Terlalu banyak jawaban dalam waktu singkat. Coba lagi sebentar lagi.' USING ERRCODE = '54000';
  END IF;
  v_benar := p_pilihan = v_kunci;
  INSERT INTO jawaban_materi (student_id, material_id, course_id, bagian, jenis, soal, pilihan, benar)
  VALUES (v_uid, p_material_id, v_course, p_bagian, p_jenis, p_soal, p_pilihan, v_benar);
  RETURN v_benar;
END;
$$;
REVOKE ALL ON FUNCTION public.jawab_soal_materi(uuid, integer, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jawab_soal_materi(uuid, integer, text, integer, integer) TO authenticated;


-- ── RPC peserta: laporkan detik baca per bagian (dikirim berkala) ──
-- Kenaikan per bagian dibatasi waktu yang benar-benar berlalu sejak laporan terakhir (+5 detik),
-- dan kenaikan total maksimal 2× waktu itu (dua bagian pendek bisa terlihat bersamaan).
CREATE OR REPLACE FUNCTION public.catat_baca_materi(p_material_id uuid, p_detik integer[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_course uuid;
  v_n      integer;
  v_lama   integer[];
  v_baru   integer[];
  v_waktu  timestamptz;
  v_izin   integer;
  v_sisa   integer;
  v_tambah integer;
  i        integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Silakan masuk terlebih dahulu' USING ERRCODE = '42501'; END IF;
  SELECT course_id,
         CASE WHEN jsonb_typeof(webslide_content->'slides') = 'array' THEN jsonb_array_length(webslide_content->'slides') ELSE 0 END
    INTO v_course, v_n
    FROM materials WHERE id = p_material_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Materi tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM enrollments WHERE course_id = v_course AND student_id = v_uid AND status = 'approved') THEN
    RAISE EXCEPTION 'Anda belum terdaftar di kursus ini' USING ERRCODE = '42501';
  END IF;
  IF v_n = 0 OR v_n > 200 THEN RETURN 0; END IF;

  INSERT INTO progres_materi (student_id, material_id, course_id) VALUES (v_uid, p_material_id, v_course)
  ON CONFLICT (student_id, material_id) DO NOTHING;
  SELECT detik_baca, dilaporkan_pada INTO v_lama, v_waktu FROM progres_materi
   WHERE student_id = v_uid AND material_id = p_material_id FOR UPDATE;

  v_izin := CASE WHEN v_waktu IS NULL THEN 20 ELSE least(3600, greatest(0, extract(epoch FROM now() - v_waktu)::integer)) + 5 END;
  v_sisa := v_izin * 2;
  v_baru := array_fill(0, ARRAY[v_n]);
  FOR i IN 1..v_n LOOP
    v_baru[i] := greatest(coalesce(v_lama[i], 0), 0);
    v_tambah := least(greatest(coalesce(p_detik[i], 0) - v_baru[i], 0), v_izin, v_sisa, 600);
    v_baru[i] := v_baru[i] + v_tambah;
    v_sisa := v_sisa - v_tambah;
  END LOOP;

  UPDATE progres_materi
     SET detik_baca = v_baru,
         detik_total = (SELECT coalesce(sum(x), 0) FROM unnest(v_baru) x),
         dilaporkan_pada = now()
   WHERE student_id = v_uid AND material_id = p_material_id;
  RETURN (SELECT detik_total FROM progres_materi WHERE student_id = v_uid AND material_id = p_material_id);
END;
$$;
REVOKE ALL ON FUNCTION public.catat_baca_materi(uuid, integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catat_baca_materi(uuid, integer[]) TO authenticated;


-- ── RPC peserta: progres tersimpan (untuk melanjutkan di perangkat lain) ──
CREATE OR REPLACE FUNCTION public.progres_saya_materi(p_material_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'baca', coalesce((SELECT to_jsonb(detik_baca) FROM progres_materi WHERE student_id = auth.uid() AND material_id = p_material_id), '[]'::jsonb),
    'benar', coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('bagian', bagian, 'jenis', jenis, 'soal', soal))
                         FROM jawaban_materi WHERE student_id = auth.uid() AND material_id = p_material_id AND benar), '[]'::jsonb))
$$;
REVOKE ALL ON FUNCTION public.progres_saya_materi(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.progres_saya_materi(uuid) TO authenticated;


-- ── RPC pengampu: laporan progres per peserta untuk satu materi ──
CREATE OR REPLACE FUNCTION public.laporan_progres_materi(p_material_id uuid)
RETURNS TABLE (student_id uuid, nama text, nim text, baca_detik integer, baca_target integer,
               video_benar integer, video_total integer, latihan_benar integer, latihan_total integer,
               jawaban_salah integer, syarat_terpenuhi boolean, selesai boolean, terakhir timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_course uuid;
BEGIN
  SELECT course_id INTO v_course FROM materials WHERE id = p_material_id;
  IF v_course IS NULL THEN RAISE EXCEPTION 'Materi tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF NOT (public.is_admin() OR public.is_pengampu(v_course)) THEN
    RAISE EXCEPTION 'Hanya pengampu kursus ini' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT e.student_id, p.full_name, p.nim,
         s.baca_detik, s.baca_target, s.video_benar, s.video_total, s.latihan_benar, s.latihan_total,
         (SELECT count(*)::integer FROM jawaban_materi j WHERE j.student_id = e.student_id AND j.material_id = p_material_id AND NOT j.benar),
         s.terpenuhi,
         EXISTS (SELECT 1 FROM course_progress cp WHERE cp.student_id = e.student_id AND cp.material_id = p_material_id),
         greatest((SELECT pm.dilaporkan_pada FROM progres_materi pm WHERE pm.student_id = e.student_id AND pm.material_id = p_material_id),
                  (SELECT max(j.dijawab_pada) FROM jawaban_materi j WHERE j.student_id = e.student_id AND j.material_id = p_material_id))
  FROM enrollments e
  JOIN profiles p ON p.id = e.student_id
  CROSS JOIN LATERAL public.syarat_materi(e.student_id, p_material_id) s
  WHERE e.course_id = v_course AND e.status = 'approved'
  ORDER BY p.full_name;
END;
$$;
REVOKE ALL ON FUNCTION public.laporan_progres_materi(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.laporan_progres_materi(uuid) TO authenticated;


-- ── "Tandai Selesai": materi SPA wajib memenuhi syarat di server ──
CREATE OR REPLACE FUNCTION public.klaim_poin_materi(p_material_id uuid, p_sub_idx integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_course uuid;
  v_jumlah integer;
  v_spa    boolean;
  v_reason text;
  v_s      record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Silakan masuk terlebih dahulu' USING ERRCODE = '42501';
  END IF;

  SELECT course_id,
         greatest(CASE WHEN jsonb_typeof(attachments) = 'array' THEN jsonb_array_length(attachments) ELSE 0 END, 1),
         jsonb_typeof(webslide_content->'slides') = 'array' AND jsonb_array_length(webslide_content->'slides') > 0
    INTO v_course, v_jumlah, v_spa
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

  -- Format reason dipakai klien dan ajukan_sertifikat untuk menandai bagian yang sudah selesai.
  v_reason := format('Selesai lampiran %s materi %s', p_sub_idx + 1, p_material_id);
  IF EXISTS (SELECT 1 FROM points_log WHERE user_id = v_uid AND source = 'materi' AND reason = v_reason) THEN
    RETURN false;
  END IF;

  IF coalesce(v_spa, false) THEN
    SELECT * INTO v_s FROM public.syarat_materi(v_uid, p_material_id);
    IF NOT v_s.terpenuhi THEN
      RAISE EXCEPTION 'Syarat materi belum terpenuhi (baca %/% detik, soal video %/%, latihan %/%)',
        v_s.baca_detik, floor(v_s.baca_target * 0.75)::integer, v_s.video_benar, v_s.video_total, v_s.latihan_benar, v_s.latihan_total
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO course_progress (student_id, course_id, material_id)
  VALUES (v_uid, v_course, p_material_id)
  ON CONFLICT (student_id, material_id) DO NOTHING;

  INSERT INTO points_log (user_id, course_id, semester_id, points, source, reason, reference_id)
  VALUES (v_uid, v_course, (SELECT id FROM semesters WHERE is_active LIMIT 1), 3, 'materi', v_reason, p_material_id);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.klaim_poin_materi(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.klaim_poin_materi(uuid, integer) TO authenticated;
