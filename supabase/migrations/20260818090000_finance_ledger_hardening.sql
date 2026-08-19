/*
# Finance ledger hardening

Makes order finance entries event-based, protects system-generated ledger rows,
and provides audited RPCs for manual cash transactions.
*/

ALTER TABLE cash_ledger
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS entry_kind text,
  ADD COLUMN IF NOT EXISTS cost_amount numeric(14,2) NOT NULL DEFAULT 0;

UPDATE cash_ledger
SET
  reference_type = 'manual',
  entry_kind = 'manual'
WHERE reference_type IS NULL
  AND type IN ('in', 'out', 'operational');

UPDATE cash_ledger
SET entry_kind = CASE
  WHEN reference_type = 'order' AND type = 'in' THEN 'order_sale'
  WHEN reference_type = 'order' AND type = 'out' THEN 'order_reversal'
  WHEN type = 'initial' THEN 'legacy_initial'
  ELSE COALESCE(entry_kind, 'manual')
END
WHERE entry_kind IS NULL;

UPDATE cash_ledger cl
SET cost_amount = costs.total_cost
FROM (
  SELECT
    oi.order_id,
    COALESCE(SUM(oi.purchase_price * oi.quantity), 0)::numeric(14,2) AS total_cost
  FROM order_items oi
  GROUP BY oi.order_id
) costs
WHERE cl.reference_type = 'order'
  AND cl.reference_id = costs.order_id
  AND cl.type = 'in';

DROP INDEX IF EXISTS idx_cash_ledger_order_unique;

ALTER TABLE cash_ledger
  DROP CONSTRAINT IF EXISTS cash_ledger_amount_positive,
  DROP CONSTRAINT IF EXISTS cash_ledger_cost_nonnegative,
  DROP CONSTRAINT IF EXISTS cash_ledger_entry_kind_check;

ALTER TABLE cash_ledger
  ADD CONSTRAINT cash_ledger_amount_positive CHECK (amount > 0) NOT VALID,
  ADD CONSTRAINT cash_ledger_cost_nonnegative CHECK (cost_amount >= 0) NOT VALID,
  ADD CONSTRAINT cash_ledger_entry_kind_check CHECK (
    entry_kind IN (
      'manual',
      'order_sale',
      'order_reversal',
      'order_reinstatement',
      'order_adjustment',
      'legacy_initial'
    )
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_cash_ledger_order_events
ON cash_ledger(reference_id, created_at)
WHERE reference_type = 'order';

CREATE TABLE IF NOT EXISTS order_finance_state (
  order_id uuid PRIMARY KEY,
  is_recognized boolean NOT NULL DEFAULT false,
  recognized_amount numeric(14,2) NOT NULL DEFAULT 0,
  recognized_cost numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text CHECK (payment_method IN ('bca','dana','shopeepay','cash')),
  recognition_sequence integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_finance_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_order_finance_state" ON order_finance_state;
CREATE POLICY "admin_select_order_finance_state"
ON order_finance_state FOR SELECT TO authenticated
USING (is_admin());

INSERT INTO order_finance_state (
  order_id,
  is_recognized,
  recognized_amount,
  recognized_cost,
  payment_method,
  recognition_sequence,
  updated_at
)
SELECT
  o.id,
  EXISTS (
    SELECT 1
    FROM cash_ledger cl
    WHERE cl.reference_type = 'order'
      AND cl.reference_id = o.id
      AND cl.type = 'in'
  ),
  CASE
    WHEN EXISTS (
      SELECT 1 FROM cash_ledger cl
      WHERE cl.reference_type = 'order' AND cl.reference_id = o.id AND cl.type = 'in'
    ) THEN o.total_amount
    ELSE 0
  END,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM cash_ledger cl
      WHERE cl.reference_type = 'order' AND cl.reference_id = o.id AND cl.type = 'in'
    ) THEN COALESCE((
      SELECT SUM(oi.purchase_price * oi.quantity)
      FROM order_items oi
      WHERE oi.order_id = o.id
    ), 0)
    ELSE 0
  END,
  o.payment_method,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM cash_ledger cl
      WHERE cl.reference_type = 'order' AND cl.reference_id = o.id AND cl.type = 'in'
    ) THEN 1
    ELSE 0
  END,
  now()
FROM orders o
ON CONFLICT (order_id) DO NOTHING;

