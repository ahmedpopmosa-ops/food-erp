import { Injectable } from '@nestjs/common';
import { kitchenFiredV1, kitchenVoidedV1, type SyncOperation } from '@ros/contracts';
import type { Tx } from '../prisma/prisma.service';
import type { DeviceContext } from '../common/auth-context';
import { parseOrReject, type OperationHandler } from '../sync/sync.errors';
import { fireTickets, voidTicketItem } from './kitchen.tickets';

/** `kitchen.fired` v1 — creates the station tickets of one firing (doc 06 §4). */
@Injectable()
export class KitchenFiredHandler implements OperationHandler {
  readonly type = 'kitchen.fired';
  readonly versions = [1];

  async handle(tx: Tx, device: DeviceContext, op: SyncOperation) {
    const p = parseOrReject(kitchenFiredV1, op.payload);
    const tickets = await fireTickets(tx, device, p);
    return { kitchen_ticket_ids: tickets };
  }
}

/** `kitchen.voided` v1 — strikes a sent item on the kitchen screen. An unknown item is accepted as a no-op. */
@Injectable()
export class KitchenVoidedHandler implements OperationHandler {
  readonly type = 'kitchen.voided';
  readonly versions = [1];

  async handle(tx: Tx, device: DeviceContext, op: SyncOperation) {
    const p = parseOrReject(kitchenVoidedV1, op.payload);
    const voided = await voidTicketItem(tx, device.tenantId, p.orderItemId, p.reason, new Date(p.voidedAt), {
      type: 'device',
      id: device.deviceId,
    });
    return { kitchen_items_voided: voided };
  }
}
