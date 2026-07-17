/*
# Fix multi-stock reservation behavior

Checkout should reserve only the purchased quantity. Products with remaining
stock stay visible as ready; products with no remaining stock become reserved
until the order is completed or released.
*/

CREATE OR REPLACE FUNCTION reserve_order_items(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item record;
  stock_after int;
BEGIN
  FOR item IN
    SELECT * FROM order_items WHERE order_id = p_order_id
  LOOP
    IF item.item_type = 'package' AND item.package_id IS NOT NULL THEN
      UPDATE business_packages
      SET availability_status = 'reserved',
          updated_at = now()
      WHERE id = item.package_id;

      UPDATE products p
      SET stock = greatest(0, p.stock - 1),
          availability_status = CASE WHEN greatest(0, p.stock - 1) > 0 THEN 'ready' ELSE 'reserved' END,
          status = CASE WHEN greatest(0, p.stock - 1) > 0 THEN 'active' ELSE p.status END,
          updated_at = now()
      FROM business_package_items bpi
      WHERE bpi.package_id = item.package_id
        AND bpi.product_id = p.id;
    ELSIF item.product_id IS NOT NULL THEN
      UPDATE products
      SET stock = greatest(0, stock - item.quantity),
          availability_status = CASE WHEN greatest(0, stock - item.quantity) > 0 THEN 'ready' ELSE 'reserved' END,
          status = CASE WHEN greatest(0, stock - item.quantity) > 0 THEN 'active' ELSE status END,
          updated_at = now()
      WHERE id = item.product_id
      RETURNING stock INTO stock_after;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION transition_order_inventory(p_order_id uuid, p_order_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item record;
BEGIN
  IF p_order_status = 'completed' THEN
    FOR item IN
      SELECT * FROM order_items WHERE order_id = p_order_id
    LOOP
      IF item.item_type = 'package' AND item.package_id IS NOT NULL THEN
        UPDATE business_packages
        SET availability_status = 'sold',
            status = 'sold_out',
            updated_at = now()
        WHERE id = item.package_id;

        UPDATE products p
        SET availability_status = CASE WHEN p.stock > 0 THEN 'ready' ELSE 'sold' END,
            status = CASE WHEN p.stock > 0 THEN 'active' ELSE 'sold_out' END,
            updated_at = now()
        FROM business_package_items bpi
        WHERE bpi.package_id = item.package_id
          AND bpi.product_id = p.id;
      ELSIF item.product_id IS NOT NULL THEN
        UPDATE products
        SET availability_status = CASE WHEN stock > 0 THEN 'ready' ELSE 'sold' END,
            status = CASE WHEN stock > 0 THEN 'active' ELSE 'sold_out' END,
            updated_at = now()
        WHERE id = item.product_id;
      END IF;
    END LOOP;
  ELSIF p_order_status IN ('cancelled','returned','refunded') THEN
    FOR item IN
      SELECT * FROM order_items WHERE order_id = p_order_id
    LOOP
      IF item.item_type = 'package' AND item.package_id IS NOT NULL THEN
        UPDATE business_packages
        SET availability_status = 'ready',
            status = 'active',
            updated_at = now()
        WHERE id = item.package_id
          AND availability_status = 'reserved';

        UPDATE products p
        SET stock = p.stock + 1,
            availability_status = 'ready',
            status = 'active',
            updated_at = now()
        FROM business_package_items bpi
        WHERE bpi.package_id = item.package_id
          AND bpi.product_id = p.id;
      ELSIF item.product_id IS NOT NULL THEN
        UPDATE products
        SET stock = stock + item.quantity,
            availability_status = 'ready',
            status = 'active',
            updated_at = now()
        WHERE id = item.product_id;
      END IF;
    END LOOP;
  END IF;
END;
$$;

UPDATE products
SET availability_status = 'ready',
    status = 'active',
    updated_at = now()
WHERE stock > 0
  AND availability_status = 'reserved';

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
      AND order_status IN ('pending', 'confirmed')
  LOOP
    PERFORM transition_order_inventory(expired_order.id, 'cancelled');

    UPDATE orders
    SET keep_status = 'expired',
        order_status = 'cancelled',
        updated_at = now()
    WHERE id = expired_order.id;

    released_count := released_count + 1;
  END LOOP;

  RETURN released_count;
END;
$$;
