import Decimal from 'decimal.js';
import { Money } from './money';

export interface TaxRateRef {
  taxRateId: string;
  /** Decimal string, e.g. "0.14" for 14 %. */
  rate: string;
}

export interface LineInput {
  lineKey: string;
  /** Decimal string quantity, > 0. */
  qty: string;
  /** Unit price as listed (tax-inclusive or exclusive per `pricesIncludeTax`). */
  unitPrice: string;
  taxes: TaxRateRef[];
}

export interface LineTax {
  taxRateId: string;
  rate: string;
  amount: string;
}

export interface LineTotals {
  lineKey: string;
  netAmount: string;
  taxAmount: string;
  grossAmount: string;
  taxes: LineTax[];
}

export interface DocumentTotals {
  currency: string;
  lines: LineTotals[];
  /** Tax summary per rate (Σ of line taxes — line-level rounding). */
  taxes: { taxRateId: string; rate: string; taxableBase: string; amount: string }[];
  subtotal: string;
  taxTotal: string;
  total: string;
}

const RATE = /^\d(\.\d{1,6})?$/;

/**
 * Line-level tax calculation (doc 07 §4), shared by the POS (to show and record totals) and the API (to
 * re-verify what the POS recorded). Non-compound rates only in Phase 3.
 *
 * Inclusive prices: net = round(gross ÷ (1 + Σrate)); each tax = round(net × rate); the last tax absorbs the
 * rounding residue so that net + Σtax equals the listed gross exactly — the customer pays the shelf price.
 * Exclusive prices: net = round(qty × price); each tax = round(net × rate); gross = net + Σtax.
 */
export function computeTotals(input: {
  currency: string;
  pricesIncludeTax: boolean;
  lines: LineInput[];
}): DocumentTotals {
  const { currency, pricesIncludeTax } = input;
  const lines: LineTotals[] = input.lines.map((line) => {
    if (!/^\d{1,9}(\.\d{1,6})?$/.test(line.qty) || new Decimal(line.qty).lte(0))
      throw new RangeError(`Invalid quantity: ${line.qty}`);
    for (const t of line.taxes) if (!RATE.test(t.rate)) throw new RangeError(`Invalid tax rate: ${t.rate}`);
    const extended = Money.of(line.unitPrice, currency).mul(line.qty);
    const rateSum = line.taxes.reduce((s, t) => s.plus(t.rate), new Decimal(0));

    if (pricesIncludeTax) {
      const gross = extended.round();
      const net = gross.div(new Decimal(1).plus(rateSum).toString()).round();
      let remaining = gross.sub(net);
      const taxes = line.taxes.map((t, i) => {
        const amount = i === line.taxes.length - 1 ? remaining : net.mul(t.rate).round();
        remaining = remaining.sub(amount);
        return { taxRateId: t.taxRateId, rate: t.rate, amount: amount.toString(true) };
      });
      return {
        lineKey: line.lineKey,
        netAmount: net.toString(true),
        taxAmount: gross.sub(net).toString(true),
        grossAmount: gross.toString(true),
        taxes,
      };
    }
    const net = extended.round();
    const taxes = line.taxes.map((t) => ({
      taxRateId: t.taxRateId,
      rate: t.rate,
      amount: net.mul(t.rate).round().toString(true),
    }));
    const tax = Money.sum(
      taxes.map((t) => Money.of(t.amount, currency)),
      currency,
    );
    return {
      lineKey: line.lineKey,
      netAmount: net.toString(true),
      taxAmount: tax.toString(true),
      grossAmount: net.add(tax).toString(true),
      taxes,
    };
  });

  const summary = new Map<string, { rate: string; base: Money; amount: Money }>();
  for (const line of lines) {
    for (const t of line.taxes) {
      const s = summary.get(t.taxRateId) ?? { rate: t.rate, base: Money.zero(currency), amount: Money.zero(currency) };
      s.base = s.base.add(Money.of(line.netAmount, currency));
      s.amount = s.amount.add(Money.of(t.amount, currency));
      summary.set(t.taxRateId, s);
    }
  }
  const sum = (key: 'netAmount' | 'taxAmount' | 'grossAmount') =>
    Money.sum(
      lines.map((l) => Money.of(l[key], currency)),
      currency,
    ).toString(true);
  return {
    currency,
    lines,
    taxes: [...summary.entries()].map(([taxRateId, s]) => ({
      taxRateId,
      rate: s.rate,
      taxableBase: s.base.toString(true),
      amount: s.amount.toString(true),
    })),
    subtotal: sum('netAmount'),
    taxTotal: sum('taxAmount'),
    total: sum('grossAmount'),
  };
}
