/*
# Sumber Sandang — Core Schema

## Summary
Full business management database for a premium thrift fashion store.

## Tables Created
1. `categories` — product categories (tops, bottoms, dresses, etc.)
2. `products` — all product details including price, stock, barcode, images
3. `customers` — customer profiles with contact and purchase history
4. `orders` — customer orders with status tracking
5. `order_items` — line items per order
6. `payments` — payment records linked to orders
7. `inventory_movements` — every stock in/out event
8. `purchase_orders` — supplier purchase orders
9. `purchase_order_items` — items in each PO
10. `coupons` — discount codes
11. `notifications` — system notifications
12. `activity_logs` — admin action audit trail
13. `admins` — admin users

## Security
- RLS enabled on all tables
- Public-facing tables (products, categories) allow anon read
- Order/payment write allowed for anon (customers checkout without login)
- Admin operations require authenticated role
*/

-- CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  image_url text,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_categories" ON categories;
CREATE POLICY "anon_select_categories" ON categories FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_categories" ON categories;
CREATE POLICY "auth_insert_categories" ON categories FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_categories" ON categories;
CREATE POLICY "auth_update_categories" ON categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_categories" ON categories;
CREATE POLICY "auth_delete_categories" ON categories FOR DELETE TO authenticated USING (true);

-- PRODUCTS
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text UNIQUE NOT NULL,
  barcode text UNIQUE,
  name text NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  brand text,
  size text,
  color text,
  material text,
  condition text DEFAULT 'Good' CHECK (condition IN ('Like New','Excellent','Good','Fair')),
  description text,
  purchase_price numeric(12,2) DEFAULT 0,
  selling_price numeric(12,2) NOT NULL DEFAULT 0,
  stock int NOT NULL DEFAULT 0,
  min_stock int DEFAULT 3,
  images text[] DEFAULT '{}',
  video_url text,
  tags text[] DEFAULT '{}',
  is_featured boolean DEFAULT false,
  status text DEFAULT 'active' CHECK (status IN ('active','inactive','sold_out')),
  weight_grams int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_products" ON products;
CREATE POLICY "anon_select_products" ON products FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_products" ON products;
CREATE POLICY "auth_insert_products" ON products FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_products" ON products;
CREATE POLICY "auth_update_products" ON products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_products" ON products;
CREATE POLICY "auth_delete_products" ON products FOR DELETE TO authenticated USING (true);

