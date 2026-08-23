# Supabase usage rollout runbook

Dokumen ini adalah prosedur rollout production untuk hardening usage Supabase. Jalankan berurutan dan jangan melompati checkpoint. Semua contoh terminal menggunakan PowerShell dari root repository.

Perubahan dibagi menjadi dua migration:

- `20260823090000_supabase_usage_hardening.sql`: additive dan kompatibel dengan frontend lama.
- `20260823100000_lock_down_public_access.sql`: cutover keamanan yang mencabut akses tabel langsung dari `anon`.

> **Aturan utama:** jangan menjalankan `npx supabase db push` di antara kedua migration. Command tersebut menerapkan seluruh migration pending dan dapat menjalankan lock-down sebelum Edge Functions serta frontend baru siap.

## 0. Isi placeholder dan pahami komponen rollout

Siapkan nilai berikut. Jangan menaruh service-role key, database password, atau worker secret di Git.

```powershell
$ProjectRef = "<PROJECT_REF>"
$ProjectUrl = "https://$ProjectRef.supabase.co"
$ProductionOrigin = "https://<DOMAIN_PRODUCTION>"
$PreviewOrigin = "https://<DOMAIN_PREVIEW>"
```

`PROJECT_REF` dapat dilihat di Supabase Dashboard URL atau **Project Settings > General**. Origin tidak boleh memiliki slash di akhir. Contoh `ALLOWED_ORIGINS`:

```text
https://sumbersandang.example,https://sumbersandang-preview.vercel.app
```

Rollout terdiri dari:

1. Validasi dan backup.
2. Additive migration.
3. Backfill thumbnail dan migrasi banner.
4. Apps Script dan Edge Function secrets.
5. Deploy Edge Functions.
6. Deploy frontend baru.
7. Smoke test sebelum lock-down.
8. Aktifkan worker Cron.
9. Lock-down migration.
10. Smoke test sesudah lock-down.
11. Audit Storage historis dan monitoring.

## 1. Prasyarat lokal

Pastikan Node.js minimal versi 20 dan dependency aplikasi tersedia:

```powershell
node --version
npm ci
npm run typecheck
npm test -- --run
npm run build
```

Semua command harus selesai dengan exit code `0`.

Supabase CLI belum dipasang sebagai dependency repository. Pasang dan pin sebagai dev dependency:

```powershell
npm install --save-dev supabase
npx supabase --version
```

Login dan link repository ke project yang benar:

```powershell
npx supabase login
npx supabase link --project-ref $ProjectRef
npx supabase migration list --linked
```

Checkpoint:

- Pastikan project yang ter-link adalah production yang dimaksud.
- Jangan memakai `--include-all` untuk memaksa migration history yang berbeda.
- Jika migration lama berbeda antara kolom `LOCAL` dan `REMOTE`, berhenti dan rekonsiliasi history lebih dulu. Jangan menandai migration sebagai applied hanya untuk menghilangkan warning.

## 2. Backup dan baseline sebelum perubahan

### 2.1 Backup database

Gunakan folder aman di luar repository karena data dump dapat berisi PII pelanggan:

```powershell
$BackupDir = "D:\Backups\sumber-sandang-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $BackupDir -Force
npx supabase db dump --linked --file "$BackupDir\schema.sql"
npx supabase db dump --linked --data-only --use-copy --file "$BackupDir\data.sql"
Get-ChildItem $BackupDir
```

Jangan commit folder backup. Backup database tidak menyertakan file Storage; file Storage dilindungi dengan antrean, grace period, dan pemeriksaan referensi sebelum delete.

### 2.2 Catat baseline Usage

Di Supabase Dashboard buka **Organization > Usage**, pilih project dan periode bulan berjalan. Catat atau screenshot:

- Storage Size.
- Database Size.
- Egress.
- Cached Egress.
- Monthly Active Users.
- Realtime Peak Connections dan Messages.
- Edge Function Invocations.

