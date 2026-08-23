import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const root = process.cwd();
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const apply = process.argv.includes('--apply');
const confirmation = process.argv.find((arg) => arg.startsWith('--confirm='))?.split('=')[1];
if (apply && confirmation !== 'MIGRATE_BANNER') {
  console.error('Gunakan --apply --confirm=MIGRATE_BANNER setelah memeriksa output dry-run.');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

function storagePath(value) {
  if (!value) return null;
  if (!/^https?:\/\//.test(value)) return value;
  const marker = '/storage/v1/object/public/products/';
  const index = value.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(value.slice(index + marker.length).split('?')[0]);
}

async function sourceBuffer(value) {
  const objectPath = storagePath(value);
  if (objectPath) {
    const { data, error } = await supabase.storage.from('products').download(objectPath);
    if (error || !data) throw new Error(error?.message || 'Banner source tidak ditemukan.');
    return Buffer.from(await data.arrayBuffer());
  }
  const response = await fetch(value);
  if (!response.ok) throw new Error(`Banner source returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function optimizedBanner(input) {
  for (const width of [1600, 1400, 1200, 1000]) {
    for (const quality of [76, 68, 60, 52]) {
      const output = await sharp(input).rotate().resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' }).webp({ quality, effort: 5 }).toBuffer();
      if (output.length <= 350 * 1024) return output;
    }
  }
  throw new Error('Banner tidak dapat dipadatkan hingga 350 KiB.');
}

const { data: setting, error } = await supabase.from('site_settings').select('id,value').eq('key', 'promo_banner').maybeSingle();
if (error || !setting) throw new Error(error?.message || 'Promo banner setting tidak ditemukan.');
const current = setting.value?.image_url;
if (!current) throw new Error('Promo banner tidak memiliki image_url.');
const target = `banners/${randomUUID()}.webp`;
console.log(JSON.stringify({ dry_run: !apply, current, target, cache_control: '31536000', target_max_bytes: 350 * 1024 }, null, 2));

if (apply) {
  const output = await optimizedBanner(await sourceBuffer(current));
  const { error: uploadError } = await supabase.storage.from('products').upload(target, output, {
    contentType: 'image/webp', cacheControl: '31536000', upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);
  const { error: updateError } = await supabase.from('site_settings').update({
    value: { ...setting.value, image_url: target }, updated_at: new Date().toISOString(),
  }).eq('id', setting.id);
  if (updateError) {
    await supabase.storage.from('products').remove([target]);
    throw new Error(updateError.message);
  }
  console.log(JSON.stringify({ migrated: true, bytes: output.length, target }, null, 2));
}
