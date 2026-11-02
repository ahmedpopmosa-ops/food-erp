import Decimal from 'decimal.js';

/** Isolated Decimal constructor: 34 significant digits, half-up — never shares global config. */
const D = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

const DECIMAL_STRING = /^-?\d{1,15}(\.\d{1,6})?$/;

/** Minor units per ISO 4217 currency, from the platform's Intl data (EGP 2, KWD 3, JPY 0). */
export function minorUnits(currency: string): number {
  if (!/^[A-Z]{3}$/.test(currency)) throw new RangeError(`Invalid currency code: ${currency}`);
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/**
 * An amount in one currency. Constructed from decimal strings only (ADR-0006): JSON transports money as
 * strings and a JS number never enters a calculation. Immutable.
 */
export class Money {
  private constructor(
    private readonly value: Decimal,
    readonly currency: string,
  ) {}

  static of(amount: string, currency: string): Money {
    if (typeof amount !== 'string' || !DECIMAL_STRING.test(amount)) {
      throw new RangeError(`Invalid money amount: ${String(amount)}`);
    }
    minorUnits(currency);
    return new Money(new D(amount), currency);
  }

  static zero(currency: string): Money {
    return Money.of('0', currency);
  }

  private same(other: Money): void {
    if (other.currency !== this.currency) {
      throw new RangeError(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }

  add(other: Money): Money {
    this.same(other);
    return new Money(this.value.plus(other.value), this.currency);
  }

  sub(other: Money): Money {
    this.same(other);
    return new Money(this.value.minus(other.value), this.currency);
  }

  /** Multiply by a decimal factor given as a string (quantity, rate). */
  mul(factor: string): Money {
    if (!DECIMAL_STRING.test(factor)) throw new RangeError(`Invalid factor: ${factor}`);
    return new Money(this.value.times(factor), this.currency);
  }

  /** Divide by a positive decimal factor given as a string (e.g. 1.14 to extract inclusive VAT). */
  div(divisor: string): Money {
    if (!DECIMAL_STRING.test(divisor) || new D(divisor).lte(0)) throw new RangeError(`Invalid divisor: ${divisor}`);
    return new Money(this.value.div(divisor), this.currency);
  }

  /** Round half-up to the currency's minor units (EGP: 2 decimals). */
  round(): Money {
    return new Money(this.value.toDecimalPlaces(minorUnits(this.currency), D.ROUND_HALF_UP), this.currency);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative() && !this.value.isZero();
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.equals(other.value);
  }

  compare(other: Money): -1 | 0 | 1 {
    this.same(other);
    return this.value.comparedTo(other.value) as -1 | 0 | 1;
  }

  /** Plain decimal string, fixed to minor units when `fixed` (for display and storage of totals). */
  toString(fixed = false): string {
    return fixed ? this.value.toFixed(minorUnits(this.currency)) : this.value.toString();
  }

  toJSON(): { amount: string; currency: string } {
    return { amount: this.value.toString(), currency: this.currency };
  }

  /** Sum a list; an empty list needs the currency explicitly. */
  static sum(items: readonly Money[], currency: string): Money {
    return items.reduce((acc, m) => acc.add(m), Money.zero(currency));
  }
}
