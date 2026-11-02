import { z } from 'zod';
import { optionalText, uuid } from './common';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date YYYY-MM-DD');
const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Amount with at most 2 decimals');
const zero = (v?: string) => !v || /^0+(\.0+)?$/.test(v);

/**
 * Manual journal entry, posted at once (corrections are reversals, never edits). Each line has exactly one of
 * debit or credit; the entry must balance (checked again by the server and by the database at commit).
 */
export const manualJournalCreateSchema = z.object({
  date: ymd,
  memo: z.string().trim().min(2).max(300),
  lines: z
    .array(
      z
        .object({
          accountId: uuid,
          debit: money.optional(),
          credit: money.optional(),
          branchId: uuid.optional(),
          description: optionalText(200),
        })
        .refine((l) => zero(l.debit) !== zero(l.credit), {
          message: 'Enter either a debit or a credit',
          path: ['debit'],
        }),
    )
    .min(2)
    .max(200),
});
export type ManualJournalCreateInput = z.infer<typeof manualJournalCreateSchema>;

export const journalReverseSchema = z.object({
  /** Accounting date of the reversal; defaults to today's business date. */
  date: ymd.optional(),
  memo: optionalText(300),
});
export type JournalReverseInput = z.infer<typeof journalReverseSchema>;

export const periodReopenSchema = z.object({ reason: z.string().trim().min(5).max(300) });
export type PeriodReopenInput = z.infer<typeof periodReopenSchema>;

export const statementRangeQuery = z.object({
  from: ymd.optional(),
  to: ymd.optional(),
  branchId: uuid.optional(),
});
export type StatementRangeQuery = z.infer<typeof statementRangeQuery>;

const signedMoney = z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/, 'Amount with at most 2 decimals');

/**
 * A bank statement as the bank printed it: amounts are signed (+ money in, − money out) and must lead from the
 * opening to the closing balance. Lines are dated inside the statement period.
 */
export const bankStatementCreateSchema = z
  .object({
    accountId: uuid,
    reference: z.string().trim().min(1).max(60),
    startDate: ymd,
    endDate: ymd,
    openingBalance: signedMoney,
    closingBalance: signedMoney,
    lines: z
      .array(
        z.object({
          date: ymd,
          description: z.string().trim().min(1).max(200),
          reference: optionalText(80),
          amount: signedMoney.refine((v) => !zero(v.replace('-', '')), 'Amount cannot be zero'),
        }),
      )
      .min(1)
      .max(2000),
  })
  .superRefine((v, ctx) => {
    if (v.endDate < v.startDate)
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'The end date is before the start date' });
    v.lines.forEach((l, i) => {
      if (l.date < v.startDate || l.date > v.endDate)
        ctx.addIssue({ code: 'custom', path: ['lines', i, 'date'], message: 'Outside the statement period' });
    });
  });
export type BankStatementCreateInput = z.infer<typeof bankStatementCreateSchema>;

export const bankMatchSchema = z.object({ lineId: uuid, journalLineId: uuid });
export const bankUnmatchSchema = z.object({ lineId: uuid });
/** Books a bank line that is not in the ledger yet (fees, interest) against an account, and matches it. */
export const bankPostLineSchema = z.object({
  lineId: uuid,
  accountId: uuid,
  memo: optionalText(300),
  branchId: uuid.optional(),
});
export type BankMatchInput = z.infer<typeof bankMatchSchema>;
export type BankUnmatchInput = z.infer<typeof bankUnmatchSchema>;
export type BankPostLineInput = z.infer<typeof bankPostLineSchema>;

export const balanceSheetQuery = z.object({ asOf: ymd.optional() });
export const generalLedgerQuery = z.object({ accountId: uuid, from: ymd.optional(), to: ymd.optional() });
export type GeneralLedgerQuery = z.infer<typeof generalLedgerQuery>;
