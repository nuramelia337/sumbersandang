/*
# Business upgrade for Sumber Sandang

Adds product availability, package sales, editable website content, Supabase Auth
admin profiles, safer policies, and helper RPCs for public checkout inventory flow.
*/

CREATE SEQUENCE IF NOT EXISTS product_code_seq START 1;

CREATE OR REPLACE FUNCTION next_product_code()
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN 'SS' || lpad(nextval('product_code_seq')::text, 3, '0');
END;
$$;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_path text,
  ADD COLUMN IF NOT EXISTS availability_status text DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS storage_location text DEFAULT 'gudang',
  ADD COLUMN IF NOT EXISTS internal_notes text;

ALTER TABLE products
  ALTER COLUMN product_code SET DEFAULT next_product_code();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_availability_status_check'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_availability_status_check
      CHECK (availability_status IN ('ready','reserved','sold'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_storage_location_check'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_storage_location_check
      CHECK (storage_location IN ('rak_a','rak_b','gudang','etalase'));
  END IF;
END $$;

UPDATE products
SET availability_status = CASE
  WHEN status = 'sold_out' OR stock <= 0 THEN 'sold'
  ELSE 'ready'
END
WHERE availability_status IS NULL OR availability_status = 'ready';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_method_check'
  ) THEN
    ALTER TABLE orders DROP CONSTRAINT orders_payment_method_check;
  END IF;
END $$;

ALTER TABLE orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('cash','transfer','qris','cod','saldo'));

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS item_type text DEFAULT 'product',
  ADD COLUMN IF NOT EXISTS package_id uuid,
  ADD COLUMN IF NOT EXISTS package_items_snapshot jsonb DEFAULT '[]';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_item_type_check'
  ) THEN
    ALTER TABLE order_items
      ADD CONSTRAINT order_items_item_type_check
      CHECK (item_type IN ('product','package'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS business_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_code text UNIQUE NOT NULL DEFAULT ('PKG' || upper(substr(gen_random_uuid()::text, 1, 8))),
  name text NOT NULL,
  description text,
  price numeric(14,2) NOT NULL DEFAULT 0,
  cover_image_path text,
  cover_image_url text,
  is_featured boolean DEFAULT false,
  availability_status text DEFAULT 'ready' CHECK (availability_status IN ('ready','reserved','sold')),
  status text DEFAULT 'active' CHECK (status IN ('active','inactive','sold_out')),
  internal_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES business_packages(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  created_at timestamptz DEFAULT now(),
  UNIQUE(package_id, product_id)
);

ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_package_id_fkey,
  ADD CONSTRAINT order_items_package_id_fkey
    FOREIGN KEY (package_id) REFERENCES business_packages(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  customer_handle text,
  message text NOT NULL,
  rating int DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  full_name text,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('owner','admin')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS admin_id uuid REFERENCES admin_profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM admin_profiles
    WHERE id = auth.uid()
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION set_product_availability_from_order(p_order_id uuid, p_availability text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item record;
  stock_after int;
BEGIN
  IF p_availability NOT IN ('ready','reserved','sold') THEN
    RAISE EXCEPTION 'Invalid availability %', p_availability;
  END IF;

  FOR item IN
    SELECT * FROM order_items WHERE order_id = p_order_id
  LOOP
    IF item.item_type = 'package' AND item.package_id IS NOT NULL THEN
      UPDATE business_packages
      SET availability_status = p_availability,
          status = CASE WHEN p_availability = 'sold' THEN 'sold_out' ELSE status END,
          updated_at = now()
      WHERE id = item.package_id;

      UPDATE products p
      SET availability_status = p_availability,
          status = CASE WHEN p_availability = 'sold' THEN 'sold_out' ELSE p.status END,
          stock = CASE WHEN p_availability = 'sold' THEN 0 ELSE p.stock END,
          updated_at = now()
      FROM business_package_items bpi
      WHERE bpi.package_id = item.package_id
        AND bpi.product_id = p.id;
    ELSIF item.product_id IS NOT NULL THEN
      SELECT CASE WHEN p_availability = 'sold' THEN 0 ELSE stock END
      INTO stock_after
      FROM products
      WHERE id = item.product_id;

      UPDATE products
      SET availability_status = p_availability,
          status = CASE WHEN p_availability = 'sold' THEN 'sold_out' ELSE status END,
          stock = stock_after,
          updated_at = now()
      WHERE id = item.product_id;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION reserve_order_items(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_product_availability_from_order(p_order_id, 'reserved');
END;
$$;

CREATE OR REPLACE FUNCTION transition_order_inventory(p_order_id uuid, p_order_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_order_status IN ('completed') THEN
    PERFORM set_product_availability_from_order(p_order_id, 'sold');
  ELSIF p_order_status IN ('cancelled','returned','refunded') THEN
    PERFORM set_product_availability_from_order(p_order_id, 'ready');
  END IF;
END;
$$;

ALTER TABLE business_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_delete_products" ON products;
DROP POLICY IF EXISTS "auth_insert_products" ON products;
DROP POLICY IF EXISTS "auth_update_products" ON products;
DROP POLICY IF EXISTS "auth_delete_products" ON products;
CREATE POLICY "admin_insert_products" ON products FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "admin_update_products" ON products FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_delete_products" ON products FOR DELETE TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "anon_select_packages" ON business_packages;
CREATE POLICY "anon_select_packages" ON business_packages FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "admin_insert_packages" ON business_packages;
CREATE POLICY "admin_insert_packages" ON business_packages FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_packages" ON business_packages;
CREATE POLICY "admin_update_packages" ON business_packages FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_packages" ON business_packages;
CREATE POLICY "admin_delete_packages" ON business_packages FOR DELETE TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "anon_select_package_items" ON business_package_items;
CREATE POLICY "anon_select_package_items" ON business_package_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "admin_insert_package_items" ON business_package_items;
CREATE POLICY "admin_insert_package_items" ON business_package_items FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_package_items" ON business_package_items;
CREATE POLICY "admin_update_package_items" ON business_package_items FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_package_items" ON business_package_items;
CREATE POLICY "admin_delete_package_items" ON business_package_items FOR DELETE TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "anon_select_site_settings" ON site_settings;
CREATE POLICY "anon_select_site_settings" ON site_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "admin_write_site_settings" ON site_settings;
CREATE POLICY "admin_write_site_settings" ON site_settings FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "anon_select_testimonials" ON testimonials;
CREATE POLICY "anon_select_testimonials" ON testimonials FOR SELECT TO anon, authenticated USING (is_active OR is_admin());
DROP POLICY IF EXISTS "admin_write_testimonials" ON testimonials;
CREATE POLICY "admin_write_testimonials" ON testimonials FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_select_profiles" ON admin_profiles;
CREATE POLICY "admin_select_profiles" ON admin_profiles FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "admin_insert_profiles" ON admin_profiles;
CREATE POLICY "admin_insert_profiles" ON admin_profiles FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_profiles" ON admin_profiles;
CREATE POLICY "admin_update_profiles" ON admin_profiles FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE INDEX IF NOT EXISTS idx_products_availability ON products(availability_status);
CREATE INDEX IF NOT EXISTS idx_products_location ON products(storage_location);
CREATE INDEX IF NOT EXISTS idx_packages_availability ON business_packages(availability_status);
CREATE INDEX IF NOT EXISTS idx_package_items_package ON business_package_items(package_id);
CREATE INDEX IF NOT EXISTS idx_order_items_package ON order_items(package_id);

INSERT INTO site_settings (key, value) VALUES
  ('promo_banner', '{
    "title": "Paket usaha thrift siap jual",
    "subtitle": "Kurasi pakaian pilihan untuk reseller dan pemilik butik kecil.",
    "cta_label": "Lihat Paket",
    "cta_page": "shop",
    "image_url": "https://images.pexels.com/photos/1488463/pexels-photo-1488463.jpeg",
    "is_active": true
  }')
ON CONFLICT (key) DO NOTHING;

INSERT INTO testimonials (customer_name, customer_handle, message, rating, sort_order) VALUES
  ('Maya', '@maya.thrift', 'Barangnya bersih, foto sesuai, dan admin cepat bantu cek ukuran.', 5, 1),
  ('Rani', '@ranicloset', 'Paket usaha praktis banget untuk mulai jualan kecil-kecilan.', 5, 2),
  ('Dewi', '@dewistyle', 'Kurasi produknya bagus dan harga masih masuk untuk reseller.', 5, 3)
ON CONFLICT DO NOTHING;
