import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { cashMovementRecordedV1, cashSessionClosedV1, cashSessionOpenedV1, type SyncOperation } from '@ros/contracts';
import { businessDate, Money } from '@ros/domain';
import type { Tx } from '../prisma/prisma.service';
import { PostingService } from '../accounting/posting.service';
import { AuditService } from '../identity/audit/audit.service';
import type { DeviceContext } from '../common/auth-context';
import { parseOrReject, PermanentRejection, Retryable, type OperationHandler } from './sync.errors';
import { ApprovalsService } from './approvals.service';

const D = (v: string) => new Prisma.Decimal(v);

async function dateFor(tx: Tx, device: DeviceContext, at: string) {
  const [branch, settings] = await Promise.all([
    tx.branch.findUniqueOrThrow({ where: { id: device.branchId } }),
    tx.tenantSettings.findUniqueOrThrow({ where: { tenantId: device.tenantId } }),
  ]);
  return { date: businessDate(at, branch.timezone, settings.businessDayCutoff), currency: branch.currencyCode };
}

async function requireEmployee(tx: Tx, id: string) {
  if (!(await tx.employee.findUnique({ where: { id } })))
    throw new PermanentRejection('unknown_reference', { employeeId: id });
}

async function openSession(tx: Tx, device: DeviceContext, id: string) {
  const s = await tx.cashSession.findUnique({ where: { id } });
  if (!s) throw new Retryable('dependency_pending', 5_000, { cashSessionId: id });
  if (s.deviceId !== device.deviceId) throw new PermanentRejection('scope_mismatch', { cashSessionId: id });
  if (s.status !== 'open') throw new PermanentRejection('cash_session_closed', { cashSessionId: id });
  return s;
}

/** `cash_session.opened` v1 — opening float counted into the drawer (no journal entry: no safe tracked yet). */
@Injectable()
export class CashSessionOpenedHandler implements OperationHandler {
  readonly type = 'cash_session.opened';
  readonly versions = [1];

  constructor(private readonly audit: AuditService) {}

  async handle(tx: Tx, device: DeviceContext, op: SyncOperation) {
    const p = parseOrReject(cashSessionOpenedV1, op.payload);
    await requireEmployee(tx, p.employeeId);
    if (await tx.cashSession.findFirst({ where: { deviceId: device.deviceId, status: 'open' } })) {
      throw new PermanentRejection('cash_session_already_open');
    }
    await tx.cashSession.create({
      data: {
        id: p.id,
        tenantId: device.tenantId,
        branchId: device.branchId,
        deviceId: device.deviceId,
        employeeId: p.employeeId,
        openedAt: new Date(p.openedAt),
        openingFloat: D(p.openingFloat),
        openedOperationId: op.operation_id,
      },
    });
    await this.audit.record(
      tx,
      device.tenantId,
      { kind: 'system' },
      {
        action: 'cash_session.opened',
        entityType: 'cash_session',
        entityId: p.id,
        branchId: device.branchId,
        changes: { openingFloat: p.openingFloat, employeeId: p.employeeId },
      },
    );
    return { cash_session_id: p.id };
  }
}

/** `cash_movement.recorded` v1 — pay-in / pay-out between drawer and safe (doc 07 §3.3). */
@Injectable()
export class CashMovementHandler implements OperationHandler {
  readonly type = 'cash_movement.recorded';
  readonly versions = [1];

  constructor(
    private readonly posting: PostingService,
    private readonly approvals: ApprovalsService,
  ) {}

  async handle(tx: Tx, device: DeviceContext, op: SyncOperation) {
    const p = parseOrReject(cashMovementRecordedV1, op.payload);
    await requireEmployee(tx, p.employeeId);
    await openSession(tx, device, p.cashSessionId);
    if (p.approval)
      await this.approvals.record(tx, device, op, p.approval, 'pos.cash_movement', { type: 'cash_movement', id: p.id });
    const { date, currency } = await dateFor(tx, device, p.occurredAt);
    const drawer = await this.posting.resolve(tx, device.tenantId, 'cash_drawer');
    const safe = await this.posting.resolve(tx, device.tenantId, 'cash_transfer');
    const [debit, credit] = p.kind === 'pay_in' ? [drawer, safe] : [safe, drawer];
    const entry = await this.posting.post(tx, {
      tenantId: device.tenantId,
      sourceType: 'cash_movement',
      sourceId: p.id,
      purpose: p.kind,
      date,
      currency,
      memo: `${p.kind === 'pay_in' ? 'Pay-in' : 'Pay-out'}: ${p.reason}`,
      lines: [
        { accountId: debit, debit: p.amount, branchId: device.branchId },
        { accountId: credit, credit: p.amount, branchId: device.branchId },
      ],
    });
    await tx.cashMovement.create({
      data: {
        id: p.id,
        tenantId: device.tenantId,
        cashSessionId: p.cashSessionId,
        kind: p.kind,
        amount: D(p.amount),
        reason: p.reason,
        employeeId: p.employeeId,
        approvalId: p.approval?.id ?? null,
        occurredAt: new Date(p.occurredAt),
        journalEntryId: entry.id,
        operationId: op.operation_id,
      },
    });
    return { cash_movement_id: p.id, journal_entry_id: entry.id };
  }
}

