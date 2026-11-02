import { SYNC_PROTOCOL, type SaleFinalizedV1, type SyncOperation } from '@ros/contracts';
import { childId, computeTotals, uuidv7 } from '@ros/domain';

export interface SaleDevice {
  tenantId: string;
  branchId: string;
  deviceId: string;
  branchCode: string;
  deviceCode: string;
}

export interface SaleItem {
  variantId: string;
  taxCategoryId: string;
  /** Tax rates the device applies to this item. */
  taxes: { taxRateId: string; rate: string }[];
  unitPrice: string;
  qty?: string;
  nameAr?: string;
  nameEn?: string;
}

export interface SaleOptions {
  seq: number;
  items: SaleItem[];
  paymentMethodId: string;
  pricesIncludeTax?: boolean;
  channel?: SaleFinalizedV1['order']['channel'];
  /** Amount applied to the invoice; defaults to the total. */
  paidAmount?: string;
  occurredAt?: string;
  /** Mutate the payload after totals are computed (to simulate device bugs or tampering). */
  tamper?: (sale: SaleFinalizedV1) => void;
}

/** Builds a `sale.finalized` v1 operation exactly as a POS would (test data factory). */
export function buildSaleOp(device: SaleDevice, o: SaleOptions): SyncOperation {
  const occurredAt = o.occurredAt ?? new Date().toISOString();
  const orderId = uuidv7();
  const invoiceId = uuidv7();
  const number = `${device.branchCode}-${device.deviceCode}-${String(o.seq).padStart(6, '0')}`;
  const pricesIncludeTax = o.pricesIncludeTax ?? true;
  const totals = computeTotals({
    currency: 'EGP',
    pricesIncludeTax,
    lines: o.items.map((it, i) => ({
      lineKey: String(i + 1),
      qty: it.qty ?? '1',
      unitPrice: it.unitPrice,
      taxes: it.taxes,
    })),
  });
  const sale: SaleFinalizedV1 = {
    order: {
      id: orderId,
      localNumber: number,
      channel: o.channel ?? 'takeaway',
      openedAt: occurredAt,
      closedAt: occurredAt,
    },
    invoice: {
      id: invoiceId,
      number,
      issuedAt: occurredAt,
      currency: 'EGP',
      pricesIncludeTax,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
    },
    lines: o.items.map((it, i) => {
      const t = totals.lines[i]!;
      return {
        id: childId(invoiceId, `line:${i + 1}`),
        lineNo: i + 1,
        variantId: it.variantId,
        productNameAr: it.nameAr ?? 'صنف',
        productNameEn: it.nameEn ?? 'Item',
        qty: it.qty ?? '1',
        unitPrice: it.unitPrice,
        taxCategoryId: it.taxCategoryId,
        netAmount: t.netAmount,
        taxAmount: t.taxAmount,
        grossAmount: t.grossAmount,
        taxes: t.taxes,
      };
    }),
    payments: [
      {
        id: childId(invoiceId, 'payment:1'),
        paymentMethodId: o.paymentMethodId,
        amount: o.paidAmount ?? totals.total,
        tendered: null,
        changeGiven: null,
        reference: null,
      },
    ],
  };
  o.tamper?.(sale);
  return {
    operation_id: uuidv7(),
    tenant_id: device.tenantId,
    branch_id: device.branchId,
    device_id: device.deviceId,
    operation_type: 'sale.finalized',
    schema_version: 1,
    occurred_at: occurredAt,
    local_seq: o.seq,
    depends_on: [],
    refs: { catalog_version: 1 },
    payload: sale,
  };
}

/** Any operation in its envelope, as a POS would queue it. */
export function envelope(
  device: SaleDevice,
  seq: number,
  type: string,
  payload: unknown,
  occurredAt = new Date().toISOString(),
): SyncOperation {
  return {
    operation_id: uuidv7(),
    tenant_id: device.tenantId,
    branch_id: device.branchId,
    device_id: device.deviceId,
    operation_type: type,
    schema_version: 1,
    occurred_at: occurredAt,
    local_seq: seq,
    depends_on: [],
    refs: {},
    payload,
  };
}

export const pushBody = (ops: SyncOperation[], batchId = uuidv7()) => ({
  protocol: SYNC_PROTOCOL as typeof SYNC_PROTOCOL,
  batch_id: batchId,
  device_time: new Date().toISOString(),
  client: { app_version: '0.1.0-test', local_schema_version: 1 },
  operations: ops,
});
