export const BRAND = {
  name: 'Sumber Sandang',
  tagline: 'Toko Baju Terlengkap',
  logo: 'https://images.pexels.com/photos/996329/pexels-photo-996329.jpeg?auto=compress&cs=tinysrgb&w=128&h=128&fit=crop',
  instagram: 'sumber.sandanggg',
  instagramUrl: 'https://www.instagram.com/sumber.sandanggg',
  mapsUrl: 'https://maps.app.goo.gl/zYVh2tbauVVR1EnP8',
  whatsapp: '6281234567890',
  whatsappDisplay: '+62 812-3456-7890',
  email: 'sumber.sandang@gmail.com',
};

export const WHATSAPP_LINK = `https://wa.me/${BRAND.whatsapp}`;

export function formatIDR(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);
}

export function genPONumber(): string {
  const d = new Date();
  return `PO${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}

export function genProductCode(slug: string, n: number): string {
  const prefix = (slug || 'GEN').slice(0, 3).toUpperCase();
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

export function genBarcode(code: string): string {
  return code.replace(/[^A-Z0-9]/g, '');
}

export function genOrderNumber(): string {
  const d = new Date();
  return `ORD${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
}

export function genInvoiceNumber(): string {
  const d = new Date();
  return `INV${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}

export function waMessage(msg: string): string {
  return `https://wa.me/${BRAND.whatsapp}?text=${encodeURIComponent(msg)}`;
}

export function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(d: string | Date): string {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

import { supabase } from './supabase';

export async function uploadProductImage(file: Blob, productCode: string): Promise<string> {
  const path = `${productCode}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('products').upload(path, file, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`Upload gagal: ${error.message}`);
  return path;
}

export const PAYMENT_METHODS = [
  { val: 'cash', label: 'Cash', desc: 'Bayar tunai di toko' },
  { val: 'saldo', label: 'Saldo', desc: 'Bayar pakai saldo' },
  { val: 'transfer', label: 'Transfer Bank', desc: 'BCA / Mandiri / BNI' },
];

export function paymentLabel(method: string): string {
  return PAYMENT_METHODS.find((p) => p.val === method)?.label || method;
}