Jalankan query baseline berikut di SQL Editor dan simpan hasilnya:

```sql
select pg_size_pretty(pg_database_size(current_database())) as database_size;

select
  bucket_id,
  count(*) as object_count,
  pg_size_pretty(coalesce(sum((metadata->>'size')::bigint), 0)) as object_bytes
from storage.objects
group by bucket_id
order by bucket_id;

select
  relname as table_name,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
from pg_catalog.pg_statio_user_tables
order by pg_total_relation_size(relid) desc
limit 20;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

## 3. Terapkan additive migration saja

Karena migration lock-down sudah berada setelah additive migration dalam folder yang sama, staged rollout ini menggunakan SQL Editor lalu menyinkronkan migration history.

Salin migration additive ke clipboard:

```powershell
Get-Content -Raw "supabase/migrations/20260823090000_supabase_usage_hardening.sql" | Set-Clipboard
```

Kemudian:

1. Buka **Supabase Dashboard > SQL Editor > New query**.
2. Paste isi clipboard.
3. Pastikan project di bagian atas adalah project production yang benar.
4. Klik **Run** satu kali dan tunggu sampai sukses.
5. Jangan melanjutkan jika ada satu statement gagal.

Migration ini idempotent dan dapat dijalankan ulang dari awal jika eksekusi sebelumnya gagal. Setelah sukses, verifikasi:

```sql
select
  to_regprocedure('public.get_public_home()') is not null as home_rpc,
  to_regprocedure('public.list_public_products(text,text,text,jsonb,integer)') is not null as products_rpc,
  to_regprocedure('public.get_public_product(uuid)') is not null as product_rpc,
  to_regprocedure('public.create_checkout_order_internal(uuid,jsonb,text,text,text,text,jsonb)') is not null as checkout_rpc,
  to_regprocedure('public.media_path_is_referenced(text)') is not null as media_guard;

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('checkout_rate_limits', 'sheet_sync_outbox', 'media_cleanup_queue')
order by table_name;

select jobname, schedule, active
from cron.job
where jobname in ('release-expired-keeps-hourly', 'cleanup-supabase-usage-daily')
order by jobname;

select id, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'products';
```

Hasil yang diharapkan:

- Semua kolom RPC bernilai `true`.
- Tiga tabel internal ditemukan.
- Dua Database Cron ditemukan dan `active = true`.
- Bucket `products` memiliki limit `1048576` byte serta MIME `image/jpeg` dan `image/webp`.

Setelah semua verifikasi benar, catat migration sebagai applied di history remote:

```powershell
npx supabase migration repair 20260823090000 --status applied --linked
npx supabase migration list --linked
```

`migration repair` hanya mencatat history; command itu tidak menjalankan atau membatalkan SQL. Jalankan hanya setelah verifikasi membuktikan migration benar-benar berhasil.

## 4. Backfill thumbnail dan migrasi banner

Script operasional menggunakan `.env` lokal. Pastikan `.env` berisi:

```dotenv
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<ANON_OR_PUBLISHABLE_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
```

`.env` sudah di-ignore oleh Git. Service-role key hanya untuk script lokal terpercaya, tidak boleh memakai prefix `VITE_`, tidak boleh masuk frontend, dan tidak boleh disimpan di Vercel sebagai variabel client.

### 4.1 Backfill thumbnail bertahap

Mulai dengan dry run kecil:

```powershell
npm run backfill:thumbnails -- --dry-run --limit=10
```

Periksa pasangan source dan target yang dicetak. Jika benar, proses maksimal 10 produk dan 10 paket per eksekusi:

```powershell
npm run backfill:thumbnails -- --limit=10
```

Ulangi command apply pada jam sepi sampai output menunjukkan `Products: 0, packages: 0`. Jangan langsung menjalankan tanpa `--limit` pada production karena script perlu mengunduh original dan mengunggah thumbnail.

Verifikasi progress:

```sql
select
  count(*) filter (where coalesce(cardinality(images), 0) > 0) as products_with_images,
  count(*) filter (
    where coalesce(cardinality(images), 0) > 0
      and coalesce(cardinality(image_thumbnail_paths), 0) >= cardinality(images)
  ) as products_with_complete_thumbnails
