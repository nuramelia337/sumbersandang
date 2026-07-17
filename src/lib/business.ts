import { supabase } from './supabase';
import type {
  ActivityLog,
  AdminProfile,
  BusinessPackage,
  Order,
  Product,
  ProductAvailabilityStatus,
  PromoBannerSetting,
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
  rak_a: 'Rak A',
  rak_b: 'Rak B',
  gudang: 'Gudang',
  etalase: 'Etalase',
};

export const STORAGE_LOCATIONS = Object.entries(STORAGE_LOCATION_LABELS).map(([value, label]) => ({
  value: value as StorageLocation,
  label,
}));

export const DEFAULT_PROMO_BANNER: PromoBannerSetting = {
  title: 'Paket usaha thrift siap jual',
  subtitle: 'Kurasi pakaian pilihan untuk reseller dan pemilik butik kecil.',
  cta_label: 'Lihat Paket',
  cta_page: 'shop',
  image_url: 'https://images.pexels.com/photos/1488463/pexels-photo-1488463.jpeg',
  is_active: true,
};

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
  await supabase.rpc('transition_order_inventory', {
    p_order_id: orderId,
    p_order_status: status,
  });
}

export async function reserveOrderItems(orderId: string) {
  await supabase.rpc('reserve_order_items', { p_order_id: orderId });
}

export async function loadBackupData() {
  const [products, packages, packageItems, orders, orderItems, customers, movements, settings, testimonials, logs] = await Promise.all([
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
  return product.status === 'active' && product.availability_status === 'ready';
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
