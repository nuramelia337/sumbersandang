import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowDownCircle, ArrowUpCircle, Calendar, Edit, Loader2, Save, Trash2, Wallet, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import CurrencyInput from '../../components/CurrencyInput';
import { useAlert } from '../../components/AlertProvider';
import { PAYMENT_LABELS, loadFinanceSummary, logActivity } from '../../lib/business';
import { localISODate } from '../../lib/finance';
import { formatDate, formatIDR } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import type { CashLedger, FinanceSummary, PaymentMethod } from '../../lib/types';

type ManualTransactionType = 'in' | 'out' | 'operational';

interface ManualTransactionForm {
  type: ManualTransactionType;
  amount: number;
  description: string;
  payment_method: PaymentMethod;
  transaction_date: string;
}

const EMPTY_SUMMARY: FinanceSummary = {
  baseOpeningBalance: 0,
  periodOpeningBalance: 0,
  cashIn: 0,
  cashOut: 0,
  closingBalance: 0,
  totalBalance: 0,
  grossSalesProfit: 0,
  netOperatingProfit: 0,
  operationalExpenses: 0,
  ledger: [],
};

const emptyForm = (): ManualTransactionForm => ({
  type: 'operational',
  amount: 0,
  description: '',
  payment_method: 'bca',
  transaction_date: localISODate(),
});

const TYPE_LABELS: Record<ManualTransactionType | 'initial', string> = {
  initial: 'Saldo Awal',
  in: 'Kas Masuk',
  out: 'Kas Keluar',
  operational: 'Operasional',
};

function isManualTransaction(row: CashLedger): boolean {
  return row.reference_type === 'manual' && row.entry_kind === 'manual';
}

function sourceLabel(row: CashLedger): string {
  if (row.entry_kind === 'order_reversal') return 'Pembalikan';
  if (row.reference_type === 'order') return 'Pesanan';
  if (isManualTransaction(row)) return 'Manual';
  return 'Sistem';
}

