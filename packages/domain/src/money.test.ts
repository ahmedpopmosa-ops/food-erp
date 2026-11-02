import { describe, expect, it } from 'vitest';
import { minorUnits, Money } from './money';

describe('Money', () => {
  it('has no binary floating point error', () => {
    const total = Money.of('0.1', 'EGP').add(Money.of('0.2', 'EGP'));
    expect(total.toString()).toBe('0.3');
    expect(total.equals(Money.of('0.3', 'EGP'))).toBe(true);
  });

  it('rounds half-up to currency minor units', () => {
    expect(Money.of('10.005', 'EGP').round().toString(true)).toBe('10.01');
    expect(Money.of('10.004', 'EGP').round().toString(true)).toBe('10.00');
    expect(Money.of('-10.005', 'EGP').round().toString(true)).toBe('-10.01');
    expect(Money.of('1.2345', 'KWD').round().toString(true)).toBe('1.235');
    expect(Money.of('1.5', 'JPY').round().toString(true)).toBe('2');
  });

  it('computes 14% VAT on a tax-inclusive price exactly', () => {
    // 114.00 inclusive -> net 100.00, tax 14.00
    const gross = Money.of('114.00', 'EGP');
    const net = Money.of('100', 'EGP');
    expect(net.mul('1.14').equals(gross)).toBe(true);
    expect(gross.sub(net).round().toString(true)).toBe('14.00');
  });

  it('refuses numbers, malformed strings and mixed currencies', () => {
    expect(() => Money.of(1.5 as unknown as string, 'EGP')).toThrow(RangeError);
    expect(() => Money.of('1e3', 'EGP')).toThrow(RangeError);
    expect(() => Money.of('1.5', 'egp')).toThrow(RangeError);
    expect(() => Money.of('1', 'EGP').add(Money.of('1', 'USD'))).toThrow(/Currency mismatch/);
  });

  it('sums and compares', () => {
    const items = ['12.50', '7.25', '0.25'].map((a) => Money.of(a, 'EGP'));
    const sum = Money.sum(items, 'EGP');
    expect(sum.toString(true)).toBe('20.00');
    expect(sum.compare(Money.of('19.99', 'EGP'))).toBe(1);
    expect(Money.sum([], 'EGP').isZero()).toBe(true);
    expect(Money.of('-0.01', 'EGP').isNegative()).toBe(true);
  });

  it('serialises amounts as strings', () => {
    expect(JSON.stringify(Money.of('12.5', 'EGP'))).toBe('{"amount":"12.5","currency":"EGP"}');
  });

  it('knows minor units', () => {
    expect(minorUnits('EGP')).toBe(2);
    expect(minorUnits('JPY')).toBe(0);
  });
});
