import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { refundIssuedV1, type SyncOperation } from '@ros/contracts';
import { businessDate, Money, refundLineAmounts } from '@ros/domain';
import type { Tx } from '../prisma/prisma.service';
import { PostingService, type PostingLine } from '../accounting/posting.service';
import { AuditService } from '../identity/audit/audit.service';
import type { DeviceContext } from '../common/auth-context';
import { parseOrReject, PermanentRejection, Retryable, type OperationHandler } from './sync.errors';
import { ApprovalsService } from './approvals.service';

const D = (v: string) => new Prisma.Decimal(v);
type TaxAmount = { taxRateId: string; amount: string };

/**
 * `refund.issued` v1 (doc 07 §3.2). Always references the original invoice and lines; quantities are capped
 * by what was sold minus what was already refunded (lines locked FOR UPDATE, DB CHECK as backstop); amounts
 * must equal the shared domain calculation. Food is not returned to stock by default (assumption A8).
 * Over-refunds and wrong amounts are rejected for manager follow-up rather than silently adjusted.
 */
@Injectable()
export class RefundIssuedHandler implements OperationHandler {
  readonly type = 'refund.issued';
  readonly versions = [1];

  constructor(
    private readonly posting: PostingService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
  ) {}

  async handle(tx: Tx, device: DeviceContext, op: SyncOperation) {
    const p = parseOrReject(refundIssuedV1, op.payload);
    const invoice = await tx.invoice.findUnique({ where: { id: p.invoiceId } });
    if (!invoice) throw new Retryable('dependency_pending', 5_000, { invoiceId: p.invoiceId });
    if (await tx.refund.findUnique({ where: { id: p.id } }))
      throw new PermanentRejection('id_conflict', { refundId: p.id });
    if (!(await tx.employee.findUnique({ where: { id: p.employeeId } })))
      throw new PermanentRejection('unknown_reference', { employeeId: p.employeeId });
    const method = await tx.paymentMethod.findUnique({ where: { id: p.payment.paymentMethodId } });
    if (!method) throw new PermanentRejection('unknown_reference', { paymentMethodId: p.payment.paymentMethodId });
    if (p.cashSessionId) {
      const s = await tx.cashSession.findUnique({ where: { id: p.cashSessionId } });
      if (!s) throw new Retryable('dependency_pending', 5_000, { cashSessionId: p.cashSessionId });
      if (s.status !== 'open' || s.deviceId !== device.deviceId) throw new PermanentRejection('cash_session_closed');
    }

    const currency = invoice.currencyCode;
    const m = (v: string) => Money.of(v, currency);
    // Serialise refunds of the same invoice: concurrent devices cannot both take the last unit.
    await tx.$queryRaw`SELECT id FROM invoice_lines WHERE invoice_id = ${invoice.id}::uuid FOR UPDATE`;
    const lines = await tx.invoiceLine.findMany({ where: { invoiceId: invoice.id } });
    const prior = await tx.refundLine.findMany({ where: { invoiceLineId: { in: lines.map((l) => l.id) } } });

    const checked = p.lines.map((rl) => {
      const line = lines.find((l) => l.id === rl.invoiceLineId);
      if (!line) throw new PermanentRejection('unknown_reference', { invoiceLineId: rl.invoiceLineId });
      const done = prior.filter((x) => x.invoiceLineId === line.id);
      const doneTaxes = new Map<string, Money>();
      for (const d of done)
        for (const t of d.taxes as TaxAmount[])
          doneTaxes.set(t.taxRateId, (doneTaxes.get(t.taxRateId) ?? Money.zero(currency)).add(m(t.amount)));
      let expected;
      try {
        expected = refundLineAmounts(
          {
            qty: line.qty.toString(),
            netAmount: line.netAmount.toFixed(2),
            taxes: (line.taxes as TaxAmount[]).map((t) => ({ taxRateId: t.taxRateId, amount: t.amount })),
          },
          {
            qty: done.reduce((s, d) => s.plus(d.qty), new Prisma.Decimal(0)).toString(),
            netAmount: done.reduce((s, d) => s.plus(d.netAmount), new Prisma.Decimal(0)).toFixed(2),
            taxes: [...doneTaxes].map(([taxRateId, a]) => ({ taxRateId, amount: a.toString(true) })),
          },
          rl.qty,
          currency,
        );
      } catch (err) {
        throw new PermanentRejection('refund_exceeds_sale', { invoiceLineId: line.id, reason: (err as Error).message });
      }
      if (!m(expected.netAmount).equals(m(rl.netAmount)) || !m(expected.taxAmount).equals(m(rl.taxAmount))) {
        throw new PermanentRejection('refund_amounts_invalid', {
          invoiceLineId: line.id,
          expected,
          recorded: { net: rl.netAmount, tax: rl.taxAmount },
        });
      }
      return { rl, line, expected };
    });
    const net = Money.sum(
      checked.map((c) => m(c.expected.netAmount)),
      currency,
    );
    const tax = Money.sum(
      checked.map((c) => m(c.expected.taxAmount)),
      currency,
    );
    const total = net.add(tax);
    if (!m(p.payment.amount).equals(total))
      throw new PermanentRejection('refund_amounts_invalid', { total: total.toString(true), paid: p.payment.amount });

    const authorised = await this.approvals.record(tx, device, op, p.approval, 'sales.refund', {
      type: 'refund',
      id: p.id,
    });

    await tx.refund.create({
      data: {
        id: p.id,
        tenantId: device.tenantId,
        invoiceId: invoice.id,
        branchId: device.branchId,
        deviceId: device.deviceId,
        number: p.number,
        employeeId: p.employeeId,
        cashSessionId: p.cashSessionId,
        reason: p.reason,
        netTotal: D(net.toString(true)),
        taxTotal: D(tax.toString(true)),
        total: D(total.toString(true)),
        approvalId: p.approval.id,
        issuedAt: new Date(p.issuedAt),
        operationId: op.operation_id,
        lines: {
          create: checked.map(({ rl, expected }) => ({
            id: rl.id,
            tenantId: device.tenantId,
            invoiceLineId: rl.invoiceLineId,
            qty: D(rl.qty),
            netAmount: D(expected.netAmount),
            taxAmount: D(expected.taxAmount),
            grossAmount: D(expected.grossAmount),
            taxes: expected.taxes,
          })),
        },
      },
    });
    for (const { rl, line } of checked) {
      await tx.invoiceLine.update({ where: { id: line.id }, data: { refundedQty: { increment: D(rl.qty) } } });
    }
    const refundedTotal = new Prisma.Decimal(invoice.refundedTotal).plus(total.toString(true));
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { refundedTotal, status: refundedTotal.gte(invoice.total) ? 'refunded' : 'partially_refunded' },
    });
    await tx.payment.create({
      data: {
        id: p.payment.id,
        tenantId: device.tenantId,
        invoiceId: invoice.id,
        refundId: p.id,
        direction: 'out',
        paymentMethodId: method.id,
        amount: D(total.toString(true)),
        occurredAt: new Date(p.issuedAt),
        operationId: op.operation_id,
        cashSessionId: p.cashSessionId,
      },
    });

    // Reverse revenue and output tax; pay out of the method's account.
    const branch = await tx.branch.findUniqueOrThrow({ where: { id: device.branchId } });
    const settings = await tx.tenantSettings.findUniqueOrThrow({ where: { tenantId: device.tenantId } });
    const date = businessDate(p.issuedAt, branch.timezone, settings.businessDayCutoff);
    const posting: PostingLine[] = [];
    const revenue = new Map<string, Money>();
    const taxes = new Map<string, Money>();
    for (const { line, expected } of checked) {
      const product = await tx.productVariant.findUniqueOrThrow({
        where: { id: line.variantId },
        include: { product: true },
      });
      const account = await this.posting.resolve(tx, device.tenantId, 'sales_revenue', {
        type: 'category',
        id: product.product.categoryId,
      });
      revenue.set(account, (revenue.get(account) ?? Money.zero(currency)).add(m(expected.netAmount)));
      for (const t of expected.taxes)
        taxes.set(t.taxRateId, (taxes.get(t.taxRateId) ?? Money.zero(currency)).add(m(t.amount)));
    }
    for (const [accountId, amount] of revenue)
      posting.push({ accountId, debit: amount.toString(true), branchId: device.branchId, description: 'Refund' });
    for (const [taxRateId, amount] of taxes) {
      const rate = await tx.taxRate.findUniqueOrThrow({ where: { id: taxRateId } });
      const accountId =
        rate.outputAccountId ??
        (await this.posting.resolve(tx, device.tenantId, 'output_tax', { type: 'tax_rate', id: taxRateId }));
      posting.push({ accountId, debit: amount.toString(true), branchId: device.branchId, description: rate.code });
    }
    posting.push({
      accountId: method.accountId,
      credit: total.toString(true),
      branchId: device.branchId,
      description: 'Refund payment',
    });
    const entry = await this.posting.post(tx, {
      tenantId: device.tenantId,
      sourceType: 'refund',
      sourceId: p.id,
      purpose: 'refund',
      date,
      currency,
      memo: `Refund ${p.number} of ${invoice.number}`,
      lines: posting,
    });
    await tx.refund.update({ where: { id: p.id }, data: { journalEntryId: entry.id } });
    await tx.payment.update({ where: { id: p.payment.id }, data: { journalEntryId: entry.id } });
    if (!authorised) {
      await tx.saleDiscrepancy.create({
        data: {
          tenantId: device.tenantId,
          invoiceId: invoice.id,
          kind: 'permission_outdated',
          details: { refundId: p.id, approverEmployeeId: p.approval.approverEmployeeId },
        },
      });
    }
    await this.audit.record(
      tx,
      device.tenantId,
      { kind: 'system' },
      {
        action: 'refund.recorded',
        entityType: 'refund',
        entityId: p.id,
        branchId: device.branchId,
        changes: {
          invoice: invoice.number,
          total: total.toString(true),
          approvedBy: p.approval.approverEmployeeId,
          authorised,
        },
      },
    );
    return {
      refund_id: p.id,
      journal_entry_id: entry.id,
      journal_number: entry.number,
      invoice_status: refundedTotal.gte(invoice.total) ? 'refunded' : 'partially_refunded',
      authorised,
    };
  }
}
