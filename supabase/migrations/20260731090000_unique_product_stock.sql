/*
# Unique product stock model

Every product represents one unique physical item. Stock is restricted to 0/1:
ready products have stock 1, reserved/sold products have stock 0.
*/

UPDATE products
SET
  stock = CASE
    WHEN status <> 'sold_out' AND availability_status = 'ready' AND stock > 0 THEN 1
    ELSE 0
  END,
  min_stock = 1,
  updated_at = now();

UPDATE products
SET
  availability_status = CASE
    WHEN availability_status = 'ready' AND stock = 1 THEN 'ready'
    WHEN availability_status = 'reserved' THEN 'reserved'
    ELSE 'sold'
  END,
  status = CASE
    WHEN availability_status = 'ready' AND stock = 1 THEN status
    WHEN availability_status = 'reserved' THEN status
    ELSE 'sold_out'
  END,
  updated_at = now();

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_stock_one_check;

ALTER TABLE products
  ADD CONSTRAINT products_stock_one_check CHECK (stock IN (0, 1));

CREATE OR REPLACE FUNCTION reserve_order_items(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item record;
  package_row business_packages%ROWTYPE;
  expected_count int;
  updated_count int;
BEGIN
  FOR item IN
    SELECT * FROM order_items WHERE order_id = p_order_id
  LOOP
    IF item.quantity <> 1 THEN
      RAISE EXCEPTION 'Setiap produk atau paket hanya bisa dipesan 1 item.';
    END IF;

    IF item.item_type = 'package' AND item.package_id IS NOT NULL THEN
      SELECT *
      INTO package_row
      FROM business_packages
      WHERE id = item.package_id
      FOR UPDATE;

      IF package_row.id IS NULL
        OR package_row.status <> 'active'
        OR package_row.availability_status <> 'ready'
      THEN
        RAISE EXCEPTION 'Paket sudah tidak tersedia.';
      END IF;

      SELECT count(DISTINCT bpi.product_id)
      INTO expected_count
      FROM business_package_items bpi
      WHERE bpi.package_id = item.package_id;

      IF expected_count = 0 THEN
        RAISE EXCEPTION 'Paket belum memiliki produk.';
      END IF;

      PERFORM 1
      FROM products p
      JOIN business_package_items bpi ON bpi.product_id = p.id
      WHERE bpi.package_id = item.package_id
      FOR UPDATE OF p;

      UPDATE products p
      SET stock = 0,
          availability_status = 'reserved',
          updated_at = now()
      FROM business_package_items bpi
      WHERE bpi.package_id = item.package_id
        AND bpi.product_id = p.id
        AND p.status = 'active'
        AND p.availability_status = 'ready'
        AND p.stock = 1;

      GET DIAGNOSTICS updated_count = ROW_COUNT;
      IF updated_count <> expected_count THEN
        RAISE EXCEPTION 'Produk dalam paket sudah tidak tersedia.';
      END IF;

      UPDATE business_packages
      SET availability_status = 'reserved',
          updated_at = now()
      WHERE id = item.package_id
        AND status = 'active'
        AND availability_status = 'ready';

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Paket sudah tidak tersedia.';
      END IF;
    ELSIF item.product_id IS NOT NULL THEN
      UPDATE products
      SET stock = 0,
          availability_status = 'reserved',
          updated_at = now()
      WHERE id = item.product_id
        AND status = 'active'
        AND availability_status = 'ready'
        AND stock = 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produk sudah tidak tersedia.';
      END IF;
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
        SET stock = 0,
            availability_status = 'sold',
            status = 'sold_out',
            updated_at = now()
        FROM business_package_items bpi
        WHERE bpi.package_id = item.package_id
          AND bpi.product_id = p.id;
      ELSIF item.product_id IS NOT NULL THEN
        UPDATE products
        SET stock = 0,
            availability_status = 'sold',
            status = 'sold_out',
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
        WHERE id = item.package_id;

        UPDATE products p
        SET stock = 1,
            availability_status = 'ready',
            status = 'active',
            updated_at = now()
        FROM business_package_items bpi
        WHERE bpi.package_id = item.package_id
          AND bpi.product_id = p.id;
      ELSIF item.product_id IS NOT NULL THEN
        UPDATE products
        SET stock = 1,
            availability_status = 'ready',
            status = 'active',
            updated_at = now()
        WHERE id = item.product_id;
      END IF;
    END LOOP;
  END IF;
END;
$$;
