import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { issue, Money, receive, uuidv5, type StockBalance } from '@ros/domain';
import type { Tx } from '../prisma/prisma.service';
import { PostingService, type PostingLine } from '../accounting/posting.service';

const MOVEMENT_NAMESPACE = '3b0d4c2e-9f61-5a7c-8e14-6d2a9b7f0c31';
const D = (v: string) => new Prisma.Decimal(v);

export const INBOUND = [
  'opening_balance',
  'adjustment_in',
  'count_gain',
  'transfer_in',
  'purchase_receipt',
  'refund_return',
] as const;
export const OUTBOUND = [
  'sale_consumption',
  'wastage',
  'spoilage',
  'adjustment_out',
  'count_loss',
  'transfer_out',
  'transfer_variance',
  'supplier_return',
] as const;
export type MovementType = (typeof INBOUND)[number] | (typeof OUTBOUND)[number];

export interface MovementInput {
  warehouseId: string;
  itemId: string;
  type: MovementType;
  /** Positive magnitude in the item's base unit; the sign follows the type. */
  qtyBase: string;
  /** Receipts only; issues are valued at weighted average. */
  unitCost?: string;
  /** Receipts only: value at exactly what the earlier input at this index issued (transfers). */
  costFrom?: number;
  /** Receipts only: value at exactly this total (purchases: the document's line value to the cent). */
  totalCost?: string;
  sourceType: string;
  sourceId: string;
  sourceLineId?: string | null;
  reasonCode?: string | null;
}

export interface PlannedMovement {
  id: string;
  input: MovementInput;
  movementType: MovementType | 'revaluation';
  qtyBase: string;
  unitCost: string;
  totalCost: string;
}

export interface LedgerPlan {
  tenantId: string;
  businessDate: string;
  occurredAt: Date;
  movements: PlannedMovement[];
  balances: Map<string, StockBalance & { warehouseId: string; itemId: string }>;
  /** Item/warehouse pairs that ended below zero. */
  negative: { warehouseId: string; itemId: string; qty: string }[];
}

