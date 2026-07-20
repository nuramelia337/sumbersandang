import { supabase } from './supabase';
import type {
  ActivityLog,
  AdminProfile,
  BusinessPackage,
  CashLedger,
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
export const TARGET_IMAGE_UPLOAD_BYTES = 700 * 1024;

export const DEFAULT_PROMO_BANNER: PromoBannerSetting = {
  title: 'Paket usaha thrift siap jual',
  subtitle: 'Kurasi pakaian pilihan untuk reseller dan pemilik butik kecil.',
  cta_label: 'Lihat Paket',
  cta_page: 'shop:packages',
  image_url: 'https://images.pexels.com/photos/1488463/pexels-photo-1488463.jpeg',
  is_active: true,
};

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

export function packageImageUrl(pkg: Pick<BusinessPackage, 'cover_image_path' | 'cover_image_url'>): string {
  return storageImageUrl(pkg.cover_image_path) || pkg.cover_image_url || DEFAULT_PROMO_BANNER.image_url;
}

export async function uploadImage(file: Blob, folder: string): Promise<string> {
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const { error } = await supabase.storage.from('products').upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: true,
  });
  if (error) throw new Error(`Upload gagal: ${error.message}`);
  return path;
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
    img.onerror = reject;
    img.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Gagal memproses gambar'))), 'image/jpeg', quality);
  });
}

export async function optimizeImage(file: Blob, brightness = 1.08, targetBytes = TARGET_IMAGE_UPLOAD_BYTES): Promise<Blob> {
  const img = await loadImageElement(file);
  const maxSize = 1200;
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.filter = `brightness(${brightness}) contrast(1.04) saturate(1.04)`;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const qualities = [0.78, 0.72, 0.66, 0.6];
  let output = await canvasToJpeg(canvas, qualities[0]);
  for (const quality of qualities.slice(1)) {
    if (output.size <= targetBytes) break;
    output = await canvasToJpeg(canvas, quality);
  }

  if (output.size > targetBytes && Math.max(canvas.width, canvas.height) > 960) {
    const smaller = document.createElement('canvas');
    const shrink = 960 / Math.max(canvas.width, canvas.height);
    smaller.width = Math.max(1, Math.round(canvas.width * shrink));
    smaller.height = Math.max(1, Math.round(canvas.height * shrink));
    const smallerCtx = smaller.getContext('2d')!;
    smallerCtx.drawImage(canvas, 0, 0, smaller.width, smaller.height);
    output = await canvasToJpeg(smaller, 0.68);
  }

  return output;
}

export async function logActivity(action: string, entityType?: string, entityId?: string, description?: string, metadata: Record<string, unknown> = {}) {
  const { data } = await supabase.auth.getUser();
  await supabase.from('activity_logs').insert({
    admin_id: data.user?.id ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    description,
    metadata,
  });
}

export async function loadPromoBanner(): Promise<PromoBannerSetting> {
  const { data } = await supabase.from('site_settings').select('*').eq('key', 'promo_banner').maybeSingle<SiteSetting>();
  return { ...DEFAULT_PROMO_BANNER, ...(data?.value || {}) } as PromoBannerSetting;
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
  const { data } = await q;
  return data || [];
}

export async function loadPackages(includeItems = false): Promise<BusinessPackage[]> {
  const select = includeItems
    ? '*, business_package_items(*, product:products(*))'
    : '*';
  const { data } = await supabase.from('business_packages').select(select).order('created_at', { ascending: false });
  return (data || []) as unknown as BusinessPackage[];
}

