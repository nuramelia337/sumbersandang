/*
  Supabase usage hardening

  - removes direct anonymous access to internal/PII tables
  - exposes bounded, projection-safe public RPCs
  - creates an atomic, idempotent checkout path for the create-order Edge Function
  - moves keep expiry and data retention to bounded cron jobs
  - queues replaced media for delayed deletion instead of leaking Storage objects
  - bounds the public Storage bucket to optimized image formats and sizes
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_thumbnail_paths text[] NOT NULL DEFAULT '{}';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS checkout_token uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_checkout_token
  ON orders(checkout_token)
  WHERE checkout_token IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS order_number_seq;
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;

CREATE TABLE IF NOT EXISTS checkout_rate_limits (
  key_hash text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key_hash, window_started_at)
);

CREATE TABLE IF NOT EXISTS sheet_sync_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

CREATE TABLE IF NOT EXISTS media_cleanup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL DEFAULT 'products',
  object_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'deleted', 'referenced', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  eligible_after timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  last_error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, object_path)
);

CREATE INDEX IF NOT EXISTS idx_checkout_rate_limits_updated
  ON checkout_rate_limits(updated_at);
CREATE INDEX IF NOT EXISTS idx_sheet_sync_outbox_ready
  ON sheet_sync_outbox(next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_media_cleanup_queue_ready
  ON media_cleanup_queue(eligible_after, created_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_orders_pending_keep_expiry
  ON orders(keep_expires_at, id)
  WHERE keep_status = 'active' AND order_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notifications_unread_created
  ON notifications(is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_id
  ON activity_logs(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_business_package_items_product
  ON business_package_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product
  ON order_items(product_id)
  WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po
  ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_notifications_reference
  ON notifications(reference_type, reference_id)
  WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity
  ON activity_logs(entity_type, entity_id)
  WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_public_newest
  ON products(created_at DESC, id DESC)
  WHERE status = 'active' AND availability_status = 'ready' AND stock = 1;
CREATE INDEX IF NOT EXISTS idx_products_public_price
  ON products(selling_price, id)
  WHERE status = 'active' AND availability_status = 'ready' AND stock = 1;

DELETE FROM order_finance_state ofs
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = ofs.order_id);

ALTER TABLE order_finance_state
  DROP CONSTRAINT IF EXISTS order_finance_state_order_id_fkey,
  ADD CONSTRAINT order_finance_state_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- These indexes duplicate indexes already provided by unique constraints.
DROP INDEX IF EXISTS idx_products_code;
DROP INDEX IF EXISTS idx_package_items_package;

CREATE OR REPLACE FUNCTION public_product_card_json(p products)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'product_code', p.product_code,
    'name', p.name,
    'category_id', p.category_id,
    'brand', p.brand,
    'size', p.size,
    'color', p.color,
    'condition', p.condition,
    'selling_price', p.selling_price,
    'stock', p.stock,
    'image_path', p.image_path,
    'thumbnail_path', p.thumbnail_path,
    'image_thumbnail_paths', COALESCE(p.image_thumbnail_paths, '{}'),
    'is_featured', p.is_featured,
    'status', p.status,
    'availability_status', p.availability_status,
    'created_at', p.created_at
  );
$$;

CREATE OR REPLACE FUNCTION public_product_detail_json(p products)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public_product_card_json(p) || jsonb_build_object(
    'material', p.material,
    'description', p.description,
    'images', COALESCE(p.images, '{}'),
    'tags', COALESCE(p.tags, '{}'),
    'video_url', p.video_url,
    'weight_grams', p.weight_grams,
    'updated_at', p.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION list_public_products(
  p_category_slug text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'newest',
  p_cursor jsonb DEFAULT NULL,
  p_limit integer DEFAULT 48
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  safe_limit integer := LEAST(GREATEST(COALESCE(p_limit, 48), 1), 48);
  safe_sort text := CASE WHEN p_sort IN ('newest', 'price-low', 'price-high') THEN p_sort ELSE 'newest' END;
  result jsonb;
BEGIN
  WITH filtered AS (
    SELECT p.*
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.status = 'active'
      AND p.availability_status = 'ready'
      AND p.stock = 1
      AND (NULLIF(BTRIM(p_category_slug), '') IS NULL OR c.slug = BTRIM(p_category_slug))
      AND (
        NULLIF(BTRIM(p_search), '') IS NULL
        OR p.name ILIKE '%' || BTRIM(p_search) || '%'
        OR COALESCE(p.brand, '') ILIKE '%' || BTRIM(p_search) || '%'
        OR p.product_code ILIKE '%' || BTRIM(p_search) || '%'
      )
      AND (
        p_cursor IS NULL
        OR (safe_sort = 'newest' AND (
          p.created_at < (p_cursor->>'created_at')::timestamptz
          OR (p.created_at = (p_cursor->>'created_at')::timestamptz AND p.id < (p_cursor->>'id')::uuid)
        ))
        OR (safe_sort = 'price-low' AND (
          p.selling_price > (p_cursor->>'selling_price')::numeric
          OR (p.selling_price = (p_cursor->>'selling_price')::numeric AND p.id > (p_cursor->>'id')::uuid)
        ))
        OR (safe_sort = 'price-high' AND (
          p.selling_price < (p_cursor->>'selling_price')::numeric
          OR (p.selling_price = (p_cursor->>'selling_price')::numeric AND p.id < (p_cursor->>'id')::uuid)
        ))
      )
  ), ordered AS (
    SELECT filtered.*, row_number() OVER (
      ORDER BY
        CASE WHEN safe_sort = 'newest' THEN created_at END DESC,
        CASE WHEN safe_sort = 'price-low' THEN selling_price END ASC,
        CASE WHEN safe_sort = 'price-high' THEN selling_price END DESC,
        CASE WHEN safe_sort = 'price-low' THEN id END ASC,
        id DESC
    ) AS rn
    FROM filtered
    ORDER BY
      CASE WHEN safe_sort = 'newest' THEN created_at END DESC,
      CASE WHEN safe_sort = 'price-low' THEN selling_price END ASC,
      CASE WHEN safe_sort = 'price-high' THEN selling_price END DESC,
      CASE WHEN safe_sort = 'price-low' THEN id END ASC,
      id DESC
    LIMIT safe_limit + 1
  ), page AS (
    SELECT * FROM ordered WHERE rn <= safe_limit
  ), tail AS (
    SELECT * FROM page ORDER BY rn DESC LIMIT 1
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(public_product_card_json(prod) ORDER BY page.rn)
      FROM page JOIN products prod ON prod.id = page.id
    ), '[]'::jsonb),
    'has_more', EXISTS(SELECT 1 FROM ordered WHERE rn > safe_limit),
    'next_cursor', CASE
      WHEN NOT EXISTS(SELECT 1 FROM ordered WHERE rn > safe_limit) THEN NULL
      WHEN safe_sort = 'newest' THEN (SELECT jsonb_build_object('created_at', created_at, 'id', id) FROM tail)
      ELSE (SELECT jsonb_build_object('selling_price', selling_price, 'id', id) FROM tail)
    END
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION get_public_product(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT jsonb_build_object(
      'product', public_product_detail_json(p),
      'category', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', c.id, 'name', c.name, 'slug', c.slug, 'description', c.description,
        'image_url', c.image_url, 'sort_order', c.sort_order, 'created_at', c.created_at
      ) END
    )
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.id = p_id AND p.status IN ('active', 'sold_out')
  ), 'null'::jsonb);
$$;

CREATE OR REPLACE FUNCTION list_public_packages(p_limit integer DEFAULT 12)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH available AS (
    SELECT bp.*
    FROM business_packages bp
    WHERE bp.status = 'active'
      AND bp.availability_status = 'ready'
      AND EXISTS (SELECT 1 FROM business_package_items bpi WHERE bpi.package_id = bp.id)
      AND NOT EXISTS (
        SELECT 1
        FROM business_package_items bpi
        JOIN products p ON p.id = bpi.product_id
        WHERE bpi.package_id = bp.id
          AND (p.status <> 'active' OR p.availability_status <> 'ready' OR p.stock <> 1)
      )
    ORDER BY bp.is_featured DESC, bp.created_at DESC, bp.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 12), 1), 12)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', bp.id,
    'package_code', bp.package_code,
    'name', bp.name,
    'description', bp.description,
    'price', bp.price,
    'cover_image_path', bp.cover_image_path,
    'cover_image_url', bp.cover_image_url,
    'thumbnail_path', bp.thumbnail_path,
    'is_featured', bp.is_featured,
    'availability_status', bp.availability_status,
    'status', bp.status,
    'created_at', bp.created_at,
    'updated_at', bp.updated_at,
    'item_count', (SELECT count(*) FROM business_package_items bpi WHERE bpi.package_id = bp.id)
  ) ORDER BY bp.is_featured DESC, bp.created_at DESC, bp.id DESC), '[]'::jsonb)
  FROM available bp;
$$;

CREATE OR REPLACE FUNCTION get_public_home()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'featured', COALESCE((
      SELECT jsonb_agg(item ORDER BY created_at DESC, id DESC)
      FROM (SELECT public_product_card_json(p) AS item, p.created_at, p.id FROM products p WHERE status = 'active' AND availability_status = 'ready' AND stock = 1 AND is_featured ORDER BY created_at DESC, id DESC LIMIT 8) featured_rows
    ), '[]'::jsonb),
    'latest', COALESCE((
      SELECT jsonb_agg(item ORDER BY created_at DESC, id DESC)
      FROM (SELECT public_product_card_json(p) AS item, p.created_at, p.id FROM products p WHERE status = 'active' AND availability_status = 'ready' AND stock = 1 AND NOT is_featured ORDER BY created_at DESC, id DESC LIMIT 8) latest_rows
    ), '[]'::jsonb),
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'slug', c.slug, 'description', c.description,
        'image_url', c.image_url, 'sort_order', c.sort_order, 'created_at', c.created_at
      ) ORDER BY c.sort_order, c.name)
      FROM categories c
      WHERE c.slug IN ('new-arrival', 'promo', 'normal', 'premi')
    ), '[]'::jsonb),
    'packages', list_public_packages(6),
    'testimonials', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.sort_order, t.created_at DESC)
      FROM (SELECT id, customer_name, customer_handle, message, rating, is_active, sort_order, created_at FROM testimonials WHERE is_active ORDER BY sort_order, created_at DESC LIMIT 3) t
    ), '[]'::jsonb),
    'promo_banner', COALESCE((SELECT value FROM site_settings WHERE key = 'promo_banner'), '{}'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION get_public_catalog_meta()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'slug', c.slug, 'description', c.description,
        'image_url', c.image_url, 'sort_order', c.sort_order, 'created_at', c.created_at
      ) ORDER BY c.sort_order, c.name)
      FROM categories c WHERE c.slug IN ('new-arrival', 'promo', 'normal', 'premi')
    ), '[]'::jsonb),
    'packages', list_public_packages(12)
  );
$$;

CREATE OR REPLACE FUNCTION preview_public_coupon(p_code text, p_subtotal numeric)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT jsonb_build_object(
      'valid', true,
      'discount', CASE
        WHEN c.type = 'percentage' THEN LEAST(GREATEST(p_subtotal, 0), GREATEST(p_subtotal, 0) * c.value / 100)
        ELSE LEAST(GREATEST(p_subtotal, 0), c.value)
      END,
      'min_purchase', c.min_purchase
    )
    FROM coupons c
    WHERE upper(c.code) = upper(BTRIM(COALESCE(p_code, '')))
      AND c.is_active
      AND c.valid_from <= now()
      AND (c.valid_until IS NULL OR c.valid_until >= now())
      AND (c.max_uses IS NULL OR c.used_count < c.max_uses)
      AND GREATEST(p_subtotal, 0) >= c.min_purchase
  ), jsonb_build_object('valid', false, 'discount', 0));
$$;

CREATE OR REPLACE FUNCTION get_admin_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501'; END IF;
  WITH revenue_orders AS (
    SELECT * FROM orders WHERE order_status IN ('confirmed','processing','packing','ready','shipped','completed')
  ), revenue_items AS (
    SELECT oi.* FROM order_items oi JOIN revenue_orders o ON o.id = oi.order_id
  ), order_stats AS (
    SELECT
      COALESCE(sum(total_amount) FILTER (WHERE created_at >= date_trunc('day', now())), 0) AS today_revenue,
      COALESCE(sum(total_amount) FILTER (WHERE created_at >= now() - interval '7 days'), 0) AS week_revenue,
      COALESCE(sum(total_amount) FILTER (WHERE created_at >= date_trunc('month', now())), 0) AS month_revenue,
      COALESCE(sum(total_amount) FILTER (WHERE created_at >= date_trunc('year', now())), 0) AS year_revenue,
      COALESCE(sum(total_amount), 0) AS total_revenue,
      COALESCE(avg(total_amount), 0) AS avg_order_value,
      COALESCE(sum(total_amount) FILTER (WHERE payment_method = 'bca'), 0) AS bca_revenue,
      COALESCE(sum(total_amount) FILTER (WHERE payment_method = 'dana'), 0) AS dana_revenue,
      COALESCE(sum(total_amount) FILTER (WHERE payment_method = 'shopeepay'), 0) AS shopeepay_revenue,
      COALESCE(sum(total_amount) FILTER (WHERE payment_method = 'cash'), 0) AS cash_revenue
    FROM revenue_orders
  ), item_stats AS (
    SELECT
      COALESCE(sum(quantity), 0) AS total_sold,
      COALESCE(sum(quantity) FILTER (WHERE created_at >= date_trunc('day', now())), 0) AS today_sold,
      COALESCE(sum(quantity) FILTER (WHERE item_type = 'package'), 0) AS packages_sold,
      COALESCE(sum(purchase_price * quantity), 0) AS total_cogs
    FROM revenue_items
  ), product_stats AS (
    SELECT
      count(*) AS total_products,
      count(*) FILTER (WHERE availability_status = 'reserved') AS reserved_products,
      count(*) FILTER (WHERE availability_status = 'ready' AND stock = 1) AS ready_products,
      count(*) FILTER (WHERE availability_status = 'sold' OR status = 'sold_out') AS sold_products,
      COALESCE(sum(stock), 0) AS total_stock,
      COALESCE(sum(purchase_price * stock), 0) AS inventory_value
    FROM products
  ), balance AS (
    SELECT
      COALESCE((SELECT value FROM finance_settings WHERE key = 'opening_balance'), 0)
      + COALESCE(sum(CASE WHEN type IN ('initial','in') THEN amount ELSE -amount END) FILTER (WHERE voided_at IS NULL), 0) AS total_balance
    FROM cash_ledger
  )
  SELECT jsonb_build_object(
    'stats', jsonb_build_object(
      'todayRevenue', os.today_revenue, 'weekRevenue', os.week_revenue, 'monthRevenue', os.month_revenue,
      'yearRevenue', os.year_revenue, 'totalRevenue', os.total_revenue, 'avgOrderValue', os.avg_order_value,
      'bcaRevenue', os.bca_revenue, 'danaRevenue', os.dana_revenue, 'shopeepayRevenue', os.shopeepay_revenue,
      'cashRevenue', os.cash_revenue, 'totalOrders', (SELECT count(*) FROM orders),
      'pendingOrders', (SELECT count(*) FROM orders WHERE order_status IN ('pending','confirmed')),
      'totalCustomers', (SELECT count(*) FROM customers), 'totalProducts', ps.total_products,
      'lowStock', ps.reserved_products, 'readyProducts', ps.ready_products, 'soldProducts', ps.sold_products,
      'totalStock', ps.total_stock, 'inventoryValue', ps.inventory_value, 'totalSold', ist.total_sold,
      'todaySold', ist.today_sold, 'packagesSold', ist.packages_sold, 'totalCogs', ist.total_cogs,
      'grossProfit', os.total_revenue - ist.total_cogs, 'totalBalance', b.total_balance
    ),
    'recentOrders', COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC, o.id DESC) FROM (SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT 5) o), '[]'::jsonb),
    'lowStockProducts', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.updated_at DESC, p.id DESC) FROM (SELECT * FROM products WHERE availability_status = 'reserved' ORDER BY updated_at DESC, id DESC LIMIT 5) p), '[]'::jsonb),
    'latestProducts', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC, p.id DESC) FROM (SELECT * FROM products ORDER BY created_at DESC, id DESC LIMIT 5) p), '[]'::jsonb),
    'topProducts', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(product_name, sold) ORDER BY sold DESC, product_name)
      FROM (SELECT product_name, sum(quantity) AS sold FROM revenue_items GROUP BY product_name ORDER BY sold DESC, product_name LIMIT 5) top
    ), '[]'::jsonb),
    'salesTrend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', day::date, 'total', COALESCE(day_sales.total, 0)) ORDER BY day)
      FROM generate_series(date_trunc('day', now()) - interval '6 days', date_trunc('day', now()), interval '1 day') AS days(day)
      LEFT JOIN LATERAL (SELECT sum(total_amount) AS total FROM revenue_orders WHERE created_at >= day AND created_at < day + interval '1 day') day_sales ON true
    ), '[]'::jsonb)
  ) INTO result
  FROM order_stats os CROSS JOIN item_stats ist CROSS JOIN product_stats ps CROSS JOIN balance b;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION get_admin_report(
  p_type text,
  p_start timestamptz,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  safe_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
  safe_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  summary jsonb;
  rows jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501'; END IF;
  IF p_type IN ('sales', 'profit') THEN
    WITH valid_orders AS (
      SELECT * FROM orders WHERE created_at >= p_start AND order_status IN ('confirmed','processing','packing','ready','shipped','completed')
    ), totals AS (
      SELECT count(*) AS orders, COALESCE(sum(total_amount),0) AS revenue,
        COALESCE(sum(total_amount) FILTER (WHERE payment_method='bca'),0) AS bca,
        COALESCE(sum(total_amount) FILTER (WHERE payment_method='dana'),0) AS dana,
        COALESCE(sum(total_amount) FILTER (WHERE payment_method='shopeepay'),0) AS shopeepay,
        COALESCE(sum(total_amount) FILTER (WHERE payment_method='cash'),0) AS cash
      FROM valid_orders
    ), item_totals AS (
      SELECT count(*) AS items, COALESCE(sum(oi.purchase_price * oi.quantity),0) AS cogs
      FROM order_items oi JOIN valid_orders o ON o.id=oi.order_id
    )
    SELECT jsonb_build_object('revenue',t.revenue,'cogs',i.cogs,'profit',t.revenue-i.cogs,'orders',t.orders,'items',i.items,
      'bcaRevenue',t.bca,'danaRevenue',t.dana,'shopeepayRevenue',t.shopeepay,'cashRevenue',t.cash)
    INTO summary FROM totals t CROSS JOIN item_totals i;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('date',o.created_at,'order',o.order_number,'customer',o.customer_name,'total',o.total_amount,'status',o.order_status,'payment',o.payment_method) ORDER BY o.created_at DESC,o.id DESC),'[]'::jsonb)
    INTO rows FROM (SELECT * FROM orders WHERE created_at >= p_start AND order_status IN ('confirmed','processing','packing','ready','shipped','completed') ORDER BY created_at DESC,id DESC LIMIT safe_limit OFFSET safe_offset) o;
  ELSIF p_type = 'inventory' THEN
    SELECT jsonb_build_object('revenue',COALESCE(sum(selling_price*stock),0),'cogs',COALESCE(sum(purchase_price*stock),0),
      'profit',COALESCE(sum((selling_price-purchase_price)*stock),0),'orders',count(*),'items',COALESCE(sum(stock),0),
      'bcaRevenue',0,'danaRevenue',0,'shopeepayRevenue',0,'cashRevenue',0) INTO summary FROM products;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('date',p.created_at,'order',p.product_code,'customer',p.name,'total',p.selling_price,
      'status',CASE WHEN p.availability_status='reserved' THEN 'Reserved' WHEN p.availability_status='sold' OR p.status='sold_out' OR p.stock=0 THEN 'Sold' ELSE 'Ready' END,
      'payment',p.condition) ORDER BY p.created_at DESC,p.id DESC),'[]'::jsonb)
    INTO rows FROM (SELECT * FROM products ORDER BY created_at DESC,id DESC LIMIT safe_limit OFFSET safe_offset) p;
  ELSIF p_type = 'customer' THEN
    WITH customer_totals AS (
      SELECT c.id,c.name,c.phone,c.city,c.created_at,count(o.id) AS order_count,COALESCE(sum(o.total_amount),0) AS spending
      FROM customers c LEFT JOIN orders o ON o.customer_id=c.id AND o.created_at>=p_start AND o.order_status IN ('confirmed','processing','packing','ready','shipped','completed')
      GROUP BY c.id
    )
    SELECT jsonb_build_object('revenue',COALESCE(sum(spending),0),'cogs',0,'profit',COALESCE(sum(spending),0),'orders',count(*),'items',COALESCE(sum(order_count),0),
      'bcaRevenue',0,'danaRevenue',0,'shopeepayRevenue',0,'cashRevenue',0) INTO summary FROM customer_totals;
    WITH customer_totals AS (
      SELECT c.id,c.name,c.phone,c.city,c.created_at,count(o.id) AS order_count,COALESCE(sum(o.total_amount),0) AS spending
      FROM customers c LEFT JOIN orders o ON o.customer_id=c.id AND o.created_at>=p_start AND o.order_status IN ('confirmed','processing','packing','ready','shipped','completed')
      GROUP BY c.id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('date',c.created_at,'order',c.phone,'customer',c.name,'total',c.spending,'status',c.order_count||' orders','payment',COALESCE(c.city,'-')) ORDER BY c.spending DESC,c.id),'[]'::jsonb)
    INTO rows FROM (SELECT * FROM customer_totals ORDER BY spending DESC,id LIMIT safe_limit OFFSET safe_offset) c;
  ELSE
    RAISE EXCEPTION 'Invalid report type';
  END IF;
  RETURN jsonb_build_object('summary',summary,'data',rows);
END;
$$;

CREATE OR REPLACE FUNCTION get_admin_finance_summary(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  opening numeric := COALESCE((SELECT value FROM finance_settings WHERE key = 'opening_balance'), 0);
  period_opening numeric;
  cash_in numeric;
  cash_out numeric;
  operational numeric;
  gross_profit numeric;
  ledger_rows jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501'; END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN RAISE EXCEPTION 'Invalid date range'; END IF;
  SELECT opening + COALESCE(sum(CASE WHEN type='in' THEN amount WHEN type IN ('out','operational') THEN -amount ELSE 0 END),0)
  INTO period_opening FROM cash_ledger WHERE voided_at IS NULL AND p_from IS NOT NULL AND transaction_date < p_from;
  IF p_from IS NULL THEN period_opening := opening; END IF;
  SELECT
    COALESCE(sum(amount) FILTER (WHERE type='in'),0),
    COALESCE(sum(amount) FILTER (WHERE type IN ('out','operational')),0),
    COALESCE(sum(amount) FILTER (WHERE type='operational'),0),
    COALESCE(sum(CASE WHEN reference_type='order' AND type='in' THEN amount-cost_amount WHEN reference_type='order' AND type='out' THEN -(amount-cost_amount) ELSE 0 END),0)
  INTO cash_in,cash_out,operational,gross_profit
  FROM cash_ledger
  WHERE voided_at IS NULL AND (p_from IS NULL OR transaction_date>=p_from) AND (p_to IS NULL OR transaction_date<=p_to);
  SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.transaction_date DESC,l.created_at DESC,l.id DESC),'[]'::jsonb)
  INTO ledger_rows FROM (
    SELECT * FROM cash_ledger WHERE voided_at IS NULL AND (p_from IS NULL OR transaction_date>=p_from) AND (p_to IS NULL OR transaction_date<=p_to)
    ORDER BY transaction_date DESC,created_at DESC,id DESC LIMIT 500
  ) l;
  RETURN jsonb_build_object(
    'baseOpeningBalance',opening,'periodOpeningBalance',period_opening,'cashIn',cash_in,'cashOut',cash_out,
    'closingBalance',period_opening+cash_in-cash_out,'totalBalance',period_opening+cash_in-cash_out,
    'grossSalesProfit',gross_profit,'operationalExpenses',operational,'netOperatingProfit',gross_profit-operational,
    'ledger',ledger_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION consume_checkout_rate_limit(
  p_key_hash text,
  p_limit integer DEFAULT 10,
  p_window_seconds integer DEFAULT 600
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bucket timestamptz;
  new_count integer;
BEGIN
  IF p_key_hash IS NULL OR length(p_key_hash) < 32 THEN
    RAISE EXCEPTION 'Invalid rate-limit key';
  END IF;

  bucket := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  INSERT INTO checkout_rate_limits(key_hash, window_started_at, request_count)
  VALUES (p_key_hash, bucket, 1)
  ON CONFLICT (key_hash, window_started_at)
  DO UPDATE SET request_count = checkout_rate_limits.request_count + 1, updated_at = now()
  RETURNING request_count INTO new_count;

  RETURN new_count <= LEAST(GREATEST(p_limit, 1), 100);
END;
$$;

CREATE OR REPLACE FUNCTION create_checkout_order_internal(
  p_request_id uuid,
  p_customer jsonb,
  p_shipping_method text,
  p_payment_method text,
  p_coupon_code text,
  p_notes text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_order orders%ROWTYPE;
  created_order orders%ROWTYPE;
  customer_id uuid;
  normalized_phone text := regexp_replace(COALESCE(p_customer->>'phone', ''), '[^0-9]', '', 'g');
  customer_name text := left(BTRIM(COALESCE(p_customer->>'name', '')), 120);
  item jsonb;
  item_kind text;
  item_id uuid;
  product_row products%ROWTYPE;
  package_row business_packages%ROWTYPE;
  coupon_row coupons%ROWTYPE;
  required_product_ids uuid[] := '{}';
  package_snapshot jsonb;
  subtotal_amount numeric(14,2) := 0;
  discount_amount numeric(14,2) := 0;
  item_count integer;
  total_required integer;
  unique_required integer;
  pending_count integer;
  package_cogs numeric(14,2);
  order_no text;
  invoice_no text;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request id is required'; END IF;

  IF normalized_phone LIKE '0%' THEN normalized_phone := '62' || substr(normalized_phone, 2); END IF;

  SELECT * INTO existing_order FROM orders WHERE checkout_token = p_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', existing_order.id,
      'order_number', existing_order.order_number,
      'invoice_number', existing_order.invoice_number,
      'subtotal', existing_order.subtotal,
      'discount_amount', existing_order.discount_amount,
      'total_amount', existing_order.total_amount,
      'shipping_method', existing_order.shipping_method,
      'payment_method', existing_order.payment_method,
      'idempotent_replay', true
    );
  END IF;

  IF customer_name = '' OR length(normalized_phone) < 8 OR length(normalized_phone) > 16 THEN
    RAISE EXCEPTION 'Customer name or phone is invalid';
  END IF;
  IF p_shipping_method NOT IN ('pickup', 'jnt', 'spx', 'maxim') THEN RAISE EXCEPTION 'Invalid shipping method'; END IF;
  IF p_payment_method NOT IN ('bca', 'dana', 'shopeepay', 'cash') THEN RAISE EXCEPTION 'Invalid payment method'; END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'Items must be an array'; END IF;

  item_count := jsonb_array_length(p_items);
  IF item_count < 1 OR item_count > 20 THEN RAISE EXCEPTION 'Checkout accepts 1 to 20 items'; END IF;

  SELECT count(*) INTO pending_count
  FROM orders
  WHERE customer_phone = normalized_phone
    AND order_status IN ('pending', 'confirmed')
    AND created_at >= now() - interval '24 hours';
  IF pending_count >= 3 THEN RAISE EXCEPTION 'Too many pending orders for this phone number'; END IF;

  IF (SELECT count(*) FROM (SELECT DISTINCT value->>'kind', value->>'id' FROM jsonb_array_elements(p_items)) d) <> item_count THEN
    RAISE EXCEPTION 'Duplicate checkout item';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    item_kind := item->>'kind';
    BEGIN item_id := (item->>'id')::uuid; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid item id'; END;

    IF item_kind = 'product' THEN
      SELECT * INTO product_row FROM products WHERE id = item_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
      subtotal_amount := subtotal_amount + product_row.selling_price;
      required_product_ids := array_append(required_product_ids, product_row.id);
    ELSIF item_kind = 'package' THEN
      SELECT * INTO package_row FROM business_packages WHERE id = item_id;
      IF NOT FOUND OR package_row.status <> 'active' OR package_row.availability_status <> 'ready' THEN
        RAISE EXCEPTION 'Package is unavailable';
      END IF;
      subtotal_amount := subtotal_amount + package_row.price;
      required_product_ids := required_product_ids || ARRAY(
        SELECT bpi.product_id FROM business_package_items bpi WHERE bpi.package_id = package_row.id ORDER BY bpi.product_id
      );
    ELSE
      RAISE EXCEPTION 'Invalid item kind';
    END IF;
  END LOOP;

  SELECT count(*), count(DISTINCT id) INTO total_required, unique_required FROM unnest(required_product_ids) AS ids(id);
  IF total_required = 0 OR total_required > 100 THEN
    RAISE EXCEPTION 'Checkout contains too many underlying products';
  END IF;
  IF total_required <> unique_required THEN
    RAISE EXCEPTION 'Products overlap between checkout items';
  END IF;

  PERFORM id FROM products WHERE id = ANY(required_product_ids) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM products WHERE id = ANY(required_product_ids) AND status = 'active' AND availability_status = 'ready' AND stock = 1) <> total_required THEN
    RAISE EXCEPTION 'One or more products are no longer available';
  END IF;

  IF NULLIF(BTRIM(COALESCE(p_coupon_code, '')), '') IS NOT NULL THEN
    SELECT * INTO coupon_row
    FROM coupons
    WHERE upper(code) = upper(BTRIM(p_coupon_code))
      AND is_active
      AND valid_from <= now()
      AND (valid_until IS NULL OR valid_until >= now())
      AND (max_uses IS NULL OR used_count < max_uses)
    FOR UPDATE;
    IF NOT FOUND OR subtotal_amount < coupon_row.min_purchase THEN RAISE EXCEPTION 'Coupon is invalid'; END IF;
    discount_amount := CASE
      WHEN coupon_row.type = 'percentage' THEN LEAST(subtotal_amount, subtotal_amount * coupon_row.value / 100)
      ELSE LEAST(subtotal_amount, coupon_row.value)
    END;
  END IF;

  INSERT INTO customers(name, phone, address, city, province, notes, updated_at)
  VALUES (
    customer_name,
    normalized_phone,
    NULLIF(left(BTRIM(COALESCE(p_customer->>'address', '')), 500), ''),
    NULLIF(left(BTRIM(COALESCE(p_customer->>'city', '')), 100), ''),
    NULLIF(left(BTRIM(COALESCE(p_customer->>'province', '')), 100), ''),
    CASE WHEN NULLIF(BTRIM(COALESCE(p_customer->>'instagram', '')), '') IS NULL THEN NULL ELSE 'IG: ' || left(BTRIM(p_customer->>'instagram'), 80) END,
    now()
  )
  ON CONFLICT (phone) DO UPDATE SET
    name = EXCLUDED.name,
    address = COALESCE(EXCLUDED.address, customers.address),
    city = COALESCE(EXCLUDED.city, customers.city),
    province = COALESCE(EXCLUDED.province, customers.province),
    notes = COALESCE(EXCLUDED.notes, customers.notes),
    updated_at = now()
  RETURNING id INTO customer_id;

  order_no := 'ORD' || to_char(now(), 'YYYYMMDD') || lpad(nextval('order_number_seq')::text, 8, '0');
  invoice_no := 'INV' || to_char(now(), 'YYYYMMDD') || lpad(nextval('invoice_number_seq')::text, 8, '0');

  INSERT INTO orders(
    order_number, invoice_number, checkout_token, customer_id, customer_name, customer_phone,
    customer_address, customer_city, customer_province, shipping_method, shipping_cost,
    subtotal, discount_amount, total_amount, payment_method, payment_status, order_status,
    coupon_code, notes, estimated_delivery, shipping_note, keep_expires_at, keep_status
  ) VALUES (
    order_no, invoice_no, p_request_id, customer_id, customer_name, normalized_phone,
    NULLIF(left(BTRIM(COALESCE(p_customer->>'address', '')), 500), ''),
    NULLIF(left(BTRIM(COALESCE(p_customer->>'city', '')), 100), ''),
    NULLIF(left(BTRIM(COALESCE(p_customer->>'province', '')), 100), ''),
    p_shipping_method, 0, subtotal_amount, discount_amount, subtotal_amount - discount_amount,
    p_payment_method, 'pending', 'pending', NULLIF(upper(BTRIM(COALESCE(p_coupon_code, ''))), ''),
    NULLIF(left(BTRIM(COALESCE(p_notes, '')), 500), ''),
    CASE WHEN p_shipping_method = 'pickup' AND (p_customer->>'pickup_date') ~ '^\d{4}-\d{2}-\d{2}$' THEN (p_customer->>'pickup_date')::date ELSE NULL END,
    CASE WHEN p_shipping_method = 'pickup' THEN left(BTRIM(COALESCE(p_customer->>'pickup_date', '') || ' ' || COALESCE(p_customer->>'pickup_time', '')), 40) ELSE NULL END,
    CASE WHEN p_shipping_method = 'pickup' THEN NULL ELSE now() + interval '3 days' END,
    'active'
  ) RETURNING * INTO created_order;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    item_kind := item->>'kind';
    item_id := (item->>'id')::uuid;
    IF item_kind = 'product' THEN
      SELECT * INTO product_row FROM products WHERE id = item_id;
      INSERT INTO order_items(order_id, item_type, product_id, package_id, product_code, product_name, quantity, unit_price, purchase_price, subtotal, package_items_snapshot)
      VALUES (created_order.id, 'product', product_row.id, NULL, product_row.product_code, product_row.name, 1, product_row.selling_price, product_row.purchase_price, product_row.selling_price, '[]');
    ELSE
      SELECT * INTO package_row FROM business_packages WHERE id = item_id FOR UPDATE;
      SELECT
        COALESCE(sum(p.purchase_price), 0),
        COALESCE(jsonb_agg(jsonb_build_object('product_id', p.id, 'product_code', p.product_code, 'product_name', p.name, 'purchase_price', p.purchase_price) ORDER BY p.id), '[]'::jsonb)
      INTO package_cogs, package_snapshot
      FROM business_package_items bpi JOIN products p ON p.id = bpi.product_id
      WHERE bpi.package_id = package_row.id;
      INSERT INTO order_items(order_id, item_type, product_id, package_id, product_code, product_name, quantity, unit_price, purchase_price, subtotal, package_items_snapshot)
      VALUES (created_order.id, 'package', NULL, package_row.id, package_row.package_code, package_row.name, 1, package_row.price, package_cogs, package_row.price, package_snapshot);
    END IF;
  END LOOP;

  PERFORM reserve_order_items(created_order.id);

  IF coupon_row.id IS NOT NULL THEN UPDATE coupons SET used_count = used_count + 1 WHERE id = coupon_row.id; END IF;

  INSERT INTO notifications(type, title, message, reference_type, reference_id)
  VALUES ('new_order', 'Pesanan Baru', customer_name || ' - ' || order_no || ' - Rp' || round(created_order.total_amount)::text, 'order', created_order.id);
  INSERT INTO activity_logs(action, entity_type, entity_id, description, metadata)
  VALUES ('order_created', 'order', created_order.id, 'Order ' || order_no || ' created through secure checkout', jsonb_build_object('source', 'create-order'));
  INSERT INTO sheet_sync_outbox(order_id) VALUES (created_order.id) ON CONFLICT (order_id) DO NOTHING;

  RETURN jsonb_build_object(
    'id', created_order.id,
    'order_number', created_order.order_number,
    'invoice_number', created_order.invoice_number,
    'subtotal', created_order.subtotal,
    'discount_amount', created_order.discount_amount,
    'total_amount', created_order.total_amount,
    'shipping_method', created_order.shipping_method,
    'payment_method', created_order.payment_method,
    'idempotent_replay', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION release_expired_keeps_batch(p_limit integer DEFAULT 200)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_order record;
  released_count integer := 0;
BEGIN
  FOR expired_order IN
    SELECT id
    FROM orders
    WHERE keep_status = 'active'
      AND keep_expires_at IS NOT NULL
      AND keep_expires_at < now()
      AND order_status = 'pending'
      AND COALESCE(shipping_method, '') <> 'pickup'
    ORDER BY keep_expires_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500)
  LOOP
    PERFORM transition_order_inventory(expired_order.id, 'cancelled');
    UPDATE orders SET keep_status = 'expired', order_status = 'cancelled', updated_at = now() WHERE id = expired_order.id;
    released_count := released_count + 1;
  END LOOP;
  RETURN released_count;
END;
$$;

CREATE OR REPLACE FUNCTION release_expired_keeps()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT release_expired_keeps_batch(200); $$;

CREATE OR REPLACE FUNCTION cleanup_supabase_usage()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  read_notifications integer;
  stale_notifications integer;
  old_logs integer;
  old_outbox integer;
  old_limits integer;
BEGIN
  WITH doomed AS (SELECT ctid FROM notifications WHERE is_read AND created_at < now() - interval '90 days' LIMIT 5000)
  DELETE FROM notifications n USING doomed d WHERE n.ctid = d.ctid;
  GET DIAGNOSTICS read_notifications = ROW_COUNT;

  WITH doomed AS (SELECT ctid FROM notifications WHERE NOT is_read AND created_at < now() - interval '365 days' LIMIT 5000)
  DELETE FROM notifications n USING doomed d WHERE n.ctid = d.ctid;
  GET DIAGNOSTICS stale_notifications = ROW_COUNT;

  WITH doomed AS (SELECT ctid FROM activity_logs WHERE created_at < now() - interval '365 days' LIMIT 5000)
  DELETE FROM activity_logs a USING doomed d WHERE a.ctid = d.ctid;
  GET DIAGNOSTICS old_logs = ROW_COUNT;

  DELETE FROM sheet_sync_outbox
  WHERE (status = 'succeeded' AND processed_at < now() - interval '30 days')
     OR (status = 'failed' AND updated_at < now() - interval '90 days');
  GET DIAGNOSTICS old_outbox = ROW_COUNT;

  DELETE FROM checkout_rate_limits WHERE updated_at < now() - interval '1 day';
  GET DIAGNOSTICS old_limits = ROW_COUNT;

  RETURN jsonb_build_object(
    'read_notifications', read_notifications,
    'stale_notifications', stale_notifications,
    'activity_logs', old_logs,
    'sheet_outbox', old_outbox,
    'rate_limits', old_limits
  );
END;
$$;

CREATE OR REPLACE FUNCTION storage_path_from_value(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_value IS NULL OR BTRIM(p_value) = '' THEN NULL
    WHEN p_value LIKE 'http%/storage/v1/object/public/products/%'
      THEN split_part(p_value, '/storage/v1/object/public/products/', 2)
    WHEN p_value LIKE 'http%' THEN NULL
    ELSE p_value
  END;
$$;

CREATE OR REPLACE FUNCTION enqueue_media_cleanup(p_path text, p_delay interval DEFAULT interval '30 days')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE normalized text := storage_path_from_value(p_path);
BEGIN
  IF normalized IS NULL OR normalized LIKE '../%' OR normalized LIKE '/%' THEN RETURN; END IF;
  INSERT INTO media_cleanup_queue(bucket_id, object_path, eligible_after, status, attempts, last_error, processed_at, updated_at)
  VALUES ('products', normalized, now() + p_delay, 'pending', 0, NULL, NULL, now())
  ON CONFLICT (bucket_id, object_path) DO UPDATE SET
    eligible_after = LEAST(media_cleanup_queue.eligible_after, EXCLUDED.eligible_after),
    status = CASE WHEN media_cleanup_queue.status = 'deleted' THEN 'deleted' ELSE 'pending' END,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION queue_replaced_product_media()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE path text; new_paths text[] := '{}';
BEGIN
  IF TG_OP = 'DELETE' THEN
    new_paths := '{}';
  ELSE
    new_paths := COALESCE(NEW.images, '{}') || COALESCE(NEW.image_thumbnail_paths, '{}') || ARRAY[NEW.image_path, NEW.thumbnail_path];
  END IF;
  FOR path IN SELECT unnest(COALESCE(OLD.images, '{}') || COALESCE(OLD.image_thumbnail_paths, '{}') || ARRAY[OLD.image_path, OLD.thumbnail_path])
  LOOP
    IF path IS NOT NULL AND NOT (storage_path_from_value(path) = ANY(ARRAY(SELECT storage_path_from_value(x) FROM unnest(new_paths) x WHERE x IS NOT NULL))) THEN
      PERFORM enqueue_media_cleanup(path);
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION queue_replaced_package_media()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM enqueue_media_cleanup(OLD.cover_image_path);
    PERFORM enqueue_media_cleanup(OLD.thumbnail_path);
    RETURN OLD;
  END IF;
  IF OLD.cover_image_path IS DISTINCT FROM NEW.cover_image_path THEN PERFORM enqueue_media_cleanup(OLD.cover_image_path); END IF;
  IF OLD.thumbnail_path IS DISTINCT FROM NEW.thumbnail_path THEN PERFORM enqueue_media_cleanup(OLD.thumbnail_path); END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION queue_replaced_banner_media()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE old_image text; new_image text;
BEGIN
  IF OLD.key <> 'promo_banner' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  old_image := OLD.value->>'image_url';
  IF TG_OP <> 'DELETE' THEN new_image := NEW.value->>'image_url'; END IF;
  IF storage_path_from_value(old_image) IS DISTINCT FROM storage_path_from_value(new_image) THEN PERFORM enqueue_media_cleanup(old_image); END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_replaced_product_media ON products;
CREATE TRIGGER trg_queue_replaced_product_media AFTER UPDATE OF images, image_path, thumbnail_path, image_thumbnail_paths OR DELETE ON products FOR EACH ROW EXECUTE FUNCTION queue_replaced_product_media();
DROP TRIGGER IF EXISTS trg_queue_replaced_package_media ON business_packages;
CREATE TRIGGER trg_queue_replaced_package_media AFTER UPDATE OF cover_image_path, thumbnail_path OR DELETE ON business_packages FOR EACH ROW EXECUTE FUNCTION queue_replaced_package_media();
DROP TRIGGER IF EXISTS trg_queue_replaced_banner_media ON site_settings;
CREATE TRIGGER trg_queue_replaced_banner_media AFTER UPDATE OF value OR DELETE ON site_settings FOR EACH ROW EXECUTE FUNCTION queue_replaced_banner_media();

CREATE OR REPLACE FUNCTION media_path_is_referenced(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM products p
    WHERE storage_path_from_value(p.image_path) = storage_path_from_value(p_path)
       OR storage_path_from_value(p.thumbnail_path) = storage_path_from_value(p_path)
       OR EXISTS (SELECT 1 FROM unnest(COALESCE(p.images, '{}')) x WHERE storage_path_from_value(x) = storage_path_from_value(p_path))
       OR EXISTS (SELECT 1 FROM unnest(COALESCE(p.image_thumbnail_paths, '{}')) x WHERE storage_path_from_value(x) = storage_path_from_value(p_path))
    UNION ALL
    SELECT 1 FROM business_packages bp
    WHERE storage_path_from_value(bp.cover_image_path) = storage_path_from_value(p_path)
       OR storage_path_from_value(bp.thumbnail_path) = storage_path_from_value(p_path)
    UNION ALL
    SELECT 1 FROM site_settings s
    WHERE s.key = 'promo_banner' AND storage_path_from_value(s.value->>'image_url') = storage_path_from_value(p_path)
  );
$$;

CREATE OR REPLACE FUNCTION compact_activity_log_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE before_row jsonb := NEW.metadata->'before'; after_row jsonb := NEW.metadata->'after';
BEGIN
  IF before_row IS NOT NULL OR after_row IS NOT NULL THEN
    NEW.metadata := (COALESCE(NEW.metadata, '{}'::jsonb) - 'before' - 'after') || jsonb_build_object(
      'before', jsonb_strip_nulls(jsonb_build_object(
        'id',before_row->'id','type',before_row->'type','amount',before_row->'amount','cost_amount',before_row->'cost_amount',
        'description',before_row->'description','payment_method',before_row->'payment_method','transaction_date',before_row->'transaction_date'
      )),
      'after', jsonb_strip_nulls(jsonb_build_object(
        'id',after_row->'id','type',after_row->'type','amount',after_row->'amount','cost_amount',after_row->'cost_amount',
        'description',after_row->'description','payment_method',after_row->'payment_method','transaction_date',after_row->'transaction_date'
      ))
    );
  END IF;
  IF octet_length(COALESCE(NEW.metadata, '{}'::jsonb)::text) > 8192 THEN
    NEW.metadata := jsonb_build_object('truncated',true,'original_bytes',octet_length(NEW.metadata::text));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compact_activity_log_metadata ON activity_logs;
CREATE TRIGGER trg_compact_activity_log_metadata BEFORE INSERT OR UPDATE OF metadata ON activity_logs FOR EACH ROW EXECUTE FUNCTION compact_activity_log_metadata();

-- Avoid finance writes/dead tuples when one of the watched columns is assigned its existing value.
DROP TRIGGER IF EXISTS trg_sync_order_cash_ledger ON orders;
DROP TRIGGER IF EXISTS trg_sync_order_cash_ledger_insert ON orders;
DROP TRIGGER IF EXISTS trg_sync_order_cash_ledger_update ON orders;
CREATE TRIGGER trg_sync_order_cash_ledger_insert
AFTER INSERT ON orders FOR EACH ROW EXECUTE FUNCTION sync_order_cash_ledger_trigger();
CREATE TRIGGER trg_sync_order_cash_ledger_update
AFTER UPDATE OF order_status, total_amount, payment_method, payment_confirmed_at ON orders
FOR EACH ROW
WHEN (
  OLD.order_status IS DISTINCT FROM NEW.order_status
  OR OLD.total_amount IS DISTINCT FROM NEW.total_amount
  OR OLD.payment_method IS DISTINCT FROM NEW.payment_method
  OR OLD.payment_confirmed_at IS DISTINCT FROM NEW.payment_confirmed_at
)
EXECUTE FUNCTION sync_order_cash_ledger_trigger();

-- New internal tables are private immediately. Existing application policies
-- are locked down by the follow-up migration after the new frontend is live.
ALTER TABLE checkout_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheet_sync_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_cleanup_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_sheet_sync_outbox ON sheet_sync_outbox;
CREATE POLICY admin_all_sheet_sync_outbox ON sheet_sync_outbox FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS admin_all_media_cleanup_queue ON media_cleanup_queue;
CREATE POLICY admin_all_media_cleanup_queue ON media_cleanup_queue FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Restrict oversized/bypass uploads at the bucket itself. Existing objects are unaffected.
UPDATE storage.buckets
SET file_size_limit = 1048576,
    allowed_mime_types = ARRAY['image/jpeg', 'image/webp']::text[]
WHERE id = 'products';

REVOKE ALL ON FUNCTION public_product_card_json(products) FROM PUBLIC;
REVOKE ALL ON FUNCTION public_product_detail_json(products) FROM PUBLIC;
REVOKE ALL ON FUNCTION list_public_products(text, text, text, jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_public_product(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION list_public_packages(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_public_home() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_public_catalog_meta() FROM PUBLIC;
REVOKE ALL ON FUNCTION preview_public_coupon(text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_admin_dashboard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_admin_report(text, timestamptz, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_admin_finance_summary(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION list_public_products(text, text, text, jsonb, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_public_product(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION list_public_packages(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_public_home() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_public_catalog_meta() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION preview_public_coupon(text, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_admin_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_report(text, timestamptz, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_finance_summary(date, date) TO authenticated;

REVOKE ALL ON FUNCTION consume_checkout_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION create_checkout_order_internal(uuid, jsonb, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_checkout_rate_limit(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION create_checkout_order_internal(uuid, jsonb, text, text, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION release_expired_keeps_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cleanup_supabase_usage() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION enqueue_media_cleanup(text, interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION media_path_is_referenced(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION release_expired_keeps_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_supabase_usage() TO service_role;
GRANT EXECUTE ON FUNCTION enqueue_media_cleanup(text, interval) TO service_role;
GRANT EXECUTE ON FUNCTION media_path_is_referenced(text) TO service_role;

-- Some installations no longer have every legacy helper below. In particular,
-- 20260821090000_void_finance_entries_on_order_delete.sql intentionally drops
-- reverse_order_cash_ledger_before_delete(). Guard privilege changes so this
-- migration remains safe to rerun across those schema versions.
DO $$
DECLARE
  function_signature text;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.next_product_code()',
    'public.increment_customer_stats(uuid,numeric)',
    'public.set_product_availability_from_order(uuid,text)',
    'public.delete_order_cash_ledger()',
    'public.sync_order_cash_ledger_trigger()',
    'public.reverse_order_cash_ledger_before_delete()',
    'public.void_order_cash_ledger_before_delete()',
    'public.validate_manual_cash_transaction(text,numeric,text,text,date)'
  ]
  LOOP
    IF to_regprocedure(function_signature) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon',
        function_signature
      );
    END IF;
  END LOOP;

  FOREACH function_signature IN ARRAY ARRAY[
    'public.increment_customer_stats(uuid,numeric)',
    'public.set_product_availability_from_order(uuid,text)',
    'public.delete_order_cash_ledger()',
    'public.sync_order_cash_ledger_trigger()',
    'public.reverse_order_cash_ledger_before_delete()',
    'public.void_order_cash_ledger_before_delete()'
  ]
  LOOP
    IF to_regprocedure(function_signature) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION %s FROM authenticated',
        function_signature
      );
    END IF;
  END LOOP;

  IF to_regprocedure('public.next_product_code()') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.next_product_code() TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.increment_customer_stats(uuid,numeric)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.increment_customer_stats(uuid, numeric) TO service_role';
  END IF;
END $$;

REVOKE ALL ON FUNCTION storage_path_from_value(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION queue_replaced_product_media() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION queue_replaced_package_media() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION queue_replaced_banner_media() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION compact_activity_log_metadata() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'release-expired-keeps-hourly') THEN
    PERFORM cron.unschedule('release-expired-keeps-hourly');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-supabase-usage-daily') THEN
    PERFORM cron.unschedule('cleanup-supabase-usage-daily');
  END IF;
END $$;

SELECT cron.schedule('release-expired-keeps-hourly', '17 * * * *', $$SELECT public.release_expired_keeps_batch(200);$$);
SELECT cron.schedule('cleanup-supabase-usage-daily', '43 2 * * *', $$SELECT public.cleanup_supabase_usage();$$);

ANALYZE products;
ANALYZE orders;
ANALYZE notifications;
ANALYZE activity_logs;
