/*
# Enforce order item quantities during reservation

Product and package reservations must respect purchased quantity. Packages use
their product composition multiplied by the package order quantity.
*/

CREATE OR REPLACE FUNCTION reserve_order_items(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item record;
  product_stock int;
BEGIN
  FOR item IN
    SELECT * FROM order_items WHERE order_id = p_order_id
  LOOP
    IF item.item_type = 'package' AND item.package_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM (
          SELECT
            bpi.product_id,
            p.stock,
            count(*)::int * item.quantity AS required_qty
          FROM business_package_items bpi
          JOIN products p ON p.id = bpi.product_id
          WHERE bpi.package_id = item.package_id
          GROUP BY bpi.product_id, p.stock
        ) required
        WHERE required.stock < required.required_qty
      ) THEN
        RAISE EXCEPTION 'Stok produk dalam paket tidak cukup.';
      END IF;

      UPDATE business_packages
      SET availability_status = 'reserved',
          updated_at = now()
      WHERE id = item.package_id;

      UPDATE products p
      SET stock = p.stock - required.required_qty,
          availability_status = CASE WHEN p.stock - required.required_qty > 0 THEN 'ready' ELSE 'reserved' END,
          status = CASE WHEN p.stock - required.required_qty > 0 THEN 'active' ELSE p.status END,
          updated_at = now()
      FROM (
        SELECT product_id, count(*)::int * item.quantity AS required_qty
        FROM business_package_items
        WHERE package_id = item.package_id
        GROUP BY product_id
      ) required
      WHERE required.product_id = p.id;
    ELSIF item.product_id IS NOT NULL THEN
      SELECT stock INTO product_stock FROM products WHERE id = item.product_id;

      IF product_stock IS NULL OR product_stock < item.quantity THEN
        RAISE EXCEPTION 'Stok produk tidak cukup.';
      END IF;

      UPDATE products
      SET stock = stock - item.quantity,
          availability_status = CASE WHEN stock - item.quantity > 0 THEN 'ready' ELSE 'reserved' END,
          status = CASE WHEN stock - item.quantity > 0 THEN 'active' ELSE status END,
          updated_at = now()
      WHERE id = item.product_id;
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
        SET stock = p.stock + restored.restored_qty,
            availability_status = 'ready',
            status = 'active',
            updated_at = now()
        FROM (
          SELECT product_id, count(*)::int * item.quantity AS restored_qty
          FROM business_package_items
          WHERE package_id = item.package_id
          GROUP BY product_id
        ) restored
        WHERE restored.product_id = p.id;
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
