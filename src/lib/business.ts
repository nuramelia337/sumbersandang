import { supabase } from './supabase';
import type {
  ActivityLog,
  AdminProfile,
  BusinessPackage,
  CashLedger,
  Category,
  FinanceSummary,
  FinanceSetting,
  Order,
  PaymentMethod,
  Product,
  ProductAvailabilityStatus,
  PromoBannerSetting,
  ShippingMethod,
  SiteSetting,
  StorageLocation,
  Testimonial,
} from './types';
import { calculateFinanceSummary } from './finance';

export const AVAILABILITY_LABELS: Record<ProductAvailabilityStatus, string> = {
  ready: 'Ready',
  reserved: 'Reserved',
  sold: 'Sold',
};

export const STORAGE_LOCATION_LABELS: Record<StorageLocation, string> = {
  keranjang_1: 'Keranjang 1',
  keranjang_2: 'Keranjang 2',
  keranjang_3: 'Keranjang 3',
  keranjang_4: 'Keranjang 4',
  keranjang_5: 'Keranjang 5',
  keranjang_6: 'Keranjang 6',
  keranjang_7: 'Keranjang 7',
  keranjang_8: 'Keranjang 8',
  keranjang_9: 'Keranjang 9',
  keranjang_10: 'Keranjang 10',
  keranjang_11: 'Keranjang 11',
  keranjang_12: 'Keranjang 12',
  keranjang_13: 'Keranjang 13',
  keranjang_14: 'Keranjang 14',
};

export const STORAGE_LOCATIONS = Object.entries(STORAGE_LOCATION_LABELS).map(([value, label]) => ({
  value: value as StorageLocation,
  label,
}));

export const PRODUCT_CATEGORY_SLUGS = ['new-arrival', 'promo', 'normal', 'premi'] as const;

export const PRODUCT_CATEGORY_COPY: Record<typeof PRODUCT_CATEGORY_SLUGS[number], { title: string; description: string; tone: string }> = {
  'new-arrival': {
    title: 'New Arrival',
    description: 'Item terbaru yang baru masuk dan siap diperebutkan.',
    tone: 'Baru masuk',
  },
  promo: {
    title: 'Promo',
    description: 'Harga spesial untuk temuan yang cepat bergerak.',
    tone: 'Kesempatan hemat',
  },
  normal: {
    title: 'Normal',
    description: 'Koleksi harian yang rapi, wearable, dan mudah dipadukan.',
    tone: 'Siap pakai',
  },
  premi: {
    title: 'Premium',
    description: 'Kurasi terbaik dengan kondisi dan karakter lebih unggul.',
    tone: 'Kurasi utama',
  },
};

export function normalizeStorageLocation(value?: string | null): StorageLocation {
  return value && value in STORAGE_LOCATION_LABELS ? value as StorageLocation : 'keranjang_1';
}

export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
export const TARGET_IMAGE_UPLOAD_BYTES = 350 * 1024;
export const TARGET_THUMBNAIL_UPLOAD_BYTES = 60 * 1024;
export const MAX_IMAGE_PIXELS = 25_000_000;
export const MAX_PRODUCT_IMAGES = 6;
const PACKAGE_PRODUCT_SELECT = 'id,product_code,name,purchase_price,status,availability_status,stock';

export const DEFAULT_PROMO_BANNER: PromoBannerSetting = {
  title: 'Paket usaha thrift siap jual',
  subtitle: 'Kurasi pakaian pilihan untuk reseller dan pemilik butik kecil.',
  cta_label: 'Lihat Paket',
  cta_page: 'shop:packages',
  image_url: 'https://images.pexels.com/photos/1488463/pexels-photo-1488463.jpeg',
  is_active: true,
};

function normalizePromoBanner(value?: Partial<PromoBannerSetting> | null): PromoBannerSetting {
  const banner = { ...DEFAULT_PROMO_BANNER, ...(value || {}) };
  const title = banner.title?.trim();
  const contactIdentifiers = [
    'sumber.sandanggg',
    'sumber.sandanggg@gmail.com',
    '@sumber.sandanggg',
  ];

  return {
    ...banner,
    title: !title || contactIdentifiers.includes(title.toLowerCase())
      ? DEFAULT_PROMO_BANNER.title
      : title,
  };
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  bca: 'BCA',
  dana: 'DANA',
  shopeepay: 'ShopeePay',
  cash: 'Cash',
};

