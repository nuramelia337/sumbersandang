/*
# Update product storage locations to basket labels

Replaces the old storage location values (`rak_a`, `rak_b`, `gudang`, `etalase`)
with `keranjang_1` through `keranjang_14`.
*/

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_storage_location_check;

UPDATE products
SET storage_location = 'keranjang_1'
WHERE storage_location IS NULL
  OR storage_location IN ('rak_a', 'rak_b', 'gudang', 'etalase')
  OR storage_location NOT IN (
    'keranjang_1',
    'keranjang_2',
    'keranjang_3',
    'keranjang_4',
    'keranjang_5',
    'keranjang_6',
    'keranjang_7',
    'keranjang_8',
    'keranjang_9',
    'keranjang_10',
    'keranjang_11',
    'keranjang_12',
    'keranjang_13',
    'keranjang_14'
  );

ALTER TABLE products
  ALTER COLUMN storage_location SET DEFAULT 'keranjang_1',
  ADD CONSTRAINT products_storage_location_check
  CHECK (storage_location IN (
    'keranjang_1',
    'keranjang_2',
    'keranjang_3',
    'keranjang_4',
    'keranjang_5',
    'keranjang_6',
    'keranjang_7',
    'keranjang_8',
    'keranjang_9',
    'keranjang_10',
    'keranjang_11',
    'keranjang_12',
    'keranjang_13',
    'keranjang_14'
  ));
