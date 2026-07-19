/*
# Add New Arrival product category
*/

INSERT INTO categories (name, slug, description, sort_order) VALUES
  ('New Arrival', 'new-arrival', 'Item terbaru yang baru masuk dan siap diperebutkan.', 1)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

UPDATE categories SET sort_order = 2 WHERE slug = 'promo';
UPDATE categories SET sort_order = 3 WHERE slug = 'normal';
UPDATE categories SET sort_order = 4 WHERE slug = 'premi';
