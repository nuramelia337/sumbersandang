import { useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Calendar, Save, Wallet } from 'lucide-react';
import CurrencyInput from '../../components/CurrencyInput';
import { useAlert } from '../../components/AlertProvider';
import { PAYMENT_LABELS, loadFinanceSummary, logActivity } from '../../lib/business';
import { formatDate, formatIDR } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import type { CashLedger, PaymentMethod } from '../../lib/types';
import * as XLSX from 'xlsx';

const today = new Date().toISOString().split('T')[0];

export default function AdminFinance() {
  const [summary, setSummary] = useState<any>({ openingBalance: 0, cashIn: 0, cashOut: 0, totalBalance: 0, salesProfit: 0, operationalExpenses: 0, ledger: [] });
  const [openingBalance, setOpeningBalance] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [form, setForm] = useState({ type: 'operational' as 'in' | 'out' | 'operational', amount: 0, description: '', payment_method: 'bca' as PaymentMethod, transaction_date: today });
  const [loading, setLoading] = useState(true);
  const { showAlert } = useAlert();

  useEffect(() => { loadData(); }, [dateFrom, dateTo]);

  const loadData = async () => {
    setLoading(true);
    const data = await loadFinanceSummary(dateFrom || undefined, dateTo || undefined);
    setSummary(data);
    setOpeningBalance(data.openingBalance);
    setLoading(false);
  };

  const saveOpening = async () => {
    const { data: existing } = await supabase.from('finance_settings').select('id').eq('key', 'opening_balance').maybeSingle();
    const query = existing
      ? supabase.from('finance_settings').update({ value: openingBalance, updated_at: new Date().toISOString() }).eq('key', 'opening_balance')
      : supabase.from('finance_settings').insert({ key: 'opening_balance', value: openingBalance });
    const { error } = await query;
    if (error) showAlert({ title: 'Gagal simpan saldo awal', message: error.message, variant: 'error' });
    else {
      await logActivity('finance_opening_balance_updated', 'finance_settings', undefined, `Opening balance updated: ${openingBalance}`);
      loadData();
    }
  };

  const addTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase.from('cash_ledger').insert({
      ...form,
      created_by: user.user?.id || null,
    });
    if (error) showAlert({ title: 'Gagal tambah transaksi', message: error.message, variant: 'error' });
    else {
      await logActivity('cash_ledger_created', 'cash_ledger', undefined, `${form.type}: ${form.description}`);
      setForm({ type: 'operational', amount: 0, description: '', payment_method: 'bca', transaction_date: today });
      loadData();
    }
  };

  const exportExcel = () => {
    const ledger = summary.ledger as CashLedger[];
    const rows = ledger.map((row) => ({
      Tanggal: formatDate(row.transaction_date),
      Tipe: row.type,
      Keterangan: row.description,
      Metode: row.payment_method ? PAYMENT_LABELS[row.payment_method] : '-',
      Jumlah: Number(row.amount || 0),
      Referensi: row.reference_type ? `${row.reference_type}: ${row.reference_id || '-'}` : '-',
    }));
    const summaryRows = [
      { Metrik: 'Saldo Awal', Nilai: summary.openingBalance },
      { Metrik: 'Kas Masuk', Nilai: summary.cashIn },
      { Metrik: 'Kas Keluar', Nilai: summary.cashOut },
      { Metrik: 'Total Saldo', Nilai: summary.totalBalance },
      { Metrik: 'Laba Penjualan', Nilai: summary.salesProfit },
      { Metrik: 'Pengeluaran Operasional', Nilai: summary.operationalExpenses },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Ringkasan');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Riwayat Transaksi');
    XLSX.writeFile(wb, `sumber-sandang-keuangan-${dateFrom || 'awal'}-${dateTo || today}.xlsx`);
  };

  const cards = [
    { label: 'Saldo Awal', value: summary.openingBalance, icon: Wallet, color: 'bg-primary-600' },
    { label: 'Kas Masuk', value: summary.cashIn, icon: ArrowDownCircle, color: 'bg-success-600' },
    { label: 'Kas Keluar', value: summary.cashOut, icon: ArrowUpCircle, color: 'bg-error-600' },
    { label: 'Total Saldo', value: summary.totalBalance, icon: Wallet, color: 'bg-accent-600' },
    { label: 'Laba Penjualan', value: summary.salesProfit, icon: ArrowDownCircle, color: 'bg-success-500' },
    { label: 'Pengeluaran Operasional', value: summary.operationalExpenses, icon: ArrowUpCircle, color: 'bg-warning-500' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-50">Keuangan</h1>
        <p className="text-sm text-neutral-500">Pencatatan kas harian dan laporan saldo</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">{card.label}</p>
                <p className="mt-2 text-xl font-bold text-neutral-900 dark:text-neutral-50">{formatIDR(card.value)}</p>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${card.color} text-white`}>
                <card.icon size={20} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 font-serif text-lg font-bold">Saldo Awal</h2>
          <div className="flex gap-2">
            <CurrencyInput value={openingBalance} onValueChange={setOpeningBalance} />
            <button onClick={saveOpening} className="btn-primary whitespace-nowrap"><Save size={18} /> Simpan</button>
          </div>
        </div>

        <form onSubmit={addTransaction} className="card p-5">
          <h2 className="mb-4 font-serif text-lg font-bold">Tambah Transaksi Kas</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })} className="input-field">
              <option value="in">Kas Masuk</option>
              <option value="out">Kas Keluar</option>
              <option value="operational">Pengeluaran Operasional</option>
            </select>
            <CurrencyInput value={form.amount} onValueChange={(amount) => setForm({ ...form, amount })} />
            <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value as PaymentMethod })} className="input-field">
              {Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input type="date" value={form.transaction_date} onChange={(e) => setForm({ ...form, transaction_date: e.target.value })} className="input-field" />
            <input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Keterangan transaksi" className="input-field sm:col-span-2" />
          </div>
          <button className="btn-primary mt-4">Simpan Transaksi</button>
        </form>
      </div>

      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-lg font-bold">Riwayat Transaksi</h2>
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-neutral-400" />
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field max-w-[160px]" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field max-w-[160px]" />
            <button type="button" onClick={exportExcel} className="btn-secondary whitespace-nowrap">
              Export Excel
            </button>
          </div>
        </div>
        {loading ? (
          <div className="skeleton h-32" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left">Tanggal</th>
                  <th className="px-4 py-3 text-left">Tipe</th>
                  <th className="px-4 py-3 text-left">Keterangan</th>
                  <th className="px-4 py-3 text-left">Metode</th>
                  <th className="px-4 py-3 text-right">Jumlah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {(summary.ledger as CashLedger[]).map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-xs text-neutral-500">{formatDate(row.transaction_date)}</td>
                    <td className="px-4 py-3"><span className="badge bg-neutral-100 text-neutral-600">{row.type}</span></td>
                    <td className="px-4 py-3">{row.description}</td>
                    <td className="px-4 py-3 text-xs text-neutral-500">{row.payment_method ? PAYMENT_LABELS[row.payment_method] : '-'}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatIDR(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
