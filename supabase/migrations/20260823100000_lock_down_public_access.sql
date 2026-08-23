/*
  Final public-access cutover.

  Apply only after create-order and the RPC-based frontend are deployed and
  smoke-tested. The additive 0900 migration deliberately keeps legacy policies
  working so this security cutover can be zero-downtime.
*/

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(ARRAY[
        'categories','products','customers','orders','order_items','inventory_movements',
        'purchase_orders','purchase_order_items','coupons','notifications','activity_logs',
        'business_packages','business_package_items','site_settings','testimonials','admin_profiles',
        'finance_settings','cash_ledger','order_finance_state'
      ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'categories','products','customers','orders','order_items','inventory_movements',
    'purchase_orders','purchase_order_items','coupons','notifications','activity_logs',
    'business_packages','business_package_items','site_settings','testimonials','admin_profiles',
    'finance_settings','cash_ledger','order_finance_state'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY admin_all_%I ON %I FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin())',
      table_name,
      table_name
    );
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION reserve_order_items(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION transition_order_inventory(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION release_expired_keeps() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION upsert_order_cash_ledger(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reserve_order_items(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION transition_order_inventory(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION upsert_order_cash_ledger(uuid) TO service_role;

-- Table grants can remain because RLS now exposes no anon policy. Explicit
-- revokes add defense in depth for PII and write-amplification targets.
REVOKE ALL ON TABLE
  categories, products, customers, orders, order_items, inventory_movements,
  purchase_orders, purchase_order_items, coupons, notifications, activity_logs,
  business_packages, business_package_items, site_settings, testimonials,
  admin_profiles, finance_settings, cash_ledger, order_finance_state
FROM anon;
