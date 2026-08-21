import { describe, expect, it } from 'vitest';
import { calculateFinanceSummary, localISODate, validateFinanceDateRange } from './finance';
import type { CashLedger } from './types';

let sequence = 0;

function ledger(overrides: Partial<CashLedger>): CashLedger {
  sequence += 1;
  return {
    id: `00000000-0000-0000-0000-${String(sequence).padStart(12, '0')}`,
    type: 'in',
    amount: 0,
    cost_amount: 0,
    description: 'Test transaction',
    payment_method: 'bca',
    reference_type: 'manual',
    reference_id: null,
    entry_kind: 'manual',
    transaction_date: '2026-08-18',
    created_at: '2026-08-18T00:00:00.000Z',
    updated_at: '2026-08-18T00:00:00.000Z',
    created_by: null,
    ...overrides,
  };
}

describe('calculateFinanceSummary', () => {
  it('calculates unfiltered cash totals from the global opening balance', () => {
    const result = calculateFinanceSummary(100, [
      ledger({ type: 'in', amount: 500 }),
      ledger({ type: 'out', amount: 100 }),
      ledger({ type: 'operational', amount: 50 }),
    ]);

    expect(result.periodOpeningBalance).toBe(100);
    expect(result.cashIn).toBe(500);
    expect(result.cashOut).toBe(150);
    expect(result.closingBalance).toBe(450);
  });

  it('rolls transactions before dateFrom into the period opening balance', () => {
    const result = calculateFinanceSummary(1_000, [
      ledger({ type: 'in', amount: 400, transaction_date: '2026-07-31' }),
      ledger({ type: 'out', amount: 100, transaction_date: '2026-07-31' }),
      ledger({ type: 'in', amount: 250, transaction_date: '2026-08-01' }),
      ledger({ type: 'out', amount: 50, transaction_date: '2026-08-31' }),
      ledger({ type: 'in', amount: 999, transaction_date: '2026-09-01' }),
    ], '2026-08-01', '2026-08-31');

    expect(result.periodOpeningBalance).toBe(1_300);
    expect(result.cashIn).toBe(250);
    expect(result.cashOut).toBe(50);
    expect(result.closingBalance).toBe(1_500);
    expect(result.ledger).toHaveLength(2);
  });

  it('includes both date boundaries', () => {
    const result = calculateFinanceSummary(0, [
      ledger({ amount: 10, transaction_date: '2026-08-01' }),
      ledger({ amount: 20, transaction_date: '2026-08-31' }),
    ], '2026-08-01', '2026-08-31');

    expect(result.cashIn).toBe(30);
  });

  it('reverses order revenue and gross profit without treating manual cash as sales', () => {
    const result = calculateFinanceSummary(0, [
      ledger({
        type: 'in', amount: 1_000, cost_amount: 600,
        reference_type: 'order', entry_kind: 'order_sale',
      }),
      ledger({
        type: 'out', amount: 1_000, cost_amount: 600,
        reference_type: 'order', entry_kind: 'order_reversal',
      }),
      ledger({ type: 'in', amount: 300 }),
      ledger({ type: 'operational', amount: 50 }),
    ]);

    expect(result.grossSalesProfit).toBe(0);
    expect(result.operationalExpenses).toBe(50);
    expect(result.netOperatingProfit).toBe(-50);
    expect(result.closingBalance).toBe(250);
  });

  it('supports an order being recognized again after a reversal', () => {
    const result = calculateFinanceSummary(0, [
      ledger({ type: 'in', amount: 1_000, cost_amount: 600, reference_type: 'order', entry_kind: 'order_sale' }),
      ledger({ type: 'out', amount: 1_000, cost_amount: 600, reference_type: 'order', entry_kind: 'order_reversal' }),
      ledger({ type: 'in', amount: 1_000, cost_amount: 600, reference_type: 'order', entry_kind: 'order_reinstatement' }),
    ]);

    expect(result.cashIn).toBe(2_000);
    expect(result.cashOut).toBe(1_000);
    expect(result.grossSalesProfit).toBe(400);
    expect(result.closingBalance).toBe(1_000);
  });

  it('excludes voided order entries from cash totals while retaining active entries', () => {
    const voidedAt = '2026-08-21T10:00:00.000Z';
    const result = calculateFinanceSummary(0, [
      ledger({
        type: 'in', amount: 95_000, cost_amount: 40_000,
        reference_type: 'order', entry_kind: 'order_sale', voided_at: voidedAt,
      }),
      ledger({
        type: 'out', amount: 95_000, cost_amount: 40_000,
        reference_type: 'order', entry_kind: 'order_reversal', voided_at: voidedAt,
      }),
      ledger({ type: 'in', amount: 20_000 }),
    ]);

    expect(result.cashIn).toBe(20_000);
    expect(result.cashOut).toBe(0);
    expect(result.grossSalesProfit).toBe(0);
    expect(result.closingBalance).toBe(20_000);
    expect(result.ledger).toHaveLength(1);
  });
});

describe('finance dates', () => {
  it('uses the Bangkok calendar date around UTC midnight', () => {
    expect(localISODate(new Date('2026-08-17T18:00:00.000Z'))).toBe('2026-08-18');
  });

  it('rejects an inverted date range', () => {
    expect(() => validateFinanceDateRange('2026-08-31', '2026-08-01')).toThrow(
      'Tanggal awal tidak boleh melewati tanggal akhir.',
    );
  });
});
