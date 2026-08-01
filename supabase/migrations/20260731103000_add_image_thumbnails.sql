/*
  # Add generated thumbnail paths

  Stores pre-generated small WebP variants for card/list/cart/admin views so
  public pages do not need to serve full product/package images from Storage.
*/

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS thumbnail_path text;

ALTER TABLE business_packages
  ADD COLUMN IF NOT EXISTS thumbnail_path text;

UPDATE products
SET image_path = images[1]
WHERE image_path IS NULL
  AND array_length(images, 1) > 0;
