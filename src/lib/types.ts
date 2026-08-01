export type ProductAvailabilityStatus = 'ready' | 'reserved' | 'sold';
export type LegacyProductStatus = 'active' | 'inactive' | 'sold_out';
export type StorageLocation =
  | 'keranjang_1'
  | 'keranjang_2'
  | 'keranjang_3'
  | 'keranjang_4'
  | 'keranjang_5'
  | 'keranjang_6'
  | 'keranjang_7'
  | 'keranjang_8'
  | 'keranjang_9'
  | 'keranjang_10'
  | 'keranjang_11'
  | 'keranjang_12'
  | 'keranjang_13'
  | 'keranjang_14';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  image_url?: string;
  sort_order: number;
  created_at: string;
}

export interface Product {
  id: string;
  product_code: string;
  barcode?: string;
  name: string;
  category_id?: string;
  brand?: string;
  size?: string;
  color?: string;
  material?: string;
  condition: 'Like New' | 'Excellent' | 'Good' | 'Fair';
  description?: string;
  purchase_price: number;
  selling_price: number;
  stock: number;
  min_stock: number;
  images: string[];
  image_path?: string | null;
  thumbnail_path?: string | null;
  video_url?: string;
  tags: string[];
  is_featured: boolean;
  status: LegacyProductStatus;
  availability_status: ProductAvailabilityStatus;
  storage_location?: StorageLocation | null;
  internal_notes?: string | null;
  weight_grams: number;
  created_at: string;
  updated_at: string;
}

export interface BusinessPackage {
  id: string;
  package_code: string;
  name: string;
  description?: string | null;
  price: number;
  cover_image_path?: string | null;
  thumbnail_path?: string | null;
  cover_image_url?: string | null;
  is_featured: boolean;
  availability_status: ProductAvailabilityStatus;
  status: LegacyProductStatus;
  internal_notes?: string | null;
  created_at: string;
  updated_at: string;
  business_package_items?: BusinessPackageItem[];
}

export interface BusinessPackageItem {
  id: string;
  package_id: string;
  product_id: string;
  created_at: string;
  product?: Product;
}

export interface SiteSetting {
  id: string;
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
}

export interface PromoBannerSetting {
  title: string;
  subtitle: string;
  cta_label: string;
  cta_page: string;
  image_url: string;
  is_active: boolean;
}

export interface Testimonial {
  id: string;
  customer_name: string;
  customer_handle?: string | null;
  message: string;
  rating: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface AdminProfile {
  id: string;
  email: string;
  full_name?: string | null;
  role: 'owner' | 'admin';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  notes?: string;
  total_orders: number;
  total_spending: number;
  created_at: string;
  updated_at: string;
}

export type PaymentMethod = 'bca' | 'dana' | 'shopeepay' | 'cash';
export type ShippingMethod = 'pickup' | 'jnt' | 'spx' | 'maxim';
export type KeepStatus = 'active' | 'expired' | 'confirmed' | 'released';

export interface Order {
  id: string;
  order_number: string;
  invoice_number: string;
  customer_id?: string;
  customer_name: string;
  customer_phone: string;
  customer_address?: string;
  customer_city?: string;
  customer_province?: string;
  shipping_method: ShippingMethod;
  shipping_cost: number;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  payment_method: PaymentMethod;
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  order_status: OrderStatus;
  coupon_code?: string;
  notes?: string;
  admin_notes?: string;
  proof_of_payment_url?: string;
  estimated_delivery?: string;
  shipped_at?: string;
  completed_at?: string;
  keep_expires_at?: string;
  payment_confirmed_at?: string;
  keep_status?: KeepStatus;
  shipping_note?: string;
  created_at: string;
  updated_at: string;
  order_items?: OrderItem[];
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'packing'
  | 'ready'
  | 'shipped'
  | 'completed'
  | 'cancelled'
  | 'returned'
  | 'refunded';

export interface OrderItem {
  id: string;
  order_id: string;
  product_id?: string;
  package_id?: string | null;
  item_type?: 'product' | 'package';
  product_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  purchase_price: number;
  subtotal: number;
  created_at: string;
}

export interface InventoryMovement {
  id: string;
  product_id: string;
  type: 'in' | 'out' | 'adjustment' | 'damaged' | 'lost' | 'return';
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  reference_type?: string;
  reference_id?: string;
  notes?: string;
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_name: string;
  supplier_phone?: string;
  supplier_address?: string;
  total_items: number;
  total_cost: number;
  status: 'draft' | 'sent' | 'received' | 'cancelled';
  notes?: string;
  ordered_at?: string;
  received_at?: string;
  created_at: string;
  updated_at: string;
  purchase_order_items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: string;
  po_id: string;
  product_name: string;
  category?: string;
  quantity: number;
  unit_cost: number;
  subtotal: number;
  received_quantity: number;
  created_at: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  min_purchase: number;
  max_uses?: number;
  used_count: number;
  valid_from: string;
  valid_until?: string;
  is_active: boolean;
  created_at: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  reference_type?: string;
  reference_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  admin_id?: string | null;
  action: string;
  entity_type?: string;
  entity_id?: string;
  description?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  admin_profiles?: Pick<AdminProfile, 'email' | 'full_name'> | null;
}

export interface FinanceSetting {
  id: string;
  key: string;
  value: number;
  updated_at: string;
}

export interface CashLedger {
  id: string;
  type: 'initial' | 'in' | 'out' | 'operational';
  amount: number;
  description: string;
  payment_method?: PaymentMethod | null;
  reference_type?: string | null;
  reference_id?: string | null;
  transaction_date: string;
  created_at: string;
  created_by?: string | null;
}

export interface ProductCartItem {
  kind: 'product';
  product: Product;
  quantity: number;
}

export interface PackageCartItem {
  kind: 'package';
  package: BusinessPackage;
  quantity: number;
}

export type CartItem = ProductCartItem | PackageCartItem;
