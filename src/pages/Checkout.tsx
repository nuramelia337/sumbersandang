import { useState } from 'react';
import { ArrowLeft, CheckCircle, MessageCircle, AlertCircle, Instagram, Calendar, Clock } from 'lucide-react';
import { useCart } from '../lib/cart';
import { supabase } from '../lib/supabase';
import { formatIDR, genOrderNumber, genInvoiceNumber, waMessage } from '../lib/constants';

interface Props {
  onNavigate: (page: string, data?: any) => void;
}

export default function Checkout({ onNavigate }: Props) {
  const { items, subtotal, clearCart } = useCart();
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [form, setForm] = useState({
    name: '',
    phone: '',
    instagram: '',
    address: '',
    city: '',
    province: '',
    shipping: 'pickup',
    payment: 'transfer',
    pickupDate: '',
    pickupTime: '',
    notes: '',
    coupon: '',
  });
  const [discount, setDiscount] = useState(0);
  const [couponError, setCouponError] = useState('');

  const shippingCost = form.shipping === 'delivery' ? 20000 : 0;
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
      alert('Mohon pilih tanggal dan jam pengambilan');
      return;
    }
    setLoading(true);

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
      coupon_code: form.coupon || null,
      notes: form.notes + (form.instagram ? ` | IG: ${form.instagram}` : '') + (form.pickupDate ? ` | Ambil: ${form.pickupDate} ${form.pickupTime}` : ''),
      estimated_delivery: estimatedDelivery,
    }).select('id').single();

    if (error || !order) {
      setLoading(false);
      alert('Gagal membuat pesanan: ' + (error?.message || 'unknown'));
      return;
    }

    const orderItems = items.map((item) => ({
      order_id: order.id,
      product_id: item.product.id,
      product_code: item.product.product_code,
      product_name: item.product.name,
      quantity: item.quantity,
      unit_price: item.product.selling_price,
      purchase_price: item.product.purchase_price,
      subtotal: item.product.selling_price * item.quantity,
    }));
    await supabase.from('order_items').insert(orderItems);

    for (const item of items) {
      const newStock = Math.max(0, item.product.stock - item.quantity);
      await supabase.from('products').update({ stock: newStock, updated_at: new Date().toISOString() }).eq('id', item.product.id);
      await supabase.from('inventory_movements').insert({
        product_id: item.product.id,
        type: 'out',
        quantity: item.quantity,
        quantity_before: item.product.stock,
        quantity_after: newStock,
        reference_type: 'order',
        reference_id: order.id,
        notes: `Order ${orderNumber}`,
      });
    }

    if (customerId) {
      await supabase.rpc('increment_customer_stats', {
        p_customer_id: customerId,
        p_amount: total,
      });
    }

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
    setStep('success');
    clearCart();
    setLoading(false);
  };

  if (step === 'success') {
    const waMsg = `Halo Sumber Sandang! Saya baru saja membuat pesanan:\n\nNo. Pesanan: ${orderId}\nNo. Invoice: ${invoiceNo}\nNama: ${form.name}\nIG: ${form.instagram || '-'}\nTotal: ${formatIDR(total)}\nMetode: ${form.payment === 'transfer' ? 'Transfer Bank' : 'Cash'}\n${form.shipping === 'pickup' ? `Pengambilan: ${form.pickupDate} ${form.pickupTime}` : 'Dikirim'}\n\nMohon konfirmasi pembayaran. Terima kasih!`;
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
            <span className="text-sm font-semibold">{form.payment === 'transfer' ? 'Transfer Bank' : 'Cash'}</span>
          </div>
          {form.shipping === 'pickup' && (
            <div className="flex justify-between border-b border-neutral-200 py-3 dark:border-neutral-700">
              <span className="text-sm text-neutral-500">Pengambilan</span>
              <span className="text-sm font-semibold">{form.pickupDate} {form.pickupTime}</span>
            </div>
          )}
          <div className="flex justify-between pt-3">
            <span className="text-sm text-neutral-500">Total</span>
            <span className="text-lg font-bold text-primary-600">{formatIDR(total)}</span>
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
                { val: 'pickup', label: 'Ambil di Toko', cost: 0 },
                { val: 'delivery', label: 'Dikirim (JNE/J&T)', cost: 20000 },
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
                  <p className="text-xs text-neutral-500">{s.cost === 0 ? 'Gratis' : formatIDR(s.cost)}</p>
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
                { val: 'cash', label: 'Cash', desc: 'Bayar tunai di toko' },
                { val: 'saldo', label: 'Saldo', desc: 'Bayar pakai saldo' },
                { val: 'transfer', label: 'Transfer Bank', desc: 'BCA / Mandiri / BNI' },
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
                <div key={item.product.id} className="flex gap-3">
                  <img
                    src={item.product.images?.[0] || 'https://images.pexels.com/photos/996329/pexels-photo-996329.jpeg'}
                    alt={item.product.name}
                    className="h-16 w-16 rounded-lg object-cover"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{item.product.name}</p>
                    <p className="font-mono text-xs text-primary-500">{item.product.product_code}</p>
                    <p className="text-xs text-neutral-500">{item.quantity}x {formatIDR(item.product.selling_price)}</p>
                  </div>
                  <p className="text-sm font-semibold">{formatIDR(item.product.selling_price * item.quantity)}</p>
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
                Pembayaran {form.payment === 'transfer' ? 'transfer bank' : 'cash'}.
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