from products;

select
  count(*) filter (where cover_image_path is not null or cover_image_url is not null) as packages_with_cover,
  count(*) filter (where thumbnail_path is not null) as packages_with_thumbnail
from business_packages;
```

### 4.2 Migrasi banner aktif

Dry run:

```powershell
npm run migrate:banner
```

Pastikan `current` menunjuk banner aktif dan `target` berada di folder `banners/`. Apply satu kali:

```powershell
npm run migrate:banner -- --apply --confirm=MIGRATE_BANNER
```

Verifikasi halaman Home masih menampilkan banner yang benar. Banner lama otomatis masuk antrean cleanup dengan grace period 30 hari; tidak langsung dihapus.

## 5. Siapkan Google Apps Script

Generate tiga secret berbeda dan simpan di password manager:

```powershell
$RateLimitSalt = ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
$InternalWorkerSecret = ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
$GoogleWebhookSecret = ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
$AllowedOrigins = "$ProductionOrigin,$PreviewOrigin"
```

Salin handler Apps Script:

```powershell
Get-Content -Raw "scripts/google-apps-script-batch.gs" | Set-Clipboard
```

Di Google Apps Script:

1. Buka project Apps Script yang menulis ke spreadsheet order.
2. Backup kode lama ke file/version terpisah.
3. Ganti handler dengan isi clipboard.
4. Buka **Project Settings > Script Properties**.
5. Tambahkan property `WEBHOOK_SECRET` dengan nilai `$GoogleWebhookSecret`.
6. Pilih **Deploy > New deployment > Web app**.
7. Execute as: akun pemilik spreadsheet.
8. Who has access: endpoint yang dapat dipanggil Edge Function; proteksinya adalah `WEBHOOK_SECRET`.
9. Deploy dan salin URL yang berakhiran `/exec`.

Simpan URL tersebut di terminal saat ini:

```powershell
$GoogleWebhookUrl = "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec"
```

Jangan memakai URL `/dev`; URL tersebut hanya untuk pengujian editor Apps Script.

## 6. Set Edge Function secrets

Set custom secrets pada project yang sudah di-link:

```powershell
npx supabase secrets set --project-ref $ProjectRef `
  "ALLOWED_ORIGINS=$AllowedOrigins" `
  "RATE_LIMIT_SALT=$RateLimitSalt" `
  "INTERNAL_WORKER_SECRET=$InternalWorkerSecret" `
  "GOOGLE_SHEETS_WEBHOOK_URL=$GoogleWebhookUrl" `
  "GOOGLE_SHEETS_WEBHOOK_SECRET=$GoogleWebhookSecret"

npx supabase secrets list --project-ref $ProjectRef
```

Pastikan lima nama secret terlihat. `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` tersedia otomatis di hosted Edge Functions dan tidak perlu di-set ulang.

## 7. Deploy Edge Functions

Deploy hanya function yang terlibat dalam rollout ini:

```powershell
npx supabase functions deploy create-order --project-ref $ProjectRef
npx supabase functions deploy sheet-sync-worker --project-ref $ProjectRef
npx supabase functions deploy media-cleanup --project-ref $ProjectRef
npx supabase functions deploy sync-sheets --project-ref $ProjectRef
npx supabase functions list --project-ref $ProjectRef
```

Konfigurasi JWT berasal dari `supabase/config.toml`:

- `create-order`, `sheet-sync-worker`, dan `media-cleanup`: `verify_jwt = false`, lalu dilindungi validasi aplikasi/worker secret.
- `sync-sheets`: `verify_jwt = true` dan hanya menjadi endpoint kompatibilitas admin.

