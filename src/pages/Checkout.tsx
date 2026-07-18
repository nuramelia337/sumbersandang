import { useState } from 'react';
import { ArrowLeft, CheckCircle, MessageCircle, AlertCircle, Instagram, Calendar, Clock } from 'lucide-react';
import { getCartItemCode, getCartItemName, getCartItemPrice, useCart } from '../lib/cart';
import { supabase } from '../lib/supabase';
import { formatIDR, genOrderNumber, genInvoiceNumber, waMessage, PAYMENT_METHODS, SHIPPING_METHODS } from '../lib/constants';
import {
  computePackageCogs,
  packageImageUrl,
  PAYMENT_LABELS,
  reserveOrderItems,
  SHIPPING_LABELS,
} from '../lib/business';
import { getProductImageUrl } from '../lib/imageUtils';
import { useAlert } from '../components/AlertProvider';
import type { CartItem } from '../lib/types';

interface Props {
  onNavigate: (page: string, data?: any) => void;
}

export default function Checkout({ onNavigate }: Props) {
  const { items, subtotal, clearCart } = useCart();
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [successTotal, setSuccessTotal] = useState(0);
  const [successPayment, setSuccessPayment] = useState('');
  const [successShipping, setSuccessShipping] = useState('');
  const [successPickupDate, setSuccessPickupDate] = useState('');
  const [successPickupTime, setSuccessPickupTime] = useState('');
  const [successItems, setSuccessItems] = useState<CartItem[]>([]);
  const [showWaConfirm, setShowWaConfirm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    instagram: '',
    address: '',
    city: '',
    province: '',
    shipping: 'pickup',
    payment: 'bca',
    pickupDate: '',
    pickupTime: '',
    notes: '',
    coupon: '',
  });
  const [discount, setDiscount] = useState(0);
  const [couponError, setCouponError] = useState('');
  const [agreedRules, setAgreedRules] = useState(false);
  const { showAlert } = useAlert();

  const shippingCost = 0;
  const total = subtotal - discount + shippingCost;

  const today = new Date().toISOString().split('T')[0];

  const applyCoupon = async () => {
    if (!form.coupon) return;
    const { data } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', form.coupon.toUpperCase())
      .eq('is_active', true)
      .maybeSingle();
    if (!data) {
      setCouponError('Kupon tidak valid');
      setDiscount(0);
      return;
    }
    if (data.min_purchase && subtotal < data.min_purchase) {
      setCouponError(`Min belanja ${formatIDR(data.min_purchase)}`);
      setDiscount(0);
      return;
    }
    if (data.type === 'percentage') {
      setDiscount(Math.round((subtotal * data.value) / 100));
    } else {
      setDiscount(data.value);
    }
    setCouponError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;
    if (form.shipping === 'pickup' && (!form.pickupDate || !form.pickupTime)) {
      showAlert({
        title: 'Tanggal pengambilan belum lengkap',
        message: 'Mohon pilih tanggal dan jam pengambilan.',
        variant: 'warning',
      });
      return;
    }
    if (!agreedRules) {
      showAlert({
        title: 'Rules Belanja belum disetujui',
        message: 'Centang persetujuan Rules Belanja sebelum checkout.',
        variant: 'warning',
      });
      return;
    }
    setShowWaConfirm(true);
  };

  const confirmWhatsApp = async () => {
    if (items.length === 0) return;
    setLoading(true);

    try {
    const orderNumber = genOrderNumber();
    const invoiceNumber = genInvoiceNumber();

    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', form.phone)
      .maybeSingle();

    let customerId = existingCustomer?.id;
    if (!customerId) {
      const { data: newCustomer } = await supabase.from('customers').insert({
        name: form.name,
        phone: form.phone,
        address: form.address,
        city: form.city,
        province: form.province,
        notes: form.instagram ? `IG: ${form.instagram}` : undefined,
      }).select('id').single();
      customerId = newCustomer?.id;
    }

    const estimatedDelivery = form.shipping === 'pickup' ? form.pickupDate : undefined;

    const { data: order, error } = await supabase.from('orders').insert({
      order_number: orderNumber,
      invoice_number: invoiceNumber,
      customer_id: customerId,
      customer_name: form.name,
      customer_phone: form.phone,
      customer_address: form.address,
      customer_city: form.city,
      customer_province: form.province,
      shipping_method: form.shipping,
      shipping_cost: shippingCost,
      subtotal,
      discount_amount: discount,
      total_amount: total,
      payment_method: form.payment,
      payment_status: 'pending',
      order_status: 'pending',
      keep_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      keep_status: 'active',
      shipping_note: form.shipping === 'pickup' ? `${form.pickupDate} ${form.pickupTime}` : null,
      coupon_code: form.coupon || null,
      notes: form.notes + (form.instagram ? ` | IG: ${form.instagram}` : '') + (form.pickupDate ? ` | Ambil: ${form.pickupDate} ${form.pickupTime}` : ''),
      estimated_delivery: estimatedDelivery,
    }).select('id').single();

    if (error || !order) {
      showAlert({
        title: 'Gagal membuat pesanan',
        message: error?.message || 'Unknown error',
        variant: 'error',
      });
      return;
    }

    const orderItems = items.map((item) => {
      const unitPrice = getCartItemPrice(item);
      if (item.kind === 'package') {
        return {
          order_id: order.id,
          item_type: 'package',
          product_id: null,
          package_id: item.package.id,
          product_code: item.package.package_code,
          product_name: item.package.name,
          quantity: item.quantity,
          unit_price: unitPrice,
          purchase_price: computePackageCogs(item.package),
          subtotal: unitPrice * item.quantity,
          package_items_snapshot: item.package.business_package_items || [],
        };
      }
      return {
        order_id: order.id,
        item_type: 'product',
        product_id: item.product.id,
        package_id: null,
        product_code: item.product.product_code,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: unitPrice,
        purchase_price: item.product.purchase_price,
        subtotal: unitPrice * item.quantity,
        package_items_snapshot: [],
      };
    });
    const { error: orderItemsError } = await supabase.from('order_items').insert(orderItems);
    if (orderItemsError) throw new Error(orderItemsError.message);
    await reserveOrderItems(order.id);

    await supabase.from('notifications').insert({
      type: 'new_order',
      title: 'Pesanan Baru',
      message: `${form.name} - ${orderNumber} - ${formatIDR(total)}`,
      reference_type: 'order',
      reference_id: order.id,
    });

    await supabase.from('activity_logs').insert({
      action: 'order_created',
      entity_type: 'order',
      entity_id: order.id,
      description: `Order ${orderNumber} created by ${form.name}`,
    });

    try {
      const syncUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-sheets`;
      await fetch(syncUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ orderId: order.id }),
      });
    } catch {
      // non-blocking
    }

    setOrderId(orderNumber);
    setInvoiceNo(invoiceNumber);
    setSuccessTotal(total);
    setSuccessPayment(form.payment);
    setSuccessShipping(form.shipping);
    setSuccessPickupDate(form.pickupDate);
    setSuccessPickupTime(form.pickupTime);
    setSuccessItems(items);
    const autoProductLines = items.map((item) => {
      const image = item.kind === 'product' ? getProductImageUrl(item.product) : packageImageUrl(item.package);
      return `- ${getCartItemName(item)} (${getCartItemCode(item)})\n  Harga: ${formatIDR(getCartItemPrice(item))}\n  Qty: ${item.quantity}\n  Link Foto Produk: ${image}`;
    }).join('\n');
    const autoPaymentText = PAYMENT_LABELS[form.payment as keyof typeof PAYMENT_LABELS] || form.payment;
    const autoShippingText = SHIPPING_LABELS[form.shipping as keyof typeof SHIPPING_LABELS] || form.shipping;
    const autoWaMsg = `==========================\n\nKONFIRMASI PESANAN\n\nNama: ${form.name}\n\nAlamat: ${form.address}, ${form.city}, ${form.province}\n\nInstagram: ${form.instagram || '-'}\n\nNomor WhatsApp: ${form.phone}\n\nProduk:\n${autoProductLines}\n\nHarga: ${formatIDR(total)}\n\nMetode Pembayaran: ${autoPaymentText}\n\nMetode Pengiriman: ${autoShippingText}${form.shipping === 'pickup' ? ` (${form.pickupTime})` : ''}\n\nCatatan: ${form.notes || '-'}\n\nNo. Pesanan: ${orderNumber}\nNo. Invoice: ${invoiceNumber}\n\n==========================`;
    window.open(waMessage(autoWaMsg), '_blank', 'noopener,noreferrer');
    setShowWaConfirm(false);
    clearCart();
    setStep('success');
    } catch (err) {
      showAlert({
        title: 'Gagal membuat pesanan',
        message: err instanceof Error ? err.message : 'Terjadi kesalahan saat membuat pesanan.',
        variant: 'error',
      });
    } finally {
    setLoading(false);
    }
  };

  if (step === 'success') {
    const paymentText = PAYMENT_LABELS[successPayment as keyof typeof PAYMENT_LABELS] || successPayment;
    const shippingText = SHIPPING_LABELS[successShipping as keyof typeof SHIPPING_LABELS] || successShipping;
    const productLines = successItems.map((item) => {
      const image = item.kind === 'product' ? getProductImageUrl(item.product) : packageImageUrl(item.package);
      return `- ${getCartItemName(item)} (${getCartItemCode(item)})\n  Harga: ${formatIDR(getCartItemPrice(item))}\n  Qty: ${item.quantity}\n  Link Foto Produk: ${image}`;
    }).join('\n');
    const waMsg = `==========================\n\nKONFIRMASI PESANAN\n\nNama: ${form.name}\n\nAlamat: ${form.address}, ${form.city}, ${form.province}\n\nInstagram: ${form.instagram || '-'}\n\nNomor WhatsApp: ${form.phone}\n\nProduk:\n${productLines}\n\nHarga: ${formatIDR(successTotal)}\n\nMetode Pembayaran: ${paymentText}\n\nMetode Pengiriman: ${shippingText}${successShipping === 'pickup' ? ` (${successPickupTime})` : ''}\n\nCatatan: ${form.notes || '-'}\n\nNo. Pesanan: ${orderId}\nNo. Invoice: ${invoiceNo}\n\n==========================`;
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success-100 text-success-600">
          <CheckCircle size={48} />
        </div>
        <h1 className="mt-6 font-serif text-3xl font-bold text-neutral-900 dark:text-neutral-50">
          Pesanan Berhasil!
        </h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Terima kasih, {form.name}! Pesanan Anda telah kami terima.
        </p>
        <div className="mt-6 w-full rounded-2xl border border-neutral-200 bg-white p-6 text-left dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex justify-between border-b border-neutral-200 pb-3 dark:border-neutral-700">
            <span className="text-sm text-neutral-500">No. Pesanan</span>
            <span className="text-sm font-semibold">{orderId}</span>
          </div>
          <div className="flex justify-between border-b border-neutral-200 py-3 dark:border-neutral-700">
            <span className="text-sm text-neutral-500">No. Invoice</span>
            <span className="text-sm font-semibold">{invoiceNo}</span>
          </div>
          <div className="flex justify-between border-b border-neutral-200 py-3 dark:border-neutral-700">
            <span className="text-sm text-neutral-500">Metode Pembayaran</span>
            <span className="text-sm font-semibold">{paymentText}</span>
          </div>
          {successShipping === 'pickup' && (
            <div className="flex justify-between border-b border-neutral-200 py-3 dark:border-neutral-700">
              <span className="text-sm text-neutral-500">Pengambilan</span>
              <span className="text-sm font-semibold">{successPickupDate} {successPickupTime}</span>
            </div>
          )}
          <div className="flex justify-between pt-3">
            <span className="text-sm text-neutral-500">Total</span>
            <span className="text-lg font-bold text-primary-600">{formatIDR(successTotal)}</span>
          </div>
        </div>
        <div className="mt-6 flex w-full items-start gap-3 rounded-2xl border-2 border-success-500 bg-success-50 p-4 text-left dark:border-success-700 dark:bg-success-900/20">
          <MessageCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-success-700 dark:text-success-400" />
          <div>
            <p className="text-sm font-bold text-success-800 dark:text-success-300">Wajib konfirmasi via WhatsApp</p>
            <p className="mt-1 text-sm text-success-700 dark:text-success-300">
              Jika WhatsApp belum terbuka, tekan tombol di bawah agar pesanan masuk ke chat admin.
            </p>
          </div>
        </div>
        <a
          href={waMessage(waMsg)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-success-500 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:bg-success-600"
        >
          <MessageCircle size={18} /> Konfirmasi via WhatsApp
        </a>
        <button onClick={() => onNavigate('home')} className="mt-4 btn-ghost">
          Kembali ke Beranda
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-neutral-500">Keranjang masih kosong</p>
        <button onClick={() => onNavigate('shop')} className="mt-4 btn-primary">
          Mulai Belanja
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {showWaConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border-2 border-warning-500 bg-warning-50 p-6 text-center shadow-2xl dark:border-warning-700 dark:bg-warning-900/20">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning-200 text-warning-800 dark:bg-warning-800 dark:text-warning-100">
              <AlertCircle size={30} />
            </div>
            <h2 className="mt-4 font-serif text-2xl font-bold text-warning-950 dark:text-warning-100">
              Wajib Konfirmasi Pesanan
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-warning-900 dark:text-warning-100">
              Tekan tombol di bawah untuk membuat pesanan dan mengirim format konfirmasi ke WhatsApp admin. Pesanan belum tercatat jika Anda membatalkan langkah ini.
            </p>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setShowWaConfirm(false)} disabled={loading} className="btn-secondary flex-1">
                Batal
              </button>
              <button type="button" onClick={confirmWhatsApp} disabled={loading} className="btn-primary flex-1 disabled:opacity-50">
                <MessageCircle size={18} /> {loading ? 'Memproses...' : 'Konfirmasi via WhatsApp'}
              </button>
            </div>
          </div>
        </div>
      )}
      <button
        onClick={() => onNavigate('shop')}
        className="mb-6 inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-primary-600"
      >
        <ArrowLeft size={16} /> Lanjut Belanja
      </button>

      <h1 className="mb-4 font-serif text-3xl font-bold text-neutral-900 dark:text-neutral-50">Checkout</h1>

      {/* No retur notice */}
      <div className="mb-8 flex items-center gap-3 rounded-xl border border-error-200 bg-error-50 px-4 py-3 dark:border-error-800 dark:bg-error-900/20">
        <AlertCircle size={20} className="flex-shrink-0 text-error-600" />
        <p className="text-sm text-error-700 dark:text-error-400">
          <span className="font-semibold">Penting:</span> Barang yang sudah dibeli tidak bisa retur. Pastikan cek ukuran dan kondisi sebelum checkout.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Form */}
        <form onSubmit={handleSubmit} className="lg:col-span-2">
          <div className="card p-6">
            <h2 className="mb-4 font-serif text-xl font-bold text-neutral-900 dark:text-neutral-50">
              Data Pemesan
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Nama Lengkap</label>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-field"
                  placeholder="Nama Anda"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">No. WhatsApp</label>
                <input
                  required
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="input-field"
                  placeholder="08xxxxxxxxxx"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  <Instagram size={14} /> Username Instagram
                </label>
                <input
                  type="text"
                  value={form.instagram}
                  onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                  className="input-field"
                  placeholder="@username.instagram"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Alamat Lengkap</label>
                <textarea
                  required
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="input-field"
                  rows={2}
                  placeholder="Jl. Contoh No. 123, RT/RW, Kelurahan, Kecamatan"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Kota</label>
                <input
                  required
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="input-field"
                  placeholder="Kota"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Provinsi</label>
                <input
                  required
                  type="text"
                  value={form.province}
                  onChange={(e) => setForm({ ...form, province: e.target.value })}
                  className="input-field"
                  placeholder="Provinsi"
                />
              </div>
            </div>

            <h3 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wider text-neutral-900 dark:text-neutral-100">
              Metode Pengambilan
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                ...SHIPPING_METHODS.map((s) => ({ ...s, cost: 0 })),
              ].map((s) => (
                <button
                  key={s.val}
                  type="button"
                  onClick={() => setForm({ ...form, shipping: s.val })}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    form.shipping === s.val
                      ? 'border-primary-500 bg-primary-50 dark:bg-neutral-800'
                      : 'border-neutral-200 dark:border-neutral-700'
                  }`}
                >
                  <p className="text-sm font-semibold">{s.label}</p>
                  <p className="text-xs text-neutral-500">{s.desc}</p>
                </button>
              ))}
            </div>

            {/* Pickup date & time */}
            {form.shipping === 'pickup' && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    <Calendar size={14} /> Tanggal Pengambilan
                  </label>
                  <input
                    required
                    type="date"
                    min={today}
                    value={form.pickupDate}
                    onChange={(e) => setForm({ ...form, pickupDate: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    <Clock size={14} /> Jam Pengambilan
                  </label>
                  <input
                    required
                    type="time"
                    value={form.pickupTime}
                    onChange={(e) => setForm({ ...form, pickupTime: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>
            )}

            <h3 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wider text-neutral-900 dark:text-neutral-100">
              Metode Pembayaran
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                ...PAYMENT_METHODS,
              ].map((p) => (
                <button
                  key={p.val}
                  type="button"
                  onClick={() => setForm({ ...form, payment: p.val })}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    form.payment === p.val
                      ? 'border-primary-500 bg-primary-50 dark:bg-neutral-800'
                      : 'border-neutral-200 dark:border-neutral-700'
                  }`}
                >
                  <p className="text-sm font-semibold">{p.label}</p>
                  <p className="text-xs text-neutral-500">{p.desc}</p>
                </button>
              ))}
            </div>

            <div className="mt-6">
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Catatan (opsional)</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="input-field"
                rows={2}
                placeholder="Catatan untuk penjual..."
              />
            </div>
            <label className="mt-5 flex items-start gap-3 rounded-xl bg-neutral-50 p-4 text-sm dark:bg-neutral-800">
              <input type="checkbox" checked={agreedRules} onChange={(e) => setAgreedRules(e.target.checked)} className="mt-1 h-4 w-4" />
              <span className="text-neutral-600 dark:text-neutral-300">
                Saya sudah membaca dan menyetujui seluruh Rules Belanja, termasuk keep 1x24 jam, no return & no refund.
              </span>
            </label>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-2xl border-2 border-warning-500 bg-warning-50 p-4 dark:border-warning-700 dark:bg-warning-900/20">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning-700 dark:text-warning-400" />
            <p className="text-sm font-semibold text-warning-800 dark:text-warning-300">
              Setelah checkout, wajib konfirmasi pesanan lewat WhatsApp agar admin dapat memproses order Anda.
            </p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary mt-6 w-full disabled:opacity-50"
          >
            {loading ? 'Memproses...' : `Bayar ${formatIDR(total)}`}
          </button>
        </form>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="card sticky top-24 p-6">
            <h2 className="mb-4 font-serif text-xl font-bold text-neutral-900 dark:text-neutral-50">
              Ringkasan Pesanan
            </h2>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {items.map((item) => (
                <div key={`${item.kind}:${item.kind === 'product' ? item.product.id : item.package.id}`} className="flex gap-3">
                  <img
                    src={item.kind === 'product' ? getProductImageUrl(item.product) : packageImageUrl(item.package)}
                    alt={getCartItemName(item)}
                    className="h-16 w-16 rounded-lg object-cover"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{getCartItemName(item)}</p>
                    <p className="font-mono text-xs text-primary-500">{getCartItemCode(item)}</p>
                    <p className="text-xs text-neutral-500">{item.quantity}x {formatIDR(getCartItemPrice(item))}</p>
                  </div>
                  <p className="text-sm font-semibold">{formatIDR(getCartItemPrice(item) * item.quantity)}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.coupon}
                  onChange={(e) => setForm({ ...form, coupon: e.target.value })}
                  placeholder="Kode kupon"
                  className="input-field text-sm"
                />
                <button type="button" onClick={applyCoupon} className="btn-secondary whitespace-nowrap">
                  Pakai
                </button>
              </div>
              {couponError && <p className="mt-1 text-xs text-error-500">{couponError}</p>}
            </div>

            <div className="mt-4 space-y-2 border-t border-neutral-200 pt-4 text-sm dark:border-neutral-700">
              <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                <span>Subtotal</span>
                <span>{formatIDR(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-success-600">
                  <span>Diskon</span>
                  <span>-{formatIDR(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                <span>Ongkir</span>
                <span>{shippingCost === 0 ? 'Gratis' : formatIDR(shippingCost)}</span>
              </div>
              <div className="flex justify-between border-t border-neutral-200 pt-2 text-lg font-bold text-neutral-900 dark:border-neutral-700 dark:text-neutral-50">
                <span>Total</span>
                <span className="text-primary-600">{formatIDR(total)}</span>
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800">
              <p className="text-xs text-neutral-500">
                Pembayaran {PAYMENT_LABELS[form.payment as keyof typeof PAYMENT_LABELS]}.
                {form.shipping === 'pickup' && form.pickupDate && ` Ambil tanggal ${form.pickupDate} ${form.pickupTime}.`}
              </p>
              <p className="mt-1 text-xs font-medium text-error-600">No retur, no refund.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
