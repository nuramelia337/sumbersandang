/*
# Finance, keep countdown, and checkout option upgrade
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_method_check'
  ) THEN
    ALTER TABLE orders DROP CONSTRAINT orders_payment_method_check;
  END IF;
END $$;

UPDATE orders SET payment_method = 'bca' WHERE payment_method = 'transfer';
UPDATE orders SET payment_method = 'dana' WHERE payment_method = 'saldo';
UPDATE orders SET payment_method = 'bca' WHERE payment_method IN ('cash','qris','cod');

ALTER TABLE orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('bca','dana','shopeepay'));

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS keep_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS keep_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS shipping_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_keep_status_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_keep_status_check
      CHECK (keep_status IN ('active','expired','confirmed','released'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS finance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value numeric(14,2) NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cash_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('initial','in','out','operational')),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  description text NOT NULL,
  payment_method text CHECK (payment_method IN ('bca','dana','shopeepay')),
  reference_type text,
  reference_id uuid,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES admin_profiles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_ledger_order_unique
ON cash_ledger(reference_type, reference_id, type)
WHERE reference_type = 'order';

ALTER TABLE finance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_finance_settings" ON finance_settings;
CREATE POLICY "admin_select_finance_settings" ON finance_settings FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "admin_write_finance_settings" ON finance_settings;
CREATE POLICY "admin_write_finance_settings" ON finance_settings FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_select_cash_ledger" ON cash_ledger;
CREATE POLICY "admin_select_cash_ledger" ON cash_ledger FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "admin_write_cash_ledger" ON cash_ledger;
CREATE POLICY "admin_write_cash_ledger" ON cash_ledger FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

INSERT INTO finance_settings (key, value)
VALUES ('opening_balance', 0)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION upsert_order_cash_ledger(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o record;
BEGIN
  SELECT * INTO o FROM orders WHERE id = p_order_id;
  IF o.id IS NULL OR o.order_status IN ('cancelled','returned','refunded') THEN
    RETURN;
  END IF;

  INSERT INTO cash_ledger (
    type, amount, description, payment_method, reference_type, reference_id, transaction_date
  )
  VALUES (
    'in',
    o.total_amount,
    'Order ' || o.order_number || ' - ' || o.customer_name,
    o.payment_method,
    'order',
    o.id,
    o.created_at::date
  )
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_cash_ledger_date ON cash_ledger(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_reference ON cash_ledger(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_orders_keep ON orders(keep_status, keep_expires_at);

INSERT INTO site_settings (key, value) VALUES
  ('rules_belanja', '{
    "is_active": true
  }')
ON CONFLICT (key) DO NOTHING;