/**
 * `cash_session.closed` v1. The server recomputes the expected cash from what it has recorded for the session
 * (float + cash taken − cash refunded ± movements) and posts the counted difference to cash over/short. The
 * device's own figure is kept for comparison; operations of the session must have arrived first (depends_on).
 */
@Injectable()
export class CashSessionClosedHandler implements OperationHandler {
  readonly type = 'cash_session.closed';
  readonly versions = [1];

  constructor(
    private readonly posting: PostingService,
    private readonly audit: AuditService,
  ) {}

  async handle(tx: Tx, device: DeviceContext, op: SyncOperation) {
    const p = parseOrReject(cashSessionClosedV1, op.payload);
    await requireEmployee(tx, p.employeeId);
    const session = await openSession(tx, device, p.id);
    const { date, currency } = await dateFor(tx, device, p.closedAt);
    const m = (v: Prisma.Decimal | string | null | undefined) =>
      Money.of(new Prisma.Decimal(v ?? 0).toFixed(4), currency);

    const cashMethods = (await tx.paymentMethod.findMany({ where: { kind: 'cash' }, select: { id: true } })).map(
      (x) => x.id,
    );
    const sums = async (direction: 'in' | 'out') =>
      m(
        (
          await tx.payment.aggregate({
            where: { cashSessionId: p.id, direction, paymentMethodId: { in: cashMethods } },
            _sum: { amount: true },
          })
        )._sum.amount,
      );
    const moves = async (kind: 'pay_in' | 'pay_out') =>
      m(
        (await tx.cashMovement.aggregate({ where: { cashSessionId: p.id, kind }, _sum: { amount: true } }))._sum.amount,
      );
    const expected = m(session.openingFloat)
      .add(await sums('in'))
      .sub(await sums('out'))
      .add(await moves('pay_in'))
      .sub(await moves('pay_out'))
      .round();
    const counted = Money.of(p.countedCash, currency).round();
    const variance = counted.sub(expected);

    let journalEntryId: string | null = null;
    if (!variance.isZero()) {
      const drawer = await this.posting.resolve(tx, device.tenantId, 'cash_drawer');
      const overShort = await this.posting.resolve(tx, device.tenantId, 'cash_over_short');
      const amount = (variance.isNegative() ? variance.mul('-1') : variance).toString(true);
      const [debit, credit] = variance.isNegative() ? [overShort, drawer] : [drawer, overShort];
      journalEntryId = (
        await this.posting.post(tx, {
          tenantId: device.tenantId,
          sourceType: 'cash_session',
          sourceId: p.id,
          purpose: 'variance',
          date,
          currency,
          memo: `Cash ${variance.isNegative() ? 'short' : 'over'} on session close`,
          lines: [
            { accountId: debit, debit: amount, branchId: device.branchId },
            { accountId: credit, credit: amount, branchId: device.branchId },
          ],
        })
      ).id;
    }
    await tx.cashSession.update({
      where: { id: p.id },
      data: {
        status: 'closed',
        closedAt: new Date(p.closedAt),
        closedBy: p.employeeId,
        expectedCash: D(expected.toString(true)),
        deviceExpectedCash: D(p.expectedCash),
        countedCash: D(counted.toString(true)),
        variance: D(variance.toString(true)),
        countedBreakdown: p.countedBreakdown,
        journalEntryId,
        closedOperationId: op.operation_id,
      },
    });
    await this.audit.record(
      tx,
      device.tenantId,
      { kind: 'system' },
      {
        action: 'cash_session.closed',
        entityType: 'cash_session',
        entityId: p.id,
        branchId: device.branchId,
        changes: {
          expected: expected.toString(true),
          counted: counted.toString(true),
          variance: variance.toString(true),
          deviceExpected: p.expectedCash,
        },
      },
    );
    return {
      cash_session_id: p.id,
      expected_cash: expected.toString(true),
      variance: variance.toString(true),
      device_expected_matches: Money.of(p.expectedCash, currency).equals(expected),
      journal_entry_id: journalEntryId,
    };
  }
}
