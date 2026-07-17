/*
# Product storage policies

Allows public reads from the `products` bucket and allows authenticated active
admins to upload, update, and delete product/package images.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('products', 'products', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "public_read_products_bucket" ON storage.objects;
CREATE POLICY "public_read_products_bucket"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'products');

DROP POLICY IF EXISTS "admin_insert_products_bucket" ON storage.objects;
CREATE POLICY "admin_insert_products_bucket"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'products'
  AND public.is_admin()
);

DROP POLICY IF EXISTS "admin_update_products_bucket" ON storage.objects;
CREATE POLICY "admin_update_products_bucket"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'products'
  AND public.is_admin()
)
WITH CHECK (
  bucket_id = 'products'
  AND public.is_admin()
);

DROP POLICY IF EXISTS "admin_delete_products_bucket" ON storage.objects;
CREATE POLICY "admin_delete_products_bucket"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'products'
  AND public.is_admin()
);