export async function loadPublicPackages(limit = 6): Promise<BusinessPackage[]> {
  const { data } = await supabase
    .from('business_packages')
    .select('*, business_package_items(*, product:products(*))')
    .eq('status', 'active')
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data || []) as unknown as BusinessPackage[];
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
  const [products, packages, packageItems, orders, orderItems, customers, movements, settings, testimonials, logs, ledger, financeSettings] = await Promise.all([
    supabase.from('products').select('*'),
    supabase.from('business_packages').select('*'),
    supabase.from('business_package_items').select('*'),
    supabase.from('orders').select('*'),
    supabase.from('order_items').select('*'),
    supabase.from('customers').select('*'),
    supabase.from('inventory_movements').select('*'),
    supabase.from('site_settings').select('*'),
    supabase.from('testimonials').select('*'),
    supabase.from('activity_logs').select('*'),
    supabase.from('cash_ledger').select('*'),
    supabase.from('finance_settings').select('*'),
  ]);

  return {
    exported_at: new Date().toISOString(),
    products: products.data || [],
    business_packages: packages.data || [],
    business_package_items: packageItems.data || [],
    orders: orders.data || [],
    order_items: orderItems.data || [],
    customers: customers.data || [],
    inventory_movements: movements.data || [],
    site_settings: settings.data || [],
    testimonials: testimonials.data || [],
    activity_logs: logs.data || [],
    cash_ledger: ledger.data || [],
    finance_settings: financeSettings.data || [],
  };
}

export async function loadFinanceSummary(dateFrom?: string, dateTo?: string) {
  const [settingsRes, ledgerRes, ordersRes, itemsRes] = await Promise.all([
    supabase.from('finance_settings').select('*'),
    supabase.from('cash_ledger').select('*').order('transaction_date', { ascending: false }),
    supabase.from('orders').select('*'),
    supabase.from('order_items').select('order_id, purchase_price, quantity'),
  ]);

  const settings = (settingsRes.data || []) as FinanceSetting[];
  const openingBalance = Number(settings.find((s) => s.key === 'opening_balance')?.value || 0);
  const ledger = ((ledgerRes.data || []) as CashLedger[]).filter((row) => {
    if (dateFrom && row.transaction_date < dateFrom) return false;
    if (dateTo && row.transaction_date > dateTo) return false;
    return true;
  });
  const validOrders = (ordersRes.data || []).filter((o) => {
    if (!orderCountsAsRevenue(o)) return false;
    if (dateFrom && String(o.created_at).slice(0, 10) < dateFrom) return false;
    if (dateTo && String(o.created_at).slice(0, 10) > dateTo) return false;
    return true;
  });
  const validOrderIds = new Set(validOrders.map((o) => o.id));
  const visibleLedger = ledger.filter((row) => {
    if (row.reference_type !== 'order') return true;
    return Boolean(row.reference_id && validOrderIds.has(row.reference_id));
  });
  const items = (itemsRes.data || []).filter((i) => validOrderIds.has(i.order_id));
  const orderRevenue = validOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const cogs = items.reduce((sum, item) => sum + Number(item.purchase_price || 0) * Number(item.quantity || 0), 0);
  const manualIn = visibleLedger.filter((row) => row.type === 'in' && row.reference_type !== 'order').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const cashOut = visibleLedger.filter((row) => row.type === 'out' || row.type === 'operational').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const operational = visibleLedger.filter((row) => row.type === 'operational').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const cashIn = orderRevenue + manualIn;
  return {
    openingBalance,
    cashIn,
    cashOut,
    totalBalance: openingBalance + cashIn - cashOut,
    salesProfit: orderRevenue - cogs,
    operationalExpenses: operational,
    ledger: visibleLedger,
  };
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
  return product.status === 'active' && product.availability_status === 'ready' && Number(product.stock || 0) > 0;
}

export function packageIsAvailable(pkg: BusinessPackage): boolean {
  return pkg.status === 'active' && pkg.availability_status === 'ready';
}

export function productAvailabilityFromStock(product: Partial<Product>): ProductAvailabilityStatus {
  if (product.availability_status) return product.availability_status;
  return Number(product.stock || 0) > 0 ? 'ready' : 'sold';
}

export function itemStatusColor(status: ProductAvailabilityStatus): string {
  if (status === 'ready') return 'bg-success-100 text-success-700';
  if (status === 'reserved') return 'bg-warning-100 text-warning-700';
  return 'bg-neutral-200 text-neutral-600';
}

export function orderIsPaid(order: Order): boolean {
  return order.payment_status === 'paid' || order.order_status === 'completed';
}
