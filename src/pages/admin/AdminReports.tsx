import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatIDR, formatDate } from '../../lib/constants';
import { Download, TrendingUp, DollarSign, Package, Users } from 'lucide-react';
import * as XLSX from 'xlsx';
import { PAYMENT_LABELS } from '../../lib/business';

export default function AdminReports() {
  const [reportType, setReportType] = useState<'sales' | 'profit' | 'inventory' | 'customer'>('sales');
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  const [data, setData] = useState<any[]>([]);
  const [summary, setSummary] = useState({ revenue: 0, cogs: 0, profit: 0, orders: 0, items: 0, bcaRevenue: 0, danaRevenue: 0, shopeepayRevenue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReport();
  }, [reportType, period]);

  const loadReport = async () => {
    setLoading(true);
    const now = new Date();
    let startDate = new Date();
    if (period === 'daily') startDate = new Date(now.getTime() - 86400000);
    else if (period === 'weekly') startDate = new Date(now.getTime() - 7 * 86400000);
    else if (period === 'monthly') startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    else startDate = new Date(now.getFullYear(), 0, 1);

    const startISO = startDate.toISOString();

    if (reportType === 'sales' || reportType === 'profit') {
      const { data: orders } = await supabase.from('orders').select('*').gte('created_at', startISO);
      const { data: items } = await supabase.from('order_items').select('*').gte('created_at', startISO);

      const validOrders = (orders || []).filter((o) => !['cancelled', 'returned', 'refunded'].includes(o.order_status));
      const validOrderIds = new Set(validOrders.map((o) => o.id));
      const validItems = (items || []).filter((item) => validOrderIds.has(item.order_id));
      const revenue = validOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const cogs = validItems.reduce((s, i) => s + Number(i.purchase_price || 0) * Number(i.quantity || 0), 0);
      const profit = revenue - cogs;

      const bcaRevenue = validOrders.filter((o) => o.payment_method === 'bca').reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const danaRevenue = validOrders.filter((o) => o.payment_method === 'dana').reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const shopeepayRevenue = validOrders.filter((o) => o.payment_method === 'shopeepay').reduce((s, o) => s + Number(o.total_amount || 0), 0);
      setSummary({ revenue, cogs, profit, orders: validOrders.length, items: validItems.length, bcaRevenue, danaRevenue, shopeepayRevenue });
      setData(validOrders.map((o) => ({
        date: o.created_at,
        order: o.order_number,
        customer: o.customer_name,
        total: o.total_amount,
        status: o.order_status,
        payment: o.payment_method,
      })));
    } else if (reportType === 'inventory') {
      const { data: products } = await supabase.from('products').select('*');
      const prods = products || [];
      const totalValue = prods.reduce((s, p) => s + p.purchase_price * p.stock, 0);
      const totalSelling = prods.reduce((s, p) => s + p.selling_price * p.stock, 0);
      setSummary({ revenue: totalSelling, cogs: totalValue, profit: totalSelling - totalValue, orders: prods.length, items: prods.reduce((s, p) => s + p.stock, 0), bcaRevenue: 0, danaRevenue: 0, shopeepayRevenue: 0 });
      setData(prods.map((p) => ({
        date: p.created_at,
        order: p.product_code,
        customer: p.name,
        total: p.selling_price,
        status: p.stock <= p.min_stock ? 'Low Stock' : `${p.stock} pcs`,
        payment: p.condition,
      })));
    } else {
      const { data: customers } = await supabase.from('customers').select('*').order('total_spending', { ascending: false });
      const custs = customers || [];
      const totalRevenue = custs.reduce((s, c) => s + c.total_spending, 0);
      setSummary({ revenue: totalRevenue, cogs: 0, profit: totalRevenue, orders: custs.length, items: custs.reduce((s, c) => s + c.total_orders, 0), bcaRevenue: 0, danaRevenue: 0, shopeepayRevenue: 0 });
      setData(custs.map((c) => ({
        date: c.created_at,
        order: c.phone,
        customer: c.name,
        total: c.total_spending,
        status: `${c.total_orders} orders`,
        payment: c.city || '-',
      })));
    }
    setLoading(false);
  };

  const exportExcel = () => {
    if (data.length === 0) return;
    const rows = data.map((d) => ({
      Tanggal: formatDate(d.date),
      Kode: d.order,
      Nama: d.customer,
      Total: d.total,
      Status: d.status,
      Info: d.payment,
    }));
    const summaryRows = [
      { Metrik: 'Pendapatan', Nilai: summary.revenue },
      { Metrik: 'COGS/HPP', Nilai: summary.cogs },
      { Metrik: 'Laba', Nilai: summary.profit },
      { Metrik: 'Total Order/Produk', Nilai: summary.orders },
      { Metrik: 'Total Item', Nilai: summary.items },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Ringkasan');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Data');
    XLSX.writeFile(wb, `sumber-sandang-${reportType}-${period}.xlsx`);
  };

  const cards = [
    { label: reportType === 'inventory' ? 'Nilai Jual' : 'Pendapatan', value: formatIDR(summary.revenue), icon: DollarSign, color: 'bg-success-500' },
    { label: reportType === 'inventory' ? 'Nilai Beli' : 'COGS', value: formatIDR(summary.cogs), icon: TrendingUp, color: 'bg-primary-500' },
    { label: reportType === 'inventory' ? 'Potensi Profit' : 'Laba', value: formatIDR(summary.profit), icon: TrendingUp, color: 'bg-accent-500' },
    { label: reportType === 'customer' ? 'Total Customer' : reportType === 'inventory' ? 'Total Produk' : 'Total Order', value: summary.orders.toString(), icon: reportType === 'customer' ? Users : Package, color: 'bg-secondary-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-50">Laporan</h1>
          <p className="text-sm text-neutral-500">Analisis performa bisnis</p>
        </div>
        <button onClick={exportExcel} className="btn-primary">
          <Download size={18} /> Export Excel
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { val: 'sales', label: 'Penjualan' },
          { val: 'profit', label: 'Profit' },
          { val: 'inventory', label: 'Inventory' },
          { val: 'customer', label: 'Customer' },
        ].map((t) => (
          <button
            key={t.val}
            onClick={() => setReportType(t.val as any)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              reportType === t.val ? 'bg-primary-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {reportType !== 'inventory' && reportType !== 'customer' && (
        <div className="flex flex-wrap gap-2">
          {[
            { val: 'daily', label: 'Harian' },
            { val: 'weekly', label: 'Mingguan' },
            { val: 'monthly', label: 'Bulanan' },
            { val: 'yearly', label: 'Tahunan' },
          ].map((p) => (
            <button
              key={p.val}
              onClick={() => setPeriod(p.val as any)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p.val ? 'bg-secondary-500 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => (
          <div key={i} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">{c.label}</p>
                <p className="mt-2 text-lg font-bold text-neutral-900 dark:text-neutral-50">{c.value}</p>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${c.color} text-white`}>
                <c.icon size={20} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Payment method breakdown */}
      {(reportType === 'sales' || reportType === 'profit') && (
        <div className="card p-5">
          <h2 className="mb-4 font-serif text-lg font-bold text-neutral-900 dark:text-neutral-50">Pembayaran per Metode</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-success-50 p-4 dark:bg-success-900/20">
              <p className="text-sm font-semibold text-success-700 dark:text-success-400">{PAYMENT_LABELS.bca}</p>
              <p className="mt-2 text-xl font-bold text-neutral-900 dark:text-neutral-50">{formatIDR(summary.bcaRevenue)}</p>
            </div>
            <div className="rounded-xl bg-primary-50 p-4 dark:bg-primary-900/20">
              <p className="text-sm font-semibold text-primary-700 dark:text-primary-400">{PAYMENT_LABELS.dana}</p>
              <p className="mt-2 text-xl font-bold text-neutral-900 dark:text-neutral-50">{formatIDR(summary.danaRevenue)}</p>
            </div>
            <div className="rounded-xl bg-secondary-50 p-4 dark:bg-secondary-900/20">
              <p className="text-sm font-semibold text-secondary-700 dark:text-secondary-400">{PAYMENT_LABELS.shopeepay}</p>
              <p className="mt-2 text-xl font-bold text-neutral-900 dark:text-neutral-50">{formatIDR(summary.shopeepayRevenue)}</p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-12" />)}</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Tanggal</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Kode</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Nama</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Total</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Info</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {data.slice(0, 50).map((d, i) => (
                  <tr key={i} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="px-4 py-3 text-xs text-neutral-500">{formatDate(d.date)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{d.order}</td>
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{d.customer}</td>
                    <td className="px-4 py-3 font-semibold text-primary-600">{formatIDR(d.total)}</td>
                    <td className="px-4 py-3"><span className="badge bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{d.status}</span></td>
                    <td className="px-4 py-3 text-xs text-neutral-500">{d.payment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
