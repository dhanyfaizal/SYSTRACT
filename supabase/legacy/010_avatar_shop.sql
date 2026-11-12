-- ============================================================
-- EduSYS: Avatar Shop & Customization Migration
-- Jalankan SELURUH file ini di Supabase SQL Editor (VPS)
-- ============================================================

-- ── 1. TABEL: shop_items (katalog item toko) ───────────────
CREATE TABLE IF NOT EXISTS shop_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL CHECK (category IN ('hair','hat','shirt','accessory','background','face')),
  price       INT  NOT NULL DEFAULT 10,
  image_url   TEXT NOT NULL,
  rarity      TEXT DEFAULT 'common' CHECK (rarity IN ('common','rare','epic','legendary')),
  is_active   BOOLEAN DEFAULT TRUE,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE shop_items ENABLE ROW LEVEL SECURITY;

-- ── 2. TABEL: user_inventory (item yang dimiliki user) ─────
CREATE TABLE IF NOT EXISTS user_inventory (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_id      UUID NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  points_spent INT NOT NULL DEFAULT 0,
  UNIQUE (user_id, item_id)
);
ALTER TABLE user_inventory ENABLE ROW LEVEL SECURITY;

-- ── 3. TABEL: user_avatar_config (avatar aktif per user) ───
CREATE TABLE IF NOT EXISTS user_avatar_config (
  user_id            UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  equipped_hair       UUID REFERENCES shop_items(id),
  equipped_hat        UUID REFERENCES shop_items(id),
  equipped_shirt      UUID REFERENCES shop_items(id),
  equipped_accessory  UUID REFERENCES shop_items(id),
  equipped_background UUID REFERENCES shop_items(id),
  equipped_face       UUID REFERENCES shop_items(id),
  skin_color          TEXT DEFAULT '#FFDBB4',
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE user_avatar_config ENABLE ROW LEVEL SECURITY;

-- ── 4. RLS POLICIES ────────────────────────────────────────

-- shop_items: semua bisa baca, admin bisa kelola
DROP POLICY IF EXISTS "shop_items_public_read" ON shop_items;
CREATE POLICY "shop_items_public_read" ON shop_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "shop_items_admin_manage" ON shop_items;
CREATE POLICY "shop_items_admin_manage" ON shop_items FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- user_inventory: baca milik sendiri, insert milik sendiri
DROP POLICY IF EXISTS "inventory_own_read" ON user_inventory;
CREATE POLICY "inventory_own_read" ON user_inventory FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "inventory_own_insert" ON user_inventory;
CREATE POLICY "inventory_own_insert" ON user_inventory FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Tambahan: semua bisa baca inventory siapapun (untuk avatar preview)
DROP POLICY IF EXISTS "inventory_public_read" ON user_inventory;
CREATE POLICY "inventory_public_read" ON user_inventory FOR SELECT USING (true);

-- user_avatar_config: kelola sendiri, semua bisa baca (untuk avatar preview)
DROP POLICY IF EXISTS "avatar_config_own_manage" ON user_avatar_config;
CREATE POLICY "avatar_config_own_manage" ON user_avatar_config FOR ALL
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "avatar_config_public_read" ON user_avatar_config;
CREATE POLICY "avatar_config_public_read" ON user_avatar_config FOR SELECT
  USING (true);

-- ── 5. RPC: purchase_item (atomic buy) ─────────────────────
CREATE OR REPLACE FUNCTION purchase_item(p_item_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_price       INT;
  v_item_name   TEXT;
  v_category    TEXT;
  v_total_xp    INT;
  v_total_spent INT;
  v_balance     INT;
BEGIN
  -- Cek item ada & aktif
  SELECT price, name, category INTO v_price, v_item_name, v_category
    FROM shop_items WHERE id = p_item_id AND is_active = true;
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item tidak ditemukan');
  END IF;

  -- Cek sudah punya?
  IF EXISTS (SELECT 1 FROM user_inventory WHERE user_id = auth.uid() AND item_id = p_item_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item sudah dimiliki');
  END IF;

  -- Hitung saldo: total XP (all time) - total belanja
  SELECT COALESCE(SUM(points), 0) INTO v_total_xp
    FROM points_log WHERE user_id = auth.uid();
  SELECT COALESCE(SUM(points_spent), 0) INTO v_total_spent
    FROM user_inventory WHERE user_id = auth.uid();
  v_balance := v_total_xp - v_total_spent;

  -- Cek saldo
  IF v_balance < v_price THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Koin tidak cukup', 'balance', v_balance, 'price', v_price);
  END IF;

  -- Insert inventory
  INSERT INTO user_inventory (user_id, item_id, points_spent)
  VALUES (auth.uid(), p_item_id, v_price);

  -- Auto-equip jika belum ada item di slot itu
  INSERT INTO user_avatar_config (user_id)
  VALUES (auth.uid())
  ON CONFLICT (user_id) DO NOTHING;

  -- Auto-equip ke slot yang kosong
  IF v_category = 'hair' THEN
    UPDATE user_avatar_config SET equipped_hair = p_item_id, updated_at = NOW()
      WHERE user_id = auth.uid() AND equipped_hair IS NULL;
  ELSIF v_category = 'hat' THEN
    UPDATE user_avatar_config SET equipped_hat = p_item_id, updated_at = NOW()
      WHERE user_id = auth.uid() AND equipped_hat IS NULL;
  ELSIF v_category = 'shirt' THEN
    UPDATE user_avatar_config SET equipped_shirt = p_item_id, updated_at = NOW()
      WHERE user_id = auth.uid() AND equipped_shirt IS NULL;
  ELSIF v_category = 'accessory' THEN
    UPDATE user_avatar_config SET equipped_accessory = p_item_id, updated_at = NOW()
      WHERE user_id = auth.uid() AND equipped_accessory IS NULL;
  ELSIF v_category = 'background' THEN
    UPDATE user_avatar_config SET equipped_background = p_item_id, updated_at = NOW()
      WHERE user_id = auth.uid() AND equipped_background IS NULL;
  ELSIF v_category = 'face' THEN
    UPDATE user_avatar_config SET equipped_face = p_item_id, updated_at = NOW()
      WHERE user_id = auth.uid() AND equipped_face IS NULL;
  END IF;

  RETURN jsonb_build_object('ok', true, 'item', v_item_name, 'spent', v_price, 'balance', v_balance - v_price);
END;
$$;

-- ── 6. SEED: Default shop items ────────────────────────────
INSERT INTO shop_items (name, description, category, price, image_url, rarity, sort_order) VALUES
  -- Hair
  ('Rambut Pendek',    'Gaya rambut pendek klasik',      'hair',      0,  '/assets/avatar/hair_short.svg',     'common',    1),
  ('Rambut Panjang',   'Rambut panjang lurus',            'hair',     15, '/assets/avatar/hair_long.svg',      'common',    2),
  ('Rambut Spike',     'Gaya spike energik',              'hair',     30, '/assets/avatar/hair_spike.svg',     'rare',      3),
  ('Rambut Curly',     'Rambut keriting stylish',         'hair',     50, '/assets/avatar/hair_curly.svg',     'epic',      4),
  -- Hat
  ('Topi Baseball',    'Topi casual',                     'hat',      20, '/assets/avatar/hat_baseball.svg',   'common',    1),
  ('Topi Wisuda',      'Topi toga wisudawan',             'hat',     100, '/assets/avatar/hat_graduation.svg', 'legendary', 2),
  ('Headband',         'Bandana keren',                   'hat',      25, '/assets/avatar/hat_headband.svg',   'rare',      3),
  -- Shirt
  ('Kaos Polos',       'Kaos simpel sehari-hari',         'shirt',     0, '/assets/avatar/shirt_basic.svg',    'common',    1),
  ('Kemeja Formal',    'Kemeja rapi formal',              'shirt',    30, '/assets/avatar/shirt_formal.svg',   'rare',      2),
  ('Hoodie STIKOM',    'Hoodie eksklusif STIKOM',         'shirt',    75, '/assets/avatar/shirt_hoodie.svg',   'epic',      3),
  ('Jas Akademik',     'Jas akademik prestisius',         'shirt',   150, '/assets/avatar/shirt_blazer.svg',   'legendary', 4),
  -- Accessory
  ('Kacamata Biasa',   'Kacamata simpel',                 'accessory', 10, '/assets/avatar/acc_glasses.svg',   'common',    1),
  ('Kacamata Hitam',   'Sunglasses keren',                'accessory', 35, '/assets/avatar/acc_sunglasses.svg','rare',      2),
  ('Headphone',        'Headphone gaming',                'accessory', 60, '/assets/avatar/acc_headphone.svg', 'epic',      3),
  -- Background
  ('Putih',            'Background default',              'background', 0, '/assets/avatar/bg_white.svg',      'common',    1),
  ('Gradient Biru',    'Latar biru gradasi',              'background',20, '/assets/avatar/bg_blue.svg',       'common',    2),
  ('Gradient Ungu',    'Latar ungu premium',              'background',40, '/assets/avatar/bg_purple.svg',     'rare',      3),
  ('Starfield',        'Langit berbintang',               'background',80, '/assets/avatar/bg_stars.svg',      'epic',      4),
  -- Face
  ('Senyum',           'Ekspresi senyum default',         'face',      0, '/assets/avatar/face_smile.svg',     'common',    1),
  ('Semangat',         'Ekspresi penuh semangat',         'face',     15, '/assets/avatar/face_excited.svg',   'common',    2),
  ('Cool',             'Ekspresi keren santai',           'face',     30, '/assets/avatar/face_cool.svg',      'rare',      3),
  ('Fokus',            'Ekspresi fokus belajar',          'face',     25, '/assets/avatar/face_focus.svg',     'rare',      4)
ON CONFLICT DO NOTHING;

-- ── 7. STORAGE BUCKET: avatar-items ────────────────────────
-- Jalankan bagian ini TERPISAH jika bucket sudah ada
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatar-items', 'avatar-items', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Semua bisa baca (public bucket)
CREATE POLICY "avatar_items_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatar-items');

-- Policy: Admin bisa upload
CREATE POLICY "avatar_items_admin_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatar-items'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Policy: Admin bisa hapus
CREATE POLICY "avatar_items_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatar-items'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
