/*
# Cash payment and simplified product categories

Adds Cash as an active payment method and simplifies public/admin product
categories to Promo, Normal, and Premium.
*/

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
  CHECK (payment_method IN ('bca','dana','shopeepay','cash'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_ledger_payment_method_check'
  ) THEN
    ALTER TABLE cash_ledger DROP CONSTRAINT cash_ledger_payment_method_check;
  END IF;
END $$;

ALTER TABLE cash_ledger
  ADD CONSTRAINT cash_ledger_payment_method_check
  CHECK (payment_method IN ('bca','dana','shopeepay','cash'));

INSERT INTO categories (name, slug, description, sort_order) VALUES
  ('Promo', 'promo', 'Pilihan harga spesial dan temuan cepat habis.', 1),
  ('Normal', 'normal', 'Koleksi harian yang mudah dipadukan.', 2),
  ('Premium', 'premi', 'Kurasi terbaik dengan kondisi dan karakter lebih unggul.', 3)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

UPDATE products
SET category_id = (SELECT id FROM categories WHERE slug = 'normal')
WHERE category_id IS NULL
   OR category_id NOT IN (SELECT id FROM categories WHERE slug IN ('promo','normal','premi'));

DELETE FROM categories
WHERE slug NOT IN ('promo','normal','premi');
