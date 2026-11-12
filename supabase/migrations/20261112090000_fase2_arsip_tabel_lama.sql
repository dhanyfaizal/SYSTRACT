-- ============================================================
-- SYSTRACT · Fase 2: arsipkan tabel sisa sistem lama
-- ------------------------------------------------------------
-- 12 tabel berikut berasal dari sistem lain (peran 'super_admin'/'instructor'),
-- tidak dipakai kode SYSTRACT, dan aksesnya sudah dicabut di Fase 1 (K6).
-- Di sini tabel DIPINDAHKAN ke skema `arsip` (tidak terlihat oleh API Supabase),
-- bukan dihapus, sehingga datanya tetap ada dan bisa dikembalikan:
--   ALTER TABLE arsip.<nama> SET SCHEMA public;
--
-- Jumlah baris tiap tabel dicetak sebagai NOTICE sebelum dipindah.
-- Juga membuang dua policy SELECT ganda yang sudah tercakup policy lain.
-- Satu transaksi; aman dijalankan ulang.
-- ============================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS arsip;
REVOKE ALL ON SCHEMA arsip FROM PUBLIC, anon, authenticated;
COMMENT ON SCHEMA arsip IS 'Tabel sisa sistem lama, dipindah dari public pada Fase 2 (2026-11-12). Tidak diakses aplikasi.';

DO $$
DECLARE
  t text;
  n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','institutions','classes','modules','sections','content_items',
                           'final_exams','exam_attempts','formative_logs','learning_paths',
                           'portfolio_submissions','user_progress']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      RAISE NOTICE 'arsip: public.% (% baris) → arsip.%', t, n, t;
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA arsip', t);
    END IF;
  END LOOP;
END $$;

-- Policy ganda: "All can see points_log" (true) sudah mencakup baca milik sendiri;
-- "inventory_public_read" (true) sudah mencakup "inventory_own_read".
DROP POLICY IF EXISTS "points_log_read_own" ON public.points_log;
DROP POLICY IF EXISTS "inventory_own_read"  ON public.user_inventory;

COMMIT;
