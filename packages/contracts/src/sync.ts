import { z } from 'zod';
import { uuid } from './common';
import { channel, discountSpec, moneyString, qtyString, rateString } from './catalog';

/** Versioned sync contract (docs/06-sync-protocol.md). */
export const SYNC_PROTOCOL = 'sync/1';
export const MAX_BATCH_OPS = 200;

export const OPERATION_TYPES = [
  'sale.finalized',
  'cash_session.opened',
  'cash_movement.recorded',
  'cash_session.closed',
  'refund.issued',
  'order.cancelled',
  'kitchen.fired',
  'kitchen.voided',
] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];

const isoInstant = z.string().datetime({ offset: true });

const saleLine = z.object({
  id: uuid,
  lineNo: z.number().int().min(1).max(500),
  variantId: uuid,
  productNameAr: z.string().min(1).max(200),
  productNameEn: z.string().min(1).max(200),
  qty: qtyString,
  unitPrice: moneyString,
  taxCategoryId: uuid,
  netAmount: moneyString,
  taxAmount: moneyString,
  grossAmount: moneyString,
  taxes: z.array(z.object({ taxRateId: uuid, rate: rateString, amount: moneyString })).max(5),
});

const salePayment = z.object({
  id: uuid,
  paymentMethodId: uuid,
  amount: moneyString,
  tendered: moneyString.nullable(),
  changeGiven: moneyString.nullable(),
  reference: z
    .string()
    .max(60)
    // Card numbers are never accepted (doc 05 §6).
    .refine((v) => !/\d{13,19}/.test(v.replace(/[\s-]/g, '')), { message: 'Card numbers must not be sent' })
    .nullable(),
});

/** `sale.finalized` schema_version 1 — a completed, paid sale recorded on a POS. */
export const saleFinalizedV1 = z.object({
  order: z.object({
    id: uuid,
    localNumber: z.string().min(3).max(40),
    channel,
    openedAt: isoInstant,
    closedAt: isoInstant,
  }),
  invoice: z.object({
    id: uuid,
    number: z.string().min(3).max(40),
    issuedAt: isoInstant,
    currency: z.string().regex(/^[A-Z]{3}$/),
    pricesIncludeTax: z.boolean(),
    subtotal: moneyString,
    taxTotal: moneyString,
    total: moneyString,
  }),
  lines: z.array(saleLine).min(1).max(500),
  payments: z.array(salePayment).min(1).max(10),
});
export type SaleFinalizedV1 = z.infer<typeof saleFinalizedV1>;

/** A manager's PIN approval recorded on the device (doc 04 `approvals`). */
const approval = z.object({
  id: uuid,
  action: z.string().min(3).max(60),
  approverEmployeeId: uuid,
  occurredAt: isoInstant,
});
export type Approval = z.infer<typeof approval>;

/** `sale.finalized` v2: v1 plus the operator, the cash session and approvals used. */
export const saleFinalizedV2 = saleFinalizedV1.extend({
  employeeId: uuid,
  cashSessionId: uuid.nullable(),
  approvals: z.array(approval).max(20).default([]),
});
export type SaleFinalizedV2 = z.infer<typeof saleFinalizedV2>;

const taxAmountWithRate = z.object({ taxRateId: uuid, rate: rateString, amount: moneyString });

/**
 * `sale.finalized` v3 (Phase 4b): table and guests, modifiers, line and order discounts, service charge and
 * voided items. All amounts follow `computeOrderTotals` in `@ros/domain`.
 */
