import { Injectable } from '@nestjs/common';
import type { SettingsUpdateInput } from '@ros/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, diff } from '../identity/audit/audit.service';
import { badRequest, notFound, staleVersion } from '../common/errors';
import type { TenantContext } from '../common/auth-context';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(auth: TenantContext) {
    const settings = await this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.tenantSettings.findUnique({ where: { tenantId: auth.tenantId } }),
    );
    if (!settings) throw notFound('settings');
    return settings;
  }

  update(auth: TenantContext, input: SettingsUpdateInput) {
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const current = await tx.tenantSettings.findUnique({ where: { tenantId } });
      if (!current) throw notFound('settings');
      const { rowVersion, ...fields } = input;
      if (
        fields.serviceChargeTaxCategoryId &&
        !(await tx.taxCategory.findFirst({ where: { id: fields.serviceChargeTaxCategoryId, tenantId } }))
      ) {
        throw badRequest('settings.unknownTaxCategory', 'Tax category not found');
      }
      const result = await tx.tenantSettings.updateMany({
        where: { tenantId, rowVersion },
        data: { ...fields, updatedBy: auth.userId, rowVersion: { increment: 1 } },
      });
      if (result.count !== 1) throw staleVersion();
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'settings.updated',
        entityType: 'tenant_settings',
        entityId: tenantId,
        changes: diff(current as unknown as Record<string, unknown>, fields),
      });
      return tx.tenantSettings.findUniqueOrThrow({ where: { tenantId } });
    });
  }
}