Smoke test tanpa mutasi:

```powershell
$OptionsHeaders = @{
  Origin = $ProductionOrigin
  "Access-Control-Request-Method" = "POST"
  "Access-Control-Request-Headers" = "content-type,authorization,apikey"
}
Invoke-WebRequest -Method Options -Uri "$ProjectUrl/functions/v1/create-order" -Headers $OptionsHeaders
```

Hasil yang diharapkan adalah status `204` dan header `Access-Control-Allow-Origin` berisi origin production.

Pastikan worker menolak request tanpa secret:

```powershell
curl.exe -i -X POST "$ProjectUrl/functions/v1/sheet-sync-worker" `
  -H "Content-Type: application/json" `
  --data '{"limit":1}'
```

Hasil yang diharapkan adalah `401 Unauthorized`.

## 8. Deploy frontend RPC-based

Pastikan environment production frontend memiliki:

- `VITE_SUPABASE_URL=$ProjectUrl`.
- `VITE_SUPABASE_ANON_KEY` berisi anon/publishable key, bukan service-role key.

Validasi build terakhir:

```powershell
npm run typecheck
npm test -- --run
npm run build
```

Jika project memakai Vercel CLI:

```powershell
npx vercel env add VITE_SUPABASE_URL production
npx vercel env add VITE_SUPABASE_ANON_KEY production
npx vercel --prod
```

Jika Vercel sudah terhubung ke Git, deploy commit/branch yang memuat perubahan ini melalui workflow Vercel yang biasa digunakan. Catat deployment URL dan commit SHA. Jangan menjalankan migration lock-down sebelum deployment production baru benar-benar aktif.

## 9. Smoke test sebelum lock-down

Lakukan pengujian berikut pada production sementara policy lama masih tersedia.

### 9.1 Pengunjung publik

1. Buka Home; featured, latest, kategori, paket, testimonial, dan banner harus tampil.
2. Buka Shop; filter, search, sort, dan tombol **Muat Lagi** harus bekerja tanpa mengulang produk.
3. Buka detail produk; thumbnail dan original aktif harus tampil.
4. Tambahkan satu produk test ke cart.
5. Lakukan satu checkout test menggunakan identitas yang jelas bertanda TEST.
6. Pastikan hanya satu order dibuat ketika tombol checkout tidak sengaja diklik dua kali.
7. Pastikan order masuk ke `sheet_sync_outbox`.

Verifikasi order/outbox terbaru:

```sql
select id, order_number, customer_name, order_status, created_at
from orders
order by created_at desc
limit 5;

select order_id, status, attempts, next_attempt_at, last_error, created_at
from sheet_sync_outbox
order by created_at desc
limit 10;
```

### 9.2 Admin

1. Login admin.
2. Buka Dashboard, Orders, Inventory, Packages, Reports, Finance, dan Website settings.
3. Edit satu produk test tanpa mengganti gambar lalu simpan.
4. Pastikan pagination/filter admin bekerja.
5. Ubah status order test melalui alur normal.
6. Pastikan laporan dan ringkasan finance tetap tampil.

### 9.3 Google Sheets

Jalankan worker secara manual menggunakan secret yang masih berada di sesi PowerShell:

```powershell
$WorkerHeaders = @{
  "Content-Type" = "application/json"
  "X-Worker-Secret" = $InternalWorkerSecret
}
Invoke-RestMethod -Method Post `
  -Uri "$ProjectUrl/functions/v1/sheet-sync-worker" `
  -Headers $WorkerHeaders `
  -Body '{"limit":50}'
