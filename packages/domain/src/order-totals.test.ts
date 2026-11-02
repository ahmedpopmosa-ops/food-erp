import { describe, expect, it } from 'vitest';
import { computeOrderTotals } from './order-totals';
import { computeTotals } from './tax';

const vat = [{ taxRateId: 'vat', rate: '0.14' }];
const cents = (v: string) => Math.round(Number(v) * 100);

describe('computeOrderTotals', () => {
  it('matches the Phase 3 calculator when there are no discounts or service charge', () => {
    const lines = [
      { lineKey: '1', qty: '2', unitPrice: '57.00', taxes: vat },
      { lineKey: '2', qty: '1', unitPrice: '33.33', taxes: vat },
    ];
    const a = computeOrderTotals({ currency: 'EGP', pricesIncludeTax: true, lines });
    const b = computeTotals({ currency: 'EGP', pricesIncludeTax: true, lines });
    expect([a.subtotal, a.taxTotal, a.total, a.discountTotal]).toEqual([b.subtotal, b.taxTotal, b.total, '0.00']);
    expect(a.lines.map((l) => [l.netAmount, l.taxAmount])).toEqual(b.lines.map((l) => [l.netAmount, l.taxAmount]));
  });

  it('charges VAT on the discounted price (inclusive pricing)', () => {
    const t = computeOrderTotals({
      currency: 'EGP',
      pricesIncludeTax: true,
      lines: [{ lineKey: '1', qty: '1', unitPrice: '114.00', taxes: vat, discount: { kind: 'percent', value: '0.1' } }],
    });
    // Customer pays 102.60 = net 90.00 + VAT 12.60; discount in net terms 10.00.
    expect(t).toMatchObject({
      subtotal: '100.00',
      discountTotal: '10.00',
      taxTotal: '12.60',
      total: '102.60',
      maxDiscountFraction: '0.1',
    });
  });

  it('spreads an order amount discount proportionally and exactly', () => {
    const t = computeOrderTotals({
      currency: 'EGP',
      pricesIncludeTax: true,
      lines: [
        { lineKey: '1', qty: '1', unitPrice: '100.00', taxes: vat },
        { lineKey: '2', qty: '1', unitPrice: '50.00', taxes: vat },
        { lineKey: '3', qty: '1', unitPrice: '25.00', taxes: vat },
      ],
      orderDiscount: { kind: 'amount', value: '10.00' },
    });
    expect(t.lines.map((l) => l.discountListed)).toEqual(['5.71', '2.86', '1.43']);
    expect(cents(t.total)).toBe(16500); // 175.00 − 10.00
    expect(cents(t.subtotal) - cents(t.discountTotal) + cents(t.taxTotal)).toBe(cents(t.total));
  });

  it('adds a taxable service charge on the discounted net', () => {
    const t = computeOrderTotals({
      currency: 'EGP',
      pricesIncludeTax: true,
      lines: [{ lineKey: '1', qty: '2', unitPrice: '57.00', taxes: vat }],
      serviceCharge: { rate: '0.12', taxes: vat },
    });
    expect(t.serviceCharge).toMatchObject({ netAmount: '12.00', taxAmount: '1.68' });
    expect(t).toMatchObject({ subtotal: '100.00', serviceChargeTotal: '12.00', taxTotal: '15.68', total: '127.68' });
    expect(t.taxes).toEqual([{ taxRateId: 'vat', rate: '0.14', taxableBase: '112.00', amount: '15.68' }]);
  });

  it('never discounts below zero and rejects nonsense', () => {
    const t = computeOrderTotals({
      currency: 'EGP',
      pricesIncludeTax: true,
      lines: [{ lineKey: '1', qty: '1', unitPrice: '10.00', taxes: vat, discount: { kind: 'amount', value: '50' } }],
    });
    expect(t.total).toBe('0.00');
    expect(() =>
      computeOrderTotals({
        currency: 'EGP',
        pricesIncludeTax: true,
        lines: [{ lineKey: '1', qty: '1', unitPrice: '10', taxes: vat, discount: { kind: 'percent', value: '1.5' } }],
      }),
    ).toThrow();
  });

  it('keeps net + tax = gross on every line for awkward discounted inclusive prices', () => {
    for (const price of ['9.99', '33.33', '47.50']) {
      for (const pct of ['0.07', '0.15', '0.333']) {
        const t = computeOrderTotals({
          currency: 'EGP',
          pricesIncludeTax: true,
          lines: [{ lineKey: '1', qty: '3', unitPrice: price, taxes: vat, discount: { kind: 'percent', value: pct } }],
        });
        const l = t.lines[0]!;
        expect(cents(l.netAmount) + cents(l.taxAmount)).toBe(cents(l.grossAmount));
        expect(cents(l.grossAmount)).toBe(cents(l.listedAmount) - cents(l.discountListed));
      }
    }
  });
});