CREATE OR REPLACE FUNCTION upsert_order_cash_ledger(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o orders%ROWTYPE;
  state order_finance_state%ROWTYPE;
  order_cost numeric(14,2);
  counts_as_revenue boolean;
  latest_in_id uuid;
BEGIN
  SELECT * INTO o
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF o.total_amount <= 0 THEN
    RAISE EXCEPTION 'Order amount must be greater than zero';
  END IF;

  SELECT COALESCE(SUM(purchase_price * quantity), 0)::numeric(14,2)
  INTO order_cost
  FROM order_items
  WHERE order_id = p_order_id;

  counts_as_revenue := o.order_status IN (
    'confirmed', 'processing', 'packing', 'ready', 'shipped', 'completed'
  );

  INSERT INTO order_finance_state (order_id, payment_method)
  VALUES (o.id, o.payment_method)
  ON CONFLICT (order_id) DO NOTHING;

  SELECT * INTO state
  FROM order_finance_state
  WHERE order_id = o.id
  FOR UPDATE;

  IF counts_as_revenue AND NOT state.is_recognized THEN
    INSERT INTO cash_ledger (
      type,
      amount,
      cost_amount,
      description,
      payment_method,
      reference_type,
      reference_id,
      entry_kind,
      transaction_date
    ) VALUES (
      'in',
      o.total_amount,
      order_cost,
      CASE
        WHEN state.recognition_sequence = 0 THEN 'Order ' || o.order_number || ' - ' || o.customer_name
        ELSE 'Pengakuan ulang order ' || o.order_number || ' - ' || o.customer_name
      END,
      o.payment_method,
      'order',
      o.id,
      CASE WHEN state.recognition_sequence = 0 THEN 'order_sale' ELSE 'order_reinstatement' END,
      COALESCE(o.payment_confirmed_at, o.updated_at, o.created_at)::date
    );

    UPDATE order_finance_state
    SET
      is_recognized = true,
      recognized_amount = o.total_amount,
      recognized_cost = order_cost,
      payment_method = o.payment_method,
      recognition_sequence = recognition_sequence + 1,
      updated_at = now()
    WHERE order_id = o.id;
  ELSIF counts_as_revenue AND state.is_recognized THEN
    SELECT id INTO latest_in_id
    FROM cash_ledger
    WHERE reference_type = 'order'
      AND reference_id = o.id
      AND type = 'in'
    ORDER BY created_at DESC
    LIMIT 1;

    IF latest_in_id IS NOT NULL THEN
      UPDATE cash_ledger
      SET
        amount = amount + (o.total_amount - state.recognized_amount),
        cost_amount = GREATEST(0, cost_amount + (order_cost - state.recognized_cost)),
        payment_method = o.payment_method,
        updated_at = now()
      WHERE id = latest_in_id;
    END IF;

    UPDATE cash_ledger
    SET payment_method = o.payment_method, updated_at = now()
    WHERE reference_type = 'order'
      AND reference_id = o.id
      AND payment_method IS DISTINCT FROM o.payment_method;

    UPDATE order_finance_state
    SET
      recognized_amount = o.total_amount,
      recognized_cost = order_cost,
      payment_method = o.payment_method,
      updated_at = now()
    WHERE order_id = o.id;
  ELSIF NOT counts_as_revenue AND state.is_recognized THEN
    INSERT INTO cash_ledger (
      type,
      amount,
      cost_amount,
      description,
      payment_method,
      reference_type,
      reference_id,
      entry_kind,
      transaction_date
    ) VALUES (
      'out',
      state.recognized_amount,
      state.recognized_cost,
      'Pembalikan order ' || o.order_number || ' - ' || o.customer_name,
      COALESCE(o.payment_method, state.payment_method),
      'order',
      o.id,
      'order_reversal',
      COALESCE(o.updated_at, now())::date
    );

    UPDATE order_finance_state
    SET
      is_recognized = false,
      recognized_amount = 0,
      recognized_cost = 0,
      payment_method = o.payment_method,
      updated_at = now()
    WHERE order_id = o.id;
  ELSE
    UPDATE order_finance_state
    SET payment_method = o.payment_method, updated_at = now()
    WHERE order_id = o.id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION sync_order_cash_ledger_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM upsert_order_cash_ledger(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_cash_ledger ON orders;
CREATE TRIGGER trg_sync_order_cash_ledger
AFTER INSERT OR UPDATE OF order_status, total_amount, payment_method, payment_confirmed_at
ON orders
FOR EACH ROW
EXECUTE FUNCTION sync_order_cash_ledger_trigger();

CREATE OR REPLACE FUNCTION reverse_order_cash_ledger_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  state order_finance_state%ROWTYPE;
BEGIN
  SELECT * INTO state
  FROM order_finance_state
  WHERE order_id = OLD.id
  FOR UPDATE;

  IF FOUND AND state.is_recognized THEN
    INSERT INTO cash_ledger (
      type,
      amount,
      cost_amount,
      description,
      payment_method,
      reference_type,
      reference_id,
      entry_kind,
      transaction_date
    ) VALUES (
      'out',
      state.recognized_amount,
      state.recognized_cost,
      'Pembalikan penghapusan order ' || OLD.order_number || ' - ' || OLD.customer_name,
      COALESCE(OLD.payment_method, state.payment_method),
      'order',
      OLD.id,
      'order_reversal',
      CURRENT_DATE
    );

    UPDATE order_finance_state
    SET
      is_recognized = false,
      recognized_amount = 0,
      recognized_cost = 0,
      updated_at = now()
    WHERE order_id = OLD.id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_order_cash_ledger ON orders;
DROP TRIGGER IF EXISTS trg_reverse_order_cash_ledger_before_delete ON orders;
CREATE TRIGGER trg_reverse_order_cash_ledger_before_delete
BEFORE DELETE ON orders
FOR EACH ROW
EXECUTE FUNCTION reverse_order_cash_ledger_before_delete();

CREATE OR REPLACE FUNCTION validate_manual_cash_transaction(
  p_type text,
  p_amount numeric,
  p_description text,
  p_payment_method text,
  p_transaction_date date
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_type NOT IN ('in', 'out', 'operational') THEN
    RAISE EXCEPTION 'Invalid manual transaction type';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Transaction amount must be greater than zero';
  END IF;
  IF NULLIF(BTRIM(p_description), '') IS NULL THEN
    RAISE EXCEPTION 'Transaction description is required';
  END IF;
  IF p_payment_method NOT IN ('bca', 'dana', 'shopeepay', 'cash') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;
  IF p_transaction_date IS NULL THEN
    RAISE EXCEPTION 'Transaction date is required';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION create_manual_cash_transaction(
  p_type text,
  p_amount numeric,
  p_description text,
  p_payment_method text,
  p_transaction_date date
)
RETURNS cash_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_row cash_ledger%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  PERFORM validate_manual_cash_transaction(
    p_type, p_amount, p_description, p_payment_method, p_transaction_date
  );

  INSERT INTO cash_ledger (
    type,
    amount,
    description,
    payment_method,
    reference_type,
    entry_kind,
    transaction_date,
    created_by
  ) VALUES (
    p_type,
    p_amount,
    BTRIM(p_description),
    p_payment_method,
    'manual',
    'manual',
    p_transaction_date,
    auth.uid()
  )
  RETURNING * INTO created_row;

  INSERT INTO activity_logs (admin_id, action, entity_type, entity_id, description, metadata)
  VALUES (
    auth.uid(),
    'cash_ledger_created',
    'cash_ledger',
    created_row.id,
    'Created manual cash transaction: ' || created_row.description,
    jsonb_build_object('after', to_jsonb(created_row))
  );

  RETURN created_row;
END;
$$;

CREATE OR REPLACE FUNCTION update_manual_cash_transaction(
  p_id uuid,
  p_type text,
  p_amount numeric,
  p_description text,
  p_payment_method text,
  p_transaction_date date
)
RETURNS cash_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_row cash_ledger%ROWTYPE;
  updated_row cash_ledger%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  PERFORM validate_manual_cash_transaction(
    p_type, p_amount, p_description, p_payment_method, p_transaction_date
  );

  SELECT * INTO previous_row
  FROM cash_ledger
  WHERE id = p_id
    AND reference_type = 'manual'
    AND entry_kind = 'manual'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manual cash transaction not found';
  END IF;

  UPDATE cash_ledger
  SET
    type = p_type,
    amount = p_amount,
    description = BTRIM(p_description),
    payment_method = p_payment_method,
    transaction_date = p_transaction_date,
    updated_at = now()
  WHERE id = p_id
  RETURNING * INTO updated_row;

  INSERT INTO activity_logs (admin_id, action, entity_type, entity_id, description, metadata)
  VALUES (
    auth.uid(),
    'cash_ledger_updated',
    'cash_ledger',
    updated_row.id,
    'Updated manual cash transaction: ' || updated_row.description,
    jsonb_build_object('before', to_jsonb(previous_row), 'after', to_jsonb(updated_row))
  );

  RETURN updated_row;
END;
$$;

CREATE OR REPLACE FUNCTION delete_manual_cash_transaction(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_row cash_ledger%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO deleted_row
  FROM cash_ledger
  WHERE id = p_id
    AND reference_type = 'manual'
    AND entry_kind = 'manual'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manual cash transaction not found';
  END IF;

  DELETE FROM cash_ledger WHERE id = p_id;

  INSERT INTO activity_logs (admin_id, action, entity_type, entity_id, description, metadata)
  VALUES (
    auth.uid(),
    'cash_ledger_deleted',
    'cash_ledger',
    deleted_row.id,
    'Deleted manual cash transaction: ' || deleted_row.description,
    jsonb_build_object('before', to_jsonb(deleted_row))
  );
END;
$$;

DROP POLICY IF EXISTS "admin_write_cash_ledger" ON cash_ledger;

REVOKE ALL ON FUNCTION create_manual_cash_transaction(text, numeric, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_manual_cash_transaction(uuid, text, numeric, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_manual_cash_transaction(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION upsert_order_cash_ledger(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION create_manual_cash_transaction(text, numeric, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION update_manual_cash_transaction(uuid, text, numeric, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_manual_cash_transaction(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_order_cash_ledger(uuid) TO authenticated;
