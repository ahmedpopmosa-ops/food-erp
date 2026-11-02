import { describe, expect, it } from 'vitest';
import { hashPin, verifyPin } from './pin';
import { refundLineAmounts } from './refund';

describe('PIN hashing', () => {
  it('verifies the right PIN only, with a random salt per hash', async () => {
    const a = await hashPin('4821', 1000);
    const b = await hashPin('4821', 1000);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^pbkdf2-sha256\$1000\$/);
    expect(await verifyPin('4821', a)).toBe(true);
    expect(await verifyPin('4822', a)).toBe(false);
    expect(await verifyPin('abcd', a)).toBe(false);
    expect(await verifyPin('4821', 'garbage')).toBe(false);
    await expect(hashPin('12')).rejects.toThrow(RangeError);
  });
});

describe('refundLineAmounts', () => {
  const line = { qty: '3', netAmount: '100.00', taxes: [{ taxRateId: 'vat', amount: '14.00' }] };
  const none = { qty: '0', netAmount: '0', taxes: [] };

  it('refunds proportionally, and the last refund takes the exact remainder', () => {
    const first = refundLineAmounts(line, none, '1', 'EGP');
    expect(first).toEqual({
      netAmount: '33.33',
      taxAmount: '4.67',
      grossAmount: '38.00',
      taxes: [{ taxRateId: 'vat', amount: '4.67' }],
    });
    const second = refundLineAmounts(line, { qty: '1', netAmount: first.netAmount, taxes: first.taxes }, '1', 'EGP');
    const sumNet = (Number(first.netAmount) + Number(second.netAmount)).toFixed(2);
    const rest = refundLineAmounts(
      line,
      {
        qty: '2',
        netAmount: sumNet,
        taxes: [{ taxRateId: 'vat', amount: (Number(first.taxAmount) + Number(second.taxAmount)).toFixed(2) }],
      },
      '1',
      'EGP',
    );
    expect((Number(sumNet) + Number(rest.netAmount)).toFixed(2)).toBe('100.00');
    expect((Number(first.taxAmount) + Number(second.taxAmount) + Number(rest.taxAmount)).toFixed(2)).toBe('14.00');
  });

  it('refuses refunding more than was sold', () => {
    expect(() => refundLineAmounts(line, { qty: '3', netAmount: '100', taxes: [] }, '1', 'EGP')).toThrow(/exceeds/);
    expect(() => refundLineAmounts(line, none, '0', 'EGP')).toThrow(/positive/);
  });

  it('a full refund in one step returns the original amounts', () => {
    expect(refundLineAmounts(line, none, '3', 'EGP')).toMatchObject({
      netAmount: '100.00',
      taxAmount: '14.00',
      grossAmount: '114.00',
    });
  });
});
