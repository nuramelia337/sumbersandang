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
UPDATE categories
SET name = 'Premium',
    description = 'Kurasi terbaik dengan kondisi dan karakter lebih unggul.',
    sort_order = 4
WHERE slug = 'premi';

UPDATE site_settings
SET value = jsonb_set(value::jsonb, '{cta_page}', '"shop:packages"', true)
WHERE key = 'promo_banner'
  AND value->>'cta_label' = 'Lihat Paket';
