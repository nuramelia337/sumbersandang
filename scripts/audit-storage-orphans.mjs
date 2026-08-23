import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const root = process.cwd();
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const args = new Set(process.argv.slice(2));
const enqueue = args.has('--enqueue');
const confirmation = process.argv.find((arg) => arg.startsWith('--confirm='))?.split('=')[1];
if (enqueue && confirmation !== 'QUEUE_ORPHANS') {
  console.error('Enqueue dibatalkan. Gunakan --enqueue --confirm=QUEUE_ORPHANS setelah memeriksa manifest dry-run.');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

function normalize(value) {
  if (!value) return null;
  if (!/^https?:\/\//.test(value)) return value;
  const marker = '/storage/v1/object/public/products/';
  const index = value.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(value.slice(index + marker.length).split('?')[0]);
}

async function allRows(table, select) {
  const rows = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 499);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}

async function productRows() {
  try {
    return await allRows('products', 'image_path,thumbnail_path,images,image_thumbnail_paths');
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('image_thumbnail_paths')) throw error;
    const rows = await allRows('products', 'image_path,thumbnail_path,images');
    return rows.map((row) => ({ ...row, image_thumbnail_paths: [] }));
  }
}

async function listFolder(prefix = '') {
  const objects = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from('products').list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`Storage list ${prefix || '/'}: ${error.message}`);
    for (const entry of data || []) {
      const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) objects.push({ path: objectPath, size: Number(entry.metadata?.size || 0), created_at: entry.created_at });
      else objects.push(...await listFolder(objectPath));
    }
    if (!data || data.length < 1000) break;
  }
  return objects;
}

const [products, packages, settings, objects] = await Promise.all([
  productRows(),
  allRows('business_packages', 'cover_image_path,thumbnail_path'),
  allRows('site_settings', 'key,value'),
  listFolder(),
]);

const referenced = new Set();
for (const product of products) {
  [product.image_path, product.thumbnail_path, ...(product.images || []), ...(product.image_thumbnail_paths || [])]
    .map(normalize).filter(Boolean).forEach((value) => referenced.add(value));
}
for (const pkg of packages) [pkg.cover_image_path, pkg.thumbnail_path].map(normalize).filter(Boolean).forEach((value) => referenced.add(value));
for (const setting of settings) {
  if (setting.key === 'promo_banner') {
    const value = normalize(setting.value?.image_url);
    if (value) referenced.add(value);
  }
}

const generatedAt = new Date();
const orphaned = objects.filter((object) => !referenced.has(object.path)).map((object) => {
  const immediateAfterApproval = object.path.startsWith('thumbnails/') || object.path.startsWith('banners/');
  return {
    ...object,
    delay_days: immediateAfterApproval ? 0 : 30,
    eligible_after: new Date(generatedAt.getTime() + (immediateAfterApproval ? 0 : 30 * 86400000)).toISOString(),
  };
});
const manifest = {
  generated_at: generatedAt.toISOString(),
  dry_run: !enqueue,
  bucket: 'products',
  object_count: objects.length,
  referenced_count: objects.length - orphaned.length,
  orphan_count: orphaned.length,
  orphan_bytes: orphaned.reduce((sum, object) => sum + object.size, 0),
  policy: 'thumbnail/banner candidates are eligible after approval; other originals retain a 30-day grace period',
  objects: orphaned,
};
const manifestPath = path.join(root, `storage-orphans-${generatedAt.toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

if (enqueue && orphaned.length > 0) {
  for (let index = 0; index < orphaned.length; index += 200) {
    const rows = orphaned.slice(index, index + 200).map((object) => ({
      bucket_id: 'products', object_path: object.path, eligible_after: object.eligible_after, status: 'pending', attempts: 0,
    }));
    const { error } = await supabase.from('media_cleanup_queue').upsert(rows, { onConflict: 'bucket_id,object_path' });
    if (error) throw new Error(error.message);
  }
}

console.log(JSON.stringify({ manifest: manifestPath, ...manifest, objects: undefined }, null, 2));