export const saleFinalizedV3 = z.object({
  employeeId: uuid,
  cashSessionId: uuid.nullable(),
  approvals: z.array(approval).max(50).default([]),
  order: z.object({
    id: uuid,
    localNumber: z.string().min(3).max(40),
    channel,
    tableId: uuid.nullable(),
    guests: z.number().int().min(1).max(200).nullable(),
    openedAt: isoInstant,
    closedAt: isoInstant,
    discount: discountSpec.nullable(),
    discountReason: z.string().max(200).nullable(),
  }),
  invoice: z.object({
    id: uuid,
    number: z.string().min(3).max(40),
    issuedAt: isoInstant,
    currency: z.string().regex(/^[A-Z]{3}$/),
    pricesIncludeTax: z.boolean(),
    subtotal: moneyString,
    discountTotal: moneyString,
    serviceChargeTotal: moneyString,
    taxTotal: moneyString,
    total: moneyString,
  }),
  serviceCharge: z
    .object({
      rate: rateString,
      netAmount: moneyString,
      taxAmount: moneyString,
      taxes: z.array(taxAmountWithRate).max(5),
    })
    .nullable(),
  lines: z
    .array(
      z.object({
        id: uuid,
        lineNo: z.number().int().min(1).max(500),
        variantId: uuid,
        productNameAr: z.string().min(1).max(200),
        productNameEn: z.string().min(1).max(200),
        qty: qtyString,
        unitPrice: moneyString,
        modifiers: z
          .array(
            z.object({
              modifierId: uuid,
              nameAr: z.string().max(120),
              nameEn: z.string().max(120),
              priceDelta: z.string().regex(/^-?\d{1,9}(\.\d{1,4})?$/),
            }),
          )
          .max(30)
          .default([]),
        taxCategoryId: uuid,
        discount: discountSpec.nullable(),
        netBeforeDiscount: moneyString,
        discountAmount: moneyString,
        netAmount: moneyString,
        taxAmount: moneyString,
        grossAmount: moneyString,
        taxes: z.array(taxAmountWithRate).max(5),
      }),
    )
    .min(1)
    .max(500),
  payments: z.array(salePayment).min(1).max(10),
  voids: z
    .array(
      z.object({
        orderItemId: uuid,
        variantId: uuid,
        productNameEn: z.string().max(200),
        qty: qtyString,
        unitPrice: moneyString,
        wasSentToKitchen: z.boolean(),
        reason: z.string().max(200),
        approvalId: uuid.nullable(),
      }),
    )
    .max(200)
    .default([]),
});
export type SaleFinalizedV3 = z.infer<typeof saleFinalizedV3>;

/** `order.cancelled` v1 — an order abandoned after items reached the kitchen (kept for wastage and audit). */
export const orderCancelledV1 = z.object({
  orderId: uuid,
  localNumber: z.string().min(3).max(40),
  channel,
  tableId: uuid.nullable(),
  employeeId: uuid,
  openedAt: isoInstant,
  cancelledAt: isoInstant,
  reason: z.string().trim().min(2).max(200),
  approval: approval.nullable(),
  items: z
    .array(
      z.object({
        orderItemId: uuid,
        variantId: uuid,
        productNameEn: z.string().max(200),
        qty: qtyString,
        unitPrice: moneyString,
        wasSentToKitchen: z.boolean(),
      }),
    )
    .min(1)
    .max(500),
});
export type OrderCancelledV1 = z.infer<typeof orderCancelledV1>;

/**
 * `kitchen.fired` v1 — items of an open order sent to the kitchen (one "fire"). The server splits them into
 * tickets per kitchen station. Names are snapshots: the kitchen sees what the cashier saw.
 */
export const kitchenFiredV1 = z.object({
  fireId: uuid,
  orderId: uuid,
  /** What the kitchen calls the order: the table label, or channel and a short order reference. */
  label: z.string().trim().min(1).max(40),
  channel,
  tableId: uuid.nullable(),
  employeeId: uuid,
  firedAt: isoInstant,
  items: z
    .array(
      z.object({
        orderItemId: uuid,
        variantId: uuid,
        nameAr: z.string().max(200),
        nameEn: z.string().max(200),
        qty: qtyString,
        modifiers: z
          .array(z.object({ nameAr: z.string().max(120), nameEn: z.string().max(120) }))
          .max(30)
          .default([]),
      }),
    )
    .min(1)
    .max(200),
});
export type KitchenFiredV1 = z.infer<typeof kitchenFiredV1>;

/** `kitchen.voided` v1 — an item already sent to the kitchen was voided (with a manager approval on the POS). */
export const kitchenVoidedV1 = z.object({
  orderId: uuid,
  orderItemId: uuid,
  reason: z.string().trim().min(1).max(200),
  voidedAt: isoInstant,
});
export type KitchenVoidedV1 = z.infer<typeof kitchenVoidedV1>;

