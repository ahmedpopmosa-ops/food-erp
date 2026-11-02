import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { DeviceTokens, PullResponse, PushResponse } from '@ros/contracts';
import { call, createApp, login, type Session } from './helpers';
import { EMAILS, loadFixtures, ownerClient } from './fixtures';
import { buildSaleOp, pushBody, type SaleDevice, type SaleItem } from './sale-factory';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Phase 3: catalog, devices and sync', () => {
  let app: INestApplication;
  let ownerB: Session;
  let fx: Awaited<ReturnType<typeof loadFixtures>>;
  const owner = ownerClient();
  const appDb = new PrismaService();

  let tokens: DeviceTokens;
  let device: SaleDevice;
  let item: SaleItem;
  let cashId: string;
  let seq = 100;

  const server = () => app.getHttpServer();
  const push = (body: object, token = tokens.accessToken) =>
    request(server()).post('/api/v1/sync/push').set('authorization', `Bearer ${token}`).send(body);
  const pull = (cursor: number, token = tokens.accessToken) =>
    request(server()).get(`/api/v1/sync/pull?cursor=${cursor}`).set('authorization', `Bearer ${token}`);
  const sale = (over: Partial<Parameters<typeof buildSaleOp>[1]> = {}) =>
    buildSaleOp(device, { seq: ++seq, paymentMethodId: cashId, items: [item], ...over });

  beforeAll(async () => {
    app = await createApp();
    fx = await loadFixtures();
    ownerB = await login(app, EMAILS.ownerB);
  });
  afterAll(async () => {
    await appDb.$disconnect();
    await owner.$disconnect();
    await app.close();
  });

  describe('catalog (dashboard)', () => {
    it('creates a product with its default variant and first price', async () => {
      const taxCats = await ownerB.agent.get('/api/v1/catalog/tax-categories').expect(200);
      const standard = taxCats.body.find((c: { code: string }) => c.code === 'STANDARD');
      expect(standard.rates[0].taxRate).toMatchObject({ code: 'VAT14', rate: '0.14' });
      const category = await call(ownerB, 'POST', '/api/v1/catalog/categories')
        .send({ nameAr: 'مشروبات', nameEn: 'Drinks' })
        .expect(201);
      const product = await call(ownerB, 'POST', '/api/v1/catalog/products')
        .send({
          nameAr: 'قهوة',
          nameEn: 'Coffee',
          categoryId: category.body.id,
          taxCategoryId: standard.id,
          price: '114.00',
        })
        .expect(201);
      const variant = product.body.variants[0];
      expect(variant.isDefault).toBe(true);
      expect(variant.prices[0].price).toBe('114');
      item = {
        variantId: variant.id,
        taxCategoryId: standard.id,
        taxes: [{ taxRateId: standard.rates[0].taxRateId, rate: '0.14' }],
        unitPrice: '114.00',
        nameAr: 'قهوة',
        nameEn: 'Coffee',
      };
      const methods = await ownerB.agent.get('/api/v1/catalog/payment-methods').expect(200);
      cashId = methods.body.find((m: { code: string }) => m.code === 'CASH').id;
    });

    it('rejects a second price change at the same time, and schedules future ones', async () => {
      const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
      await call(ownerB, 'POST', `/api/v1/catalog/variants/${item.variantId}/prices`)
        .send({ price: '120.00', validFrom: future })
        .expect(201);
      const again = await call(ownerB, 'POST', `/api/v1/catalog/variants/${item.variantId}/prices`)
        .send({ price: '125.00', validFrom: future })
        .expect(409);
      expect(again.body.code).toBe('prices.laterChangeExists');
      const rows = await owner.productPrice.findMany({
        where: { variantId: item.variantId },
        orderBy: { validFrom: 'asc' },
      });
      expect(rows.map((r) => [r.price.toString(), r.validTo?.toISOString() ?? null])).toEqual([
        ['114', future],
        ['120', null],
      ]);
    });
  });

  describe('device pairing', () => {
    it('pairs with a one-time code and rotates tokens', async () => {
      const created = await call(ownerB, 'POST', '/api/v1/devices')
        .send({ branchId: fx.branchB1.id, code: 'p2', name: 'Counter 2' })
        .expect(201);
      expect(created.body.pairingCode).toMatch(/^[A-Z2-9]{8}$/);
      const stored = await owner.device.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(stored.pairingCodeHash).not.toBe(created.body.pairingCode);

      const paired = await request(server())
        .post('/api/v1/devices/pair')
        .send({ pairingCode: created.body.pairingCode, appVersion: '0.1.0' })
        .expect(200);
      tokens = paired.body;
      expect(tokens).toMatchObject({
        deviceId: created.body.id,
        tenantId: fx.tenantB.id,
        branchId: fx.branchB1.id,
        deviceCode: 'P2',
        branchCode: 'B1',
      });
      device = {
        tenantId: tokens.tenantId,
        branchId: tokens.branchId,
        deviceId: tokens.deviceId,
        branchCode: 'B1',
        deviceCode: 'P2',
      };

      const reuse = await request(server())
        .post('/api/v1/devices/pair')
        .send({ pairingCode: created.body.pairingCode, appVersion: '0.1.0' })
        .expect(400);
      expect(reuse.body.code).toBe('devices.invalidPairingCode');

      const rotated = await request(server())
        .post('/api/v1/devices/token')
        .send({ deviceId: tokens.deviceId, refreshToken: tokens.refreshToken })
        .expect(200);
      await pull(0, tokens.accessToken).expect(401); // old access token revoked on rotation
      tokens = rotated.body;
      await pull(0).expect(200);
    });

    it('rejects people’s sessions and garbage tokens on device routes', async () => {
      await ownerB.agent.get('/api/v1/sync/pull').expect(401);
      await pull(0, 'not-a-real-token-but-long-enough').expect(401);
    });

    it('revokes the whole device when a used refresh token is replayed', async () => {
      const created = await call(ownerB, 'POST', '/api/v1/devices')
        .send({ branchId: fx.branchB1.id, code: 'P3', name: 'Stolen' })
        .expect(201);
      const t1: DeviceTokens = (
        await request(server())
          .post('/api/v1/devices/pair')
          .send({ pairingCode: created.body.pairingCode, appVersion: '0.1.0' })
          .expect(200)
      ).body;
      const t2: DeviceTokens = (
        await request(server())
          .post('/api/v1/devices/token')
          .send({ deviceId: t1.deviceId, refreshToken: t1.refreshToken })
          .expect(200)
      ).body;
      const replay = await request(server())
        .post('/api/v1/devices/token')
        .send({ deviceId: t1.deviceId, refreshToken: t1.refreshToken })
        .expect(401);
      expect(replay.body.code).toBe('devices.tokenReuse');
      expect((await owner.device.findUniqueOrThrow({ where: { id: t1.deviceId } })).status).toBe('disabled');
      const blocked = await pull(0, t2.accessToken).expect(401);
      expect(blocked.body.code).toBe('devices.invalidToken');
    });
  });

  describe('pull', () => {
    it('delivers reference data for its branch with a resumable cursor', async () => {
      const first = await pull(0).expect(200);
      const body: PullResponse = first.body;
      const types = new Set(body.changes.map((c) => c.entity_type));
      for (const t of [
        'branch',
        'tenant_settings',
        'product',
        'product_variant',
        'product_price',
        'tax_rate',
        'tax_category_rate',
        'payment_method',
      ]) {
        expect(types).toContain(t);
      }
      const branches = body.changes.filter((c) => c.entity_type === 'branch').map((c) => c.data!.code);
      expect(branches).toEqual(['B1']); // never other branches, never other tenants
      // Staff, modifier links and tables may legitimately arrive as deletions (other suites edit tenant B's
      // floor plan and modifiers); the core catalog rows checked here are all live.
      const core = body.changes.filter((c) =>
        ['branch', 'product', 'product_variant', 'payment_method'].includes(c.entity_type),
      );
      expect(core.filter((c) => c.op !== 'upsert')).toEqual([]);
      const again = await pull(body.next_cursor).expect(200);
      expect(again.body.changes).toEqual([]);
      expect(again.body.next_cursor).toBe(body.next_cursor);
    });
  });

  describe('push', () => {
    let accepted: PushResponse;
    let op: ReturnType<typeof sale>;

    it('records an offline sale with its balanced journal entry', async () => {
      op = sale();
      const res = await push(pushBody([op])).expect(200);
      accepted = res.body;
      expect(accepted.results[0]).toMatchObject({ status: 'accepted', server_refs: { discrepancies: [] } });

      const refs = accepted.results[0]!.server_refs as { invoice_id: string; journal_entry_id: string };
      const invoice = await ownerB.agent.get(`/api/v1/sales/invoices/${refs.invoice_id}`).expect(200);
      expect(invoice.body).toMatchObject({
        subtotal: '100',
        taxTotal: '14',
        total: '114',
        paidTotal: '114',
        paymentStatus: 'paid',
        number: 'B1-P2-000101',
      });
      expect(invoice.body.lines[0]).toMatchObject({ descriptionEn: 'Coffee', netAmount: '100', taxAmount: '14' });
      const accounts = await owner.account.findMany({ where: { tenantId: fx.tenantB.id } });
      const code = (id: string) => accounts.find((a) => a.id === id)!.code;
      expect(
        invoice.body.journal.lines.map((l: { accountId: string; debit: string; credit: string }) => [
          code(l.accountId),
          l.debit,
          l.credit,
        ]),
      ).toEqual([
        ['1110', '114', '0'],
        ['4100', '0', '100'],
        ['2210', '0', '14'],
      ]);
      const tb = await ownerB.agent.get('/api/v1/accounting/trial-balance').expect(200);
      expect(tb.body.balanced).toBe(true);
    });

    it('applies a duplicated batch exactly once (P3-5)', async () => {
      for (let i = 0; i < 3; i++) {
        const res = await push(pushBody([op])).expect(200);
        expect(res.body.results[0]).toEqual({
          operation_id: op.operation_id,
          status: 'already_processed',
          server_refs: accepted.results[0]!.server_refs,
        });
      }
      expect(await owner.invoice.count({ where: { operationId: op.operation_id } })).toBe(1);
      expect(
        await owner.journalEntry.count({ where: { sourceId: (op.payload as { invoice: { id: string } }).invoice.id } }),
      ).toBe(1);
    });

    it('processes concurrent deliveries of the same operation once', async () => {
      const twin = sale();
      const [a, b] = await Promise.all([push(pushBody([twin])), push(pushBody([twin]))]);
      const statuses = [a.body.results[0].status, b.body.results[0].status].sort();
      expect(statuses).toEqual(['accepted', 'already_processed']);
      expect(await owner.invoice.count({ where: { operationId: twin.operation_id } })).toBe(1);
    });

    it('rejects reuse of an operation id with a different payload', async () => {
      const changed = {
        ...op,
        payload: {
          ...(op.payload as object),
          order: { ...(op.payload as { order: object }).order, channel: 'delivery' },
        },
      };
      const res = await push(pushBody([changed])).expect(200);
      expect(res.body.results[0]).toMatchObject({ status: 'rejected', error: { code: 'idempotency_key_reused' } });
    });

    it('keeps a sale whose totals do not re-compute, and flags it (P3-6)', async () => {
      const odd = sale({
        tamper: (s) => {
          // Device computed 15.00 tax on a 114.00 inclusive price: internally consistent, but wrong.
          s.lines[0] = {
            ...s.lines[0]!,
            netAmount: '99.00',
            taxAmount: '15.00',
            taxes: [{ ...s.lines[0]!.taxes[0]!, amount: '15.00' }],
          };
          s.invoice.subtotal = '99.00';
          s.invoice.taxTotal = '15.00';
        },
      });
      const res = await push(pushBody([odd])).expect(200);
      expect(res.body.results[0]).toMatchObject({
        status: 'accepted',
        server_refs: { discrepancies: ['totals_mismatch'] },
      });
    });

    it('flags an outdated offline price instead of rejecting the sale', async () => {
      const res = await push(pushBody([sale({ items: [{ ...item, unitPrice: '100.00' }] })])).expect(200);
      expect(res.body.results[0].server_refs.discrepancies).toEqual(['price_outdated']);
    });

    it('rejects structurally invalid operations and keeps them for follow-up', async () => {
      const inconsistent = sale({ tamper: (s) => (s.invoice.total = '999.00') });
      // A well-formed id that is not a variant of this tenant (here: tenant A's branch id).
      const unknown = sale({ items: [{ ...item, variantId: fx.branchA1.id }] });
      const foreign = { ...sale(), tenant_id: fx.tenantA.id };
      const card = sale({ tamper: (s) => (s.payments[0]!.reference = '4111 1111 1111 1111') });
      const res = await push(pushBody([inconsistent, unknown, foreign, card])).expect(200);
      expect(
        res.body.results.map((r: { status: string; error?: { code: string } }) => [r.status, r.error?.code]),
      ).toEqual([
        ['rejected', 'totals_inconsistent'],
        ['rejected', 'unknown_reference'],
        ['rejected', 'scope_mismatch'],
        ['rejected', 'payload_invalid'],
      ]);
      const kept = await owner.syncOperation.findUniqueOrThrow({
        where: { tenantId_operationId: { tenantId: fx.tenantB.id, operationId: inconsistent.operation_id } },
      });
      expect(kept).toMatchObject({ status: 'rejected', errorCode: 'totals_inconsistent' });
      expect(kept.payload).not.toBeNull();
    });

    it('holds a sale for retry while an account mapping is missing, then accepts it', async () => {
      const mapping = await owner.accountingMapping.findFirstOrThrow({
        where: { tenantId: fx.tenantB.id, mappingKey: 'sales_revenue' },
      });
      await owner.accountingMapping.delete({ where: { id: mapping.id } });
      const held = sale();
      try {
        const res = await push(pushBody([held])).expect(200);
        expect(res.body.results[0]).toMatchObject({
          status: 'retryable',
          error: { code: 'posting_mapping_missing' },
          retry_after_ms: 3_600_000,
        });
        expect(await owner.invoice.count({ where: { operationId: held.operation_id } })).toBe(0); // nothing half-applied
      } finally {
        await owner.accountingMapping.create({
          data: {
            tenantId: mapping.tenantId,
            mappingKey: mapping.mappingKey,
            scopeType: 'tenant',
            accountId: mapping.accountId,
          },
        });
      }
      const retry = await push(pushBody([held])).expect(200);
      expect(retry.body.results[0].status).toBe('accepted');
    });

    it('posts into the next open period when the sale’s period is closed (late posting)', async () => {
      const day = new Date().toISOString().slice(0, 10);
      const period = await owner.accountingPeriod.findFirstOrThrow({
        where: {
          tenantId: fx.tenantB.id,
          startDate: { lte: new Date(`${day}T00:00:00Z`) },
          endDate: { gte: new Date(`${day}T00:00:00Z`) },
        },
      });
      const next = await owner.accountingPeriod.findFirst({
        where: { tenantId: fx.tenantB.id, startDate: { gt: period.endDate } },
      });
      if (!next) return; // December: no later period in the seeded fiscal year (covered once FY roll-over exists)
      await owner.accountingPeriod.update({ where: { id: period.id }, data: { status: 'closed' } });
      try {
        const res = await push(pushBody([sale()])).expect(200);
        expect(res.body.results[0].server_refs.discrepancies).toEqual(['late_posting']);
        const entry = await owner.journalEntry.findUniqueOrThrow({
          where: { id: res.body.results[0].server_refs.journal_entry_id },
        });
        expect(entry.periodId).toBe(next.id);
        expect(entry.originalDate?.toISOString().slice(0, 10)).toBe(day);
      } finally {
        await owner.accountingPeriod.update({ where: { id: period.id }, data: { status: 'open' } });
      }
    });

    it('refuses pushes from a disabled device, leaving its operations on the device', async () => {
      const created = await call(ownerB, 'POST', '/api/v1/devices')
        .send({ branchId: fx.branchB1.id, code: 'P4', name: 'To disable' })
        .expect(201);
      const t: DeviceTokens = (
        await request(server())
          .post('/api/v1/devices/pair')
          .send({ pairingCode: created.body.pairingCode, appVersion: '0.1.0' })
          .expect(200)
      ).body;
      await call(ownerB, 'POST', `/api/v1/devices/${t.deviceId}/disable`).expect(200);
      const res = await push(pushBody([sale()]), t.accessToken).expect(401);
      expect(res.body.code).toBe('devices.invalidToken');
    });
  });

  describe('financial immutability (database layer)', () => {
    const asApp = (sql: string) => appDb.withTenant(fx.tenantB.id, (tx) => tx.$executeRawUnsafe(sql));

    it('finalized invoices, lines and payments cannot be edited or deleted', async () => {
      const id = fx.invoiceB.id;
      await expect(asApp(`UPDATE invoices SET total = 1 WHERE id = '${id}'`)).rejects.toThrow(
        /immutable|check constraint/,
      );
      await expect(asApp(`UPDATE invoice_lines SET unit_price = 1 WHERE invoice_id = '${id}'`)).rejects.toThrow(
        /immutable/,
      );
      await expect(asApp(`UPDATE payments SET amount = 1 WHERE invoice_id = '${id}'`)).rejects.toThrow(/immutable/);
      await expect(asApp(`DELETE FROM invoices WHERE id = '${id}'`)).rejects.toThrow(/permission denied/);
    });

    it('posted journal entries and lines are immutable', async () => {
      const entryId = fx.invoiceB.journalEntryId!;
      await expect(asApp(`UPDATE journal_entries SET memo = 'x' WHERE id = '${entryId}'`)).rejects.toThrow(/immutable/);
      await expect(
        asApp(`UPDATE journal_lines SET debit = debit + 1 WHERE journal_entry_id = '${entryId}'`),
      ).rejects.toThrow(/immutable/);
      await expect(asApp(`DELETE FROM journal_lines WHERE journal_entry_id = '${entryId}'`)).rejects.toThrow(
        /permission denied/,
      );
    });

    it('an unbalanced entry cannot be posted, even bypassing the service', async () => {
      // An open period: a closed one would be refused by the period guard before the balance check is reached.
      const [period] = await owner.accountingPeriod.findMany({
        where: { tenantId: fx.tenantB.id, status: 'open' },
        orderBy: { startDate: 'desc' },
        take: 1,
      });
      const [acc] = await owner.account.findMany({ where: { tenantId: fx.tenantB.id, code: '1110' } });
      const id = '0192f0c4-7b1e-7c3a-8a4e-1f2d3c4b5a70';
      await expect(
        appDb.withTenant(fx.tenantB.id, async (tx) => {
          await tx.$executeRawUnsafe(`INSERT INTO journal_entries (id, tenant_id, number, entry_date, period_id, source_type, status)
            VALUES ('${id}', '${fx.tenantB.id}', 'JE-X-1', '${period!.startDate.toISOString().slice(0, 10)}', '${period!.id}', 'manual', 'draft')`);
          await tx.$executeRawUnsafe(`INSERT INTO journal_lines (id, tenant_id, journal_entry_id, line_no, account_id, debit, credit, currency_code)
            VALUES ('${id.replace(/70$/, '71')}', '${fx.tenantB.id}', '${id}', 1, '${acc!.id}', 10, 0, 'EGP')`);
          await tx.$executeRawUnsafe(`UPDATE journal_entries SET status = 'posted' WHERE id = '${id}'`);
        }),
      ).rejects.toThrow(/not balanced/);
      expect(await owner.journalEntry.count({ where: { id } })).toBe(0);
    });
  });
});
