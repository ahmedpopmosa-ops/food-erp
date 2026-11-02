/** Exact money arithmetic for the payment screen (integer cents; never floating point, ADR-0006). */
const MONEY = /^-?\d{1,12}(\.\d{1,2})?$/;

export const isMoney = (v: string) => MONEY.test(v.trim());

export const cents = (v: string): bigint => {
  const s = v.trim();
  if (!MONEY.test(s)) return 0n;
  const neg = s.startsWith('-');
  const [whole, frac = ''] = s.replace('-', '').split('.');
  const c = BigInt(whole!) * 100n + BigInt(frac.padEnd(2, '0'));
  return neg ? -c : c;
};

export const fromCents = (c: bigint) => {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? '-' : ''}${a / 100n}.${String(a % 100n).padStart(2, '0')}`;
};

/** "10" → "0.1", "12.5" → "0.125": a percentage typed by the cashier as the fraction the core expects. */
export const percentToFraction = (v: string) => {
  const s = v.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const [w, f = ''] = s.split('.');
  const scaled = BigInt(w!) * 100n + BigInt(f.padEnd(2, '0')); // hundredths of a percent
  if (scaled <= 0n || scaled > 10000n) return null;
  const digits = String(scaled).padStart(5, '0'); // fraction = scaled / 10000
  const fraction = `${digits.slice(0, -4)}.${digits.slice(-4)}`.replace(/^0+(?=\d\.)/, '').replace(/\.?0+$/, '');
  return fraction === '1' ? '1' : fraction.startsWith('.') ? `0${fraction}` : fraction;
};
