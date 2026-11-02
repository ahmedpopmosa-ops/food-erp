import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { orderCancelledV1, type SyncOperation } from '@ros/contracts';
import { businessDate } from '@ros/domain';
import type { Tx } from '../prisma/prisma.service';
import { AuditService } from '../identity/audit/audit.service';
import type { DeviceContext } from '../common/auth-context';
import { parseOrReject, PermanentRejection, type OperationHandler } from './sync.errors';
import { ApprovalsService } from './approvals.service';
import { ConsumptionService } from '../inventory/consumption.service';
import { cancelOrderTickets } from '../kitchen/kitchen.tickets';

/**
 * `order.cancelled` v1 — an order abandoned after some items were sent to the kitchen. No money changed hands,
 * so no sale is posted; items that reached the kitchen are consumed through their recipes as wastage (stock
 * movements + wastage expense) and the cancellation is audited with its approval.
 */
@Injectable()
export class OrderCancelledHandler implements OperationHandler {
  readonly type = 'order.cancelled';
  readonly versions = [1];

  constructor(
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
    private readonly consumption: ConsumptionService,
  ) {}

  async handle(tx: Tx, device: DeviceContext, op: SyncOperation) {
    const p = parseOrReject(orderCancelledV1, op.payload);
    if (await tx.order.findUnique({ where: { id: p.orderId } }))
      throw new PermanentRejection('id_conflict', { orderId: p.orderId });
    if (!(await tx.employee.findUnique({ where: { id: p.employeeId } })))
      throw new PermanentRejection('unknown_reference', { employeeId: p.employeeId });
    if (p.tableId && !(await tx.diningTable.findFirst({ where: { id: p.tableId, branchId: device.branchId } }))) {
      throw new PermanentRejection('unknown_reference', { tableId: p.tableId });
    }
    const variants = await tx.productVariant.findMany({
      where: { id: { in: p.items.map((i) => i.variantId) } },
      include: { product: true },
    });
    const unknown = p.items.map((i) => i.variantId).filter((id) => !variants.some((v) => v.id === id));
    if (unknown.length) throw new PermanentRejection('unknown_reference', { variants: unknown });

    const authorised = p.approval
      ? await this.approvals.record(tx, device, op, p.approval, 'pos.void_sent_item', { type: 'order', id: p.orderId })
      : null;
    const [branch, settings] = await Promise.all([
      tx.branch.findUniqueOrThrow({ where: { id: device.branchId } }),
      tx.tenantSettings.findUniqueOrThrow({ where: { tenantId: device.tenantId } }),
    ]);
    const date = businessDate(p.cancelledAt, branch.timezone, settings.businessDayCutoff);
    await tx.order.create({
      data: {
        id: p.orderId,
        tenantId: device.tenantId,
        branchId: device.branchId,
        deviceId: device.deviceId,
        localNumber: p.localNumber,
        channel: p.channel,
        status: 'cancelled',
        openedAt: new Date(p.openedAt),
        closedAt: new Date(p.cancelledAt),
        businessDate: new Date(`${date}T00:00:00Z`),
        operationId: op.operation_id,
        tableId: p.tableId,
        employeeId: p.employeeId,
        cancelReason: p.reason,
        items: {
          create: p.items.map((i, n) => ({
            id: i.orderItemId,
            tenantId: device.tenantId,
            lineNo: n + 1,
            variantId: i.variantId,
            productNameAr: i.productNameEn,
            productNameEn: i.productNameEn,
            qty: new Prisma.Decimal(i.qty),
            unitPrice: new Prisma.Decimal(i.unitPrice),
            taxCategoryId: variants.find((v) => v.id === i.variantId)!.product.taxCategoryId,
            status: 'voided',
            voidReason: p.reason,
            voidApprovalId: p.approval?.id ?? null,
          })),
        },
      },
    });
    const kitchenCancelled = await cancelOrderTickets(
      tx,
      device.tenantId,
      p.orderId,
      { type: 'device', id: device.deviceId },
      `Order cancelled: ${p.reason}`,
    );
    const sent = p.items.filter((i) => i.wasSentToKitchen);
    const wasted = await this.consumption.consume(tx, {
      tenantId: device.tenantId,
      branchId: device.branchId,
      kind: 'wastage',
      sourceType: 'order',
      sourceId: p.orderId,
      lines: sent.map((i) => ({ lineId: i.orderItemId, variantId: i.variantId, qty: i.qty })),
      versions: await this.consumption.versionsAt(
        tx,
        sent.map((i) => i.variantId),
        new Date(p.cancelledAt),
      ),
      businessDate: date,
      occurredAt: new Date(p.cancelledAt),
      currency: branch.currencyCode,
      memo: `Cancelled after kitchen ${p.localNumber}`,
    });
    await this.audit.record(
      tx,
      device.tenantId,
      { kind: 'system' },
      {
        action: 'order.cancelled',
        entityType: 'order',
        entityId: p.orderId,
        branchId: device.branchId,
        changes: {
          reason: p.reason,
          items: p.items.length,
          sentToKitchen: p.items.filter((i) => i.wasSentToKitchen).length,
          approvedBy: p.approval?.approverEmployeeId ?? null,
          authorised,
          wastageJournalEntryId: wasted.journalEntryId,
          negativeStock: wasted.negative,
          kitchenTicketsCancelled: kitchenCancelled,
        },
      },
    );
    return { order_id: p.orderId, authorised, wastage_journal_entry_id: wasted.journalEntryId };
  }
}
