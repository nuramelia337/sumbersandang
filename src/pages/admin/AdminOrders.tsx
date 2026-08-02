import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatDateTime, formatIDR, waMessageTo } from '../../lib/constants';
import { Edit, Eye, MessageCircle, Search, Trash2, X } from 'lucide-react';
import type { Order, OrderItem, PaymentMethod } from '../../lib/types';
import { logActivity, packageImageUrl, PAYMENT_LABELS, SHIPPING_LABELS, transitionOrderInventory } from '../../lib/business';
import { useAlert } from '../../components/AlertProvider';
import { getProductImageUrl } from '../../lib/imageUtils';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning-100 text-warning-700',
  confirmed: 'bg-primary-100 text-primary-700',
  processing: 'bg-primary-100 text-primary-700',
  packing: 'bg-secondary-100 text-secondary-700',
  ready: 'bg-accent-100 text-accent-700',
  shipped: 'bg-primary-200 text-primary-800',
  completed: 'bg-success-100 text-success-700',
  cancelled: 'bg-neutral-100 text-neutral-500',
  returned: 'bg-error-100 text-error-700',
  refunded: 'bg-error-100 text-error-700',
};

const STATUSES = ['pending', 'confirmed', 'processing', 'packing', 'ready', 'shipped', 'completed', 'cancelled', 'returned', 'refunded'];

function paymentLabel(method: string) {
  return PAYMENT_LABELS[method as PaymentMethod] || method;
}

function shippingLabel(method: string) {
  return SHIPPING_LABELS[method as keyof typeof SHIPPING_LABELS] || method;
}