export default function AdminFinance() {
  const [summary, setSummary] = useState<FinanceSummary>(EMPTY_SUMMARY);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [form, setForm] = useState<ManualTransactionForm>(emptyForm);
  const [editing, setEditing] = useState<CashLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingTransaction, setSavingTransaction] = useState(false);
  const [savingOpening, setSavingOpening] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { showAlert, showConfirm } = useAlert();

  const loadData = async () => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setLoadError('Tanggal awal tidak boleh melewati tanggal akhir.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const data = await loadFinanceSummary(dateFrom || undefined, dateTo || undefined);
      setSummary(data);
      setOpeningBalance(data.baseOpeningBalance);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Data keuangan gagal dimuat.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [dateFrom, dateTo]);

  const resetForm = () => {
    setEditing(null);
    setForm(emptyForm());
  };

  const saveOpening = async () => {
    setSavingOpening(true);
    try {
      const { data: existing, error: lookupError } = await supabase
        .from('finance_settings')
        .select('id')
        .eq('key', 'opening_balance')
        .maybeSingle();
      if (lookupError) throw new Error(lookupError.message);

      const query = existing
        ? supabase.from('finance_settings').update({ value: openingBalance, updated_at: new Date().toISOString() }).eq('key', 'opening_balance')
        : supabase.from('finance_settings').insert({ key: 'opening_balance', value: openingBalance });
      const { error } = await query;
      if (error) throw new Error(error.message);

      await logActivity('finance_opening_balance_updated', 'finance_settings', undefined, `Opening balance updated: ${openingBalance}`);
      await loadData();
      showAlert({ title: 'Saldo awal tersimpan', message: `Saldo awal diperbarui menjadi ${formatIDR(openingBalance)}.`, variant: 'success' });
    } catch (error) {
      showAlert({
        title: 'Gagal menyimpan saldo awal',
        message: error instanceof Error ? error.message : 'Terjadi kesalahan saat menyimpan saldo awal.',
        variant: 'error',
      });
    } finally {
      setSavingOpening(false);
    }
  };

  const saveTransaction = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.amount <= 0) {
      showAlert({ title: 'Nominal tidak valid', message: 'Nominal transaksi harus lebih dari Rp 0.', variant: 'warning' });
      return;
    }
    if (!form.description.trim()) {
      showAlert({ title: 'Keterangan diperlukan', message: 'Isi keterangan transaksi sebelum menyimpan.', variant: 'warning' });
      return;
    }

    setSavingTransaction(true);
    try {
      const params = {
        p_type: form.type,
        p_amount: form.amount,
        p_description: form.description.trim(),
        p_payment_method: form.payment_method,
        p_transaction_date: form.transaction_date,
      };
      const { error } = editing
        ? await supabase.rpc('update_manual_cash_transaction', { p_id: editing.id, ...params })
        : await supabase.rpc('create_manual_cash_transaction', params);
      if (error) throw new Error(error.message);

      const action = editing ? 'diperbarui' : 'ditambahkan';
      resetForm();
      await loadData();
      showAlert({ title: `Transaksi ${action}`, message: `Transaksi manual berhasil ${action}.`, variant: 'success' });
    } catch (error) {
      showAlert({
        title: editing ? 'Gagal memperbarui transaksi' : 'Gagal menambah transaksi',
        message: error instanceof Error ? error.message : 'Terjadi kesalahan saat menyimpan transaksi.',
        variant: 'error',
      });
    } finally {
      setSavingTransaction(false);
    }
  };

  const openEdit = (row: CashLedger) => {
    if (!isManualTransaction(row)) return;
    setEditing(row);
    setForm({
      type: row.type as ManualTransactionType,
      amount: Number(row.amount || 0),
      description: row.description,
      payment_method: row.payment_method || 'bca',
      transaction_date: row.transaction_date,
    });
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const deleteTransaction = (row: CashLedger) => {
    if (!isManualTransaction(row)) return;
    showConfirm({
      title: 'Hapus transaksi manual?',
      message: `${row.description} senilai ${formatIDR(row.amount)} akan dihapus dan saldo akan dihitung ulang.`,
      variant: 'error',
      confirmLabel: 'Hapus Transaksi',
      onConfirm: async () => {
        setDeletingId(row.id);
        try {
          const { error } = await supabase.rpc('delete_manual_cash_transaction', { p_id: row.id });
          if (error) throw new Error(error.message);
          if (editing?.id === row.id) resetForm();
          await loadData();
          showAlert({ title: 'Transaksi dihapus', message: 'Transaksi manual berhasil dihapus.', variant: 'success' });
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const exportExcel = () => {
    if (summary.ledger.length === 0) return;
    const rows = summary.ledger.map((row) => ({
      Tanggal: formatDate(row.transaction_date),
      Tipe: TYPE_LABELS[row.type],
      Sumber: sourceLabel(row),
      Keterangan: row.description,
      Metode: row.payment_method ? PAYMENT_LABELS[row.payment_method] : '-',
      Jumlah: Number(row.amount || 0),
      Referensi: row.reference_type === 'order' ? `order: ${row.reference_id || '-'}` : '-',
    }));
    const summaryRows = [
      { Metrik: 'Saldo Awal Global', Nilai: summary.baseOpeningBalance },
      { Metrik: 'Saldo Pembuka Periode', Nilai: summary.periodOpeningBalance },
      { Metrik: 'Kas Masuk', Nilai: summary.cashIn },
      { Metrik: 'Kas Keluar', Nilai: summary.cashOut },
      { Metrik: 'Saldo Akhir', Nilai: summary.closingBalance },
      { Metrik: 'Laba Kotor Penjualan', Nilai: summary.grossSalesProfit },
      { Metrik: 'Pengeluaran Operasional', Nilai: summary.operationalExpenses },
      { Metrik: 'Laba Bersih Operasional', Nilai: summary.netOperatingProfit },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Ringkasan');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Riwayat Transaksi');
    XLSX.writeFile(workbook, `sumber-sandang-keuangan-${dateFrom || 'awal'}-${dateTo || localISODate()}.xlsx`);
  };

  const cards = [
    { label: dateFrom ? 'Saldo Pembuka Periode' : 'Saldo Awal', value: summary.periodOpeningBalance, icon: Wallet, color: 'bg-primary-600' },
    { label: 'Kas Masuk', value: summary.cashIn, icon: ArrowDownCircle, color: 'bg-success-600' },
    { label: 'Kas Keluar', value: summary.cashOut, icon: ArrowUpCircle, color: 'bg-error-600' },
    { label: 'Saldo Akhir', value: summary.closingBalance, icon: Wallet, color: 'bg-accent-600' },
    { label: 'Laba Kotor Penjualan', value: summary.grossSalesProfit, icon: ArrowDownCircle, color: 'bg-success-500' },
    { label: 'Pengeluaran Operasional', value: summary.operationalExpenses, icon: ArrowUpCircle, color: 'bg-warning-500' },
    { label: 'Laba Bersih Operasional', value: summary.netOperatingProfit, icon: Wallet, color: 'bg-secondary-700' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-50">Keuangan</h1>
        <p className="text-sm text-neutral-500">Pencatatan kas harian dan laporan saldo</p>
      </div>

      {loadError ? (
        <div className="card flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-error-50 text-error-600 dark:bg-error-900/20">
            <AlertCircle size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-50">Data keuangan tidak dapat dimuat</h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{loadError}</p>
          </div>
          <button type="button" onClick={() => void loadData()} className="btn-secondary px-4 py-2">Muat Ulang</button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">{card.label}</p>
                  <p className="mt-2 text-xl font-bold text-neutral-900 dark:text-neutral-50">{formatIDR(card.value)}</p>
                </div>
                <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${card.color} text-white`}>
                  <card.icon size={20} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-2 font-serif text-lg font-bold">Saldo Awal Global</h2>
          <p className="mb-4 text-sm text-neutral-500">Nilai dasar sebelum seluruh transaksi buku kas.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <CurrencyInput value={openingBalance} onValueChange={setOpeningBalance} disabled={savingOpening} />
            <button type="button" onClick={() => void saveOpening()} disabled={savingOpening} className="btn-primary whitespace-nowrap">
              {savingOpening ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {savingOpening ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>

        <form ref={formRef} onSubmit={saveTransaction} className="card p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-lg font-bold">{editing ? 'Edit Transaksi Manual' : 'Tambah Transaksi Kas'}</h2>
              {editing && <p className="mt-1 text-sm text-neutral-500">Perubahan akan langsung menghitung ulang saldo.</p>}
            </div>
            {editing && (
              <button type="button" onClick={resetForm} disabled={savingTransaction} className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Batalkan edit">
                <X size={18} />
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as ManualTransactionType })} disabled={savingTransaction} className="input-field">
              <option value="in">Kas Masuk</option>
              <option value="out">Kas Keluar</option>
              <option value="operational">Pengeluaran Operasional</option>
            </select>
            <CurrencyInput value={form.amount} onValueChange={(amount) => setForm({ ...form, amount })} required disabled={savingTransaction} />
            <select value={form.payment_method} onChange={(event) => setForm({ ...form, payment_method: event.target.value as PaymentMethod })} disabled={savingTransaction} className="input-field">
              {Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input type="date" required value={form.transaction_date} onChange={(event) => setForm({ ...form, transaction_date: event.target.value })} disabled={savingTransaction} className="input-field" />
            <input required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} disabled={savingTransaction} placeholder="Keterangan transaksi" className="input-field sm:col-span-2" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button disabled={savingTransaction} className="btn-primary">
              {savingTransaction ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {savingTransaction ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Simpan Transaksi'}
            </button>
            {editing && <button type="button" onClick={resetForm} disabled={savingTransaction} className="btn-secondary">Batal</button>}
          </div>
        </form>
      </div>

      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg font-bold">Riwayat Transaksi</h2>
            <p className="mt-1 text-sm text-neutral-500">Transaksi pesanan dikelola otomatis dan tidak dapat diedit di sini.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Calendar size={16} className="text-neutral-400" />
            <input aria-label="Tanggal mulai" type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className="input-field max-w-[160px]" />
            <input aria-label="Tanggal akhir" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="input-field max-w-[160px]" />
            {(dateFrom || dateTo) && <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); }} className="btn-ghost px-3 py-2">Reset</button>}
            <button type="button" onClick={exportExcel} disabled={summary.ledger.length === 0 || loading || Boolean(loadError)} className="btn-secondary whitespace-nowrap px-4 py-2">
              Export Excel
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">{[...Array(4)].map((_, index) => <div key={index} className="skeleton h-12" />)}</div>
        ) : loadError ? (
          <div className="rounded-xl bg-error-50 p-4 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-300">Perbaiki rentang tanggal atau muat ulang data untuk melihat riwayat.</div>
        ) : summary.ledger.length === 0 ? (
          <div className="py-12 text-center">
            <Wallet size={32} className="mx-auto text-neutral-300" />
            <h3 className="mt-3 font-semibold text-neutral-800 dark:text-neutral-100">Belum ada transaksi pada periode ini</h3>
            <p className="mt-1 text-sm text-neutral-500">Ubah rentang tanggal atau tambahkan transaksi kas manual.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left">Tanggal</th>
                  <th className="px-4 py-3 text-left">Tipe</th>
                  <th className="px-4 py-3 text-left">Sumber</th>
                  <th className="px-4 py-3 text-left">Keterangan</th>
                  <th className="px-4 py-3 text-left">Metode</th>
                  <th className="px-4 py-3 text-right">Jumlah</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {summary.ledger.map((row) => {
                  const manual = isManualTransaction(row);
                  return (
                    <tr key={row.id} className={editing?.id === row.id ? 'bg-primary-50/70 dark:bg-primary-900/10' : undefined}>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-500">{formatDate(row.transaction_date)}</td>
                      <td className="px-4 py-3"><span className="badge bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">{TYPE_LABELS[row.type]}</span></td>
                      <td className="px-4 py-3"><span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">{sourceLabel(row)}</span></td>
                      <td className="min-w-[220px] px-4 py-3">{row.description}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-500">{row.payment_method ? PAYMENT_LABELS[row.payment_method] : '-'}</td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${row.type === 'in' ? 'text-success-700 dark:text-success-400' : 'text-neutral-900 dark:text-neutral-50'}`}>
                        {row.type === 'in' ? '+' : row.type === 'initial' ? '' : '-'}{formatIDR(row.amount)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {manual ? (
                          <div className="inline-flex items-center gap-1">
                            <button type="button" onClick={() => openEdit(row)} disabled={savingTransaction || deletingId === row.id} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-primary-600 disabled:opacity-50 dark:hover:bg-neutral-700" aria-label={`Edit ${row.description}`} title="Edit transaksi">
                              <Edit size={16} />
                            </button>
                            <button type="button" onClick={() => deleteTransaction(row)} disabled={deletingId === row.id} className="rounded-lg p-2 text-neutral-500 hover:bg-error-50 hover:text-error-600 disabled:opacity-50 dark:hover:bg-error-900/30" aria-label={`Hapus ${row.description}`} title="Hapus transaksi">
                              {deletingId === row.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            </button>
                          </div>
                        ) : <span className="text-xs text-neutral-400">Otomatis</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
