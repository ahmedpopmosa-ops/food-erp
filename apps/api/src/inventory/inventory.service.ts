import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type {
  InventoryItemCreateInput,
  RecipeVersionCreateInput,
  StockAdjustmentCreateInput,
  StockCountLinesInput,
  StockTransferCreateInput,
  StockTransferReceiveInput,
} from '@ros/contracts';
import { childId, toBaseQty } from '@ros/domain';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { AuditService } from '../identity/audit/audit.service';
import { PostingService } from '../accounting/posting.service';
import { LedgerService, type LedgerPlan, type MovementInput } from './ledger.service';
import { accessibleWarehouse, baseCurrency, nextDocumentNumber, postingMoment, toBase } from './stock-helpers';
import { badRequest, conflict, forbidden, isUniqueViolation, notFound } from '../common/errors';
import { branchScope, canAccessBranch, type TenantContext } from '../common/auth-context';

const D = (v: string) => new Prisma.Decimal(v);

/** Inventory back office (doc 07 §3.5): items, recipes, adjustments, counts, transfers, reconciliation. */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    private readonly posting: PostingService,
  ) {}

  /**
   * Active warehouses in the caller's branch scope (the tenant transit warehouse needs all branches).
   * `destinations`: every non-transit warehouse of the tenant, the ones a transfer may be sent to.
   */
  warehouses(auth: TenantContext, destinations = false) {
    const scope = destinations ? null : branchScope(auth);
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.warehouse.findMany({
        where: {
          tenantId: auth.tenantId,
          isActive: true,
          ...(destinations ? { kind: { not: 'transit' } } : {}),
          ...(scope ? { branchId: { in: scope } } : {}),
        },
        select: { id: true, code: true, name: true, kind: true, branchId: true },
        orderBy: { code: 'asc' },
      }),
    );
  }

  // ── Items & recipes ────────────────────────────────────────────────────────

  items(auth: TenantContext) {
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.inventoryItem.findMany({ where: { tenantId: auth.tenantId }, orderBy: { code: 'asc' } }),
    );
  }

  async createItem(auth: TenantContext, input: InventoryItemCreateInput) {
    try {
      return await this.prisma.withTenant(auth.tenantId, async (tx) => {
        const item = await tx.inventoryItem.create({
          data: {
            tenantId: auth.tenantId,
            code: input.code,
            nameAr: input.nameAr,
            nameEn: input.nameEn,
            kind: input.kind,
            baseUnit: input.baseUnit,
            standardCost: D(input.standardCost),
            conversions: input.conversions,
            minQty: input.minQty ? D(input.minQty) : null,
          },
        });
        await this.audit.record(tx, auth.tenantId, this.audit.user(auth), {
          action: 'inventory_item.created',
          entityType: 'inventory_item',
          entityId: item.id,
          changes: { ...input },
        });
        return item;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('inventory.duplicateCode', 'An item with this code already exists');
      throw err;
    }
  }

  recipes(auth: TenantContext, variantId?: string) {
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.recipe.findMany({
        where: { tenantId: auth.tenantId, ...(variantId ? { variantId } : {}) },
        include: { versions: { include: { lines: true }, orderBy: { version: 'desc' } } },
      }),
    );
  }

  /** New active version (the previous active one is retired; versions themselves never change). */
  createRecipeVersion(auth: TenantContext, input: RecipeVersionCreateInput) {
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      if (!(await tx.productVariant.findFirst({ where: { id: input.variantId, tenantId } })))
        throw notFound('variants');
      const items = await tx.inventoryItem.findMany({
        where: { tenantId, id: { in: input.lines.map((l) => l.itemId) } },
      });
      const lines = input.lines.map((l) => {
        const item = items.find((i) => i.id === l.itemId);
        if (!item) throw badRequest('inventory.unknownItem', 'Item not found');
        let qtyBase: string;
        try {
          qtyBase = toBaseQty(l.qty, l.unit, item.baseUnit, item.conversions as Record<string, string>);
        } catch (err) {
          throw badRequest('inventory.unitConversion', (err as Error).message);
        }
        return {
          tenantId,
          itemId: l.itemId,
          qty: D(l.qty),
          unit: l.unit,
          qtyBase: D(qtyBase),
          wastePct: D(l.wastePct),
        };
      });
      const recipe =
        (await tx.recipe.findFirst({ where: { tenantId, variantId: input.variantId } })) ??
        (await tx.recipe.create({ data: { tenantId, variantId: input.variantId } }));
      const last = await tx.recipeVersion.findFirst({ where: { recipeId: recipe.id }, orderBy: { version: 'desc' } });
      await tx.recipeVersion.updateMany({
        where: { recipeId: recipe.id, status: 'active' },
        data: { status: 'retired' },
      });
      const version = await tx.recipeVersion.create({
        data: {
          tenantId,
          recipeId: recipe.id,
          version: (last?.version ?? 0) + 1,
          yieldQty: D(input.yieldQty),
          effectiveFrom: new Date(),
          createdBy: auth.userId,
          lines: { create: lines },
        },
        include: { lines: true },
      });
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'recipe.versionCreated',
        entityType: 'recipe',
        entityId: recipe.id,
        changes: { version: version.version, lines: input.lines },
      });
      return version;
    });
  }

  // ── Adjustments (opening balance, +/- adjustment, wastage, spoilage) ──────

  createAdjustment(auth: TenantContext, input: StockAdjustmentCreateInput) {
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const warehouse = await this.warehouse(tx, auth, input.warehouseId);
      const items = await this.itemsById(
        tx,
        tenantId,
        input.lines.map((l) => l.itemId),
      );
      const id = randomUUID();
      const number = await this.nextNumber(tx, tenantId, 'stock_adjustment', 'ADJ');
      const lines = input.lines.map((l, i) => {
        const item = items.get(l.itemId)!;
        const negative = l.qty.startsWith('-');
        const qtyBase = this.base(l.qty.replace(/^-/, ''), l.unit, item);
        const type = input.kind === 'adjustment' ? (negative ? 'adjustment_out' : 'adjustment_in') : input.kind;
        return {
          lineId: childId(id, `line:${i + 1}`),
          l,
          qtyBase,
          type,
          unitCostBase: l.unitCost ? this.costPerBase(l.unitCost, l.unit, item) : undefined,
        };
      });
      const counterKey =
        input.kind === 'opening_balance'
          ? 'opening_balance_equity'
          : input.kind === 'adjustment'
            ? 'inventory_adjustment'
            : 'wastage_expense';
      const counter = await this.posting.resolve(tx, tenantId, counterKey);
      await tx.stockAdjustment.create({
        data: {
          id,
          tenantId,
          warehouseId: warehouse.id,
          number,
          kind: input.kind,
          reason: input.reason,
          createdBy: auth.userId,
          lines: {
            create: lines.map((x) => ({
              id: x.lineId,
              tenantId,
              itemId: x.l.itemId,
              qty: D(x.l.qty),
              unit: x.l.unit,
              qtyBase: D(x.qtyBase),
              unitCost: x.unitCostBase ? D(x.unitCostBase) : null,
            })),
          },
        },
      });
      const { journalEntryId } = await this.ledger.record(
        tx,
        tenantId,
        lines.map((x): MovementInput => ({
          warehouseId: warehouse.id,
          itemId: x.l.itemId,
          type: x.type as MovementInput['type'],
          qtyBase: x.qtyBase,
          unitCost: x.unitCostBase,
          sourceType: 'stock_adjustment',
          sourceId: id,
          sourceLineId: x.lineId,
          reasonCode: input.reason,
        })),
        await this.when(tx, auth, warehouse.branchId),
        {
          sourceType: 'stock_adjustment',
          sourceId: id,
          purpose: input.kind,
          currency: await this.currency(tx, tenantId),
          memo: `${number} ${input.reason}`,
          branchId: warehouse.branchId,
          counterAccount: async () => counter,
        },
      );
      if (journalEntryId) await tx.stockAdjustment.update({ where: { id }, data: { journalEntryId } });
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'stock.adjusted',
        entityType: 'stock_adjustment',
        entityId: id,
        branchId: warehouse.branchId,
        changes: { number, kind: input.kind, lines: input.lines.length },
      });
      return tx.stockAdjustment.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    });
  }

  // ── Counts ─────────────────────────────────────────────────────────────────

  /** Starts a count: snapshots the system quantity of every active item in the warehouse. */
  startCount(auth: TenantContext, warehouseId: string) {
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const warehouse = await this.warehouse(tx, auth, warehouseId);
      if (await tx.stockCount.findFirst({ where: { warehouseId, status: 'in_progress' } }))
        throw conflict('counts.alreadyOpen', 'A count is already in progress for this warehouse');
      const id = randomUUID();
      const items = await tx.inventoryItem.findMany({ where: { tenantId, archivedAt: null } });
      const balances = await tx.stockBalance.findMany({ where: { warehouseId } });
      const count = await tx.stockCount.create({
        data: {
          id,
          tenantId,
          warehouseId: warehouse.id,
          number: await this.nextNumber(tx, tenantId, 'stock_count', 'CNT'),
          snapshotAt: new Date(),
          createdBy: auth.userId,
          lines: {
            create: items.map((it) => ({
              id: childId(id, `item:${it.id}`),
              tenantId,
              itemId: it.id,
              systemQty: balances.find((b) => b.itemId === it.id)?.qtyBase ?? D('0'),
            })),
          },
        },
        include: { lines: true },
      });
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'stock_count.started',
        entityType: 'stock_count',
        entityId: id,
        branchId: warehouse.branchId,
      });
      return count;
    });
  }

  enterCount(auth: TenantContext, countId: string, input: StockCountLinesInput) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const count = await this.openCount(tx, auth, countId);
      const items = await this.itemsById(
        tx,
        auth.tenantId,
        input.lines.map((l) => l.itemId),
      );
      for (const l of input.lines) {
        const line = count.lines.find((x) => x.itemId === l.itemId);
        if (!line) throw badRequest('counts.unknownItem', 'Item is not part of this count');
        const counted = this.base(l.countedQty, l.unit, items.get(l.itemId)!);
        await tx.stockCountLine.update({
          where: { id: line.id },
          data: { countedQty: D(counted), differenceQty: D(counted).minus(line.systemQty) },
        });
      }
      return tx.stockCount.findUniqueOrThrow({ where: { id: countId }, include: { lines: true } });
    });
  }

  /**
   * Approves a count: differences against the stock *now* (movements since the snapshot are respected) become
   * count gain/loss movements; uncounted items are left unchanged.
   */
  approveCount(auth: TenantContext, countId: string) {
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const count = await this.openCount(tx, auth, countId);
      const warehouse = await tx.warehouse.findUniqueOrThrow({ where: { id: count.warehouseId } });
      const inputs: MovementInput[] = [];
      for (const line of count.lines) {
        if (line.countedQty === null) continue;
        const since = await tx.stockMovement.aggregate({
          where: { warehouseId: count.warehouseId, itemId: line.itemId, postedAt: { gt: count.snapshotAt } },
          _sum: { qtyBase: true },
        });
        const expected = line.systemQty.plus(since._sum.qtyBase ?? 0);
        const diff = line.countedQty.minus(expected);
        if (diff.isZero()) continue;
        inputs.push({
          warehouseId: count.warehouseId,
          itemId: line.itemId,
          type: diff.gt(0) ? 'count_gain' : 'count_loss',
          qtyBase: diff.abs().toString(),
          sourceType: 'stock_count',
          sourceId: countId,
          sourceLineId: line.id,
        });
      }
      const counter = await this.posting.resolve(tx, tenantId, 'inventory_adjustment');
      const { journalEntryId } = await this.ledger.record(
        tx,
        tenantId,
        inputs,
        await this.when(tx, auth, warehouse.branchId),
        {
          sourceType: 'stock_count',
          sourceId: countId,
          purpose: 'count',
          currency: await this.currency(tx, tenantId),
          memo: `Count ${count.number}`,
          branchId: warehouse.branchId,
          counterAccount: async () => counter,
        },
      );
      await tx.stockCount.update({
        where: { id: countId },
        data: { status: 'approved', approvedBy: auth.userId, approvedAt: new Date(), journalEntryId },
      });
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'stock_count.approved',
        entityType: 'stock_count',
        entityId: countId,
        branchId: warehouse.branchId,
        changes: { adjustments: inputs.length },
      });
      return tx.stockCount.findUniqueOrThrow({ where: { id: countId }, include: { lines: true } });
    });
  }

  // ── Transfers (source → transit → destination) ────────────────────────────

  createTransfer(auth: TenantContext, input: StockTransferCreateInput) {
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.warehouse(tx, auth, input.fromWarehouseId);
      const to = await tx.warehouse.findFirst({ where: { id: input.toWarehouseId, tenantId, isActive: true } });
      if (!to || to.kind === 'transit') throw notFound('warehouses');
      const items = await this.itemsById(
        tx,
        tenantId,
        input.lines.map((l) => l.itemId),
      );
      const id = randomUUID();
      const transfer = await tx.stockTransfer.create({
        data: {
          id,
          tenantId,
          number: await this.nextNumber(tx, tenantId, 'stock_transfer', 'TRF'),
          fromWarehouseId: input.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
          createdBy: auth.userId,
          lines: {
            create: input.lines.map((l) => ({
              id: childId(id, `item:${l.itemId}`),
              tenantId,
              itemId: l.itemId,
              qtySent: D(this.base(l.qty, l.unit, items.get(l.itemId)!)),
            })),
          },
        },
        include: { lines: true },
      });
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'stock_transfer.created',
        entityType: 'stock_transfer',
        entityId: id,
        changes: { number: transfer.number },
      });
      return transfer;
    });
  }

  dispatchTransfer(auth: TenantContext, id: string) {
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const t = await this.transfer(tx, auth, id, 'draft', 'from');
      const from = await tx.warehouse.findUniqueOrThrow({ where: { id: t.fromWarehouseId } });
      const transit = await this.transit(tx, tenantId);
      // Out of the source at weighted average, into transit at exactly that value (one plan: sorted locks).
      const inputs: MovementInput[] = t.lines.flatMap((l, i) => [
        {
          warehouseId: t.fromWarehouseId,
          itemId: l.itemId,
          type: 'transfer_out' as const,
          qtyBase: l.qtySent.toString(),
          sourceType: 'stock_transfer_dispatch',
          sourceId: id,
          sourceLineId: l.id,
        },
        {
          warehouseId: transit.id,
          itemId: l.itemId,
          type: 'transfer_in' as const,
          qtyBase: l.qtySent.toString(),
          costFrom: i * 2,
          sourceType: 'stock_transfer_dispatch',
          sourceId: id,
          sourceLineId: l.id,
        },
      ]);
      const plan = await this.ledger.plan(tx, tenantId, inputs, await this.when(tx, auth, from.branchId));
      const journalId = await this.postTransferJournal(tx, plan, id, 'dispatch', t.number, from.branchId);
      await this.ledger.commit(tx, plan, journalId);
      for (const m of plan.movements.filter((x) => x.movementType === 'transfer_out')) {
        await tx.stockTransferLine.update({ where: { id: m.input.sourceLineId! }, data: { unitCost: D(m.unitCost) } });
      }
      await tx.stockTransfer.update({
        where: { id },
        data: {
          status: 'dispatched',
          dispatchedAt: new Date(),
          dispatchedBy: auth.userId,
          dispatchJournalId: journalId,
        },
      });
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'stock_transfer.dispatched',
        entityType: 'stock_transfer',
        entityId: id,
        branchId: from.branchId,
      });
      return tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    });
  }

  /** Receives a transfer; any shortfall leaves transit as a transfer variance (expense), never silently. */
  receiveTransfer(auth: TenantContext, id: string, input: StockTransferReceiveInput) {
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const t = await this.transfer(tx, auth, id, 'dispatched', 'to');
      const to = await tx.warehouse.findUniqueOrThrow({ where: { id: t.toWarehouseId } });
      const transit = await this.transit(tx, tenantId);
      const items = await this.itemsById(
        tx,
        tenantId,
        t.lines.map((l) => l.itemId),
      );
      if (input.lines.some((r) => !t.lines.some((l) => l.itemId === r.itemId)))
        throw badRequest('transfers.unknownItem', 'Item is not part of this transfer');
      const inputs: MovementInput[] = [];
      for (const l of t.lines) {
        const r = input.lines.find((x) => x.itemId === l.itemId);
        const received = r
          ? new Prisma.Decimal(this.base(r.qtyReceived, r.unit, items.get(l.itemId)!))
          : new Prisma.Decimal(0);
        if (received.gt(l.qtySent)) throw badRequest('transfers.overReceived', 'Cannot receive more than was sent');
        const short = l.qtySent.minus(received);
        const src = { sourceType: 'stock_transfer_receive', sourceId: id, sourceLineId: l.id };
        if (received.gt(0)) {
          inputs.push({
            warehouseId: transit.id,
            itemId: l.itemId,
            type: 'transfer_out',
            qtyBase: received.toString(),
            ...src,
          });
          inputs.push({
            warehouseId: t.toWarehouseId,
            itemId: l.itemId,
            type: 'transfer_in',
            qtyBase: received.toString(),
            costFrom: inputs.length - 1,
            ...src,
          });
        }
        if (short.gt(0))
          inputs.push({
            warehouseId: transit.id,
            itemId: l.itemId,
            type: 'transfer_variance',
            qtyBase: short.toString(),
            ...src,
          });
        await tx.stockTransferLine.update({ where: { id: l.id }, data: { qtyReceived: received } });
      }
      const plan = await this.ledger.plan(tx, tenantId, inputs, await this.when(tx, auth, to.branchId));
      const journalId = await this.postTransferJournal(tx, plan, id, 'receive', t.number, to.branchId);
      await this.ledger.commit(tx, plan, journalId);
      await tx.stockTransfer.update({
        where: { id },
        data: { status: 'received', receivedAt: new Date(), receivedBy: auth.userId, receiveJournalId: journalId },
      });
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'stock_transfer.received',
        entityType: 'stock_transfer',
        entityId: id,
        branchId: to.branchId,
      });
      return tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    });
  }

  /**
   * Transfer entries only move value between inventory (1200) and in transit (1210). Every leg's counter is
   * the inventory account, so legs inside branch stock net to zero and only the transit side and any
   * shortfall (transfer variance → inventory adjustments) remain.
   */
  private async postTransferJournal(
    tx: Tx,
    plan: LedgerPlan,
    id: string,
    purpose: string,
    number: string,
    branchId: string | null,
  ) {
    const stock = await this.posting.resolve(tx, plan.tenantId, 'inventory');
    const variance = await this.posting.resolve(tx, plan.tenantId, 'inventory_adjustment');
    return this.ledger.postPlan(tx, plan, {
      sourceType: 'stock_transfer',
      sourceId: id,
      purpose,
      currency: await this.currency(tx, plan.tenantId),
      memo: `Transfer ${number} ${purpose}`,
      branchId,
      counterAccount: async (m) => (m.movementType === 'transfer_variance' ? variance : stock),
    });
  }

  // ── Read side & reconciliation ─────────────────────────────────────────────

  /** Documents of one kind in the warehouses the caller can see. */
  async documents(auth: TenantContext, kind: 'adjustments' | 'counts' | 'transfers') {
    const scope = branchScope(auth);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const ids = scope
        ? (await tx.warehouse.findMany({ where: { tenantId: auth.tenantId, branchId: { in: scope } } })).map(
            (w) => w.id,
          )
        : null;
      const inScope = ids ? { in: ids } : undefined;
      const where = { tenantId: auth.tenantId };
      if (kind === 'adjustments')
        return tx.stockAdjustment.findMany({
          where: { ...where, ...(inScope ? { warehouseId: inScope } : {}) },
          orderBy: { postedAt: 'desc' },
          take: 200,
        });
      if (kind === 'counts')
        return tx.stockCount.findMany({
          where: { ...where, ...(inScope ? { warehouseId: inScope } : {}) },
          orderBy: { createdAt: 'desc' },
          take: 200,
        });
      return tx.stockTransfer.findMany({
        where: { ...where, ...(inScope ? { OR: [{ fromWarehouseId: inScope }, { toWarehouseId: inScope }] } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
    });
  }

  count(auth: TenantContext, id: string) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const count = await tx.stockCount.findFirst({ where: { id, tenantId: auth.tenantId }, include: { lines: true } });
      if (!count) throw notFound('counts');
      await this.warehouse(tx, auth, count.warehouseId);
      return count;
    });
  }

  transferDetail(auth: TenantContext, id: string) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const t = await tx.stockTransfer.findFirst({ where: { id, tenantId: auth.tenantId }, include: { lines: true } });
      if (!t) throw notFound('transfers');
      const visible = await tx.warehouse.findMany({ where: { id: { in: [t.fromWarehouseId, t.toWarehouseId] } } });
      if (!visible.some((w) => w.branchId && canAccessBranch(auth, w.branchId))) throw notFound('transfers');
      return t;
    });
  }

  balances(auth: TenantContext, warehouseId?: string) {
    const scope = branchScope(auth);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const warehouses = await tx.warehouse.findMany({
        where: {
          tenantId: auth.tenantId,
          ...(warehouseId ? { id: warehouseId } : {}),
          ...(scope ? { branchId: { in: scope } } : {}),
        },
      });
      const rows = await tx.stockBalance.findMany({ where: { warehouseId: { in: warehouses.map((w) => w.id) } } });
      const items = await tx.inventoryItem.findMany({ where: { tenantId: auth.tenantId } });
      return rows.map((b) => {
        const item = items.find((i) => i.id === b.itemId)!;
        return {
          ...b,
          warehouseCode: warehouses.find((w) => w.id === b.warehouseId)!.code,
          itemCode: item.code,
          nameEn: item.nameEn,
          nameAr: item.nameAr,
          baseUnit: item.baseUnit,
          belowMinimum: item.minQty !== null && b.qtyBase.lt(item.minQty),
        };
      });
    });
  }

  movements(auth: TenantContext, q: { itemId?: string; warehouseId?: string; page: number; pageSize: number }) {
    const scope = branchScope(auth);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const warehouses = scope
        ? (await tx.warehouse.findMany({ where: { tenantId: auth.tenantId, branchId: { in: scope } } })).map(
            (w) => w.id,
          )
        : null;
      const where: Prisma.StockMovementWhereInput = {
        tenantId: auth.tenantId,
        ...(q.itemId ? { itemId: q.itemId } : {}),
        ...(q.warehouseId ? { warehouseId: q.warehouseId } : warehouses ? { warehouseId: { in: warehouses } } : {}),
      };
      const [items, total] = await Promise.all([
        tx.stockMovement.findMany({
          where,
          orderBy: { postedAt: 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        tx.stockMovement.count({ where }),
      ]);
      return { items, page: q.page, pageSize: q.pageSize, total };
    });
  }

  /**
   * Doc 07 §7: Σ movements must equal each balance, and the inventory GL accounts must equal the valued
   * stock. Every mismatch is listed — nothing is corrected automatically.
   */
  reconciliation(auth: TenantContext) {
    if (!auth.allBranches)
      throw forbidden('inventory.allBranchesRequired', 'Reconciliation needs access to all branches');
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const ledger = await tx.$queryRaw<
        { warehouse_id: string; item_id: string; qty: Prisma.Decimal; value: Prisma.Decimal }[]
      >`
        SELECT warehouse_id, item_id, sum(qty_base) AS qty, sum(total_cost) AS value FROM stock_movements
        WHERE tenant_id = ${auth.tenantId}::uuid GROUP BY warehouse_id, item_id`;
      const balances = await tx.stockBalance.findMany({ where: { tenantId: auth.tenantId } });
      const mismatches = [];
      for (const b of balances) {
        const l = ledger.find((x) => x.warehouse_id === b.warehouseId && x.item_id === b.itemId);
        const qty = l?.qty ?? new Prisma.Decimal(0);
        const value = l?.value ?? new Prisma.Decimal(0);
        if (!qty.equals(b.qtyBase) || !value.equals(b.totalValue)) {
          mismatches.push({
            warehouseId: b.warehouseId,
            itemId: b.itemId,
            ledgerQty: qty.toString(),
            balanceQty: b.qtyBase.toString(),
            ledgerValue: value.toFixed(2),
            balanceValue: b.totalValue.toFixed(2),
          });
        }
      }
      const stockValue = balances.reduce((s, b) => s.plus(b.totalValue), new Prisma.Decimal(0));
      const accounts = [
        await this.posting.resolve(tx, auth.tenantId, 'inventory'),
        await this.posting.resolve(tx, auth.tenantId, 'inventory_in_transit'),
      ];
      const [gl] = await tx.$queryRaw<{ balance: Prisma.Decimal | null }[]>`
        SELECT sum(l.debit - l.credit) AS balance FROM journal_lines l JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted'
        WHERE l.tenant_id = ${auth.tenantId}::uuid AND l.account_id = ANY(${accounts}::uuid[])`;
      const glValue = gl?.balance ?? new Prisma.Decimal(0);
      return {
        ledgerMatchesBalances: mismatches.length === 0,
        mismatches,
        stockValue: stockValue.toFixed(2),
        glInventoryValue: glValue.toFixed(2),
        glMatchesStock: glValue.equals(stockValue),
      };
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private warehouse(tx: Tx, auth: TenantContext, id: string) {
    return accessibleWarehouse(tx, auth, id);
  }

  private async transit(tx: Tx, tenantId: string) {
    const w = await tx.warehouse.findFirst({ where: { tenantId, kind: 'transit' } });
    if (!w) throw badRequest('transfers.noTransitWarehouse', 'No transit warehouse configured');
    return w;
  }

  private async openCount(tx: Tx, auth: TenantContext, id: string) {
    const count = await tx.stockCount.findFirst({ where: { id, tenantId: auth.tenantId }, include: { lines: true } });
    if (!count) throw notFound('counts');
    await this.warehouse(tx, auth, count.warehouseId);
    if (count.status !== 'in_progress') throw badRequest('invalid_state_transition', `Count is ${count.status}`);
    return count;
  }

  private async transfer(tx: Tx, auth: TenantContext, id: string, status: string, side: 'from' | 'to') {
    const t = await tx.stockTransfer.findFirst({ where: { id, tenantId: auth.tenantId }, include: { lines: true } });
    if (!t) throw notFound('transfers');
    await this.warehouse(tx, auth, side === 'from' ? t.fromWarehouseId : t.toWarehouseId);
    if (t.status !== status) throw badRequest('invalid_state_transition', `Transfer is ${t.status}`);
    return t;
  }

  private async itemsById(tx: Tx, tenantId: string, ids: string[]) {
    const items = await tx.inventoryItem.findMany({ where: { tenantId, id: { in: ids } } });
    if (items.length !== new Set(ids).size) throw badRequest('inventory.unknownItem', 'Item not found');
    return new Map(items.map((i) => [i.id, i]));
  }

  private base(qty: string, unit: string, item: { baseUnit: string; conversions: Prisma.JsonValue }) {
    return toBase(qty, unit, item);
  }

  /** Cost per base unit from a cost per `unit` (e.g. 40.00 per kg → 0.04 per g). */
  private costPerBase(cost: string, unit: string, item: { baseUnit: string; conversions: Prisma.JsonValue }) {
    const perBase = new Prisma.Decimal(cost).div(this.base('1', unit, item));
    return perBase.toDecimalPlaces(6).toString();
  }

  private when(tx: Tx, auth: TenantContext, branchId: string | null) {
    return postingMoment(tx, auth.tenantId, branchId);
  }

  private currency(tx: Tx, tenantId: string) {
    return baseCurrency(tx, tenantId);
  }

  private nextNumber(tx: Tx, tenantId: string, docType: string, prefix: string) {
    return nextDocumentNumber(tx, tenantId, docType, prefix);
  }
}