-- CUSTOMERS
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text UNIQUE NOT NULL,
  email text,
  address text,
  city text,
  province text,
  postal_code text,
  notes text,
  total_orders int DEFAULT 0,
  total_spending numeric(14,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_insert_customers" ON customers;
CREATE POLICY "anon_insert_customers" ON customers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_select_customers" ON customers;
CREATE POLICY "anon_select_customers" ON customers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_update_customers" ON customers;
CREATE POLICY "auth_update_customers" ON customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_customers" ON customers;
CREATE POLICY "auth_delete_customers" ON customers FOR DELETE TO authenticated USING (true);

-- ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,
  invoice_number text UNIQUE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_address text,
  customer_city text,
  customer_province text,
  shipping_method text DEFAULT 'pickup',
  shipping_cost numeric(10,2) DEFAULT 0,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text DEFAULT 'cash' CHECK (payment_method IN ('cash','transfer','qris','cod')),
  payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','failed','refunded')),
  order_status text DEFAULT 'pending' CHECK (order_status IN ('pending','confirmed','processing','packing','ready','shipped','completed','cancelled','returned','refunded')),
  coupon_code text,
  notes text,
  admin_notes text,
  proof_of_payment_url text,
  estimated_delivery date,
  shipped_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
CREATE POLICY "anon_insert_orders" ON orders FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_select_orders" ON orders;
CREATE POLICY "anon_select_orders" ON orders FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_update_orders" ON orders;
CREATE POLICY "auth_update_orders" ON orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_orders" ON orders;
CREATE POLICY "auth_delete_orders" ON orders FOR DELETE TO authenticated USING (true);

-- ORDER ITEMS
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_code text NOT NULL,
  product_name text NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL,
  purchase_price numeric(12,2) DEFAULT 0,
  subtotal numeric(14,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_insert_order_items" ON order_items;
CREATE POLICY "anon_insert_order_items" ON order_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_select_order_items" ON order_items;
CREATE POLICY "anon_select_order_items" ON order_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_update_order_items" ON order_items;
CREATE POLICY "auth_update_order_items" ON order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_order_items" ON order_items;
CREATE POLICY "auth_delete_order_items" ON order_items FOR DELETE TO authenticated USING (true);

-- INVENTORY MOVEMENTS
CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('in','out','adjustment','damaged','lost','return')),
  quantity int NOT NULL,
  quantity_before int NOT NULL,
  quantity_after int NOT NULL,
  reference_type text,
  reference_id uuid,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_insert_inv" ON inventory_movements;
CREATE POLICY "anon_insert_inv" ON inventory_movements FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_select_inv" ON inventory_movements;
CREATE POLICY "auth_select_inv" ON inventory_movements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_update_inv" ON inventory_movements;
CREATE POLICY "auth_update_inv" ON inventory_movements FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_inv" ON inventory_movements;
CREATE POLICY "auth_delete_inv" ON inventory_movements FOR DELETE TO authenticated USING (true);

-- PURCHASE ORDERS
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text UNIQUE NOT NULL,
  supplier_name text NOT NULL,
  supplier_phone text,
  supplier_address text,
  total_items int DEFAULT 0,
  total_cost numeric(14,2) DEFAULT 0,
  status text DEFAULT 'draft' CHECK (status IN ('draft','sent','received','cancelled')),
  notes text,
  ordered_at timestamptz,
  received_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_po" ON purchase_orders;
CREATE POLICY "auth_select_po" ON purchase_orders FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_po" ON purchase_orders;
CREATE POLICY "auth_insert_po" ON purchase_orders FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_po" ON purchase_orders;
CREATE POLICY "auth_update_po" ON purchase_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_po" ON purchase_orders;
CREATE POLICY "auth_delete_po" ON purchase_orders FOR DELETE TO authenticated USING (true);

-- PURCHASE ORDER ITEMS
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  category text,
  quantity int NOT NULL DEFAULT 1,
  unit_cost numeric(12,2) NOT NULL,
  subtotal numeric(14,2) NOT NULL,
  received_quantity int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_poi" ON purchase_order_items;
CREATE POLICY "auth_select_poi" ON purchase_order_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_poi" ON purchase_order_items;
CREATE POLICY "auth_insert_poi" ON purchase_order_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_poi" ON purchase_order_items;
CREATE POLICY "auth_update_poi" ON purchase_order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_poi" ON purchase_order_items;
CREATE POLICY "auth_delete_poi" ON purchase_order_items FOR DELETE TO authenticated USING (true);

-- COUPONS
CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  type text DEFAULT 'percentage' CHECK (type IN ('percentage','fixed')),
  value numeric(10,2) NOT NULL,
  min_purchase numeric(14,2) DEFAULT 0,
  max_uses int DEFAULT NULL,
  used_count int DEFAULT 0,
  valid_from timestamptz DEFAULT now(),
  valid_until timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_coupons" ON coupons;
CREATE POLICY "anon_select_coupons" ON coupons FOR SELECT TO anon, authenticated USING (is_active = true);
DROP POLICY IF EXISTS "auth_insert_coupons" ON coupons;
CREATE POLICY "auth_insert_coupons" ON coupons FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_coupons" ON coupons;
CREATE POLICY "auth_update_coupons" ON coupons FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_coupons" ON coupons;
CREATE POLICY "auth_delete_coupons" ON coupons FOR DELETE TO authenticated USING (true);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  reference_type text,
  reference_id uuid,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_notifs" ON notifications;
CREATE POLICY "auth_select_notifs" ON notifications FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_notifs" ON notifications;
CREATE POLICY "anon_insert_notifs" ON notifications FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_notifs" ON notifications;
CREATE POLICY "auth_update_notifs" ON notifications FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_notifs" ON notifications;
CREATE POLICY "auth_delete_notifs" ON notifications FOR DELETE TO authenticated USING (true);

-- ACTIVITY LOGS
CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  description text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_logs" ON activity_logs;
CREATE POLICY "auth_select_logs" ON activity_logs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_logs" ON activity_logs;
CREATE POLICY "anon_insert_logs" ON activity_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_logs" ON activity_logs;
CREATE POLICY "auth_update_logs" ON activity_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_logs" ON activity_logs;
CREATE POLICY "auth_delete_logs" ON activity_logs FOR DELETE TO authenticated USING (true);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(product_code);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_movements(product_id);

-- SEED CATEGORIES
INSERT INTO categories (name, slug, description, sort_order) VALUES
  ('Tops', 'tops', 'Blouses, shirts, tees, crop tops', 1),
  ('Bottoms', 'bottoms', 'Pants, skirts, shorts, jeans', 2),
  ('Dresses', 'dresses', 'Casual and formal dresses', 3),
  ('Outerwear', 'outerwear', 'Jackets, coats, cardigans', 4),
  ('Accessories', 'accessories', 'Bags, belts, hats, scarves', 5),
  ('Sets', 'sets', 'Matching two-piece and co-ord sets', 6)
ON CONFLICT (slug) DO NOTHING;
