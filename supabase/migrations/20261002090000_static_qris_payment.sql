-- Add manual static QRIS without changing the pending checkout flow.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('bca', 'dana', 'shopeepay', 'cash', 'qris'));

ALTER TABLE cash_ledger DROP CONSTRAINT IF EXISTS cash_ledger_payment_method_check;
ALTER TABLE cash_ledger ADD CONSTRAINT cash_ledger_payment_method_check
  CHECK (payment_method IN ('bca', 'dana', 'shopeepay', 'cash', 'qris'));

ALTER TABLE order_finance_state DROP CONSTRAINT IF EXISTS order_finance_state_payment_method_check;
ALTER TABLE order_finance_state ADD CONSTRAINT order_finance_state_payment_method_check
  CHECK (payment_method IN ('bca', 'dana', 'shopeepay', 'cash', 'qris'));

DO $$
DECLARE
  definition text;
  old_validation text := 'IF p_payment_method NOT IN (''bca'', ''dana'', ''shopeepay'', ''cash'') THEN';
BEGIN
  definition := pg_get_functiondef('public.create_checkout_order_internal(uuid,jsonb,text,text,text,text,jsonb)'::regprocedure);
  IF position(old_validation IN definition) = 0 THEN
    RAISE EXCEPTION 'Checkout payment validation changed; update QRIS migration before applying';
  END IF;
  EXECUTE replace(definition, old_validation,
    'IF p_payment_method NOT IN (''bca'', ''dana'', ''shopeepay'', ''cash'', ''qris'') THEN');
END;
$$;

CREATE OR REPLACE FUNCTION get_admin_qris_revenue(p_start timestamptz DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((SELECT sum(total_amount) FROM orders
    WHERE payment_method = 'qris'
      AND order_status IN ('confirmed', 'processing', 'packing', 'ready', 'shipped', 'completed')
      AND (p_start IS NULL OR created_at >= p_start)), 0);
END;
$$;
REVOKE ALL ON FUNCTION get_admin_qris_revenue(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_admin_qris_revenue(timestamptz) TO authenticated;

-- The manual finance form accepts the same payment methods as orders.
DO $$
DECLARE
  routine record;
  definition text;
  old_validation text := 'IF p_payment_method NOT IN (''bca'', ''dana'', ''shopeepay'', ''cash'') THEN';
BEGIN
  FOR routine IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'validate_manual_cash_transaction'
  LOOP
    definition := pg_get_functiondef(routine.oid);
    IF position(old_validation IN definition) > 0 THEN
      EXECUTE replace(definition, old_validation,
        'IF p_payment_method NOT IN (''bca'', ''dana'', ''shopeepay'', ''cash'', ''qris'') THEN');
    END IF;
  END LOOP;
END;
$$;
