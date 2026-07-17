import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatIDR, formatDate, BRAND } from '../../lib/constants';
import { TrendingUp, Package, ShoppingCart, Users, DollarSign, AlertTriangle, Clock, CheckCircle, Warehouse, TrendingDown, Wallet } from 'lucide-react';
import { loadFinanceSummary, PAYMENT_LABELS } from '../../lib/business';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    todayRevenue: 0,
    weekRevenue: 0,
    monthRevenue: 0,
    yearRevenue: 0,
    totalOrders: 0,
    pendingOrders: 0,
    totalProducts: 0,
    lowStock: 0,
    totalCustomers: 0,
    avgOrderValue: 0,
    totalCogs: 0,
    grossProfit: 0,
    inventoryValue: 0,
    totalSold: 0,
    totalRevenue: 0,
    totalStock: 0,
    readyProducts: 0,
    soldProducts: 0,
    bcaRevenue: 0,
    danaRevenue: 0,
    shopeepayRevenue: 0,
    totalBalance: 0,
    todaySold: 0,
    packagesSold: 0,
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [latestProducts, setLatestProducts] = useState<any[]>([]);
  const [salesTrend, setSalesTrend] = useState<Array<{ date: string; total: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        await supabase.rpc('release_expired_keeps');
      } catch {
        // Non-blocking; dashboard can still load if the migration is not applied yet.
      }

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

      const [orders, products, customers, orderItems, financeSummary, lowStockNotifications] = await Promise.all([
        supabase.from('orders').select('*'),
        supabase.from('products').select('*'),
        supabase.from('customers').select('id'),
        supabase.from('order_items').select('order_id, product_name, quantity, unit_price, purchase_price, item_type, created_at'),
        loadFinanceSummary().catch(() => ({ totalBalance: 0 })),
        supabase.from('notifications').select('reference_id').eq('type', 'low_stock'),
      ]);

      const allOrders = orders.data || [];
      const allProducts = products.data || [];
      const allItems = orderItems.data || [];

      const validOrders = allOrders.filter((o) => !['cancelled', 'returned', 'refunded'].includes(o.order_status));
      const validOrderIds = new Set(validOrders.map((o) => o.id));
      const validItems = allItems.filter((i) => !i.order_id || validOrderIds.has(i.order_id));
      const todayRev = validOrders.filter((o) => o.created_at >= todayStart).reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const weekRev = validOrders.filter((o) => o.created_at >= weekAgo).reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const monthRev = validOrders.filter((o) => o.created_at >= monthStart).reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const yearRev = validOrders.filter((o) => o.created_at >= yearStart).reduce((s, o) => s + Number(o.total_amount || 0), 0);

      const bcaRevenue = validOrders.filter((o) => o.payment_method === 'bca').reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const danaRevenue = validOrders.filter((o) => o.payment_method === 'dana').reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const shopeepayRevenue = validOrders.filter((o) => o.payment_method === 'shopeepay').reduce((s, o) => s + Number(o.total_amount || 0), 0);

      const totalCogs = validItems.reduce((s, i) => s + Number(i.purchase_price || 0) * Number(i.quantity || 0), 0);
      const grossProfit = validOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0) - totalCogs;
      const inventoryValue = allProducts.reduce((s, p) => s + p.purchase_price * p.stock, 0);

      const productSales: Record<string, number> = {};
      allItems.forEach((i) => {
        productSales[i.product_name] = (productSales[i.product_name] || 0) + i.quantity;
      });
      const top = Object.entries(productSales)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const totalSold = validItems.reduce((s, i) => s + Number(i.quantity || 0), 0);
      const todaySold = validItems.filter((i) => i.created_at >= todayStart).reduce((s, i) => s + Number(i.quantity || 0), 0);
      const packagesSold = validItems.filter((i) => i.item_type === 'package').reduce((s, i) => s + Number(i.quantity || 0), 0);
      const totalRevenue = validOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const totalStock = allProducts.reduce((s, p) => s + p.stock, 0);
      const readyProducts = allProducts.filter((p) => (p.availability_status || (p.stock > 0 ? 'ready' : 'sold')) === 'ready').length;
      const soldProducts = allProducts.filter((p) => (p.availability_status || (p.stock > 0 ? 'ready' : 'sold')) === 'sold').length;
      const lowProducts = allProducts.filter((p) => Number(p.stock || 0) <= Number(p.min_stock || 1));
      const existingLowRefs = new Set((lowStockNotifications.data || []).map((n: any) => n.reference_id));
      const newLowNotifications = lowProducts
        .filter((p) => !existingLowRefs.has(p.id))
        .map((p) => ({
          type: 'low_stock',
          title: p.stock === 0 ? 'Stok Habis' : 'Stok Menipis',
          message: `${p.name} (${p.product_code}) tersisa ${p.stock} pcs`,
          reference_type: 'product',
          reference_id: p.id,
        }));
      if (newLowNotifications.length > 0) {
        await supabase.from('notifications').insert(newLowNotifications);
      }

      const last7Days = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(now);
        date.setDate(now.getDate() - (6 - index));
        const key = date.toISOString().slice(0, 10);
        const total = validOrders
          .filter((o) => String(o.created_at).slice(0, 10) === key)
          .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
        return { date: key, total };
      });

      setStats({
        todayRevenue: todayRev,
        weekRevenue: weekRev,
        monthRevenue: monthRev,
        yearRevenue: yearRev,
        totalOrders: allOrders.length,
        pendingOrders: allOrders.filter((o) => o.order_status === 'pending' || o.order_status === 'confirmed').length,
        totalProducts: allProducts.length,
        lowStock: allProducts.filter((p) => p.stock <= p.min_stock).length,
        totalCustomers: customers.data?.length || 0,
        avgOrderValue: validOrders.length > 0 ? validOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0) / validOrders.length : 0,
        totalCogs,
        grossProfit,
        inventoryValue,
        totalSold,
        totalRevenue,
        totalStock,
        readyProducts,
        soldProducts,
        bcaRevenue,
        danaRevenue,
        shopeepayRevenue,
        totalBalance: Number((financeSummary as any).totalBalance || 0),
        todaySold,
        packagesSold,
      });

      setRecentOrders(allOrders.slice(0, 5));
      setLowStockProducts(lowProducts.slice(0, 5));
      setTopProducts(top);
      setLatestProducts(allProducts.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 5));
      setSalesTrend(last7Days);
      setLoading(false);
    })();
  }, []);

  const cards = [
    { label: 'Total Uang Masuk', value: formatIDR(stats.totalRevenue), icon: DollarSign, color: 'bg-success-500' },
    { label: 'Total Saldo', value: formatIDR(stats.totalBalance), icon: Wallet, color: 'bg-primary-700' },
    { label: 'Barang Terjual', value: `${stats.totalSold} pcs`, icon: CheckCircle, color: 'bg-primary-500' },
    { label: 'Terjual Hari Ini', value: `${stats.todaySold} pcs`, icon: CheckCircle, color: 'bg-accent-500' },
    { label: 'Total Stok Barang', value: `${stats.totalStock} pcs`, icon: Warehouse, color: 'bg-secondary-500' },
    { label: 'Paket Usaha Terjual', value: `${stats.packagesSold}`, icon: Package, color: 'bg-primary-700' },
    { label: 'Produk Ready', value: stats.readyProducts.toString(), icon: Package, color: 'bg-success-600' },
    { label: 'Produk Sold Out', value: stats.soldProducts.toString(), icon: TrendingDown, color: 'bg-neutral-700' },
    { label: 'Pendapatan Hari Ini', value: formatIDR(stats.todayRevenue), icon: DollarSign, color: 'bg-success-500' },
    { label: 'Pendapatan Mingguan', value: formatIDR(stats.weekRevenue), icon: TrendingUp, color: 'bg-primary-500' },
    { label: 'Pendapatan Bulanan', value: formatIDR(stats.monthRevenue), icon: TrendingUp, color: 'bg-accent-500' },
    { label: 'Pendapatan Tahunan', value: formatIDR(stats.yearRevenue), icon: TrendingUp, color: 'bg-secondary-500' },
    { label: 'Total Pesanan', value: stats.totalOrders.toString(), icon: ShoppingCart, color: 'bg-primary-600' },
    { label: 'Pesanan Pending', value: stats.pendingOrders.toString(), icon: Clock, color: 'bg-warning-500' },
    { label: 'Total Produk', value: stats.totalProducts.toString(), icon: Package, color: 'bg-neutral-700' },
    { label: 'Total Customer', value: stats.totalCustomers.toString(), icon: Users, color: 'bg-accent-600' },
    { label: 'Laba Kotor', value: formatIDR(stats.grossProfit), icon: TrendingUp, color: 'bg-success-600' },
    { label: 'Nilai Inventory', value: formatIDR(stats.inventoryValue), icon: Package, color: 'bg-primary-700' },
    { label: 'Avg Order Value', value: formatIDR(stats.avgOrderValue), icon: DollarSign, color: 'bg-secondary-600' },
    { label: 'Stok Menipis', value: stats.lowStock.toString(), icon: AlertTriangle, color: 'bg-error-500' },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => <div key={i} className="skeleton h-28" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-50">Dashboard</h1>
        <p className="text-sm text-neutral-500">Ringkasan performa {BRAND.name}</p>
      </div>

      {/* Highlight cards - top row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-gradient-to-br from-success-500 to-success-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-white/80">Total Uang Masuk</p>
              <p className="mt-2 text-2xl font-bold">{formatIDR(stats.totalRevenue)}</p>
            </div>
            <DollarSign size={32} className="text-white/70" />
          </div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-white/80">Barang Terjual Hari Ini</p>
              <p className="mt-2 text-2xl font-bold">{stats.todaySold} pcs</p>
            </div>
            <CheckCircle size={32} className="text-white/70" />
          </div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-secondary-500 to-secondary-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-white/80">Total Stok Barang</p>
              <p className="mt-2 text-2xl font-bold">{stats.totalStock} pcs</p>
            </div>
            <Warehouse size={32} className="text-white/70" />
          </div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-accent-500 to-accent-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-white/80">Produk Ready / Sold</p>
              <p className="mt-2 text-2xl font-bold">{stats.readyProducts} / {stats.soldProducts}</p>
            </div>
            <Package size={32} className="text-white/70" />
          </div>
        </div>
      </div>

      {/* Payment method breakdown */}
      <div className="card p-5">
        <h2 className="mb-4 font-serif text-lg font-bold text-neutral-900 dark:text-neutral-50">Pembayaran per Metode</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-success-50 p-4 dark:bg-success-900/20">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-success-600" />
              <span className="text-sm font-semibold text-success-700 dark:text-success-400">{PAYMENT_LABELS.bca}</span>
            </div>
            <p className="mt-2 text-xl font-bold text-neutral-900 dark:text-neutral-50">{formatIDR(stats.bcaRevenue)}</p>
          </div>
          <div className="rounded-xl bg-primary-50 p-4 dark:bg-primary-900/20">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary-600" />
              <span className="text-sm font-semibold text-primary-700 dark:text-primary-400">{PAYMENT_LABELS.dana}</span>
            </div>
            <p className="mt-2 text-xl font-bold text-neutral-900 dark:text-neutral-50">{formatIDR(stats.danaRevenue)}</p>
          </div>
          <div className="rounded-xl bg-secondary-50 p-4 dark:bg-secondary-900/20">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-secondary-600" />
              <span className="text-sm font-semibold text-secondary-700 dark:text-secondary-400">{PAYMENT_LABELS.shopeepay}</span>
            </div>
            <p className="mt-2 text-xl font-bold text-neutral-900 dark:text-neutral-50">{formatIDR(stats.shopeepayRevenue)}</p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-4 font-serif text-lg font-bold text-neutral-900 dark:text-neutral-50">Grafik Penjualan 7 Hari</h2>
        <div className="flex h-48 items-end gap-3">
          {salesTrend.map((point) => {
            const max = Math.max(...salesTrend.map((item) => item.total), 1);
            const height = Math.max(8, (point.total / max) * 160);
            return (
              <div key={point.date} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-40 w-full items-end rounded-t-lg bg-neutral-100 dark:bg-neutral-800">
                  <div
                    className="w-full rounded-t-lg bg-primary-500 transition-all"
                    style={{ height }}
                    title={formatIDR(point.total)}
                  />
                </div>
                <span className="text-[11px] text-neutral-500">{point.date.slice(5)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => (
          <div key={i} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">{c.label}</p>
                <p className="mt-2 text-xl font-bold text-neutral-900 dark:text-neutral-50">{c.value}</p>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${c.color} text-white`}>
                <c.icon size={20} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent orders + low stock */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 font-serif text-lg font-bold text-neutral-900 dark:text-neutral-50">Pesanan Terbaru</h2>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-neutral-400">Belum ada pesanan</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{o.customer_name}</p>
                    <p className="text-xs text-neutral-500">{o.order_number} · {formatDate(o.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-primary-600">{formatIDR(o.total_amount)}</p>
                    <span className="badge bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{o.order_status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-4 font-serif text-lg font-bold text-neutral-900 dark:text-neutral-50">Stok Menipis</h2>
          {lowStockProducts.length === 0 ? (
            <p className="text-sm text-neutral-400">Semua stok aman</p>
          ) : (
            <div className="space-y-3">
              {lowStockProducts.map((p) => (
                <div key={p.id} className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{p.name}</p>
                    <p className="text-xs text-neutral-500">{p.product_code}</p>
                  </div>
                  <span className={`badge ${p.stock === 0 ? 'bg-error-100 text-error-700' : 'bg-warning-100 text-warning-700'}`}>
                    {p.stock === 0 ? 'Habis' : `Sisa ${p.stock}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top products */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 font-serif text-lg font-bold text-neutral-900 dark:text-neutral-50">Produk Terlaris</h2>
          {topProducts.length === 0 ? (
            <p className="text-sm text-neutral-400">Belum ada data penjualan</p>
          ) : (
            <div className="space-y-3">
              {topProducts.map(([name, qty], i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700 dark:bg-neutral-800 dark:text-primary-400">{i + 1}</span>
                  <p className="flex-1 text-sm font-medium text-neutral-900 dark:text-neutral-100">{name}</p>
                  <p className="text-sm text-neutral-500">{qty} terjual</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card p-5">
          <h2 className="mb-4 font-serif text-lg font-bold text-neutral-900 dark:text-neutral-50">Produk Terbaru</h2>
          <div className="space-y-3">
            {latestProducts.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{p.name}</p>
                  <p className="text-xs text-neutral-500">{p.product_code}</p>
                </div>
                <p className="text-sm font-semibold text-primary-600">{formatIDR(p.selling_price)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