function orderItemImageUrl(item: OrderItem) {
  if (item.item_type === 'package') {
    return packageImageUrl(item.business_package || {}, 'thumbnail');
  }
  return getProductImageUrl(item.product || {}, 'thumbnail');
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [editingPaymentOrder, setEditingPaymentOrder] = useState<Order | null>(null);
  const [newPaymentMethod, setNewPaymentMethod] = useState<PaymentMethod>('bca');
  const { showAlert, showConfirm } = useAlert();

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      await supabase.rpc('release_expired_keeps');
    } catch {
      // Non-blocking; orders can still load if the migration is not applied yet.
    }
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (error) {
      showAlert({ title: 'Gagal memuat pesanan', message: error.message, variant: 'error' });
      setLoading(false);
      return;
    }
    setOrders(data || []);
    setLoading(false);
  };

  const filtered = orders.filter((order) => {
    const q = search.toLowerCase();
    const matchSearch =
      order.order_number.toLowerCase().includes(q) ||
      order.customer_name.toLowerCase().includes(q) ||
      order.customer_phone.includes(search);
    const matchStatus = filterStatus === 'all' || order.order_status === filterStatus;
    return matchSearch && matchStatus;
  });

  const updateStatus = async (id: string, status: string) => {
    try {
      const payload: Partial<Order> = { order_status: status as Order['order_status'], updated_at: new Date().toISOString() };
      if (status === 'shipped') payload.shipped_at = new Date().toISOString();
      if (status === 'completed') {
        payload.completed_at = new Date().toISOString();
        payload.payment_status = 'paid';
      }

      const { error } = await supabase.from('orders').update(payload).eq('id', id);
      if (error) throw new Error(error.message);

      await transitionOrderInventory(id, status);
      const { error: ledgerError } = await supabase.rpc('upsert_order_cash_ledger', { p_order_id: id });
      if (ledgerError) throw new Error(ledgerError.message);

      await logActivity('order_status_updated', 'order', id, `Order status changed to ${status}`);
      loadOrders();
      if (selectedOrder?.id === id) {
        setSelectedOrder({ ...selectedOrder, ...payload });
      }
    } catch (err) {
      showAlert({
        title: 'Gagal mengubah status pesanan',
        message: err instanceof Error ? err.message : 'Terjadi kesalahan saat mengubah status pesanan.',
        variant: 'error',
      });
    }
  };

  const viewOrder = async (order: Order) => {
    setSelectedOrder(order);
    const { data, error } = await supabase
      .from('order_items')
      .select(`
        *,
        product:products(id,product_code,name,image_path,thumbnail_path,images),
        business_package:business_packages(id,package_code,name,cover_image_path,cover_image_url,thumbnail_path)
      `)
      .eq('order_id', order.id);
    if (error) {
      showAlert({ title: 'Gagal memuat detail pesanan', message: error.message, variant: 'error' });
      return;
    }
    setOrderItems(data || []);
  };

  const sendWhatsApp = (order: Order) => {
    const igMatch = (order.notes || '').match(/IG: @?([^\s|]+)/);
    const ig = igMatch ? `\nIG: @${igMatch[1]}` : '';
    const pickupMatch = (order.notes || '').match(/Ambil: (\S+ \S+)/);
    const pickup = pickupMatch ? `\nPengambilan: ${pickupMatch[1]}` : '';
    const msg = `Halo ${order.customer_name}!${ig}\n\nPesanan Anda *${order.order_number}* telah kami terima.\nTotal: ${formatIDR(order.total_amount)}\nMetode Pembayaran: ${paymentLabel(order.payment_method)}\nMetode Pengiriman: ${shippingLabel(order.shipping_method)}${pickup}\n\nTerima kasih telah berbelanja di Sumber Sandang!`;
    window.open(waMessageTo(order.customer_phone, msg), '_blank');
  };

  const openPaymentEditor = (order: Order) => {
    setEditingPaymentOrder(order);
    setNewPaymentMethod(order.payment_method);
  };

  const updatePaymentMethod = async () => {
    if (!editingPaymentOrder) return;
    try {
      const oldMethod = editingPaymentOrder.payment_method;
      const { error } = await supabase
        .from('orders')
        .update({ payment_method: newPaymentMethod, updated_at: new Date().toISOString() })
        .eq('id', editingPaymentOrder.id);
      if (error) throw new Error(error.message);

      const { error: ledgerError } = await supabase.rpc('upsert_order_cash_ledger', { p_order_id: editingPaymentOrder.id });
      if (ledgerError) throw new Error(ledgerError.message);

      await logActivity(
        'order_payment_method_updated',
        'order',
        editingPaymentOrder.id,
        `Payment method changed from ${paymentLabel(oldMethod)} to ${paymentLabel(newPaymentMethod)}`,
      );
      setOrders((prev) => prev.map((order) => (order.id === editingPaymentOrder.id ? { ...order, payment_method: newPaymentMethod } : order)));
      if (selectedOrder?.id === editingPaymentOrder.id) {
        setSelectedOrder({ ...selectedOrder, payment_method: newPaymentMethod });
      }
      setEditingPaymentOrder(null);
    } catch (err) {
      showAlert({
        title: 'Gagal mengubah metode pembayaran',
        message: err instanceof Error ? err.message : 'Terjadi kesalahan saat mengubah metode pembayaran.',
        variant: 'error',
      });
    }
  };

  const deleteOrder = (order: Order) => {
    showConfirm({
      title: 'Hapus pesanan?',
      message: `Pesanan ${order.order_number} akan dihapus. Jika pesanan ini sudah masuk saldo, Total Uang Masuk akan berkurang sebesar ${formatIDR(order.total_amount)}.`,
      variant: 'error',
      confirmLabel: 'Hapus Pesanan',
      onConfirm: async () => {
        await transitionOrderInventory(order.id, 'cancelled');
        const { error: ledgerError } = await supabase.from('cash_ledger').delete().eq('reference_type', 'order').eq('reference_id', order.id).eq('type', 'in');
        if (ledgerError) throw new Error(ledgerError.message);

        const { error } = await supabase.from('orders').delete().eq('id', order.id);
        if (error) throw new Error(error.message);

        await logActivity('order_deleted', 'order', order.id, `Deleted order ${order.order_number}`);
        if (selectedOrder?.id === order.id) setSelectedOrder(null);
        setOrders((prev) => prev.filter((item) => item.id !== order.id));
        loadOrders();
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-50">Pesanan</h1>
        <p className="text-sm text-neutral-500">{orders.length} total pesanan</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari pesanan..."
            className="input-field pl-10"
          />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field max-w-[180px]">
          <option value="all">Semua Status</option>
          {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-16" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="card flex h-40 items-center justify-center text-neutral-400">Tidak ada pesanan</div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {filtered.map((order) => (
              <div key={order.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-primary-600">{order.order_number}</p>
                    <h2 className="mt-1 truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{order.customer_name}</h2>
                    <p className="text-xs text-neutral-500">{order.customer_phone}</p>
                    <p className="mt-1 text-xs text-neutral-500">{formatDateTime(order.created_at)}</p>
                  </div>
                  <span className={`badge ${STATUS_COLORS[order.order_status] || 'bg-neutral-100'}`}>{order.order_status}</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
                  <span className="text-xs text-neutral-500">Total</span>
                  <span className="font-semibold text-primary-600">{formatIDR(order.total_amount)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2 dark:bg-neutral-800">
                  <div>
                    <p className="text-xs text-neutral-500">Pembayaran</p>
                    <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{paymentLabel(order.payment_method)}</p>
                  </div>
                  <button type="button" onClick={() => openPaymentEditor(order)} className="rounded-lg p-2 text-neutral-500 hover:bg-white hover:text-primary-600 dark:hover:bg-neutral-700" title="Ganti metode pembayaran">
                    <Edit size={16} />
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => viewOrder(order)} className="btn-secondary px-3 py-2">
                    <Eye size={16} /> Detail
                  </button>
                  <button type="button" onClick={() => sendWhatsApp(order)} className="btn-secondary px-3 py-2 text-success-700">
                    <MessageCircle size={16} /> WA
                  </button>
                  <button type="button" onClick={() => deleteOrder(order)} className="inline-flex items-center justify-center gap-2 rounded-full bg-error-600 px-3 py-2 text-sm font-semibold text-white transition-all hover:bg-error-700">
                    <Trash2 size={16} /> Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="card hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">No. Pesanan</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Customer</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Tanggal</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Pembayaran</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Total</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Status</th>
                    <th className="px-4 py-3 text-right font-semibold text-neutral-700 dark:text-neutral-300">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {filtered.map((order) => (
                    <tr key={order.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                      <td className="px-4 py-3 font-mono text-xs">{order.order_number}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-neutral-900 dark:text-neutral-100">{order.customer_name}</p>
                        <p className="text-xs text-neutral-500">{order.customer_phone}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-500">{formatDateTime(order.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{paymentLabel(order.payment_method)}</span>
                          <button onClick={() => openPaymentEditor(order)} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-primary-600 dark:hover:bg-neutral-700" title="Ganti metode pembayaran">
                            <Edit size={14} />
                          </button>
                        </div>
                        <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${order.payment_status === 'paid' ? 'bg-success-100 text-success-700' : 'bg-warning-100 text-warning-700'}`}>
                          {order.payment_status === 'paid' ? 'Lunas' : 'Belum Bayar'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-primary-600">{formatIDR(order.total_amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${STATUS_COLORS[order.order_status] || 'bg-neutral-100'}`}>{order.order_status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => viewOrder(order)} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-primary-600 dark:hover:bg-neutral-700" title="Lihat detail">
                            <Eye size={16} />
                          </button>
                          <button onClick={() => sendWhatsApp(order)} className="rounded-lg p-2 text-neutral-500 hover:bg-success-50 hover:text-success-600 dark:hover:bg-success-900/30" title="Kirim WhatsApp">
                            <MessageCircle size={16} />
                          </button>
                          <button onClick={() => deleteOrder(order)} className="rounded-lg p-2 text-neutral-500 hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-900/30" title="Hapus pesanan">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedOrder(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-serif text-xl font-bold text-neutral-900 dark:text-neutral-50">Detail Pesanan</h2>
                <p className="text-sm text-neutral-500">{selectedOrder.order_number}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="rounded-full p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                <X size={20} />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="card p-4">
                <h3 className="mb-2 text-sm font-semibold">Info Customer</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">{selectedOrder.customer_name}</p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">{selectedOrder.customer_phone}</p>
                {selectedOrder.notes && selectedOrder.notes.includes('IG:') && (
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">IG: @{(selectedOrder.notes.match(/IG: @?([^\s|]+)/) || [])[1] || '-'}</p>
                )}
                <p className="text-sm text-neutral-600 dark:text-neutral-400">{selectedOrder.customer_address}</p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">{selectedOrder.customer_city}, {selectedOrder.customer_province}</p>
              </div>
              <div className="card p-4">
                <h3 className="mb-2 text-sm font-semibold">Info Pembayaran</h3>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">Metode: {paymentLabel(selectedOrder.payment_method)}</p>
                  <button type="button" onClick={() => openPaymentEditor(selectedOrder)} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-primary-600 dark:hover:bg-neutral-800">
                    <Edit size={14} />
                  </button>
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">Status: {selectedOrder.payment_status}</p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">Pengiriman: {shippingLabel(selectedOrder.shipping_method)}</p>
                {selectedOrder.shipping_method === 'pickup' && selectedOrder.notes && selectedOrder.notes.includes('Ambil:') && (
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">Pengambilan: {(selectedOrder.notes.match(/Ambil: (\S+ \S+)/) || [])[1] || '-'}</p>
                )}
              </div>
            </div>

            <div className="mt-4 card p-4">
              <h3 className="mb-3 text-sm font-semibold">Item Pesanan</h3>
              <div className="space-y-3">
                {orderItems.map((item) => (
                  <div key={item.id} className="flex gap-3 border-b border-neutral-100 pb-3 last:border-0 last:pb-0 dark:border-neutral-800">
                    <img
                      src={orderItemImageUrl(item)}
                      alt={item.product_name}
                      loading="lazy"
                      decoding="async"
                      className="h-16 w-16 shrink-0 rounded-xl bg-neutral-100 object-cover dark:bg-neutral-800"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{item.product_name}</p>
                        {item.item_type === 'package' && (
                          <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-semibold text-accent-700 dark:bg-accent-900/30 dark:text-accent-300">Paket Usaha</span>
                        )}
                      </div>
                      <p className="mt-1 font-mono text-xs font-semibold text-primary-600">{item.product_code}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {item.quantity}x {formatIDR(item.unit_price)}
                      </p>
                    </div>
                    <p className="shrink-0 text-right text-sm font-semibold text-neutral-900 dark:text-neutral-100">{formatIDR(item.subtotal)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-between border-t border-neutral-200 pt-3 dark:border-neutral-700">
                <span className="font-semibold">Total</span>
                <span className="text-lg font-bold text-primary-600">{formatIDR(selectedOrder.total_amount)}</span>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-semibold">Update Status</label>
              <select
                value={selectedOrder.order_status}
                onChange={(e) => updateStatus(selectedOrder.id, e.target.value)}
                className="input-field"
              >
                {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>

            <button
              type="button"
              onClick={() => deleteOrder(selectedOrder)}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-error-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-error-700"
            >
              <Trash2 size={16} /> Hapus Pesanan
            </button>

            {selectedOrder.notes && (
              <div className="mt-4 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800">
                <p className="text-xs font-semibold text-neutral-500">Catatan Customer:</p>
                <p className="text-sm text-neutral-700 dark:text-neutral-300">{selectedOrder.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {editingPaymentOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditingPaymentOrder(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-serif text-xl font-bold text-neutral-900 dark:text-neutral-50">Ganti Metode Pembayaran</h2>
                <p className="text-sm text-neutral-500">{editingPaymentOrder.order_number}</p>
              </div>
              <button onClick={() => setEditingPaymentOrder(null)} className="rounded-full p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                <X size={20} />
              </button>
            </div>
            <label className="mb-2 block text-sm font-semibold">Metode Pembayaran</label>
            <select value={newPaymentMethod} onChange={(e) => setNewPaymentMethod(e.target.value as PaymentMethod)} className="input-field">
              {Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={updatePaymentMethod} className="btn-primary flex-1">
                Simpan
              </button>
              <button type="button" onClick={() => setEditingPaymentOrder(null)} className="btn-secondary">
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
