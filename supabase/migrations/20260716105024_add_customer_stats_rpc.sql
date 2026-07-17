/*
# Add increment_customer_stats RPC

## Summary
Creates a stored procedure to atomically increment a customer's total_orders and total_spending.

## Functions
- `increment_customer_stats(p_customer_id uuid, p_amount numeric)` — increments total_orders by 1 and adds p_amount to total_spending
*/

CREATE OR REPLACE FUNCTION increment_customer_stats(p_customer_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE customers
  SET total_orders = total_orders + 1,
      total_spending = total_spending + p_amount,
      updated_at = now()
  WHERE id = p_customer_id;
END;
$$;
