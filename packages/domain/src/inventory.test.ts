import { describe, expect, it } from 'vitest';
import { issue, receive, recipeConsumption, toBaseQty, type StockBalance } from './inventory';

const empty: StockBalance = { qty: '0', value: '0', avgCost: '0' };

describe('units', () => {
  it('converts within a dimension and with item-specific conversions', () => {
    expect(toBaseQty('1.5', 'kg', 'g')).toBe('1500');
    expect(toBaseQty('250', 'ml', 'ml')).toBe('250');
    expect(toBaseQty('2', 'box', 'pc', { box: '24' })).toBe('48');
    expect(toBaseQty('3', 'pc', 'g', { pc: '180' })).toBe('540');
    expect(() => toBaseQty('1', 'l', 'g')).toThrow(/No conversion/);
  });
});

describe('weighted average valuation', () => {
  it('averages receipts and issues at the average', () => {
    const r1 = receive(empty, '1000', '0.05'); // 1 kg rice @ 0.05/g = 50.00
    const r2 = receive(r1.balance, '1000', '0.07'); // + 70.00 → avg 0.06
    expect(r2.balance).toEqual({ qty: '2000', value: '120.00', avgCost: '0.06' });
    const i1 = issue(r2.balance, '300');
    expect(i1).toMatchObject({ totalCost: '-18.00', unitCost: '0.06' });
    expect(i1.balance).toMatchObject({ qty: '1700', value: '102.00' });
  });

  it('issuing everything takes exactly the remaining value (no rounding residue)', () => {
    const r = receive(receive(empty, '3', '1.00').balance, '3', '1.01'); // value 6.03, avg 1.005
    const part = issue(r.balance, '1');
    const rest = issue(part.balance, '5');
    expect((Number(part.totalCost) + Number(rest.totalCost)).toFixed(2)).toBe('-6.03');
    expect(rest.balance).toMatchObject({ qty: '0', value: '0.00' });
  });

  it('goes negative at the last average and settles with a revaluation on the next receipt', () => {
    const r = receive(empty, '100', '2.00'); // 200.00
    const out = issue(r.balance, '150'); // 100 @ avg + 50 more at last avg 2.00 = 300.00
    expect(out.balance).toMatchObject({ qty: '-50', value: '-100.00' });
    const back = receive(out.balance, '100', '2.50'); // +250 → value 150; target 50 × 2.50 = 125 → −25 variance
    expect(back).toMatchObject({ totalCost: '250.00', revaluation: '-25.00' });
    expect(back.balance).toEqual({ qty: '50', value: '125.00', avgCost: '2.5' });
  });

  it('uses the fallback cost when nothing was ever received', () => {
    expect(issue(empty, '10', '0.5')).toMatchObject({ totalCost: '-5.00', balance: { qty: '-10', value: '-5.00' } });
  });
});

describe('recipe consumption', () => {
  it('scales by portions sold and grosses up for preparation waste', () => {
    const lines = [
      { itemId: 'rice', qtyBase: '150', wastePct: '0' },
      { itemId: 'onion', qtyBase: '45', wastePct: '0.1' },
      { itemId: 'rice', qtyBase: '10', wastePct: '0' }, // same item twice is summed
    ];
    expect(recipeConsumption(lines, '1', '3')).toEqual([
      { itemId: 'rice', qtyBase: '480' },
      { itemId: 'onion', qtyBase: '150' },
    ]);
    expect(recipeConsumption([{ itemId: 'sauce', qtyBase: '2000', wastePct: '0' }], '20', '1')).toEqual([
      { itemId: 'sauce', qtyBase: '100' },
    ]);
  });
});