/**
 * The only writer of the stock ledger (doc 07 §5, ADR-0008). Two steps inside the caller's transaction:
 * `plan` locks the affected balances in a deterministic order and values every movement (weighted
 * average); the caller posts the journal entry from the plan; `commit` writes movements (with the journal
 * link) and balances. Movements are never updated — corrections are new movements.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly posting: PostingService) {}

  async plan(
    tx: Tx,
    tenantId: string,
    inputs: MovementInput[],
    at: { businessDate: string; occurredAt: Date },
  ): Promise<LedgerPlan> {
    const keys = [...new Set(inputs.map((i) => `${i.warehouseId}:${i.itemId}`))].sort();
    for (const k of keys) {
      const [warehouseId, itemId] = k.split(':') as [string, string];
      await tx.$executeRaw`INSERT INTO stock_balances (tenant_id, warehouse_id, item_id, updated_at)
        VALUES (${tenantId}::uuid, ${warehouseId}::uuid, ${itemId}::uuid, now()) ON CONFLICT DO NOTHING`;
    }
    const balances = new Map<string, StockBalance & { warehouseId: string; itemId: string }>();
    for (const k of keys) {
      // Locked one by one in key order: concurrent postings over the same items cannot deadlock.
      const [warehouseId, itemId] = k.split(':') as [string, string];
      const [row] = await tx.$queryRaw<
        { qty_base: Prisma.Decimal; total_value: Prisma.Decimal; avg_unit_cost: Prisma.Decimal }[]
      >`
        SELECT qty_base, total_value, avg_unit_cost FROM stock_balances
        WHERE warehouse_id = ${warehouseId}::uuid AND item_id = ${itemId}::uuid FOR UPDATE`;
      balances.set(k, {
        warehouseId,
        itemId,
        qty: row!.qty_base.toString(),
        value: row!.total_value.toFixed(2),
        avgCost: row!.avg_unit_cost.toString(),
      });
    }
    const items = await tx.inventoryItem.findMany({
      where: { id: { in: [...new Set(inputs.map((i) => i.itemId))] } },
      select: { id: true, standardCost: true },
    });

    const movements: PlannedMovement[] = [];
    const issued: (PlannedMovement | undefined)[] = [];
    for (const input of inputs) {
      const key = `${input.warehouseId}:${input.itemId}`;
      const b = balances.get(key)!;
      const inbound = (INBOUND as readonly string[]).includes(input.type);
      const fallback = items.find((x) => x.id === input.itemId)?.standardCost.toString() ?? '0';
      let receiptCost = input.unitCost ?? (Number(b.avgCost) > 0 ? b.avgCost : fallback);
      const from = input.costFrom !== undefined ? issued[input.costFrom] : undefined;
      const exact = from
        ? new Prisma.Decimal(from.totalCost).abs()
        : input.totalCost !== undefined
          ? new Prisma.Decimal(input.totalCost)
          : undefined;
      if (exact) receiptCost = exact.div(input.qtyBase).toString();
      let result = inbound ? receive(b, input.qtyBase, receiptCost) : issue(b, input.qtyBase, fallback);
      // Carried or invoiced value must arrive to the cent, whatever the per-unit rounding.
      if (exact && inbound && result.totalCost !== exact.toFixed(2)) {
        const delta = exact.minus(result.totalCost);
        result = {
          ...result,
          totalCost: exact.toFixed(2),
          balance: { ...result.balance, value: delta.plus(result.balance.value).toFixed(2) },
        };
      }
      const id = uuidv5(
        `${input.sourceType}:${input.sourceId}:${input.sourceLineId ?? ''}:${input.type}:${input.itemId}:${input.warehouseId}`,
        MOVEMENT_NAMESPACE,
      );
      const movement: PlannedMovement = {
        id,
        input,
        movementType: input.type,
        qtyBase: inbound ? input.qtyBase : `-${input.qtyBase}`,
        unitCost: result.unitCost,
        totalCost: result.totalCost,
      };
      movements.push(movement);
      issued.push(movement);
      if (result.revaluation) {
        movements.push({
          id: uuidv5(`${id}:revaluation`, MOVEMENT_NAMESPACE),
          input,
          movementType: 'revaluation',
          qtyBase: '0',
          unitCost: '0',
          totalCost: result.revaluation,
        });
      }
      balances.set(key, { ...result.balance, warehouseId: input.warehouseId, itemId: input.itemId });
    }
    const negative = [...balances.values()]
      .filter((b) => Number(b.qty) < 0)
      .map((b) => ({ warehouseId: b.warehouseId, itemId: b.itemId, qty: b.qty }));
    return { tenantId, businessDate: at.businessDate, occurredAt: at.occurredAt, movements, balances, negative };
  }

  async commit(tx: Tx, plan: LedgerPlan, journalEntryId: string | null) {
    if (plan.movements.length === 0) return;
    await tx.stockMovement.createMany({
      data: plan.movements.map((m) => ({
        id: m.id,
        tenantId: plan.tenantId,
        warehouseId: m.input.warehouseId,
        itemId: m.input.itemId,
        movementType: m.movementType,
        qtyBase: D(m.qtyBase),
        unitCost: D(m.unitCost),
        totalCost: D(m.totalCost),
        sourceType: m.input.sourceType,
        sourceId: m.input.sourceId,
        sourceLineId: m.movementType === 'revaluation' ? m.id : (m.input.sourceLineId ?? null),
        businessDate: new Date(`${plan.businessDate}T00:00:00Z`),
        occurredAt: plan.occurredAt,
        journalEntryId,
        reasonCode: m.input.reasonCode ?? null,
      })),
    });
    for (const b of plan.balances.values()) {
      await tx.stockBalance.update({
        where: { warehouseId_itemId: { warehouseId: b.warehouseId, itemId: b.itemId } },
        data: { qtyBase: D(b.qty), totalValue: D(b.value), avgUnitCost: D(b.avgCost) },
      });
    }
  }

  /**
   * Posts the journal entry for a plan: every movement moves value between the inventory account (in transit
   * for the transit warehouse) and `counterAccount(movement)`; revaluations go to price variance. Returns the
   * entry id, or null when the plan carries no value (e.g. zero-cost items).
   */
  async postPlan(
    tx: Tx,
    plan: LedgerPlan,
    opts: {
      sourceType: string;
      sourceId: string;
      purpose: string;
      currency: string;
      memo: string;
      branchId: string | null;
      counterAccount: (m: PlannedMovement) => Promise<string>;
      /** Further amounts on the same entry (positive = debit), e.g. purchase charges or price variance. */
      extra?: { accountId: string; amount: string }[];
    },
  ): Promise<string | null> {
    const totals = new Map<string, Money>();
    const add = (account: string, amount: Money) =>
      totals.set(account, (totals.get(account) ?? Money.zero(opts.currency)).add(amount));
    const transitIds = new Set(
      (
        await tx.warehouse.findMany({
          where: { id: { in: plan.movements.map((m) => m.input.warehouseId) }, kind: 'transit' },
          select: { id: true },
        })
      ).map((w) => w.id),
    );
    for (const m of plan.movements) {
      const value = Money.of(m.totalCost, opts.currency);
      if (value.isZero()) continue;
      const stockAccount = await this.posting.resolve(
        tx,
        plan.tenantId,
        transitIds.has(m.input.warehouseId) ? 'inventory_in_transit' : 'inventory',
      );
      const counter =
        m.movementType === 'revaluation'
          ? await this.posting.resolve(tx, plan.tenantId, 'inventory_price_variance')
          : await opts.counterAccount(m);
      add(stockAccount, value); // + debit inventory, − credit inventory
      add(counter, value.mul('-1'));
    }
    for (const e of opts.extra ?? []) add(e.accountId, Money.of(e.amount, opts.currency));
    const lines: PostingLine[] = [];
    for (const [accountId, amount] of totals) {
      if (amount.isZero()) continue;
      lines.push(
        amount.isNegative()
          ? { accountId, credit: amount.mul('-1').toString(true), branchId: opts.branchId }
          : { accountId, debit: amount.toString(true), branchId: opts.branchId },
      );
    }
    if (lines.length < 2) return null;
    const entry = await this.posting.post(tx, {
      tenantId: plan.tenantId,
      sourceType: opts.sourceType,
      sourceId: opts.sourceId,
      purpose: opts.purpose,
      date: plan.businessDate,
      currency: opts.currency,
      memo: opts.memo,
      lines,
    });
    return entry.id;
  }

  /** plan → journal → commit, for callers with a single counter account rule. */
  async record(
    tx: Tx,
    tenantId: string,
    inputs: MovementInput[],
    at: { businessDate: string; occurredAt: Date },
    journal: Parameters<LedgerService['postPlan']>[2],
  ) {
    const plan = await this.plan(tx, tenantId, inputs, at);
    const journalEntryId = await this.postPlan(tx, plan, journal);
    await this.commit(tx, plan, journalEntryId);
    return { plan, journalEntryId };
  }
}
