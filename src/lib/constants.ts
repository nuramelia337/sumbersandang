export const BRAND = {
  name: 'Sumber Sandang',
  tagline: 'Toko Baju Terlengkap',
  logo: '/sumber-sandang-logo.webp',
  instagram: 'sumber.sandanggg',
  instagramUrl: 'https://www.instagram.com/sumber.sandanggg',
  mapsUrl: 'https://maps.app.goo.gl/zYVh2tbauVVR1EnP8',
  whatsapp: '6281521705794',
  whatsappDisplay: '+62 815-2170-5794',
  email: 'lia09.amel@gmail.com',
};

export const WHATSAPP_LINK = `https://wa.me/${BRAND.whatsapp}`;

export function formatIDR(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);
}

export function genPONumber(): string {
  const d = new Date();
  return `PO${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}

export function genProductCode(_slug: string, n: number): string {
  return `SS${String(n).padStart(3, '0')}`;
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

export async function uploadProductImages(files: Blob[], productCode: string): Promise<string[]> {
  const uploaded: string[] = [];
  for (const [index, file] of files.entries()) {
    const path = `${productCode}-${Date.now()}-${index}.jpg`;
    const { error } = await supabase.storage.from('products').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true });
    if (error) throw new Error(`Upload gagal: ${error.message}`);
    uploaded.push(path);
  }
  return uploaded;
}

export const PAYMENT_METHODS = [
  { val: 'bca', label: 'BCA', desc: 'Transfer Bank BCA' },
  { val: 'dana', label: 'DANA', desc: 'Transfer via DANA' },
  { val: 'shopeepay', label: 'ShopeePay', desc: 'Transfer via ShopeePay' },
];

export const SHIPPING_METHODS = [
  { val: 'pickup', label: 'Ambil Sendiri', desc: 'Ambil di toko sesuai jam' },
  { val: 'jnt', label: 'JNT', desc: 'Kirim via JNT' },
  { val: 'spx', label: 'SPX', desc: 'Kirim via Shopee Xpress' },
  { val: 'maxim', label: 'Maxim', desc: 'Kirim via Maxim' },
];

export function paymentLabel(method: string): string {
  return PAYMENT_METHODS.find((p) => p.val === method)?.label || method;
}
