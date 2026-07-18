/*
# Sync order cash ledger by confirmed order statuses

Order revenue only counts after admin confirmation. Pending/cancelled/returned/
refunded orders must not remain in cash_ledger.
*/

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

  IF o.id IS NULL THEN
    RETURN;
  END IF;

  IF o.order_status NOT IN ('confirmed','processing','packing','ready','shipped','completed') THEN
    DELETE FROM cash_ledger
    WHERE reference_type = 'order'
      AND reference_id = p_order_id
      AND type = 'in';
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
    COALESCE(o.payment_confirmed_at, o.updated_at, o.created_at)::date
  )
  ON CONFLICT (reference_type, reference_id, type)
  WHERE reference_type = 'order'
  DO UPDATE SET
    amount = EXCLUDED.amount,
    description = EXCLUDED.description,
    payment_method = EXCLUDED.payment_method,
    transaction_date = EXCLUDED.transaction_date;
END;
$$;

DELETE FROM cash_ledger cl
USING orders o
WHERE cl.reference_type = 'order'
  AND cl.reference_id = o.id
  AND cl.type = 'in'
  AND o.order_status NOT IN ('confirmed','processing','packing','ready','shipped','completed');
