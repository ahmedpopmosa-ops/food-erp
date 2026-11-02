import Decimal from 'decimal.js';
import { Money } from './money';
import type { TaxRateRef } from './tax';

export type DiscountSpec = { kind: 'percent'; value: string } | { kind: 'amount'; value: string };

export interface OrderLineInput {
  lineKey: string;
  qty: string;
  /** Unit price including modifier price deltas, as listed (inclusive or exclusive of tax). */
  unitPrice: string;
  taxes: TaxRateRef[];
  discount?: DiscountSpec | null;
}

export interface OrderLineTotals {
  lineKey: string;
  /** Listed amount before any discount (qty × unit price, rounded). */
  listedAmount: string;
  /** Discount in listed terms (gross if prices include tax, net otherwise): line + share of order discount. */
  discountListed: string;
  /** Net before discount, net after discount, and their difference (the discount in net terms). */
  netBeforeDiscount: string;
  discountAmount: string;
  netAmount: string;
  taxAmount: string;
  grossAmount: string;
  taxes: { taxRateId: string; rate: string; amount: string }[];
}

export interface OrderTotals {
  currency: string;
  lines: OrderLineTotals[];
  serviceCharge: {
    rate: string;
    netAmount: string;
    taxAmount: string;
    taxes: { taxRateId: string; rate: string; amount: string }[];
  } | null;
  taxes: { taxRateId: string; rate: string; taxableBase: string; amount: string }[];
  /** Σ net before discount. */
  subtotal: string;
  discountTotal: string;
  serviceChargeTotal: string;
  taxTotal: string;
  /** subtotal − discountTotal + serviceChargeTotal + taxTotal. */
  total: string;
  /** Largest effective discount on any line, as a fraction of its listed amount (for approval limits). */
  maxDiscountFraction: string;
}

const RATE = /^\d(\.\d{1,6})?$/;
const QTY = /^\d{1,9}(\.\d{1,6})?$/;
const fraction = (v: string) => {
  const [i, f = ''] = new Decimal(v).toFixed(12).split('.');
  return `${i}.${f.slice(0, 6)}`;
};

/** Splits `amount` over `weights` proportionally; rounding residue goes to the last part so the sum is exact. */
function allocate(amount: Money, weights: Money[], currency: string): Money[] {
  const total = Money.sum(weights, currency);
  if (total.isZero()) return weights.map(() => Money.zero(currency));
  let left = amount;
  return weights.map((w, i) => {
    if (i === weights.length - 1) return left;
    const part = amount.mul(fraction(new Decimal(w.toString()).div(total.toString()).toString())).round();
    left = left.sub(part);
    return part;
  });
}

/** Taxes on a net amount; with `fixedGross` the last rate absorbs rounding so net + taxes = gross exactly. */
function taxesOn(net: Money, taxes: TaxRateRef[], fixedGross: Money | null) {
  let remaining = fixedGross ? fixedGross.sub(net) : null;
  return taxes.map((t, i) => {
    const amount = remaining && i === taxes.length - 1 ? remaining : net.mul(t.rate).round();
    if (remaining) remaining = remaining.sub(amount);
    return { taxRateId: t.taxRateId, rate: t.rate, amount };
  });
}

/**
 * Order totals with line and order discounts and a service charge (doc 07 §4), shared by POS and API.
 *
 * - Discounts reduce the listed amount (gross for tax-inclusive prices) before tax is extracted, so VAT is
 *   charged on what the customer actually pays. An order discount is spread over lines in proportion to their
 *   amount after line discounts. A percentage discount is applied per line.
 * - The service charge is a percentage of the discounted net, always added on top, taxed with `taxes`.
 * - Amounts are rounded per line; every total is an exact sum of rounded parts.
 */
