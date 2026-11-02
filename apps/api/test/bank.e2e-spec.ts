import type { INestApplication } from '@nestjs/common';
import { call, createApp, login, type Session } from './helpers';
import { EMAILS, loadFixtures, ownerClient } from './fixtures';
import { PrismaService } from '../src/prisma/prisma.service';

interface Statement {
  id: string;
  status: string;
  autoMatched?: number;
  lines: { id: string; lineNo: number; amount: string; journalLineId: string | null; match: { id: string } | null }[];
  bookLines: { id: string; amount: string; memo: string | null }[];
  summary: { unmatchedLines: number; unrecordedBank: string; outstandingBook: string };
}

/**
 * P6-7 on tenant A's bank account (1150), with amounts no other suite uses. The books have a deposit of
 * 2 500.37, a payment of 345.67 and a cheque of 999.99 not yet cleared; the bank statement shows the deposit,
 * the payment and a bank fee of 12.50 the books do not have yet.
 */
describe('bank reconciliation: import, match, post bank-only lines, complete', () => {
  let app: INestApplication;
  let ownerA: Session;
  let managerA: Session;
  let fx: Awaited<ReturnType<typeof loadFixtures>>;
  const owner = ownerClient();
  const prisma = new PrismaService();
  const acc: Record<string, string> = {};
  const today = new Date().toISOString().slice(0, 10);
  let statement: Statement;
  const book: Record<string, string> = {}; // memo → bank-side journal line id

  const manual = async (memo: string, bankDebit: boolean, amount: string) => {
    const res = await call(ownerA, 'POST', '/api/v1/accounting/journal-entries')
      .send({
        date: today,
        memo,
        lines: [
          { accountId: acc['1150'], ...(bankDebit ? { debit: amount } : { credit: amount }) },
          { accountId: acc[bankDebit ? '3100' : '5900'], ...(bankDebit ? { credit: amount } : { debit: amount }) },
        ],
      })
      .expect(201);
    book[memo] = (res.body.lines as { id: string; accountId: string }[]).find((l) => l.accountId === acc['1150'])!.id;
  };
  const statementBody = (o: Partial<{ reference: string; closingBalance: string; accountId: string }> = {}) => ({
    accountId: acc['1150'],
    reference: 'BS-A-1',
    startDate: today,
    endDate: today,
    openingBalance: '0.00',
    closingBalance: '2142.20',
    lines: [
      { date: today, description: 'Deposit', amount: '2500.37' },
      { date: today, description: 'Supplier transfer', amount: '-345.67' },
      { date: today, description: 'Bank fee', reference: 'FEE-10', amount: '-12.50' },
    ],
    ...o,
  });
  const act = (path: string, body: object = {}) =>
    call(ownerA, 'POST', `/api/v1/accounting/bank-statements/${statement.id}/${path}`).send(body);

  beforeAll(async () => {
    app = await createApp();
    fx = await loadFixtures();
    for (const a of await owner.account.findMany({ where: { tenantId: fx.tenantA.id } })) acc[a.code] = a.id;
    ownerA = await login(app, EMAILS.ownerA);
    managerA = await login(app, EMAILS.managerA);
    await manual('Deposit 2500.37', true, '2500.37');
    await manual('Payment 345.67', false, '345.67');
    await manual('Cheque 999.99', false, '999.99');
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await owner.$disconnect();
    await app.close();
  });

  it('imports a statement only when its lines lead from the opening to the closing balance', async () => {
    const wrong = await call(ownerA, 'POST', '/api/v1/accounting/bank-statements')
      .send(statementBody({ closingBalance: '2142.00' }))
      .expect(400);
    expect(wrong.body).toMatchObject({ code: 'bankStatements.totalsMismatch', details: { computed: '2142.20' } });
    const notBank = await call(ownerA, 'POST', '/api/v1/accounting/bank-statements')
      .send(statementBody({ accountId: acc['1200'] }))
      .expect(400);
    expect(notBank.body.code).toBe('bank.invalidAccount');

    const res = await call(ownerA, 'POST', '/api/v1/accounting/bank-statements').send(statementBody()).expect(201);
    statement = res.body;
    expect([statement.status, statement.lines.length, statement.summary.unmatchedLines]).toEqual(['open', 3, 3]);
    await call(ownerA, 'POST', '/api/v1/accounting/bank-statements').send(statementBody()).expect(409);
    await call(managerA, 'POST', '/api/v1/accounting/bank-statements')
      .send(statementBody({ reference: 'X' }))
      .expect(403);
  });

  it('auto-matches unambiguous lines and leaves the rest visible on both sides', async () => {
    statement = (await act('auto-match').expect(201)).body;
    expect(statement.autoMatched).toBe(2);
    const byNo = (n: number) => statement.lines.find((l) => l.lineNo === n)!;
    expect(byNo(1).match?.id).toBe(book['Deposit 2500.37']);
    expect(byNo(2).match?.id).toBe(book['Payment 345.67']);
    expect(byNo(3).journalLineId).toBeNull();
    // The uncleared cheque is an outstanding book line; the fee is a bank line the books lack.
    expect(statement.bookLines.map((b) => b.id)).toContain(book['Cheque 999.99']);
    expect(statement.bookLines.map((b) => b.id)).not.toContain(book['Deposit 2500.37']);
    expect(statement.summary.unrecordedBank).toBe('-12.50');
  });

  it('refuses wrong matches, then books the bank fee from the statement and completes', async () => {
    const fee = statement.lines.find((l) => l.lineNo === 3)!;
    const deposit = statement.lines.find((l) => l.lineNo === 1)!;
    const wrongAmount = await act('match', { lineId: fee.id, journalLineId: book['Cheque 999.99'] }).expect(400);
    expect(wrongAmount.body.code).toBe('bank.amountMismatch');
    const taken = await act('match', { lineId: deposit.id, journalLineId: book['Cheque 999.99'] }).expect(409);
    expect(taken.body.code).toBe('bank.lineMatched');
    const early = await act('complete').expect(400);
    expect(early.body).toMatchObject({ code: 'bankStatements.unmatched', details: { open: 1 } });

    // Unmatch and rematch by hand.
    statement = (await act('unmatch', { lineId: deposit.id }).expect(201)).body;
    expect(statement.summary.unmatchedLines).toBe(2);
    statement = (await act('match', { lineId: deposit.id, journalLineId: book['Deposit 2500.37'] }).expect(201)).body;

    statement = (
      await act('post-line', { lineId: fee.id, accountId: acc['5900'], memo: 'Bank charges October' }).expect(201)
    ).body;
    const feeLine = statement.lines.find((l) => l.lineNo === 3)!;
    const entry = await owner.journalLine.findUniqueOrThrow({
      where: { id: feeLine.journalLineId! },
      include: { entry: { include: { lines: true } } },
    });
    expect(entry.entry.sourceType).toBe('bank_statement_line');
    expect(
      entry.entry.lines
        .map((l) => [l.accountId === acc['1150'] ? '1150' : '5900', l.debit.toFixed(2), l.credit.toFixed(2)])
        .sort(),
    ).toEqual([
      ['1150', '0.00', '12.50'],
      ['5900', '12.50', '0.00'],
    ]);
    await act('post-line', { lineId: fee.id, accountId: acc['5900'] }).expect(409);

    statement = (await act('complete').expect(201)).body;
    expect([statement.status, statement.summary.unmatchedLines]).toEqual(['reconciled', 0]);
    expect(statement.bookLines.map((b) => b.id)).toContain(book['Cheque 999.99']); // still outstanding
    const after = await act('unmatch', { lineId: deposit.id }).expect(400);
    expect(after.body.code).toBe('invalid_state_transition');
  });

  it('enforces matches and frozen statements in the database too', async () => {
    const run = (sql: string) => prisma.withTenant(fx.tenantA.id, (tx) => tx.$executeRawUnsafe(sql));
    await expect(
      run(
        `UPDATE bank_statement_lines SET journal_line_id = NULL, matched_at = NULL WHERE statement_id = '${statement.id}'`,
      ),
    ).rejects.toThrow(/reconciled/);
    await expect(run(`DELETE FROM bank_statement_lines`)).rejects.toThrow(/permission denied/i);
    // A second statement: a match to a book line of another amount is refused by the trigger itself.
    const other = await call(ownerA, 'POST', '/api/v1/accounting/bank-statements')
      .send({
        ...statementBody({ reference: 'BS-A-2', closingBalance: '-999.98' }),
        lines: [{ date: today, description: 'Cheque', amount: '-999.98' }],
      })
      .expect(201);
    await expect(
      run(
        `UPDATE bank_statement_lines SET journal_line_id = '${book['Cheque 999.99']}', matched_at = now() WHERE statement_id = '${other.body.id}'`,
      ),
    ).rejects.toThrow(/same account and amount/);
  });
});
