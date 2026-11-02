import { Injectable } from '@nestjs/common';
import { recipeConsumption } from '@ros/domain';
import type { Tx } from '../prisma/prisma.service';
import { LedgerService, type MovementInput } from './ledger.service';
import { PostingService } from '../accounting/posting.service';

export interface ConsumedLine {
  /** Source line (invoice line or order item) the stock is consumed for. */
  lineId: string;
  variantId: string;
  qty: string;
}

/**
 * Turns sold or wasted menu items into stock movements through their recipes (doc 07 §6). The recipe version
 * in effect at the time of sale is used and returned, so consumption can always be reproduced from
 * (version, quantity). Items without a recipe consume nothing.
 */
@Injectable()
export class ConsumptionService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly posting: PostingService,
  ) {}

  /** Recipe version in effect at `at` for each variant (latest effective_from ≤ at; retired versions included). */
  async versionsAt(tx: Tx, variantIds: string[], at: Date) {
    const recipes = await tx.recipe.findMany({
      where: { variantId: { in: variantIds } },
      include: {
        versions: {
          where: { effectiveFrom: { lte: at } },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
          include: { lines: true },
        },
      },
    });
    return new Map(recipes.filter((r) => r.versions[0]).map((r) => [r.variantId, r.versions[0]!]));
  }

  /** Main warehouse of a branch (where the kitchen consumes from). */
  async kitchenWarehouse(tx: Tx, branchId: string) {
    const w = await tx.warehouse.findFirst({
      where: { branchId, kind: 'main', isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    return w?.id ?? null;
  }

  /**
   * Records consumption (`sale_consumption`, counter account COGS) or waste (`wastage`, counter account wastage
   * expense) for the given lines and posts the journal entry. Returns negative-stock items for flagging.
   */
  async consume(
    tx: Tx,
    p: {
      tenantId: string;
      branchId: string;
      kind: 'sale_consumption' | 'wastage';
      sourceType: string;
      sourceId: string;
      lines: ConsumedLine[];
      versions: Awaited<ReturnType<ConsumptionService['versionsAt']>>;
      businessDate: string;
      occurredAt: Date;
      currency: string;
      memo: string;
    },
  ) {
    const warehouseId = await this.kitchenWarehouse(tx, p.branchId);
    if (!warehouseId) return { negative: [], journalEntryId: null };
    const inputs: MovementInput[] = [];
    for (const line of p.lines) {
      const version = p.versions.get(line.variantId);
      if (!version) continue;
      const usage = recipeConsumption(
        version.lines.map((l) => ({
          itemId: l.itemId,
          qtyBase: l.qtyBase.toString(),
          wastePct: l.wastePct.toString(),
        })),
        version.yieldQty.toString(),
        line.qty,
      );
      for (const u of usage) {
        if (Number(u.qtyBase) > 0) {
          inputs.push({
            warehouseId,
            itemId: u.itemId,
            type: p.kind,
            qtyBase: u.qtyBase,
            sourceType: p.sourceType,
            sourceId: p.sourceId,
            sourceLineId: line.lineId,
          });
        }
      }
    }
    if (inputs.length === 0) return { negative: [], journalEntryId: null };
    const counterKey = p.kind === 'sale_consumption' ? 'cogs' : 'wastage_expense';
    const counter = await this.posting.resolve(tx, p.tenantId, counterKey);
    const { plan, journalEntryId } = await this.ledger.record(
      tx,
      p.tenantId,
      inputs,
      { businessDate: p.businessDate, occurredAt: p.occurredAt },
      {
        sourceType: p.sourceType,
        sourceId: p.sourceId,
        purpose: p.kind === 'sale_consumption' ? 'cogs' : 'wastage',
        currency: p.currency,
        memo: p.memo,
        branchId: p.branchId,
        counterAccount: async () => counter,
      },
    );
    return { negative: plan.negative, journalEntryId };
  }
}