export function computeOrderTotals(input: {
  currency: string;
  pricesIncludeTax: boolean;
  lines: OrderLineInput[];
  orderDiscount?: DiscountSpec | null;
  serviceCharge?: { rate: string; taxes: TaxRateRef[] } | null;
}): OrderTotals {
  const { currency, pricesIncludeTax } = input;
  const m = (v: string) => Money.of(v, currency);
  const zero = Money.zero(currency);

  const prepared = input.lines.map((l) => {
    if (!QTY.test(l.qty) || new Decimal(l.qty).lte(0)) throw new RangeError(`Invalid quantity: ${l.qty}`);
    for (const t of l.taxes) if (!RATE.test(t.rate)) throw new RangeError(`Invalid tax rate: ${t.rate}`);
    const listed = m(l.unitPrice).mul(l.qty).round();
    const lineDiscount = discountOf(l.discount, listed, currency);
    return { l, listed, afterLine: listed.sub(lineDiscount), lineDiscount };
  });

  // Order discount: percent per line, amount spread proportionally.
  const od = input.orderDiscount;
  const orderShares =
    od?.kind === 'percent'
      ? prepared.map((p) => discountOf(od, p.afterLine, currency))
      : od?.kind === 'amount'
        ? allocate(
            clampAmount(
              m(od.value),
              Money.sum(
                prepared.map((p) => p.afterLine),
                currency,
              ),
            ),
            prepared.map((p) => p.afterLine),
            currency,
          )
        : prepared.map(() => zero);

  let maxFraction = new Decimal(0);
  const lines: OrderLineTotals[] = prepared.map((p, i) => {
    const discountListed = p.lineDiscount.add(orderShares[i]!);
    const charged = p.listed.sub(discountListed);
    const rateSum = p.l.taxes
      .reduce((s, t) => s.plus(t.rate), new Decimal(0))
      .plus(1)
      .toString();
    const netBefore = pricesIncludeTax ? p.listed.div(rateSum).round() : p.listed;
    const net = pricesIncludeTax ? charged.div(rateSum).round() : charged;
    const taxes = taxesOn(net, p.l.taxes, pricesIncludeTax ? charged : null);
    const tax = Money.sum(
      taxes.map((t) => t.amount),
      currency,
    );
    if (!p.listed.isZero())
      maxFraction = Decimal.max(maxFraction, new Decimal(discountListed.toString()).div(p.listed.toString()));
    return {
      lineKey: p.l.lineKey,
      listedAmount: p.listed.toString(true),
      discountListed: discountListed.toString(true),
      netBeforeDiscount: netBefore.toString(true),
      discountAmount: netBefore.sub(net).toString(true),
      netAmount: net.toString(true),
      taxAmount: tax.toString(true),
      grossAmount: net.add(tax).toString(true),
      taxes: taxes.map((t) => ({ taxRateId: t.taxRateId, rate: t.rate, amount: t.amount.toString(true) })),
    };
  });

  const discountedNet = Money.sum(
    lines.map((l) => m(l.netAmount)),
    currency,
  );
  let serviceCharge: OrderTotals['serviceCharge'] = null;
  if (input.serviceCharge && new Decimal(input.serviceCharge.rate).gt(0)) {
    if (!RATE.test(input.serviceCharge.rate))
      throw new RangeError(`Invalid service charge rate: ${input.serviceCharge.rate}`);
    const scNet = discountedNet.mul(input.serviceCharge.rate).round();
    const scTaxes = taxesOn(scNet, input.serviceCharge.taxes, null);
    serviceCharge = {
      rate: input.serviceCharge.rate,
      netAmount: scNet.toString(true),
      taxAmount: Money.sum(
        scTaxes.map((t) => t.amount),
        currency,
      ).toString(true),
      taxes: scTaxes.map((t) => ({ taxRateId: t.taxRateId, rate: t.rate, amount: t.amount.toString(true) })),
    };
  }

  const summary = new Map<string, { rate: string; base: Money; amount: Money }>();
  const addTax = (base: string, list: { taxRateId: string; rate: string; amount: string }[]) => {
    for (const t of list) {
      const s = summary.get(t.taxRateId) ?? { rate: t.rate, base: zero, amount: zero };
      s.base = s.base.add(m(base));
      s.amount = s.amount.add(m(t.amount));
      summary.set(t.taxRateId, s);
    }
  };
  for (const l of lines) addTax(l.netAmount, l.taxes);
  if (serviceCharge) addTax(serviceCharge.netAmount, serviceCharge.taxes);

  const sum = (k: keyof Pick<OrderLineTotals, 'netBeforeDiscount' | 'discountAmount' | 'taxAmount'>) =>
    Money.sum(
      lines.map((l) => m(l[k])),
      currency,
    );
  const subtotal = sum('netBeforeDiscount');
  const discountTotal = sum('discountAmount');
  const scNet = serviceCharge ? m(serviceCharge.netAmount) : zero;
  const taxTotal = sum('taxAmount').add(serviceCharge ? m(serviceCharge.taxAmount) : zero);
  return {
    currency,
    lines,
    serviceCharge,
    taxes: [...summary].map(([taxRateId, s]) => ({
      taxRateId,
      rate: s.rate,
      taxableBase: s.base.toString(true),
      amount: s.amount.toString(true),
    })),
    subtotal: subtotal.toString(true),
    discountTotal: discountTotal.toString(true),
    serviceChargeTotal: scNet.toString(true),
    taxTotal: taxTotal.toString(true),
    total: subtotal.sub(discountTotal).add(scNet).add(taxTotal).toString(true),
    maxDiscountFraction: maxFraction.toDecimalPlaces(6).toString(),
  };
}

function clampAmount(value: Money, max: Money) {
  if (value.isNegative()) throw new RangeError('Discount cannot be negative');
  return value.compare(max) > 0 ? max : value;
}

function discountOf(spec: DiscountSpec | null | undefined, base: Money, currency: string): Money {
  if (!spec) return Money.zero(currency);
  if (spec.kind === 'percent') {
    const pct = new Decimal(spec.value);
    if (pct.lt(0) || pct.gt(1)) throw new RangeError('Percent discount must be between 0 and 1');
    return base.mul(fraction(spec.value)).round();
  }
  return clampAmount(Money.of(spec.value, currency), base);
}
