import Decimal from 'decimal.js';

/**
 * Inventory rules shared by API and (later) POS: unit conversion, perpetual weighted-average valuation and
 * recipe consumption (doc 07 §5–6, ADR-0008). Quantities are decimal strings with up to 6 places; costs are
 * kept at 6 places per unit and money amounts rounded to the currency's minor units by the caller's Money.
 */

const D = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP });
const q6 = (v: Decimal) =>
  v
    .toDecimalPlaces(6)
    .toFixed(6)
    .replace(/\.?0+$/, '') || '0';
const c2 = (v: Decimal) => v.toDecimalPlaces(2).toFixed(2);

/** Built-in units: factor to the dimension's base unit (g, ml, pc). */
export const UNITS: Record<string, { dimension: 'mass' | 'volume' | 'count'; factor: string }> = {
  g: { dimension: 'mass', factor: '1' },
  kg: { dimension: 'mass', factor: '1000' },
  ml: { dimension: 'volume', factor: '1' },
  l: { dimension: 'volume', factor: '1000' },
  pc: { dimension: 'count', factor: '1' },
  dozen: { dimension: 'count', factor: '12' },
};

export const BASE_UNITS = ['g', 'ml', 'pc'] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];

/**
 * Converts `qty` of `unit` into the item's base unit. Item-specific conversions (e.g. 1 box = 24 pc, or
 * 1 pc = 180 g for onions) take precedence; otherwise built-in units of the same dimension apply.
 */
export function toBaseQty(
  qty: string,
  unit: string,
  baseUnit: string,
  itemConversions: Record<string, string> = {},
): string {
  if (unit === baseUnit) return q6(new D(qty));
  if (itemConversions[unit]) return q6(new D(qty).times(itemConversions[unit]!));
  const from = UNITS[unit];
  const to = UNITS[baseUnit];
  if (!from || !to || from.dimension !== to.dimension)
    throw new RangeError(`No conversion from ${unit} to ${baseUnit}`);
  return q6(new D(qty).times(from.factor).div(to.factor));
}

export interface StockBalance {
  /** Quantity in base units (may be negative when negative stock is allowed). */
  qty: string;
  /** Total value at cost; mirrors Σ movement costs. */
  value: string;
  /** Last known average cost per base unit (used while the balance is not positive). */
  avgCost: string;
}

export interface ValuationResult {
  /** Signed cost of the movement itself (positive in, negative out), rounded to 2 decimals. */
  totalCost: string;
  unitCost: string;
  /** Cost correction booked as a separate zero-quantity revaluation movement (price variance), if any. */
  revaluation: string | null;
  balance: StockBalance;
}

/**
 * Receipt at `unitCost`. A receipt into negative stock settles the shortfall: the balance restarts at the
 * receipt cost and the difference between what was issued and what it really cost is a price variance.
 */
export function receive(b: StockBalance, qty: string, unitCost: string): ValuationResult {
  const q = new D(qty);
  if (q.lte(0)) throw new RangeError('Receipt quantity must be positive');
  const cost = new D(unitCost);
  const total = new D(c2(q.times(cost)));
  const oldQty = new D(b.qty);
  const newQty = oldQty.plus(q);
  let value = new D(b.value).plus(total);
  let revaluation: Decimal | null = null;
  if (oldQty.lt(0)) {
    // Whatever remains (positive, zero or still negative) is valued at the receipt cost.
    const target = new D(c2(newQty.times(cost)));
    revaluation = target.minus(value);
    value = target;
    if (revaluation.isZero()) revaluation = null;
  }
  const avg = newQty.gt(0) ? value.div(newQty) : cost;
  return {
    totalCost: c2(total),
    unitCost: q6(cost),
    revaluation: revaluation ? c2(revaluation) : null,
    balance: { qty: q6(newQty), value: c2(value), avgCost: q6(avg) },
  };
}

/**
 * Issue at the current average cost. Issuing the whole positive balance takes exactly its value (no residue);
 * with no stock on hand the last average (or `fallbackCost`) is used and the balance goes negative.
 */
export function issue(b: StockBalance, qty: string, fallbackCost = '0'): ValuationResult {
  const q = new D(qty);
  if (q.lte(0)) throw new RangeError('Issue quantity must be positive');
  const onHand = new D(b.qty);
  const value = new D(b.value);
  const avg = onHand.gt(0) ? value.div(onHand) : new D(b.avgCost).gt(0) ? new D(b.avgCost) : new D(fallbackCost);
  const total = onHand.gt(0) && q.eq(onHand) ? value : new D(c2(q.times(avg)));
  const newQty = onHand.minus(q);
  const newValue = value.minus(total);
  return {
    totalCost: c2(total.neg()),
    unitCost: q6(avg),
    revaluation: null,
    balance: { qty: q6(newQty), value: c2(newValue), avgCost: q6(newQty.gt(0) ? newValue.div(newQty) : avg) },
  };
}

export interface RecipeLine {
  itemId: string;
  /** Quantity in the item's base unit per recipe yield. */
  qtyBase: string;
  /** Fraction lost in preparation (0 ≤ waste < 1); consumption = qty ÷ (1 − waste). */
  wastePct: string;
}

/** Base-unit consumption per item for `soldQty` portions of a recipe yielding `yieldQty` portions. */
export function recipeConsumption(
  lines: RecipeLine[],
  yieldQty: string,
  soldQty: string,
): { itemId: string; qtyBase: string }[] {
  const portions = new D(soldQty).div(yieldQty);
  const totals = new Map<string, Decimal>();
  for (const l of lines) {
    const waste = new D(l.wastePct);
    if (waste.lt(0) || waste.gte(1)) throw new RangeError('Waste must be in [0, 1)');
    totals.set(
      l.itemId,
      (totals.get(l.itemId) ?? new D(0)).plus(new D(l.qtyBase).div(new D(1).minus(waste)).times(portions)),
    );
  }
  return [...totals].map(([itemId, qty]) => ({ itemId, qtyBase: q6(qty) }));
}