export const cashSessionOpenedV1 = z.object({
  id: uuid,
  employeeId: uuid,
  openedAt: isoInstant,
  openingFloat: moneyString,
});
export type CashSessionOpenedV1 = z.infer<typeof cashSessionOpenedV1>;

export const cashMovementRecordedV1 = z.object({
  id: uuid,
  cashSessionId: uuid,
  kind: z.enum(['pay_in', 'pay_out']),
  amount: moneyString,
  reason: z.string().trim().min(2).max(200),
  employeeId: uuid,
  approval: approval.nullable(),
  occurredAt: isoInstant,
});
export type CashMovementRecordedV1 = z.infer<typeof cashMovementRecordedV1>;

export const cashSessionClosedV1 = z.object({
  id: uuid,
  employeeId: uuid,
  closedAt: isoInstant,
  countedCash: moneyString,
  /** What the device computed; the server recomputes from its own records and posts against that. */
  expectedCash: moneyString,
  countedBreakdown: z.record(z.string(), z.number().int().min(0)).default({}),
});
export type CashSessionClosedV1 = z.infer<typeof cashSessionClosedV1>;

export const refundIssuedV1 = z.object({
  id: uuid,
  number: z.string().min(3).max(40),
  invoiceId: uuid,
  issuedAt: isoInstant,
  reason: z.string().trim().min(2).max(200),
  employeeId: uuid,
  cashSessionId: uuid.nullable(),
  approval,
  lines: z
    .array(
      z.object({
        id: uuid,
        invoiceLineId: uuid,
        qty: qtyString,
        netAmount: moneyString,
        taxAmount: moneyString,
        grossAmount: moneyString,
        taxes: z.array(z.object({ taxRateId: uuid, amount: moneyString })).max(5),
      }),
    )
    .min(1)
    .max(500),
  payment: z.object({ id: uuid, paymentMethodId: uuid, amount: moneyString }),
});
export type RefundIssuedV1 = z.infer<typeof refundIssuedV1>;

export const operationSchema = z.object({
  operation_id: uuid,
  tenant_id: uuid,
  branch_id: uuid,
  device_id: uuid,
  operation_type: z.string().max(60),
  schema_version: z.number().int().min(1),
  occurred_at: isoInstant,
  local_seq: z.number().int().min(1),
  depends_on: z.array(uuid).max(20).default([]),
  refs: z
    .object({ catalog_version: z.number().int().min(0).optional() })
    .passthrough()
    .default({}),
  payload: z.unknown(),
});
export type SyncOperation = z.infer<typeof operationSchema>;

export const pushRequestSchema = z.object({
  protocol: z.literal(SYNC_PROTOCOL),
  batch_id: uuid,
  device_time: isoInstant,
  client: z.object({ app_version: z.string().max(40), local_schema_version: z.number().int().min(1) }),
  operations: z.array(z.unknown()).min(1).max(MAX_BATCH_OPS),
});
export type PushRequest = z.infer<typeof pushRequestSchema>;

export type OperationStatus = 'accepted' | 'already_processed' | 'retryable' | 'rejected' | 'blocked';

export interface OperationResult {
  operation_id: string;
  status: OperationStatus;
  server_refs?: Record<string, unknown>;
  error?: { code: string; details?: unknown };
  retry_after_ms?: number;
}

export interface PushResponse {
  batch_id: string;
  server_time: string;
  results: OperationResult[];
  /** Renewed offline license lease (every successful push). */
  lease?: import('./employees').LicenseLease;
}

export const pullQuerySchema = z.object({
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});

export const PULL_ENTITY_TYPES = [
  'branch',
  'tenant_settings',
  'category',
  'product',
  'product_variant',
  'product_price',
  'tax_rate',
  'tax_category',
  'tax_category_rate',
  'payment_method',
  'employee',
  'role',
  'modifier_group',
  'modifier',
  'product_modifier_group',
  'service_area',
  'dining_table',
] as const;
export type PullEntityType = (typeof PULL_ENTITY_TYPES)[number];

export interface PullChange {
  entity_type: PullEntityType;
  op: 'upsert' | 'delete';
  id: string;
  data?: Record<string, unknown>;
}

export interface PullResponse {
  cursor: number;
  next_cursor: number;
  has_more: boolean;
  changes: PullChange[];
}
