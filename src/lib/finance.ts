import type { CashLedger, FinanceSummary } from './types';

function amountOf(row: CashLedger): number {
  const amount = Number(row.amount || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function costOf(row: CashLedger): number {
  const cost = Number(row.cost_amount || 0);
  return Number.isFinite(cost) ? cost : 0;
}

function cashEffect(row: CashLedger): number {
  if (row.type === 'in') return amountOf(row);
  if (row.type === 'out' || row.type === 'operational') return -amountOf(row);
  return 0;
}

function grossProfitEffect(row: CashLedger): number {
  if (row.reference_type !== 'order') return 0;
  const profit = amountOf(row) - costOf(row);
  if (row.type === 'in') return profit;
  if (row.type === 'out') return -profit;
  return 0;
}

export function localISODate(date = new Date(), timeZone = 'Asia/Bangkok'): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function validateFinanceDateRange(dateFrom?: string, dateTo?: string): void {
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new Error('Tanggal awal tidak boleh melewati tanggal akhir.');
  }
}

export function calculateFinanceSummary(
  baseOpeningBalance: number,
  allLedger: CashLedger[],
  dateFrom?: string,
  dateTo?: string,
): FinanceSummary {
  validateFinanceDateRange(dateFrom, dateTo);

  const activeLedger = allLedger.filter((row) => !row.voided_at);
  const beforePeriod = dateFrom
    ? activeLedger.filter((row) => row.transaction_date < dateFrom)
    : [];
  const ledger = activeLedger.filter((row) => {
    if (dateFrom && row.transaction_date < dateFrom) return false;
    if (dateTo && row.transaction_date > dateTo) return false;
    return true;
  });

  const periodOpeningBalance = Number(baseOpeningBalance || 0)
    + beforePeriod.reduce((sum, row) => sum + cashEffect(row), 0);
  const cashIn = ledger
    .filter((row) => row.type === 'in')
    .reduce((sum, row) => sum + amountOf(row), 0);
  const cashOut = ledger
    .filter((row) => row.type === 'out' || row.type === 'operational')
    .reduce((sum, row) => sum + amountOf(row), 0);
  const operationalExpenses = ledger
    .filter((row) => row.type === 'operational')
    .reduce((sum, row) => sum + amountOf(row), 0);
  const grossSalesProfit = ledger.reduce((sum, row) => sum + grossProfitEffect(row), 0);
  const closingBalance = periodOpeningBalance + cashIn - cashOut;

  return {
    baseOpeningBalance: Number(baseOpeningBalance || 0),
    periodOpeningBalance,
    cashIn,
    cashOut,
    closingBalance,
    totalBalance: closingBalance,
    grossSalesProfit,
    netOperatingProfit: grossSalesProfit - operationalExpenses,
    operationalExpenses,
    ledger,
  };
}
