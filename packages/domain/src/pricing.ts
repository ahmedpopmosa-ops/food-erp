export type Channel = 'dine_in' | 'takeaway' | 'delivery' | 'phone';

export interface PriceRow {
  id: string;
  variantId: string;
  branchId: string | null;
  channel: Channel | null;
  price: string;
  /** ISO timestamp. */
  validFrom: string;
  validTo: string | null;
}

/**
 * Price of a variant at an instant for a branch and channel. Most specific scope wins:
 * branch + channel > branch > channel > all branches; within a scope, the latest `validFrom` wins.
 * Used by the POS to price lines and by the API to detect outdated offline prices.
 */
export function selectPrice(
  prices: readonly PriceRow[],
  q: { variantId: string; branchId: string; channel: Channel; at: string },
): PriceRow | null {
  const at = Date.parse(q.at);
  const candidates = prices.filter(
    (p) =>
      p.variantId === q.variantId &&
      (p.branchId === null || p.branchId === q.branchId) &&
      (p.channel === null || p.channel === q.channel) &&
      Date.parse(p.validFrom) <= at &&
      (p.validTo === null || Date.parse(p.validTo) > at),
  );
  const specificity = (p: PriceRow) => (p.branchId ? 2 : 0) + (p.channel ? 1 : 0);
  candidates.sort((a, b) => specificity(b) - specificity(a) || Date.parse(b.validFrom) - Date.parse(a.validFrom));
  return candidates[0] ?? null;
}
