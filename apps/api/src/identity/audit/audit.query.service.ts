import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuditQuery } from '@ros/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { branchScope, type TenantContext } from '../../common/auth-context';

@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Users limited to some branches see only entries recorded against those branches. */
  list(auth: TenantContext, q: AuditQuery) {
    const scope = branchScope(auth);
    const where: Prisma.AuditLogWhereInput = {
      tenantId: auth.tenantId,
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(scope ? { branchId: { in: scope } } : {}),
    };
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        tx.auditLog.count({ where }),
      ]);
      return { items, page: q.page, pageSize: q.pageSize, total };
    });
  }
}
