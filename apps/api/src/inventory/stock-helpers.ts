import type { Prisma } from '@prisma/client';
import { businessDate, toBaseQty } from '@ros/domain';
import type { Tx } from '../prisma/prisma.service';
import { badRequest, notFound } from '../common/errors';
import { canAccessBranch, type TenantContext } from '../common/auth-context';

/** Shared by the inventory and purchasing back office. */

/** An active warehouse the caller may work in (branch scope; branchless warehouses need all branches). */
export async function accessibleWarehouse(tx: Tx, auth: TenantContext, id: string) {
  const w = await tx.warehouse.findFirst({ where: { id, tenantId: auth.tenantId, isActive: true } });
  if (!w || (w.branchId ? !canAccessBranch(auth, w.branchId) : !auth.allBranches)) throw notFound('warehouses');
  return w;
}

/** Quantity in the item's base unit; an unknown unit is a 400, never a silent 1:1. */
export function toBase(qty: string, unit: string, item: { baseUnit: string; conversions: Prisma.JsonValue }) {
  try {
    return toBaseQty(qty, unit, item.baseUnit, item.conversions as Record<string, string>);
  } catch (err) {
    throw badRequest('inventory.unitConversion', (err as Error).message);
  }
}

/** Business date (branch timezone and day cutoff) and timestamp for a posting made now. */
export async function postingMoment(tx: Tx, tenantId: string, branchId: string | null) {
  const branch = branchId ? await tx.branch.findUniqueOrThrow({ where: { id: branchId } }) : null;
  const settings = await tx.tenantSettings.findUniqueOrThrow({ where: { tenantId } });
  const tz = branch?.timezone ?? (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } })).timezone;
  const now = new Date();
  return { businessDate: businessDate(now, tz, settings.businessDayCutoff), occurredAt: now };
}

export async function baseCurrency(tx: Tx, tenantId: string) {
  return (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { baseCurrency: true } })).baseCurrency;
}

/** Gap-free per-tenant document number, e.g. GRN-000001 (the counter row is locked until commit). */
export async function nextDocumentNumber(tx: Tx, tenantId: string, docType: string, prefix: string) {
  const rows = await tx.$queryRaw<{ value: bigint }[]>`
    INSERT INTO document_sequences (tenant_id, doc_type, scope_key, next_value) VALUES (${tenantId}::uuid, ${docType}, 'all', 2)
    ON CONFLICT (tenant_id, doc_type, scope_key) DO UPDATE SET next_value = document_sequences.next_value + 1
    RETURNING next_value - 1 AS value`;
  return `${prefix}-${String(rows[0]!.value).padStart(6, '0')}`;
}