```

Hasil yang diharapkan memiliki `failed = 0`. Pastikan order test muncul tepat satu kali di spreadsheet dan outbox berubah menjadi `succeeded`.

Jika checkout, admin, atau sinkronisasi Sheet gagal, berhenti di tahap ini. Jangan terapkan lock-down.

## 10. Buat HTTP Cron untuk worker

Migration additive sudah membuat dua Database Cron:

- `release-expired-keeps-hourly`: per jam.
- `cleanup-supabase-usage-daily`: per hari.

Tahap ini menambahkan dua HTTP Cron untuk Edge Functions. Enable `pg_net` dan buat Vault secrets melalui SQL Editor:

```sql
create extension if not exists pg_net with schema extensions;

select vault.create_secret(
  'https://<PROJECT_REF>.supabase.co',
  'project_url',
  'Base URL untuk worker Edge Functions'
);

select vault.create_secret(
  '<INTERNAL_WORKER_SECRET>',
  'internal_worker_secret',
  'X-Worker-Secret untuk Cron'
);
```

Ganti placeholder dengan `$ProjectUrl` dan `$InternalWorkerSecret`. Jika nama secret sudah ada, update nilainya melalui **Dashboard > Vault**; jangan membuat duplikat dengan nama yang sama.

Kemudian jalankan SQL berikut:

```sql
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sheet-sync-worker-hourly') then
    perform cron.unschedule('sheet-sync-worker-hourly');
  end if;
  if exists (select 1 from cron.job where jobname = 'media-cleanup-daily') then
    perform cron.unschedule('media-cleanup-daily');
  end if;
end $$;

select cron.schedule(
  'sheet-sync-worker-hourly',
  '7 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/sheet-sync-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Worker-Secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'internal_worker_secret')
    ),
    body := '{"limit":50}'::jsonb,
    timeout_milliseconds := 15000
  ) as request_id;
  $$
);

select cron.schedule(
  'media-cleanup-daily',
  '23 3 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/media-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Worker-Secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'internal_worker_secret')
    ),
    body := '{"limit":100}'::jsonb,
    timeout_milliseconds := 15000
  ) as request_id;
  $$
);
```

Jadwal menggunakan timezone database/UTC. `7 * * * *` berarti menit ke-7 setiap jam. `23 3 * * *` berarti pukul 03:23 UTC atau sekitar 10:23 WIB.

Verifikasi seluruh Cron:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname in (
  'release-expired-keeps-hourly',
  'cleanup-supabase-usage-daily',
  'sheet-sync-worker-hourly',
  'media-cleanup-daily'
)
order by jobname;
```

Setelah Cron pernah berjalan, periksa hasilnya:

```sql
select jobid, status, return_message, start_time, end_time
from cron.job_run_details
where jobid in (
  select jobid from cron.job
  where jobname in ('sheet-sync-worker-hourly', 'media-cleanup-daily')
)
order by start_time desc
limit 20;

select id, status_code, timed_out, error_msg, created
from net._http_response
order by created desc
limit 20;
```

HTTP `2xx` berarti request diterima. Periksa Edge Function logs untuk hasil `processed`, `succeeded`, `deleted`, `referenced`, atau `failed`.

## 11. Terapkan lock-down migration

Prasyarat wajib:

- Edge Functions sudah ter-deploy.
- Frontend RPC-based sudah live.
- Checkout publik berhasil.
- Admin role-matrix berhasil.
- Apps Script berhasil dan outbox test `succeeded`.
- Empat Cron aktif.
- Backup dan baseline tersedia.

Salin migration:

```powershell
Get-Content -Raw "supabase/migrations/20260823100000_lock_down_public_access.sql" | Set-Clipboard
```

Paste ke **Supabase SQL Editor** lalu Run. Migration ini menghapus policy lama dan mencabut akses tabel langsung dari `anon`; jangan jalankan pada jam ramai.

Verifikasi hasil:

