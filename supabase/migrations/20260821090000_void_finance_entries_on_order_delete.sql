/*
# Void finance entries when an order is deleted

Deleting an order from admin is data cleanup, not a refund. Keep its ledger
rows for audit, but exclude them from active cash totals. Cancel/return/refund
status transitions continue to create normal reversal entries.
*/

ALTER TABLE cash_ledger
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES admin_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason text;

CREATE INDEX IF NOT EXISTS idx_cash_ledger_active_date
ON cash_ledger(transaction_date DESC)
WHERE voided_at IS NULL;

/*
  Backfill orders deleted while the previous trigger was active. The explicit
  description distinguishes deletion reversals from real cancel/refund rows.
*/
WITH deleted_order_events AS (
  SELECT
    reference_id,
    MAX(created_at) AS deleted_at
  FROM cash_ledger
  WHERE reference_type = 'order'
    AND reference_id IS NOT NULL
    AND entry_kind = 'order_reversal'
    AND description LIKE 'Pembalikan penghapusan order %'
  GROUP BY reference_id
)
UPDATE cash_ledger cl
SET
  voided_at = deleted.deleted_at,
  void_reason = 'Order dihapus admin (migrasi data lama)',
  updated_at = now()
FROM deleted_order_events deleted
WHERE cl.reference_type = 'order'
  AND cl.reference_id = deleted.reference_id
  AND cl.voided_at IS NULL;

CREATE OR REPLACE FUNCTION void_order_cash_ledger_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE cash_ledger
  SET
    voided_at = now(),
    voided_by = CASE WHEN is_admin() THEN auth.uid() ELSE NULL END,
    void_reason = 'Order ' || OLD.order_number || ' dihapus dari menu Pesanan',
    updated_at = now()
  WHERE reference_type = 'order'
    AND reference_id = OLD.id
    AND voided_at IS NULL;

  UPDATE order_finance_state
  SET
    is_recognized = false,
    recognized_amount = 0,
    recognized_cost = 0,
    updated_at = now()
  WHERE order_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_order_cash_ledger ON orders;
DROP TRIGGER IF EXISTS trg_reverse_order_cash_ledger_before_delete ON orders;
DROP TRIGGER IF EXISTS trg_void_order_cash_ledger_before_delete ON orders;

CREATE TRIGGER trg_void_order_cash_ledger_before_delete
BEFORE DELETE ON orders
FOR EACH ROW
EXECUTE FUNCTION void_order_cash_ledger_before_delete();

DROP FUNCTION IF EXISTS reverse_order_cash_ledger_before_delete();
