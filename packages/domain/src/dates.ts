/**
 * Business date of an instant in a branch: the local calendar date in `timeZone`, where times before the
 * day cutoff (e.g. "04:00") still belong to the previous business day — a sale at 01:30 after a late shift
 * counts for yesterday. Returns YYYY-MM-DD.
 */
export function businessDate(instant: string | Date, timeZone: string, cutoff = '00:00'): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid instant: ${String(instant)}`);
  const [ch, cm] = cutoff.split(':').map(Number) as [number, number];
  const shifted = new Date(date.getTime() - (ch * 60 + cm) * 60_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(shifted);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
