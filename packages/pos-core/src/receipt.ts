import type { SaleFinalizedV1 } from '@ros/contracts';

export type ReceiptLocale = 'ar' | 'en';

export interface ReceiptContext {
  branchName: string;
  /** Arabic needs a printer path that renders it (the browser's print dialog); ESC/POS text stays English. */
  locale?: ReceiptLocale;
  /** IANA zone of the branch; the receipt shows its local time. */
  timeZone?: string;
  branchAddress?: string | null;
  taxRegistrationNo?: string | null;
  paymentMethodNames: Record<string, string>;
  footer?: string;
  /** Characters per line: 42 for 80 mm, 32 for 58 mm paper. */
  width?: number;
}

const pad = (left: string, right: string, width: number) => {
  const space = Math.max(1, width - left.length - right.length);
  return left.slice(0, width - right.length - 1) + ' '.repeat(space) + right;
};

const LABELS = {
  en: {
    taxReg: 'Tax reg.',
    receipt: 'Receipt',
    date: 'Date',
    subtotal: 'Subtotal (excl. tax)',
    tax: 'Tax',
    total: 'TOTAL',
    payment: 'Payment',
    change: 'Change',
  },
  ar: {
    taxReg: 'رقم التسجيل الضريبي',
    receipt: 'فاتورة',
    date: 'التاريخ',
    subtotal: 'الإجمالي قبل الضريبة',
    tax: 'الضريبة',
    total: 'الإجمالي',
    payment: 'دفعة',
    change: 'الباقي',
  },
};

/** "YYYY-MM-DD HH:mm" in the given zone (UTC, labelled, when none is known). */
export function receiptTime(iso: string, timeZone?: string) {
  const d = new Date(iso);
  if (!timeZone) return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/**
 * Plain-text receipt rendered only from the locally committed sale, so it prints with no network.
 * English by default: Arabic needs raster rendering for most thermal printers, so it is only asked for
 * where the output path can draw it (the browser POS prints through the browser).
 */
export function renderReceipt(sale: SaleFinalizedV1, ctx: ReceiptContext): string {
  const w = ctx.width ?? 42;
  const ar = ctx.locale === 'ar';
  const t = LABELS[ar ? 'ar' : 'en'];
  const rule = '-'.repeat(w);
  const center = (s: string) => ' '.repeat(Math.max(0, Math.floor((w - s.length) / 2))) + s;
  const lines = [
    center(ctx.branchName),
    ...(ctx.branchAddress ? [center(ctx.branchAddress)] : []),
    ...(ctx.taxRegistrationNo ? [center(`${t.taxReg} ${ctx.taxRegistrationNo}`)] : []),
    rule,
    pad(t.receipt, sale.invoice.number, w),
    pad(t.date, receiptTime(sale.invoice.issuedAt, ctx.timeZone), w),
    rule,
  ];
  for (const l of sale.lines) {
    lines.push((ar ? l.productNameAr : l.productNameEn).slice(0, w));
    lines.push(pad(`  ${l.qty} x ${l.unitPrice}`, l.grossAmount, w));
  }
  lines.push(rule);
  lines.push(pad(t.subtotal, sale.invoice.subtotal, w));
  lines.push(pad(t.tax, sale.invoice.taxTotal, w));
  lines.push(pad(`${t.total} ${sale.invoice.currency}`, sale.invoice.total, w));
  lines.push(rule);
  for (const p of sale.payments) {
    lines.push(pad(ctx.paymentMethodNames[p.paymentMethodId] ?? t.payment, p.tendered ?? p.amount, w));
    if (p.changeGiven && p.changeGiven !== '0.00') lines.push(pad(t.change, p.changeGiven, w));
  }
  if (ctx.footer) lines.push(rule, center(ctx.footer));
  return lines.join('\n') + '\n';
}

/** ESC/POS bytes for a text receipt: initialise, text, feed and partial cut. */
export function toEscPos(text: string): Uint8Array {
  const ascii = Array.from(text, (ch) => (ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : 0x3f));
  return Uint8Array.from([0x1b, 0x40, ...ascii, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x01]);
}

export interface Printer {
  print(job: { id: string; invoiceNumber: string; text: string; escpos: Uint8Array }): Promise<void>;
}
