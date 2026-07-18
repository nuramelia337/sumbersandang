/*
# Clean order ledger rows when orders are deleted

Keeps cash totals correct if an order is deleted from admin tooling or any other
trusted path.
*/

CREATE OR REPLACE FUNCTION delete_order_cash_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM cash_ledger
  WHERE reference_type = 'order'
    AND reference_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_order_cash_ledger ON orders;
CREATE TRIGGER trg_delete_order_cash_ledger
BEFORE DELETE ON orders
FOR EACH ROW
EXECUTE FUNCTION delete_order_cash_ledger();
