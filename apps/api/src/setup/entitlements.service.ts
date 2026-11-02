import { HttpStatus, Injectable } from '@nestjs/common';
import type { Tx } from '../prisma/prisma.service';
import { AppError } from '../common/errors';

const LIVE_STATUSES = ['trialing', 'active', 'past_due', 'grace', 'suspended'];

export type LimitKey = 'limit.branches' | 'limit.users' | 'limit.devices';

/** Plan entitlements of the tenant's live subscription. A limit the plan does not list is treated as 0. */
@Injectable()
export class EntitlementsService {
  /**
   * Serialises concurrent creations for one tenant (lock on its settings row), then checks the limit.
   * Call before inserting the counted record, inside the same transaction.
   */
  async assertWithinLimit(tx: Tx, tenantId: string, key: LimitKey, currentCount: () => Promise<number>) {
    await tx.$queryRaw`SELECT 1 FROM tenant_settings WHERE tenant_id = ${tenantId}::uuid FOR UPDATE`;
    const subscription = await tx.subscription.findFirst({
      where: { tenantId, status: { in: LIVE_STATUSES } },
      include: { plan: { include: { entitlements: { where: { featureKey: key } } } } },
    });
    const entitlement = subscription?.plan.entitlements[0];
    const limit = entitlement && entitlement.enabled ? entitlement.limitValue : 0;
    if (limit === null) return; // unlimited
    const current = await currentCount();
    if (current >= limit) {
      throw new AppError(HttpStatus.FORBIDDEN, 'entitlements.limitReached', `Your plan allows ${limit} for ${key}`, {
        key,
        limit,
        current,
      });
    }
  }
}