export const SHIPPING_LABELS: Record<ShippingMethod, string> = {
  pickup: 'Ambil Sendiri',
  jnt: 'JNT',
  spx: 'SPX',
  maxim: 'Maxim',
};

export const REVENUE_ORDER_STATUSES: Order['order_status'][] = [
  'confirmed',
  'processing',
  'packing',
  'ready',
  'shipped',
  'completed',
];

export function orderCountsAsRevenue(order: Pick<Order, 'order_status'>): boolean {
  return REVENUE_ORDER_STATUSES.includes(order.order_status);
}

export function storageImageUrl(path?: string | null): string {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/products/${path}`;
}

export function packageImageUrl(
  pkg: Pick<BusinessPackage, 'cover_image_path' | 'cover_image_url' | 'thumbnail_path'>,
  variant: 'thumbnail' | 'original' = 'thumbnail',
): string {
  if (variant === 'thumbnail') {
    return storageImageUrl(pkg.thumbnail_path) || storageImageUrl(pkg.cover_image_path) || pkg.cover_image_url || DEFAULT_PROMO_BANNER.image_url;
  }
  return storageImageUrl(pkg.cover_image_path) || pkg.cover_image_url || storageImageUrl(pkg.thumbnail_path) || DEFAULT_PROMO_BANNER.image_url;
}

export async function uploadStorageImage(path: string, file: Blob, contentType = file.type || 'image/jpeg'): Promise<string> {
  const { error } = await supabase.storage.from('products').upload(path, file, {
    contentType,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new Error(`Upload gagal: ${error.message}`);
  return path;
}

export async function uploadImage(file: Blob, folder: string): Promise<string> {
  const path = `${folder}/${crypto.randomUUID()}.webp`;
  return uploadStorageImage(path, file, 'image/webp');
}

export interface ImageUploadResult {
  path: string;
  thumbnailPath: string;
}

export async function uploadImageWithThumbnail(file: Blob, folder: string): Promise<ImageUploadResult> {
  const stamp = crypto.randomUUID();
  const path = `${folder}/${stamp}.webp`;
  const thumbnailPath = `thumbnails/${folder}/${stamp}.webp`;
  const thumbnail = await createThumbnailImage(file);
  const uploaded: string[] = [];
  try {
    await uploadStorageImage(path, file, 'image/webp');
    uploaded.push(path);
    await uploadStorageImage(thumbnailPath, thumbnail, 'image/webp');
    uploaded.push(thumbnailPath);
    return { path, thumbnailPath };
  } catch (error) {
    if (uploaded.length > 0) await supabase.storage.from('products').remove(uploaded);
    throw error;
  }
}

export async function removeStorageImages(paths: Array<string | null | undefined>): Promise<void> {
  const unique = Array.from(new Set(paths.filter((path): path is string => Boolean(path) && !/^https?:\/\//.test(path!))));
  if (unique.length === 0) return;
  const { error } = await supabase.storage.from('products').remove(unique);
  if (error) throw new Error(`Cleanup upload gagal: ${error.message}`);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function assertImageUploadFile(file: File) {
  if (!file.type.startsWith('image/')) {
    throw new Error('File harus berupa gambar.');
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new Error(`Ukuran gambar maksimal ${formatFileSize(MAX_IMAGE_UPLOAD_BYTES)}. File ini ${formatFileSize(file.size)}.`);
  }
}

function loadImageElement(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Format gambar tidak didukung. Gunakan JPEG, PNG, atau WebP.'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Gagal memproses gambar'))), type, quality);
  });
}

export async function optimizeImage(file: Blob, brightness = 1.08, targetBytes = TARGET_IMAGE_UPLOAD_BYTES): Promise<Blob> {
  const img = await loadImageElement(file);
  if (img.width * img.height > MAX_IMAGE_PIXELS) throw new Error('Resolusi gambar maksimal 25 megapiksel.');
  const dimensions = [1200, 1080, 960, 840, 720];
  const qualities = [0.78, 0.7, 0.62, 0.54, 0.46];
  for (const maxSize of dimensions) {
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.filter = `brightness(${brightness}) contrast(1.04) saturate(1.04)`;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of qualities) {
      const output = await canvasToBlob(canvas, 'image/webp', quality);
      if (output.size <= targetBytes) return output;
    }
  }
  throw new Error(`Gambar tidak dapat dipadatkan hingga ${formatFileSize(targetBytes)}. Gunakan foto yang lebih sederhana.`);
}

export async function createThumbnailImage(file: Blob, maxSize = 480, targetBytes = TARGET_THUMBNAIL_UPLOAD_BYTES): Promise<Blob> {
  const img = await loadImageElement(file);
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const qualities = [0.64, 0.56, 0.48, 0.4];
  let output = await canvasToBlob(canvas, 'image/webp', qualities[0]);
  for (const quality of qualities.slice(1)) {
    if (output.size <= targetBytes) break;
    output = await canvasToBlob(canvas, 'image/webp', quality);
  }

  if (output.size > targetBytes && Math.max(canvas.width, canvas.height) > 320) {
    const smaller = document.createElement('canvas');
    const shrink = 320 / Math.max(canvas.width, canvas.height);
    smaller.width = Math.max(1, Math.round(canvas.width * shrink));
    smaller.height = Math.max(1, Math.round(canvas.height * shrink));
    const smallerCtx = smaller.getContext('2d')!;
    smallerCtx.fillStyle = '#ffffff';
    smallerCtx.fillRect(0, 0, smaller.width, smaller.height);
    smallerCtx.drawImage(canvas, 0, 0, smaller.width, smaller.height);
    for (const quality of [0.48, 0.4, 0.34]) {
      output = await canvasToBlob(smaller, 'image/webp', quality);
      if (output.size <= targetBytes) break;
    }
  }
  if (output.size > targetBytes) throw new Error(`Thumbnail melebihi ${formatFileSize(targetBytes)}.`);
  return output;
}

export async function logActivity(action: string, entityType?: string, entityId?: string, description?: string, metadata: Record<string, unknown> = {}) {
  const { data } = await supabase.auth.getSession();
  await supabase.from('activity_logs').insert({
    admin_id: data.session?.user.id ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    description,
    metadata,
  });
}

export async function loadPromoBanner(): Promise<PromoBannerSetting> {
  const { data } = await supabase.from('site_settings').select('*').eq('key', 'promo_banner').maybeSingle<SiteSetting>();
  return normalizePromoBanner(data?.value as Partial<PromoBannerSetting> | null);
}

export async function savePromoBanner(value: PromoBannerSetting) {
  const { data: existing } = await supabase.from('site_settings').select('id').eq('key', 'promo_banner').maybeSingle();
  if (existing) {
    return supabase.from('site_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', 'promo_banner');
  }
  return supabase.from('site_settings').insert({ key: 'promo_banner', value });
}

export async function loadTestimonials(includeInactive = false): Promise<Testimonial[]> {
  let q = supabase.from('testimonials').select('*').order('sort_order').order('created_at', { ascending: false });
  if (!includeInactive) q = q.eq('is_active', true);
  const { data } = await q.limit(100);
  return data || [];
}

export async function loadPackages(includeItems = false): Promise<BusinessPackage[]> {
  const select = includeItems
    ? `*, business_package_items(id,package_id,product_id,created_at,product:products(${PACKAGE_PRODUCT_SELECT}))`
    : '*';
  const { data } = await supabase.from('business_packages').select(select).order('created_at', { ascending: false }).limit(50);
  return (data || []) as unknown as BusinessPackage[];
}

type CacheEntry<T> = { expiresAt: number; promise: Promise<T> };
const publicRequestCache = new Map<string, CacheEntry<unknown>>();

function cachedPublicRequest<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const existing = publicRequestCache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > Date.now()) return existing.promise;
  const promise = loader().catch((error) => {
    publicRequestCache.delete(key);
    throw error;
  });
  publicRequestCache.set(key, { expiresAt: Date.now() + ttlMs, promise });
  return promise;
}

export interface PublicHomePayload {
  featured: Product[];
  latest: Product[];
  categories: Category[];
  packages: BusinessPackage[];
  testimonials: Testimonial[];
  promo_banner: Partial<PromoBannerSetting>;
}

export interface PublicProductPage {
  items: Product[];
  has_more: boolean;
  next_cursor: Record<string, string | number> | null;
}

export async function loadPublicHome(): Promise<PublicHomePayload> {
  return cachedPublicRequest('public-home', 10 * 60_000, async () => {
    const { data, error } = await supabase.rpc('get_public_home');
    if (error) throw new Error(error.message);
    const payload = (data || {}) as PublicHomePayload;
    return {
      featured: payload.featured || [],
      latest: payload.latest || [],
      categories: payload.categories || [],
      packages: payload.packages || [],
      testimonials: payload.testimonials || [],
      promo_banner: normalizePromoBanner(payload.promo_banner),
    };
  });
}

export async function loadPublicCatalogMeta(): Promise<{ categories: Category[]; packages: BusinessPackage[] }> {
  return cachedPublicRequest('public-catalog-meta', 10 * 60_000, async () => {
    const { data, error } = await supabase.rpc('get_public_catalog_meta');
    if (error) throw new Error(error.message);
    const payload = (data || {}) as { categories?: Category[]; packages?: BusinessPackage[] };
    return { categories: payload.categories || [], packages: payload.packages || [] };
  });
}

export async function listPublicProducts(params: {
  categorySlug?: string | null;
  search?: string;
  sort?: 'newest' | 'price-low' | 'price-high';
  cursor?: Record<string, string | number> | null;
  limit?: number;
}): Promise<PublicProductPage> {
  const key = `public-products:${JSON.stringify(params)}`;
  return cachedPublicRequest(key, 30_000, async () => {
    const { data, error } = await supabase.rpc('list_public_products', {
      p_category_slug: params.categorySlug || null,
      p_search: params.search?.trim() || null,
      p_sort: params.sort || 'newest',
      p_cursor: params.cursor || null,
      p_limit: Math.min(Math.max(params.limit || 48, 1), 48),
    });
    if (error) throw new Error(error.message);
    const page = (data || {}) as PublicProductPage;
    return { items: page.items || [], has_more: Boolean(page.has_more), next_cursor: page.next_cursor || null };
  });
}

export async function loadPublicProduct(productId: string): Promise<{ product: Product; category: Category | null } | null> {
  return cachedPublicRequest(`public-product:${productId}`, 30_000, async () => {
    const { data, error } = await supabase.rpc('get_public_product', { p_id: productId });
    if (error) throw new Error(error.message);
    if (!data || !(data as any).product) return null;
    return data as { product: Product; category: Category | null };
  });
}

export async function loadPublicPackages(limit = 6): Promise<BusinessPackage[]> {
  return cachedPublicRequest(`public-packages:${limit}`, 10 * 60_000, async () => {
    const { data, error } = await supabase.rpc('list_public_packages', { p_limit: Math.min(Math.max(limit, 1), 12) });
    if (error) throw new Error(error.message);
    return ((data || []) as BusinessPackage[]).filter(packageIsAvailable);
  });
}

export async function loadAdminProfiles(): Promise<AdminProfile[]> {
  const { data } = await supabase.from('admin_profiles').select('*').order('created_at', { ascending: false });
  return data || [];
}

export async function loadActivityLogs(): Promise<ActivityLog[]> {
  const { data } = await supabase
    .from('activity_logs')
    .select('*, admin_profiles(email, full_name)')
    .order('created_at', { ascending: false })
    .limit(100);
  return data || [];
}

export async function transitionOrderInventory(orderId: string, status: string) {
  const { error } = await supabase.rpc('transition_order_inventory', {
    p_order_id: orderId,
    p_order_status: status,
  });
  if (error) throw new Error(error.message);
}

export async function reserveOrderItems(orderId: string) {
  const { error } = await supabase.rpc('reserve_order_items', { p_order_id: orderId });
  if (error) throw new Error(error.message);
}

export async function loadBackupData() {
  const loadAllRows = async (table: string) => {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await supabase.from(table).select('*').range(from, from + 499);
      if (error) throw new Error(`Backup ${table} gagal: ${error.message}`);
      rows.push(...(data || []));
      if (!data || data.length < 500) return rows;
    }
  };
  const [products, packages, packageItems, orders, orderItems, customers, movements, settings, testimonials, logs, ledger, financeSettings] = await Promise.all([
    loadAllRows('products'),
    loadAllRows('business_packages'),
    loadAllRows('business_package_items'),
    loadAllRows('orders'),
    loadAllRows('order_items'),
    loadAllRows('customers'),
    loadAllRows('inventory_movements'),
    loadAllRows('site_settings'),
    loadAllRows('testimonials'),
    loadAllRows('activity_logs'),
    loadAllRows('cash_ledger'),
    loadAllRows('finance_settings'),
  ]);

  return {
    exported_at: new Date().toISOString(),
    products,
    business_packages: packages,
    business_package_items: packageItems,
    orders,
    order_items: orderItems,
    customers,
    inventory_movements: movements,
    site_settings: settings,
    testimonials,
    activity_logs: logs,
    cash_ledger: ledger,
    finance_settings: financeSettings,
  };
}

export async function loadFinanceSummary(dateFrom?: string, dateTo?: string): Promise<FinanceSummary> {
  const { data: aggregate, error: aggregateError } = await supabase.rpc('get_admin_finance_summary', {
    p_from: dateFrom || null,
    p_to: dateTo || null,
  });
  if (!aggregateError && aggregate) return aggregate as unknown as FinanceSummary;

  // Backward-compatible fallback while the aggregate RPC migration is rolling out.
  const [settingsRes, ledgerRes] = await Promise.all([
    supabase.from('finance_settings').select('*'),
    supabase.from('cash_ledger').select('*').order('transaction_date', { ascending: false }),
  ]);

  if (settingsRes.error) throw new Error(`Gagal memuat pengaturan keuangan: ${settingsRes.error.message}`);
  if (ledgerRes.error) throw new Error(`Gagal memuat riwayat transaksi: ${ledgerRes.error.message}`);

  const settings = (settingsRes.data || []) as FinanceSetting[];
  const openingBalance = Number(settings.find((s) => s.key === 'opening_balance')?.value || 0);
  return calculateFinanceSummary(openingBalance, (ledgerRes.data || []) as CashLedger[], dateFrom, dateTo);
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function computePackageCogs(pkg: BusinessPackage): number {
  return (pkg.business_package_items || []).reduce((sum, item) => sum + Number(item.product?.purchase_price || 0), 0);
}

export function productIsAvailable(product: Product): boolean {
  return product.status === 'active' && product.availability_status === 'ready' && Number(product.stock || 0) === 1;
}

export function packageIsAvailable(pkg: BusinessPackage): boolean {
  const baseAvailable = pkg.status === 'active' && pkg.availability_status === 'ready';
  if (!baseAvailable) return false;
  if (!Array.isArray(pkg.business_package_items)) return true;
  return pkg.business_package_items.length > 0 && pkg.business_package_items.every((item) => item.product && productIsAvailable(item.product));
}

export function productAvailabilityFromStock(product: Partial<Product>): ProductAvailabilityStatus {
  if (product.availability_status === 'reserved') return 'reserved';
  if (product.availability_status === 'sold' || product.status === 'sold_out') return 'sold';
  return Number(product.stock || 0) === 1 ? 'ready' : 'sold';
}

export function itemStatusColor(status: ProductAvailabilityStatus): string {
  if (status === 'ready') return 'bg-success-100 text-success-700';
  if (status === 'reserved') return 'bg-warning-100 text-warning-700';
  return 'bg-neutral-200 text-neutral-600';
}

export function orderIsPaid(order: Order): boolean {
  return order.payment_status === 'paid' || order.order_status === 'completed';
}
