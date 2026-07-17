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
  video_url?: string;
  tags: string[];
  is_featured: boolean;
  status: 'active' | 'inactive' | 'sold_out';
  weight_grams: number;
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
  shipping_method: string;
  shipping_cost: number;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  payment_method: string;
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  order_status: OrderStatus;
  coupon_code?: string;
  notes?: string;
  admin_notes?: string;
  proof_of_payment_url?: string;
  estimated_delivery?: string;
  shipped_at?: string;
  completed_at?: string;
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
  action: string;
  entity_type?: string;
  entity_id?: string;
  description?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}
