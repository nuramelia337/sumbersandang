CREATE POLICY "anon_delete_products" ON products FOR DELETE
  TO anon USING (true);