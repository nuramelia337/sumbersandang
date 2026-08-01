/*
  # Expire pending keeps after three days

  Pending checkout orders release reserved inventory only if the admin never
  confirms/updates them within three days. Confirmed, completed, and sold
  inventory is never auto-released by this cleanup.
*/

CREATE OR REPLACE FUNCTION release_expired_keeps()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_order record;
  released_count int := 0;
BEGIN
  FOR expired_order IN
    SELECT id
    FROM orders
    WHERE keep_status = 'active'
      AND keep_expires_at IS NOT NULL
      AND keep_expires_at < now()
      AND order_status = 'pending'
  LOOP
    PERFORM transition_order_inventory(expired_order.id, 'cancelled');

    UPDATE orders
    SET keep_status = 'expired',
        order_status = 'cancelled',
        updated_at = now()
    WHERE id = expired_order.id;

    PERFORM upsert_order_cash_ledger(expired_order.id);

    released_count := released_count + 1;
  END LOOP;

  RETURN released_count;
END;
$$;

UPDATE orders
SET keep_expires_at = created_at + interval '3 days'
WHERE keep_status = 'active'
  AND order_status = 'pending'
  AND keep_expires_at IS NOT NULL
  AND keep_expires_at <= created_at + interval '25 hours';
