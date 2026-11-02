import Decimal from 'decimal.js';
import { Money } from './money';

export interface RefundableLine {
  qty: string;
  netAmount: string;
  taxes: { taxRateId: string; amount: string }[];
}

export interface AlreadyRefunded {
  qty: string;
  netAmount: string;
  taxes: { taxRateId: string; amount: string }[];
}

export interface RefundLineAmounts {
  netAmount: string;
  taxAmount: string;
  grossAmount: string;
  taxes: { taxRateId: string; amount: string }[];
}

/**
 * Amounts refunded for `qty` units of an invoice line. Partial refunds are proportional (rounded per currency);
 * the refund that brings the line to fully refunded takes exactly the remainder, so a line refunded in several
 * steps always sums to its original amounts — no cent is lost or created. Used by the POS and re-checked by the API.
 */
export function refundLineAmounts(
  line: RefundableLine,
  already: AlreadyRefunded,
  qty: string,
  currency: string,
): RefundLineAmounts {
  const lineQty = new Decimal(line.qty);
  const done = new Decimal(already.qty);
  const q = new Decimal(qty);
  if (q.lte(0)) throw new RangeError('Refund quantity must be positive');
  if (done.plus(q).gt(lineQty)) throw new RangeError('Refund quantity exceeds the quantity sold');
  const m = (v: string) => Money.of(v, currency);
  const final = done.plus(q).eq(lineQty);
  const share = q.div(lineQty).toString();
  const portion = (total: string, refunded: string) =>
    final ? m(total).sub(m(refunded)) : m(total).mul(trim(share)).round();

  const net = portion(line.netAmount, already.netAmount);
  const taxes = line.taxes.map((t) => {
    const prior = already.taxes.find((a) => a.taxRateId === t.taxRateId)?.amount ?? '0';
    return { taxRateId: t.taxRateId, amount: portion(t.amount, prior).toString(true) };
  });
  const tax = Money.sum(
    taxes.map((t) => m(t.amount)),
    currency,
  );
  return {
    netAmount: net.toString(true),
    taxAmount: tax.toString(true),
    grossAmount: net.add(tax).toString(true),
    taxes,
  };
}

/** Money.mul accepts at most 6 decimals; a refund share like 1/3 is truncated there (rounding happens after). */
const trim = (v: string) => {
  const [i, f = ''] = v.split('.');
  return f ? `${i}.${f.slice(0, 6)}` : i!;
};