```sql
select
  has_table_privilege('anon', 'public.customers', 'select') as anon_customers_select,
  has_table_privilege('anon', 'public.orders', 'insert') as anon_orders_insert,
  has_table_privilege('anon', 'public.order_items', 'insert') as anon_order_items_insert,
  has_function_privilege('anon', 'public.get_public_home()', 'execute') as anon_home_rpc,
  has_function_privilege(
    'anon',
    'public.list_public_products(text,text,text,jsonb,integer)',
    'execute'
  ) as anon_products_rpc;

select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Hasil yang diharapkan:

- Tiga privilege tabel `anon_*` bernilai `false`.
- Dua privilege public RPC bernilai `true`.
- Tabel aplikasi hanya memiliki policy admin untuk role `authenticated`, kecuali policy internal yang memang dibuat khusus.

Catat migration sebagai applied:

```powershell
npx supabase migration repair 20260823100000 --status applied --linked
npx supabase migration list --linked
npx supabase db push --dry-run --linked
```

`db push --dry-run` seharusnya tidak menawarkan kedua migration rollout lagi. Jangan menjalankan push nyata jika dry run masih menunjukkan migration yang tidak diharapkan.

## 12. Smoke test setelah lock-down

Ulangi seluruh test pada bagian 9. Tambahkan pengujian keamanan berikut.

Public RPC harus tetap berhasil:

```powershell
$AnonKey = "<ANON_OR_PUBLISHABLE_KEY>"
$PublicHeaders = @{
  apikey = $AnonKey
  Authorization = "Bearer $AnonKey"
  "Content-Type" = "application/json"
}
Invoke-RestMethod -Method Post `
  -Uri "$ProjectUrl/rest/v1/rpc/get_public_home" `
  -Headers $PublicHeaders `
  -Body '{}'
```

Akses langsung ke PII harus ditolak:

```powershell
curl.exe -i "$ProjectUrl/rest/v1/customers?select=id&limit=1" `
  -H "apikey: $AnonKey" `
  -H "Authorization: Bearer $AnonKey"
```

Hasil yang diharapkan bukan data pelanggan. Ulangi checkout publik dan satu operasi admin. Pantau **Edge Function Logs**, **Postgres Logs**, dan browser console minimal 30–60 menit setelah cutover.

## 13. Pembersihan Storage historis

Jangan jalankan audit Storage terjadwal harian. Audit penuh membaca seluruh metadata bucket dan referensi database; jalankan manual ketika Storage tumbuh tidak wajar.

Dry run:

```powershell
npm run audit:storage
```

Script hanya membuat manifest `storage-orphans-*.json`; belum mengubah antrean atau menghapus file. Periksa:

- `object_count`.
- `referenced_count`.
- `orphan_count`.
- `orphan_bytes`.
- Setiap `objects[].path`.
- `delay_days` dan `eligible_after`.

> Audit terakhir mengklasifikasikan 992 dari 993 objek sebagai kandidat orphan. Jangan enqueue hasil tersebut sebelum sampling path dan referensi database membuktikan klasifikasinya benar.

Setelah hasil benar-benar disetujui:

```powershell
npm run audit:storage -- --enqueue --confirm=QUEUE_ORPHANS
```

Command tersebut hanya memasukkan kandidat ke `media_cleanup_queue`:

- Thumbnail/banner historis eligible segera setelah approval.
- Original produk/paket mendapat grace period 30 hari.
- Worker selalu memanggil `media_path_is_referenced()` sebelum Storage API delete.

Pantau antrean:

```sql
select status, count(*) as rows, min(eligible_after) as oldest_eligible
from media_cleanup_queue
group by status
order by status;

select object_path, status, attempts, eligible_after, last_error
from media_cleanup_queue
where status in ('failed', 'processing')
order by updated_at desc
limit 100;
```

Jangan menghapus objek menggunakan SQL pada `storage.objects`; deletion harus melalui Storage API.

## 14. Network budget yang harus dipertahankan

