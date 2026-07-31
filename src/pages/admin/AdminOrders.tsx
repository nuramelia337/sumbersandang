// @ts-nocheck 
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatIDR, formatDateTime, waMessageTo } from '../../lib/constants';
import { Search, MessageCircle, Eye, X, Edit, Trash2 } from 'lucide-react';
import type { Order, OrderItem } from '../../lib/types';
import { logActivity, PAYMENT_LABELS, SHIPPING_LABELS, transitionOrderInventory } from '../../lib/business';
import { useAlert } from '../../components/AlertProvider';

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

const STATUSES = ['pending', 'confirmed', 'processing', 'packing', 'ready', 'shipped', 'completed', 'cancelled'];

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [editingPaymentOrder, setEditingPaymentOrder] = useState<Order | null>(null);
  const [newPaymentMethod, setNewPaymentMethod] = useState('');

  const { showAlert, showConfirm } = useAlert();

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const now = new Date();
      const updatedOrders = [...(data || [])];

      // Logic: Batalkan otomatis pesanan pending > 3 hari jika BELUM PAYMENT
      for (const order of updatedOrders) {
        if (order.status === 'pending') {
          const createdAt = new Date(order.created_at);
          const diffInDays = (now.getTime() - createdAt.getTime()) / (1000 * 3600 * 24);

          // Hanya batalkan & kembalikan stok jika > 3 hari DAN belum dibayar
          if (diffInDays >= 3 && order.payment_status !== 'paid') {
            await transitionOrderInventory(order.id, 'pending', 'cancelled');
            await supabase
              .from('orders')
              .update({ status: 'cancelled', updated_at: new Date().toISOString() })
              .eq('id', order.id);

            order.status = 'cancelled';
            await logActivity('system', 'cancel_expired_order', `Sistem membatalkan pesanan #${order.order_number} (Pending > 3 hari belum dibayar)`);
          }
        }
      }

      setOrders(updatedOrders);
    } catch (err: any) {
      showAlert('Gagal memuat pesanan: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (order: Order) => {
    setSelectedOrder(order);
    try {
      // Mengambil detail pesanan beserta relational data produk (foto & kode)
      const { data, error } = await supabase
        .from('order_items')
        .select(`
          *,
          product:products (
            id,
            name,
            code,
            image_url
          )
        `)
        .eq('order_id', order.id);

      if (error) throw error;
      setOrderItems(data || []);
    } catch (err: any) {
      showAlert('Gagal memuat detail item pesanan: ' + err.message, 'error');
    }
  };

  const handleStatusChange = async (orderId: string, currentStatus: string, newStatus: string) => {
    try {
      await transitionOrderInventory(orderId, currentStatus, newStatus);

      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', orderId);

      if (error) throw error;

      showAlert('Status pesanan berhasil diperbarui', 'success');
      loadOrders();
      if (selectedOrder?.id === orderId) {
        setSelectedOrder({ ...selectedOrder, status: newStatus });
      }
    } catch (err: any) {
      showAlert('Gagal mengubah status: ' + err.message, 'error');
    }
  };

  const handleUpdatePaymentMethod = async () => {
    if (!editingPaymentOrder || !newPaymentMethod) return;

    try {
      const oldMethod = editingPaymentOrder.payment_method;

      const { error } = await supabase
        .from('orders')
        .update({
          payment_method: newPaymentMethod,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingPaymentOrder.id);

      if (error) throw error;

      await logActivity(
        'admin',
        'update_payment_method',
        `Mengubah metode pembayaran order #${editingPaymentOrder.order_number} dari ${PAYMENT_LABELS[oldMethod] || oldMethod} menjadi ${PAYMENT_LABELS[newPaymentMethod] || newPaymentMethod}`
      );

      showAlert('Metode pembayaran berhasil diperbarui', 'success');
      setEditingPaymentOrder(null);
      loadOrders();
    } catch (err: any) {
      showAlert('Gagal mengubah metode pembayaran: ' + err.message, 'error');
    }
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.order_number?.toLowerCase().includes(search.toLowerCase()) ||
      order.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      order.customer_phone?.includes(search);
    const matchesStatus = filterStatus === 'all' || order.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Kelola Pesanan</h1>
          <p className="text-sm text-neutral-500">Daftar transaksi dan status pesanan masuk</p>
        </div>
      </div>

      {/* Filter & Pencarian */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between bg-white p-4 rounded-xl shadow-sm border border-neutral-200">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Cari nomor pesanan, nama, atau WhatsApp..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">Semua Status</option>
          {STATUSES.map((st) => (
            <option key={st} value={st}>
              {st.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {/* Tabel Utama Pesanan */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-neutral-500">Memuat pesanan...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">Tidak ada pesanan ditemukan.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-medium">
                <tr>
                  <th className="p-4">No. Pesanan</th>
                  <th className="p-4">Tanggal</th>
                  <th className="p-4">Pelanggan</th>
                  <th className="p-4">Pembayaran</th>
                  <th className="p-4">Total</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-neutral-50 transition">
                    <td className="p-4 font-semibold text-primary-600">#{order.order_number}</td>
                    <td className="p-4 text-neutral-600">{formatDateTime(order.created_at)}</td>
                    <td className="p-4">
                      <div className="font-medium text-neutral-900">{order.customer_name}</div>
                      <div className="text-xs text-neutral-500">{order.customer_phone}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">
                          {PAYMENT_LABELS[order.payment_method] || order.payment_method}
                        </span>
                        <button
                          onClick={() => {
                            setEditingPaymentOrder(order);
                            setNewPaymentMethod(order.payment_method);
                          }}
                          className="p-1 text-neutral-400 hover:text-primary-600 rounded hover:bg-neutral-100"
                          title="Ganti Metode Pembayaran"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${order.payment_status === 'paid' ? 'bg-success-100 text-success-700' : 'bg-warning-100 text-warning-700'}`}>
                        {order.payment_status === 'paid' ? 'Lunas' : 'Belum Bayar'}
                      </span>
                    </td>
                    <td className="p-4 font-semibold">{formatIDR(order.total_amount)}</td>
                    <td className="p-4">
                      <select
                        value={order.status}
                        onChange={(e) => handleStatusChange(order.id, order.status, e.target.value)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLORS[order.status] || 'bg-neutral-100'}`}
                      >
                        {STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleViewDetails(order)}
                        className="p-2 text-neutral-600 hover:text-primary-600 hover:bg-neutral-100 rounded-lg"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Detail Pesanan dengan Kode Barang & Foto */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <div className="flex justify-between items-center border-b pb-4">
              <div>
                <h3 className="text-lg font-bold">Detail Pesanan #{selectedOrder.order_number}</h3>
                <p className="text-xs text-neutral-500">{formatDateTime(selectedOrder.created_at)}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-1 hover:bg-neutral-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-neutral-700">Daftar Produk yang Di-checkout</h4>
              <div className="space-y-2">
                {orderItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between border p-3 rounded-lg gap-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={item.product?.image_url || 'https://via.placeholder.com/60'}
                        alt={item.product_name || item.product?.name}
                        className="w-12 h-12 object-cover rounded-md border border-neutral-200"
                      />
                      <div>
                        <div className="font-medium text-sm">{item.product_name || item.product?.name}</div>
                        <div className="text-xs text-neutral-500">
                          Kode Barang: <span className="font-mono text-primary-600 font-semibold">{item.product?.code || item.product_code || '-'}</span>
                        </div>
                        <div className="text-xs text-neutral-500">
                          {item.quantity} x {formatIDR(item.price)}
                        </div>
                      </div>
                    </div>
                    <div className="font-semibold text-sm">{formatIDR(item.quantity * item.price)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t pt-4 flex justify-between items-center font-bold">
              <span>Total Pesanan</span>
              <span className="text-primary-600 text-lg">{formatIDR(selectedOrder.total_amount)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit Pembayaran */}
      {editingPaymentOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-lg">Ganti Metode Pembayaran</h3>
            <p className="text-sm text-neutral-600">
              Ganti metode pembayaran pesanan <span className="font-semibold">#{editingPaymentOrder.order_number}</span>.
            </p>

            <select
              value={newPaymentMethod}
              onChange={(e) => setNewPaymentMethod(e.target.value)}
              className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary-500"
            >
              {Object.entries(PAYMENT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingPaymentOrder(null)}
                className="px-4 py-2 border rounded-lg text-sm text-neutral-600 hover:bg-neutral-50"
              >
                Batal
              </button>
              <button
                onClick={handleUpdatePaymentMethod}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 font-medium"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}