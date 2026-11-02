import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { call, createApp, login, type Session } from './helpers';
import { EMAILS, loadFixtures, ownerClient, TEST_PASSWORD } from './fixtures';
import { PrismaService } from '../src/prisma/prisma.service';
import { hashPassword } from '../src/common/crypto';

/**
 * Phase 6a on tenant B. Year 2025 is created here (fixtures only seed the current year), so manual entries,
 * period closing and the year-end close run on a year no other suite touches. Expected 2025 figures:
 *   E1 Jan 10  Dr 1150 bank 10 000 / Cr 3100 capital 10 000
 *   E6 Jan 20  Dr 1150 bank    100 / Cr 3100 capital    100   (posted while January is soft-closed)
 *   E2 Mar 15  Dr 1150 bank  2 500 / Cr 4900 revenue  2 500   (branch B1)
 *   E3 Jun 20  Dr 5900 exp.    800 / Cr 1150 bank       800   (branch B1)
 *   E4 Jul  1  Dr 1300 VAT     140 / Cr 1150 bank       140
 *   E5 Aug  1  Dr 5900 50 / Cr 1150 50, reversed on Aug 2
 * → net income 1 700; bank 11 660; assets 11 800 = capital 10 100 + earnings 1 700.
 */
describe('general ledger: manual entries, reversals, periods, year close, statements', () => {
  let app: INestApplication;
  let ownerB: Session;
  let ownerA: Session;
  let managerA: Session;
  let clerkB: Session;
  let fx: Awaited<ReturnType<typeof loadFixtures>>;
  const owner = ownerClient();
  const prisma = new PrismaService();
  const acc: Record<string, string> = {};
  let fy2025: string;
  let periods2025: { id: string; periodNo: number }[];
  const nextYear = new Date().getUTCFullYear() + 1;

  const post = (s: Session, date: string, lines: object[], memo = 'Test entry') =>
    call(s, 'POST', '/api/v1/accounting/journal-entries').send({ date, memo, lines });
  const dr = (code: string, amount: string, extra: object = {}) => ({ accountId: acc[code], debit: amount, ...extra });
  const cr = (code: string, amount: string, extra: object = {}) => ({ accountId: acc[code], credit: amount, ...extra });
  const journal = async (entryId: string) =>
    (
      await owner.$queryRaw<{ code: string; debit: Prisma.Decimal; credit: Prisma.Decimal }[]>`
        SELECT a.code, l.debit, l.credit FROM journal_lines l JOIN accounts a ON a.id = l.account_id
        WHERE l.journal_entry_id = ${entryId}::uuid`
    )
      .map((l) => [l.code, l.debit.toFixed(2), l.credit.toFixed(2)])
      .sort();
  const period = (n: number) => periods2025.find((p) => p.periodNo === n)!.id;
  const report = (path: string) =>
    ownerB.agent
      .get(`/api/v1/accounting/${path}`)
      .expect(200)
      .then((r) => r.body);

  beforeAll(async () => {
    app = await createApp();
    fx = await loadFixtures();
    const tenantId = fx.tenantB.id;
    for (const a of await owner.account.findMany({ where: { tenantId } })) acc[a.code] = a.id;
    // FY2025 with twelve open months, as the onboarding seed would have created it a year earlier.
    const fy = await owner.fiscalYear.create({
      data: {
        tenantId,
        name: 'FY2025',
        startDate: new Date('2025-01-01T00:00:00Z'),
        endDate: new Date('2025-12-31T00:00:00Z'),
        periods: {
          create: Array.from({ length: 12 }, (_, m) => ({
            tenantId,
            periodNo: m + 1,
            startDate: new Date(Date.UTC(2025, m, 1)),
            endDate: new Date(Date.UTC(2025, m + 1, 0)),
          })),
        },
      },
      include: { periods: true },
    });
    fy2025 = fy.id;
    periods2025 = fy.periods;
    // A ledger clerk who may post but not into soft-closed periods.
    const role = await owner.role.create({
      data: {
        tenantId,
        name: 'Ledger clerk',
        rolePermissions: {
          create: ['accounting.view', 'accounting.journal.post'].map((permissionKey) => ({ tenantId, permissionKey })),
        },
      },
    });
    const user = await owner.user.create({
      data: { email: 'clerk-b@test.local', fullName: 'Clerk B', passwordHash: await hashPassword(TEST_PASSWORD) },
    });
    await owner.membership.create({ data: { tenantId, userId: user.id, roleId: role.id, status: 'active' } });
    ownerB = await login(app, EMAILS.ownerB);
    ownerA = await login(app, EMAILS.ownerA);
    managerA = await login(app, EMAILS.managerA);
    clerkB = await login(app, 'clerk-b@test.local');
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await owner.$disconnect();
    await app.close();
  });

  it('posts balanced manual entries and refuses unbalanced, control-account or unauthorised ones', async () => {
    const b1 = { branchId: fx.branchB1.id };
    const e1 = await post(ownerB, '2025-01-10', [dr('1150', '10000.00'), cr('3100', '10000.00')], 'Capital').expect(
      201,
    );
    expect(e1.body).toMatchObject({ sourceType: 'manual', status: 'posted', memo: 'Capital' });
    expect(e1.body.number).toMatch(/^JE-2025-\d{6}$/);
    await post(ownerB, '2025-03-15', [dr('1150', '2500.00', b1), cr('4900', '2500.00', b1)]).expect(201);
    await post(ownerB, '2025-06-20', [dr('5900', '800.00', b1), cr('1150', '800.00', b1)]).expect(201);
    await post(ownerB, '2025-07-01', [dr('1300', '140.00'), cr('1150', '140.00')]).expect(201);

    const unbalanced = await post(ownerB, '2025-07-02', [dr('1150', '10.00'), cr('3100', '9.99')]).expect(400);
    expect(unbalanced.body).toMatchObject({ code: 'journal.unbalanced', details: { debit: '10.00', credit: '9.99' } });
    const control = await post(ownerB, '2025-07-02', [dr('2100', '10.00'), cr('1150', '10.00')]).expect(400);
    expect(control.body).toMatchObject({ code: 'journal.invalidAccount', details: { accountId: acc['2100'] } });
    await post(ownerB, '2025-07-02', [dr('1000', '10.00'), cr('1150', '10.00')]).expect(400); // header account
    await post(ownerB, '2025-07-02', [
      { accountId: acc['1150'], debit: '5.00', credit: '5.00' },
      cr('3100', '5.00'),
    ]).expect(400);
    const far = await post(ownerB, '2099-01-01', [dr('1150', '1.00'), cr('3100', '1.00')]).expect(422);
    expect(far.body.code).toBe('accounting.noOpenPeriod');
    await post(managerA, '2026-01-02', [dr('1150', '1.00'), cr('3100', '1.00')]).expect(403);
  });

  it('corrects a manual entry only by one mirrored reversal', async () => {
    const e5 = await post(ownerB, '2025-08-01', [
      dr('5900', '50.00', { branchId: fx.branchB1.id }),
      cr('1150', '50.00', { branchId: fx.branchB1.id }),
    ]).expect(201);
    const early = await call(ownerB, 'POST', `/api/v1/accounting/journal-entries/${e5.body.id}/reverse`)
      .send({ date: '2025-07-31' })
      .expect(400);
    expect(early.body.code).toBe('journal.reversalBeforeOriginal');
    const rev = await call(ownerB, 'POST', `/api/v1/accounting/journal-entries/${e5.body.id}/reverse`)
      .send({ date: '2025-08-02' })
      .expect(201);
    expect(rev.body).toMatchObject({
      sourceType: 'reversal',
      reversalOfId: e5.body.id,
      memo: `Reversal of ${e5.body.number}`,
    });
    expect(await journal(rev.body.id)).toEqual([
      ['1150', '50.00', '0.00'],
      ['5900', '0.00', '50.00'],
    ]);
    const detail = await report(`journal-entries/${e5.body.id}`);
    expect(detail.reversedBy).toEqual({ id: rev.body.id, number: rev.body.number });

    const twice = await call(ownerB, 'POST', `/api/v1/accounting/journal-entries/${e5.body.id}/reverse`)
      .send({})
      .expect(409);
    expect(twice.body.code).toBe('journal.alreadyReversed');
    const ofReversal = await call(ownerB, 'POST', `/api/v1/accounting/journal-entries/${rev.body.id}/reverse`)
      .send({})
      .expect(400);
    expect(ofReversal.body.code).toBe('journal.notReversible');
    // A sale's entry belongs to its invoice: it is corrected by a refund, never by a ledger reversal.
    const sale = await call(ownerB, 'POST', `/api/v1/accounting/journal-entries/${fx.journalB.id}/reverse`)
      .send({})
      .expect(400);
    expect(sale.body.code).toBe('journal.notReversible');
  });

  it('closes periods in order, protects closed ones in the service and the database, and reopens backwards', async () => {
    const direct = await call(ownerB, 'POST', `/api/v1/accounting/periods/${period(1)}/close`).expect(400);
    expect(direct.body.code).toBe('invalid_state_transition'); // open → closed must pass soft_closed
    await call(ownerB, 'POST', `/api/v1/accounting/periods/${period(2)}/soft-close`).expect(201);
    const order = await call(ownerB, 'POST', `/api/v1/accounting/periods/${period(2)}/close`).expect(400);
    expect(order.body.code).toBe('periods.earlierOpen');

    await call(ownerB, 'POST', `/api/v1/accounting/periods/${period(1)}/soft-close`).expect(201);
    // Soft-closed: the owner (accounting.post_in_soft_closed) may still post, the clerk may not.
    await post(ownerB, '2025-01-20', [dr('1150', '100.00'), cr('3100', '100.00')], 'Late capital').expect(201);
    const soft = await post(clerkB, '2025-01-21', [dr('1150', '1.00'), cr('3100', '1.00')]).expect(403);
    expect(soft.body.code).toBe('accounting.periodSoftClosed');

    await call(ownerB, 'POST', `/api/v1/accounting/periods/${period(1)}/close`).expect(201);
    const closed = await post(ownerB, '2025-01-25', [dr('1150', '1.00'), cr('3100', '1.00')]).expect(422);
    expect(closed.body.code).toBe('accounting.periodClosed');
    // Whatever the code path, the database refuses a posted entry in a closed period.
    await expect(
      prisma.withTenant(fx.tenantB.id, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO journal_entries (id, tenant_id, number, entry_date, period_id, source_type, status)
           VALUES ('${randomUUID()}', '${fx.tenantB.id}', 'JE-PROBE', '2025-01-26', '${period(1)}', 'manual', 'posted')`,
        ),
      ),
    ).rejects.toThrow(/closed/);

    for (let n = 2; n <= 12; n++) {
      if (n !== 2) await call(ownerB, 'POST', `/api/v1/accounting/periods/${period(n)}/soft-close`).expect(201);
      await call(ownerB, 'POST', `/api/v1/accounting/periods/${period(n)}/close`).expect(201);
    }
    const backwards = await call(ownerB, 'POST', `/api/v1/accounting/periods/${period(1)}/reopen`)
      .send({ reason: 'Missing invoice' })
      .expect(400);
    expect(backwards.body.code).toBe('periods.laterClosed');
    await call(ownerB, 'POST', `/api/v1/accounting/periods/${period(12)}/reopen`)
      .send({ reason: 'Audit adjustment' })
      .expect(201);
    const audit = await owner.auditLog.findFirstOrThrow({
      where: { tenantId: fx.tenantB.id, action: 'accounting_period.reopened', entityId: period(12) },
    });
    expect(audit.changes).toMatchObject({ reason: 'Audit adjustment', from: 'closed' });
    const early = await call(ownerB, 'POST', `/api/v1/accounting/fiscal-years/${fy2025}/close`).expect(400);
    expect(early.body.code).toBe('fiscalYears.periodsOpen');
    await call(ownerB, 'POST', `/api/v1/accounting/periods/${period(12)}/soft-close`).expect(201);
    await call(ownerB, 'POST', `/api/v1/accounting/periods/${period(12)}/close`).expect(201);

    const checklist = await report(`periods/${period(12)}/checklist`);
    expect(checklist.items.map((i: { key: string }) => i.key)).toContain('syncNotApplied');
  });

  it('derives profit and loss, balance sheet, cash flow and the general ledger from journal lines', async () => {
    const pl = await report('reports/profit-and-loss?from=2025-01-01&to=2025-12-31');
    expect([pl.revenue.total, pl.costOfSales.total, pl.expenses.total, pl.netIncome]).toEqual([
      '2500.00',
      '0.00',
      '800.00',
      '1700.00',
    ]);
    const branch = await report(`reports/profit-and-loss?from=2025-01-01&to=2025-12-31&branchId=${fx.branchB1.id}`);
    expect(branch.netIncome).toBe('1700.00');

    const bs = await report('reports/balance-sheet?asOf=2025-12-31');
    expect([bs.assets.total, bs.liabilities.total, bs.equity.total, bs.currentEarnings, bs.balanced]).toEqual([
      '11800.00',
      '0.00',
      '10100.00',
      '1700.00',
      true,
    ]);

    const cf = await report('reports/cash-flow?from=2025-01-01&to=2025-12-31');
    expect(cf).toMatchObject({
      openingCash: '0.00',
      operating: { netIncome: '1700.00', total: '1560.00' },
      financing: { total: '10100.00' },
      netChange: '11660.00',
      closingCash: '11660.00',
      reconciles: true,
    });
    expect(cf.operating.adjustments).toEqual([expect.objectContaining({ code: '1300', amount: '-140.00' })]);

    const gl = await report(`reports/general-ledger?accountId=${acc['1150']}&from=2025-01-01&to=2025-12-31`);
    expect(gl.opening).toBe('0.00');
    expect(gl.lines.map((l: { balance: string }) => l.balance)).toEqual([
      '10000.00',
      '10100.00',
      '12600.00',
      '11800.00',
      '11660.00',
      '11610.00',
      '11660.00',
    ]);
    expect(gl.closing).toBe('11660.00');
  });

  it('closes the year into retained earnings per branch and freezes it', async () => {
    const res = await call(ownerB, 'POST', `/api/v1/accounting/fiscal-years/${fy2025}/close`).expect(201);
    expect(res.body.status).toBe('closed');
    expect(await journal(res.body.closingEntryId)).toEqual([
      ['3200', '0.00', '1700.00'],
      ['4900', '2500.00', '0.00'],
      ['5900', '0.00', '800.00'],
    ]);
    const closing = await owner.journalEntry.findUniqueOrThrow({ where: { id: res.body.closingEntryId } });
    expect([closing.sourceType, closing.entryDate.toISOString().slice(0, 10)]).toEqual(['year_close', '2025-12-31']);

    // The year's P&L is still reported; its earnings now sit in retained earnings.
    expect((await report('reports/profit-and-loss?from=2025-01-01&to=2025-12-31')).netIncome).toBe('1700.00');
    const bs = await report('reports/balance-sheet?asOf=2025-12-31');
    expect([bs.equity.total, bs.currentEarnings, bs.balanced]).toEqual(['11800.00', '0.00', true]);

    await call(ownerB, 'POST', `/api/v1/accounting/fiscal-years/${fy2025}/close`).expect(400);
    const reopen = await call(ownerB, 'POST', `/api/v1/accounting/periods/${period(12)}/reopen`)
      .send({ reason: 'Try after close' })
      .expect(400);
    expect(reopen.body.code).toBe('periods.yearClosed');
    await expect(
      prisma.withTenant(fx.tenantB.id, (tx) =>
        tx.$executeRawUnsafe(`UPDATE fiscal_years SET status = 'open' WHERE name = 'FY2025'`),
      ),
    ).rejects.toThrow(/closed/);
    const current = await owner.fiscalYear.findFirstOrThrow({
      where: { tenantId: fx.tenantB.id, name: `FY${nextYear - 1}` },
    });
    const notYet = await call(ownerB, 'POST', `/api/v1/accounting/fiscal-years/${current.id}/close`).expect(400);
    expect(notYet.body.code).toBe('fiscalYears.periodsOpen');
  });

  it('opens next year on demand or explicitly, never further ahead', async () => {
    // Tenant B: an entry dated next year creates that fiscal year with its twelve periods.
    await post(ownerB, `${nextYear}-02-01`, [dr('1150', '1.00'), cr('3100', '1.00')]).expect(201);
    const fy = await owner.fiscalYear.findFirstOrThrow({
      where: { tenantId: fx.tenantB.id, name: `FY${nextYear}` },
      include: { periods: true },
    });
    expect(fy.periods).toHaveLength(12);
    const again = await call(ownerB, 'POST', '/api/v1/accounting/fiscal-years/next').expect(409);
    expect(again.body.code).toBe('fiscalYears.alreadyAhead');
    // Tenant A: explicit roll-over.
    const opened = await call(ownerA, 'POST', '/api/v1/accounting/fiscal-years/next').expect(201);
    expect([opened.body.name, opened.body.periods.length]).toEqual([`FY${nextYear}`, 12]);
  });

  it('reconciles sales, payables, GRNI and stock with the ledger and exposes a manual revenue entry', async () => {
    const before = await report('reconciliation');
    expect(before.checks.filter((c: { ok: boolean }) => !c.ok)).toEqual([]);
    expect(before.checks.map((c: { key: string }) => c.key)).toEqual([
      'sales',
      'payables',
      'goodsReceivedNotInvoiced',
      'inventory',
      'stockLedgerMismatches',
      'documentsWithoutEntry',
      'trialBalance',
    ]);
    const today = before.to as string;
    const manual = await post(ownerB, today, [dr('1150', '30.00'), cr('4100', '30.00')], 'Revenue by hand').expect(201);
    const after = await report('reconciliation');
    expect(after.checks.find((c: { key: string }) => c.key === 'sales')).toMatchObject({
      difference: '-30.00',
      ok: false,
    });
    expect(after.ok).toBe(false);
    await call(ownerB, 'POST', `/api/v1/accounting/journal-entries/${manual.body.id}/reverse`).send({}).expect(201);
    expect((await report('reconciliation')).ok).toBe(true);
    await managerA.agent.get('/api/v1/accounting/reconciliation').expect(403);
  });
});