- Home: maksimal 1 RPC data publik.
- Shop: 48 produk per page; **Muat Lagi** hanya mengambil page berikutnya.
- Product detail: 1 RPC, 1 original aktif, dan thumbnail maksimal 60 KiB untuk strip galeri.
- Checkout: 1 request browser ke `create-order`; browser tidak menulis PII/order langsung ke tabel.
- List admin utama: maksimal 50–200 row per request.
- Dashboard, laporan, dan keuangan: aggregate RPC.
- Export/backup: aksi eksplisit dan dipaginasi 500 row per request.
- Realtime: tetap tidak digunakan.
- `sheet-sync-worker`: maksimal 50 outbox per invocation, setiap jam.
- `media-cleanup`: maksimal 100 objek per invocation, setiap hari.

## 15. Retensi dan monitoring

Retensi database otomatis:

- Notification sudah dibaca: 90 hari.
- Notification belum dibaca: 365 hari.
- Activity log: 365 hari.
- Sheet outbox sukses: 30 hari.
- Sheet outbox gagal: 90 hari.
- Rate-limit buckets: 1 hari.
- Cash ledger: permanen.

Cleanup memakai batch dan `VACUUM` reguler Supabase. Jangan menjalankan `VACUUM FULL` di production tanpa maintenance window.

Selama 7–14 hari setelah rollout:

1. Periksa Usage setiap hari selama tiga hari pertama, lalu mingguan.
2. Investigasi sebelum salah satu usage mencapai 70% kuota.
3. Bandingkan Egress dan Cached Egress dengan baseline.
4. Periksa Edge Function invocation dan error rate.
5. Periksa jumlah outbox `pending/failed`.
6. Periksa cleanup queue `failed/processing`.
7. Periksa ukuran tabel terbesar dan dead tuples jika Database Size naik.

Query monitoring ringkas:

```sql
select status, count(*) from sheet_sync_outbox group by status order by status;
select status, count(*) from media_cleanup_queue group by status order by status;

select
  relname,
  n_live_tup,
  n_dead_tup,
  last_autovacuum,
  last_autoanalyze
from pg_stat_user_tables
order by n_dead_tup desc
limit 20;

select jobname, schedule, active
from cron.job
order by jobname;
```

## 16. Pause dan rollback operasional

### Jika worker bermasalah

Nonaktifkan HTTP Cron tanpa menghapus data antrean:

```sql
select cron.unschedule('sheet-sync-worker-hourly')
where exists (select 1 from cron.job where jobname = 'sheet-sync-worker-hourly');

select cron.unschedule('media-cleanup-daily')
where exists (select 1 from cron.job where jobname = 'media-cleanup-daily');
```

Fix dan deploy ulang function, lakukan invocation manual, lalu buat ulang Cron menggunakan SQL bagian 10.

### Jika frontend baru bermasalah sebelum lock-down

Rollback deployment frontend ke versi sebelumnya. Additive migration aman dibiarkan karena policy lama masih tersedia. Jangan jalankan migration lock-down.

### Jika masalah muncul setelah lock-down

1. Jangan menjalankan `migration repair --status reverted`; command itu tidak mengembalikan policy atau grant.
2. Jika public RPC masih sehat, forward-fix frontend/Edge Function adalah opsi paling aman.
3. Jika akses admin/public benar-benar terputus, gunakan backup schema/policy baseline untuk membuat migration pemulihan yang eksplisit.
4. Jangan menebak atau mengaktifkan kembali akses `anon` ke `customers`, `orders`, atau `order_items` secara luas.

Migration lock-down tidak memiliki rollback otomatis karena policy lama dihapus. Karena itu checkpoint sebelum bagian 11 wajib dilalui.

## Referensi resmi

- [Supabase CLI dan instalasi](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Database migrations dan migration history](https://supabase.com/docs/guides/deployment/database-migrations)
- [Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
- [Deploy Edge Functions](https://supabase.com/docs/guides/functions/deploy)
- [Scheduling Edge Functions dengan Cron, pg_net, dan Vault](https://supabase.com/docs/guides/functions/schedule-functions)
- [Menghapus Storage objects melalui Storage API](https://supabase.com/docs/guides/storage/management/delete-objects)
