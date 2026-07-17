import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatIDR, formatDateTime, waMessage } from '../../lib/constants';
import { Search, MessageCircle, Eye, X } from 'lucide-react';
import type { Order, OrderItem } from '../../lib/types';
import { logActivity, PAYMENT_LABELS, SHIPPING_LABELS, transitionOrderInventory } from '../../lib/business';

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

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      await supabase.rpc('release_expired_keeps');
    } catch {
      // Non-blocking; orders can still load if the migration is not applied yet.
    }
    const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    setOrders(data || []);
    setLoading(false);
  };

  const filtered = orders.filter((o) => {
    const matchSearch = o.order_number.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_phone.includes(search);
    const matchStatus = filterStatus === 'all' || o.order_status === filterStatus;
    return matchSearch && matchStatus;
  });

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('orders').update({ order_status: status, updated_at: new Date().toISOString() }).eq('id', id);
    if (status === 'shipped') {
      await supabase.from('orders').update({ shipped_at: new Date().toISOString() }).eq('id', id);
    }
    if (status === 'completed') {
      await supabase.from('orders').update({ completed_at: new Date().toISOString(), payment_status: 'paid' }).eq('id', id);
    }
    await transitionOrderInventory(id, status);
    await logActivity('order_status_updated', 'order', id, `Order status changed to ${status}`);
    loadOrders();
    if (selectedOrder?.id === id) {
      setSelectedOrder({ ...selectedOrder, order_status: status as any });
    }
  };

  const viewOrder = async (order: Order) => {
    setSelectedOrder(order);
    const { data } = await supabase.from('order_items').select('*').eq('order_id', order.id);
    setOrderItems(data || []);
  };

  const sendWhatsApp = (order: Order) => {
    const igMatch = (order.notes || '').match(/IG: @?([^\s|]+)/);
    const ig = igMatch ? `\nIG: @${igMatch[1]}` : '';
    const pickupMatch = (order.notes || '').match(/Ambil: (\S+ \S+)/);
    const pickup = pickupMatch ? `\nPengambilan: ${pickupMatch[1]}` : '';
    const paymentLabel = PAYMENT_LABELS[order.payment_method] || order.payment_method;
    const shippingLabel = SHIPPING_LABELS[order.shipping_method] || order.shipping_method;
    const msg = `Halo ${order.customer_name}!${ig}\n\nPesanan Anda *${order.order_number}* telah kami terima.\nTotal: ${formatIDR(order.total_amount)}\nMetode Pembayaran: ${paymentLabel}\nMetode Pengiriman: ${shippingLabel}${pickup}\n\nTerima kasih telah berbelanja di Sumber Sandang!`;
    window.open(waMessage(msg), '_blank');
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
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-16" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="card flex h-40 items-center justify-center text-neutral-400">Tidak ada pesanan</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">No. Pesanan</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Customer</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Tanggal</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Total</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-neutral-700 dark:text-neutral-300">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="px-4 py-3 font-mono text-xs">{o.order_number}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-neutral-900 dark:text-neutral-100">{o.customer_name}</p>
                      <p className="text-xs text-neutral-500">{o.customer_phone}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500">{formatDateTime(o.created_at)}</td>
                    <td className="px-4 py-3 font-semibold text-primary-600">{formatIDR(o.total_amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${STATUS_COLORS[o.order_status] || 'bg-neutral-100'}`}>{o.order_status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => viewOrder(o)} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-primary-600 dark:hover:bg-neutral-700" title="Lihat detail">
                          <Eye size={16} />
                        </button>
                        <button onClick={() => sendWhatsApp(o)} className="rounded-lg p-2 text-neutral-500 hover:bg-success-50 hover:text-success-600 dark:hover:bg-success-900/30" title="Kirim WhatsApp">
                          <MessageCircle size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order detail modal */}
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
                <p className="text-sm text-neutral-600 dark:text-neutral-400">Metode: {PAYMENT_LABELS[selectedOrder.payment_method] || selectedOrder.payment_method}</p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">Status: {selectedOrder.payment_status}</p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">Pengiriman: {SHIPPING_LABELS[selectedOrder.shipping_method] || selectedOrder.shipping_method}</p>
                {selectedOrder.shipping_method === 'pickup' && selectedOrder.notes && selectedOrder.notes.includes('Ambil:') && (
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">Pengambilan: {(selectedOrder.notes.match(/Ambil: (\S+ \S+)/) || [])[1] || '-'}</p>
                )}
              </div>
            </div>

            <div className="mt-4 card p-4">
              <h3 className="mb-3 text-sm font-semibold">Item Pesanan</h3>
              <div className="space-y-2">
                {orderItems.map((item) => (
                  <div key={item.id} className="flex justify-between border-b border-neutral-100 pb-2 dark:border-neutral-800">
                    <div>
                      <p className="text-sm font-medium">{item.product_name}</p>
                      <p className="text-xs text-neutral-500">
                        {item.item_type === 'package' ? 'Paket Usaha · ' : ''}{item.quantity}x {formatIDR(item.unit_price)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold">{formatIDR(item.subtotal)}</p>
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
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {selectedOrder.notes && (
              <div className="mt-4 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800">
                <p className="text-xs font-semibold text-neutral-500">Catatan Customer:</p>
                <p className="text-sm text-neutral-700 dark:text-neutral-300">{selectedOrder.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
