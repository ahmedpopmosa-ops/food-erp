import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { businessDate, childId, computeTotals, selectPrice, uuidv5, uuidv7, type PriceRow } from './index';

describe('ids', () => {
  it('generates RFC 9562 v7 ids that sort by time', () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
    expect(a.slice(0, 13).replace('-', '')).toBe((1_700_000_000_000).toString(16).padStart(12, '0'));
  });

  it('matches the RFC 9562 v5 test vector and Node crypto', () => {
    // RFC 9562 Appendix A.4: DNS namespace + "www.example.com"
    expect(uuidv5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
    for (let i = 0; i < 20; i++) {
      const ns = randomUUID();
      const name = `line:${i}:${'x'.repeat(i * 7)}`;
      const h = createHash('sha1')
        .update(Buffer.concat([Buffer.from(ns.replace(/-/g, ''), 'hex'), Buffer.from(name)]))
        .digest();
      h[6] = (h[6]! & 0x0f) | 0x50;
      h[8] = (h[8]! & 0x3f) | 0x80;
      const hex = h.subarray(0, 16).toString('hex');
      expect(uuidv5(name, ns)).toBe(
        `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
      );
    }
  });

  it('derives stable child ids', () => {
    const parent = uuidv7();
    expect(childId(parent, 'line:1')).toBe(childId(parent, 'line:1'));
    expect(childId(parent, 'line:1')).not.toBe(childId(parent, 'line:2'));
  });
});

describe('computeTotals', () => {
  const vat = [{ taxRateId: 'vat', rate: '0.14' }];

  it('extracts 14% VAT from inclusive prices so the customer pays the shelf price', () => {
    const t = computeTotals({
      currency: 'EGP',
      pricesIncludeTax: true,
      lines: [{ lineKey: '1', qty: '1', unitPrice: '114.00', taxes: vat }],
    });
    expect(t).toMatchObject({ subtotal: '100.00', taxTotal: '14.00', total: '114.00' });
  });

  it('keeps net + tax = gross under rounding for awkward inclusive prices', () => {
    for (const price of ['10.00', '33.33', '47.50', '0.99', '1234.56']) {
      for (const qty of ['1', '3', '0.5']) {
        const t = computeTotals({
          currency: 'EGP',
          pricesIncludeTax: true,
          lines: [{ lineKey: '1', qty, unitPrice: price, taxes: vat }],
        });
        const l = t.lines[0]!;
        expect((Number(l.netAmount) * 100 + Number(l.taxAmount) * 100).toFixed(0)).toBe(
          (Number(l.grossAmount) * 100).toFixed(0),
        );
      }
    }
  });

  it('adds tax on exclusive prices and summarises per rate', () => {
    const t = computeTotals({
      currency: 'EGP',
      pricesIncludeTax: false,
      lines: [
        { lineKey: '1', qty: '2', unitPrice: '50.00', taxes: vat },
        { lineKey: '2', qty: '1', unitPrice: '20.00', taxes: [] },
      ],
    });
    expect(t).toMatchObject({ subtotal: '120.00', taxTotal: '14.00', total: '134.00' });
    expect(t.taxes).toEqual([{ taxRateId: 'vat', rate: '0.14', taxableBase: '100.00', amount: '14.00' }]);
  });

  it('rejects bad quantities and rates', () => {
    expect(() =>
      computeTotals({
        currency: 'EGP',
        pricesIncludeTax: true,
        lines: [{ lineKey: '1', qty: '0', unitPrice: '1', taxes: [] }],
      }),
    ).toThrow();
    expect(() =>
      computeTotals({
        currency: 'EGP',
        pricesIncludeTax: true,
        lines: [{ lineKey: '1', qty: '1', unitPrice: '1', taxes: [{ taxRateId: 'x', rate: '14' }] }],
      }),
    ).toThrow();
  });
});

describe('selectPrice', () => {
  const base = { variantId: 'v', validTo: null } as const;
  const prices: PriceRow[] = [
    { ...base, id: 'all', branchId: null, channel: null, price: '50.00', validFrom: '2026-01-01T00:00:00Z' },
    { ...base, id: 'delivery', branchId: null, channel: 'delivery', price: '55.00', validFrom: '2026-01-01T00:00:00Z' },
    { ...base, id: 'b1', branchId: 'b1', channel: null, price: '48.00', validFrom: '2026-01-01T00:00:00Z' },
    { ...base, id: 'future', branchId: null, channel: null, price: '60.00', validFrom: '2026-12-01T00:00:00Z' },
  ];
  const q = (branchId: string, channel: 'dine_in' | 'delivery', at = '2026-10-30T12:00:00Z') =>
    selectPrice(prices, { variantId: 'v', branchId, channel, at })?.id;

  it('prefers the most specific scope', () => {
    expect(q('b2', 'dine_in')).toBe('all');
    expect(q('b2', 'delivery')).toBe('delivery');
    expect(q('b1', 'delivery')).toBe('b1');
  });

  it('applies scheduled price changes at their start time', () => {
    expect(q('b2', 'dine_in', '2026-12-01T00:00:01Z')).toBe('future');
  });
});

describe('businessDate', () => {
  it('uses the branch timezone and the day cutoff', () => {
    // 2026-10-29 23:30 UTC = 2026-10-30 02:30 in Cairo (UTC+3 in DST) -> before 04:00 cutoff -> 2026-10-29
    expect(businessDate('2026-10-29T23:30:00Z', 'Africa/Cairo', '04:00')).toBe('2026-10-29');
    expect(businessDate('2026-10-30T02:00:00Z', 'Africa/Cairo', '04:00')).toBe('2026-10-30');
    expect(businessDate('2026-10-29T23:30:00Z', 'Africa/Cairo')).toBe('2026-10-30');
  });
});
