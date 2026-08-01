import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const root = process.cwd();
const envPath = path.join(root, '.env');

if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function storagePathFromValue(value) {
  if (!value) return null;
  if (!/^https?:\/\//.test(value)) return value;
  const marker = '/storage/v1/object/public/products/';
  const index = value.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(value.slice(index + marker.length).split('?')[0]);
}

async function createThumbnailBuffer(sourcePath) {
  const { data, error } = await supabase.storage.from('products').download(sourcePath);
  if (error || !data) throw new Error(error?.message || `Cannot download ${sourcePath}`);
  const input = Buffer.from(await data.arrayBuffer());
  return sharp(input)
    .rotate()
    .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .webp({ quality: 58, effort: 5 })
    .toBuffer();
}

async function uploadThumbnail(targetPath, buffer) {
  const { error } = await supabase.storage.from('products').upload(targetPath, buffer, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: true,
  });
  if (error) throw new Error(error.message);
}

async function backfillProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id,product_code,image_path,images,thumbnail_path')
    .is('thumbnail_path', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  let processed = 0;
  for (const product of data || []) {
    if (processed >= limit) break;
    const sourcePath = storagePathFromValue(product.image_path || product.images?.[0]);
    if (!sourcePath) continue;
    const targetPath = `thumbnails/products/${product.id}.webp`;
    console.log(`${dryRun ? '[dry-run] ' : ''}product ${product.product_code || product.id}: ${sourcePath} -> ${targetPath}`);
    if (!dryRun) {
      const thumbnail = await createThumbnailBuffer(sourcePath);
      await uploadThumbnail(targetPath, thumbnail);
      const { error: updateError } = await supabase.from('products').update({ thumbnail_path: targetPath }).eq('id', product.id);
      if (updateError) throw new Error(updateError.message);
    }
    processed += 1;
  }
  return processed;
}

async function backfillPackages() {
  const { data, error } = await supabase
    .from('business_packages')
    .select('id,package_code,cover_image_path,cover_image_url,thumbnail_path')
    .is('thumbnail_path', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  let processed = 0;
  for (const pkg of data || []) {
    if (processed >= limit) break;
    const sourcePath = storagePathFromValue(pkg.cover_image_path || pkg.cover_image_url);
    if (!sourcePath) continue;
    const targetPath = `thumbnails/packages/${pkg.id}.webp`;
    console.log(`${dryRun ? '[dry-run] ' : ''}package ${pkg.package_code || pkg.id}: ${sourcePath} -> ${targetPath}`);
    if (!dryRun) {
      const thumbnail = await createThumbnailBuffer(sourcePath);
      await uploadThumbnail(targetPath, thumbnail);
      const { error: updateError } = await supabase.from('business_packages').update({ thumbnail_path: targetPath }).eq('id', pkg.id);
      if (updateError) throw new Error(updateError.message);
    }
    processed += 1;
  }
  return processed;
}

try {
  const productCount = await backfillProducts();
  const packageCount = await backfillPackages();
  console.log(`Done. Products: ${productCount}, packages: ${packageCount}${dryRun ? ' (dry-run)' : ''}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
