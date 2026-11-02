import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { call, createApp, login, type Session } from './helpers';
import { EMAILS, loadFixtures, ownerClient } from './fixtures';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostingService } from '../src/accounting/posting.service';

/**
 * Review fixes of Phase 6a:
 * 1. Financial back-office writes require an Idempotency-Key; a repeat returns the first result and changes
 *    nothing (the key is stored in the same transaction as the change).
 * 2. Closing a period cannot slip past an entry being posted into it: the entry holds a share lock on the
 *    period until it commits, so the close waits (and an entry after a committed close goes to the next period).
 * Tenant A and B data used here leaves every balance other suites check unchanged.
 */
describe('back-office write safety: idempotency keys and period locks', () => {
  let app: INestApplication;
  let ownerA: Session;
  let ownerB: Session;
  let fx: Awaited<ReturnType<typeof loadFixtures>>;
  const owner = ownerClient();
  const prisma = new PrismaService();
  const acc: Record<string, string> = {};

  const entry = (memo: string, amount = '5.00') => ({
    date: new Date().toISOString().slice(0, 10),
    memo,
    lines: [
      { accountId: acc['1150'], debit: amount },
      { accountId: acc['3100'], credit: amount },
    ],
  });

  beforeAll(async () => {
    app = await createApp();
    fx = await loadFixtures();
    for (const a of await owner.account.findMany({ where: { tenantId: fx.tenantA.id } })) acc[a.code] = a.id;
    ownerA = await login(app, EMAILS.ownerA);
    ownerB = await login(app, EMAILS.ownerB);
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await owner.$disconnect();
    await app.close();
  });

  it('requires an Idempotency-Key on financial writes', async () => {
    const res = await ownerA.agent
      .post('/api/v1/accounting/journal-entries')
      .set('x-csrf-token', ownerA.csrf)
      .send(entry('No key'))
      .expect(400);
    expect(res.body.code).toBe('idempotency.keyRequired');
    await call(ownerA, 'POST', '/api/v1/accounting/journal-entries', 'short').send(entry('Bad key')).expect(400);
  });

  it('replays a repeated request instead of posting twice, even when the repeats are concurrent', async () => {
    const key = randomUUID();
    const first = await call(ownerA, 'POST', '/api/v1/accounting/journal-entries', key).send(entry('Once')).expect(201);
    const again = await call(ownerA, 'POST', '/api/v1/accounting/journal-entries', key).send(entry('Once')).expect(201);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body).toEqual(first.body);
    expect(await owner.journalEntry.count({ where: { tenantId: fx.tenantA.id, memo: 'Once' } })).toBe(1);

    const other = await call(ownerA, 'POST', '/api/v1/accounting/journal-entries', key)
      .send(entry('Changed'))
      .expect(422);
    expect(other.body.code).toBe('idempotency.keyReused');

    const burst = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        call(ownerA, 'POST', '/api/v1/accounting/journal-entries', burst).send(entry('Burst')),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await owner.journalEntry.count({ where: { tenantId: fx.tenantA.id, memo: 'Burst' } })).toBe(1);
  });

  it('does not keep the key of a request that failed, so it can be corrected and resent', async () => {
    const key = randomUUID();
    const bad = {
      ...entry('Fixed later'),
      lines: [
        { accountId: acc['1150'], debit: '5.00' },
        { accountId: acc['3100'], credit: '4.00' },
      ],
    };
    await call(ownerA, 'POST', '/api/v1/accounting/journal-entries', key).send(bad).expect(400);
    await call(ownerA, 'POST', '/api/v1/accounting/journal-entries', key).send(bad).expect(400); // not a replay
    await call(ownerA, 'POST', '/api/v1/accounting/journal-entries', key).send(entry('Fixed later')).expect(201);
  });

  it('keeps keys per user and pays a supplier only once for a resent payment', async () => {
    // Same key from another user (tenant B) is a different request.
    const key = randomUUID();
    await call(ownerA, 'POST', '/api/v1/accounting/journal-entries', key).send(entry('Per user')).expect(201);
    const accB: Record<string, string> = {};
    for (const a of await owner.account.findMany({ where: { tenantId: fx.tenantB.id } })) accB[a.code] = a.id;
    await call(ownerB, 'POST', '/api/v1/accounting/journal-entries', key)
      .send({
        ...entry('Per user'),
        lines: [
          { accountId: accB['1150'], debit: '5.00' },
          { accountId: accB['3100'], credit: '5.00' },
        ],
      })
      .expect(201);

    // Tenant B: a services-only invoice, then the same payment sent twice.
    const supplier = await call(ownerB, 'POST', '/api/v1/purchasing/suppliers')
      .send({ code: 'IDEM', nameAr: 'مورد', nameEn: 'Idempotency supplier' })
      .expect(201);
    const invoice = await call(ownerB, 'POST', '/api/v1/purchasing/invoices')
      .send({
        supplierId: supplier.body.id,
        supplierInvoiceNo: 'IDEM-1',
        invoiceDate: new Date().toISOString().slice(0, 10),
        total: '10.00',
        lines: [{ accountId: accB['5900'], amount: '10.00' }],
      })
      .expect(201);
    const payKey = randomUUID();
    const body = {
      supplierId: supplier.body.id,
      method: 'bank',
      amount: '10.00',
      allocations: [{ invoiceId: invoice.body.id, amount: '10.00' }],
    };
    const p1 = await call(ownerB, 'POST', '/api/v1/purchasing/payments', payKey).send(body).expect(201);
    const p2 = await call(ownerB, 'POST', '/api/v1/purchasing/payments', payKey).send(body).expect(201);
    expect(p2.body.id).toBe(p1.body.id);
    expect(await owner.supplierPayment.count({ where: { supplierId: supplier.body.id } })).toBe(1);
    // Resent with a new key it is a new request: refused, because the invoice has nothing left open.
    await call(ownerB, 'POST', '/api/v1/purchasing/payments').send(body).expect(400);
  });

  it('makes a period close wait for an entry being posted into it, and sends later entries onwards', async () => {
    const tenantId = fx.tenantA.id;
    const fy = await owner.fiscalYear.create({
      data: {
        tenantId,
        name: 'FY2024',
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-12-31T00:00:00Z'),
        periods: {
          create: Array.from({ length: 12 }, (_, m) => ({
            tenantId,
            periodNo: m + 1,
            startDate: new Date(Date.UTC(2024, m, 1)),
            endDate: new Date(Date.UTC(2024, m + 1, 0)),
          })),
        },
      },
      include: { periods: true },
    });
    const jan = fy.periods.find((p) => p.periodNo === 1)!;
    const feb = fy.periods.find((p) => p.periodNo === 2)!;

    // An entry into open January is written but not yet committed…
    const posting = new PostingService();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const inFlight = prisma.withTenant(tenantId, async (tx) => {
      const e = await posting.post(tx, {
        tenantId,
        sourceType: 'race_test',
        sourceId: randomUUID(),
        purpose: 'main',
        date: '2024-01-15',
        currency: 'EGP',
        lines: [
          { accountId: acc['1150'], debit: '7.00' },
          { accountId: acc['3100'], credit: '7.00' },
        ],
      });
      await gate;
      return e;
    });
    await new Promise((r) => setTimeout(r, 300));
    // …so changing January's status waits for it instead of slipping in underneath.
    let changedAt = 0;
    const softClose = call(ownerA, 'POST', `/api/v1/accounting/periods/${jan.id}/soft-close`).then((r) => {
      changedAt = Date.now();
      return r;
    });
    await new Promise((r) => setTimeout(r, 500));
    expect(changedAt).toBe(0);
    const releasedAt = Date.now();
    release();
    const e = await inFlight;
    expect((await softClose).status).toBe(201);
    expect(changedAt).toBeGreaterThanOrEqual(releasedAt);
    await call(ownerA, 'POST', `/api/v1/accounting/periods/${jan.id}/close`).expect(201);
    const stored = await owner.journalEntry.findUniqueOrThrow({ where: { id: e.id } });
    expect([stored.periodId, stored.status]).toEqual([jan.id, 'posted']);

    // After the close, a late January posting lands in February with its original date.
    const late = await prisma.withTenant(tenantId, (tx) =>
      posting.post(tx, {
        tenantId,
        sourceType: 'race_test',
        sourceId: randomUUID(),
        purpose: 'main',
        date: '2024-01-20',
        currency: 'EGP',
        lines: [
          { accountId: acc['1150'], debit: '3.00' },
          { accountId: acc['3100'], credit: '3.00' },
        ],
      }),
    );
    const lateRow = await owner.journalEntry.findUniqueOrThrow({ where: { id: late.id } });
    expect([lateRow.periodId, lateRow.originalDate?.toISOString().slice(0, 10), late.late]).toEqual([
      feb.id,
      '2024-01-20',
      true,
    ]);
  });
});
