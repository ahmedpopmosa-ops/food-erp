import { Injectable } from '@nestjs/common';
import type { BranchCreateInput, BranchUpdateInput } from '@ros/contracts';
import { branchStatus } from '@ros/domain';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, diff } from '../identity/audit/audit.service';
import { EntitlementsService } from './entitlements.service';
import { badRequest, conflict, forbidden, isUniqueViolation, notFound, staleVersion } from '../common/errors';
import { branchScope, canAccessBranch, type TenantContext } from '../common/auth-context';

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  list(auth: TenantContext) {
    const scope = branchScope(auth);
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.branch.findMany({
        where: { tenantId: auth.tenantId, ...(scope ? { id: { in: scope } } : {}) },
        orderBy: { code: 'asc' },
      }),
    );
  }

  async get(auth: TenantContext, id: string) {
    if (!canAccessBranch(auth, id)) throw notFound('branches');
    const branch = await this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.branch.findFirst({
        where: { id, tenantId: auth.tenantId },
        include: { warehouses: { orderBy: { code: 'asc' } } },
      }),
    );
    if (!branch) throw notFound('branches');
    return branch;
  }

  /** Creates the branch and its main warehouse. Needs all-branch access and a free plan slot. */
  async create(auth: TenantContext, input: BranchCreateInput) {
    if (!auth.allBranches)
      throw forbidden('branches.allBranchesRequired', 'Only users with access to all branches can add branches');
    const tenantId = auth.tenantId;
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        await this.entitlements.assertWithinLimit(tx, tenantId, 'limit.branches', () =>
          tx.branch.count({ where: { tenantId, status: 'active' } }),
        );
        const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
        const branch = await tx.branch.create({
          data: {
            tenantId,
            code: input.code,
            nameAr: input.nameAr,
            nameEn: input.nameEn,
            timezone: input.timezone ?? tenant.timezone,
            currencyCode: tenant.baseCurrency,
            address: input.address,
            phone: input.phone,
            taxRegistrationNo: input.taxRegistrationNo,
            createdBy: auth.userId,
            updatedBy: auth.userId,
          },
        });
        await tx.warehouse.create({
          data: {
            tenantId,
            branchId: branch.id,
            code: `${branch.code}-MAIN`,
            name: `${branch.nameEn} main store`,
            kind: 'main',
          },
        });
        await this.audit.record(tx, tenantId, this.audit.user(auth), {
          action: 'branch.created',
          entityType: 'branch',
          entityId: branch.id,
          branchId: branch.id,
          changes: { code: branch.code, nameAr: branch.nameAr, nameEn: branch.nameEn, timezone: branch.timezone },
        });
        return branch;
      });
    } catch (err) {
      if (isUniqueViolation(err))
        throw conflict('branches.duplicateCode', 'A branch or warehouse with this code already exists');
      throw err;
    }
  }

  async update(auth: TenantContext, id: string, input: BranchUpdateInput) {
    if (!canAccessBranch(auth, id)) throw notFound('branches');
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const current = await tx.branch.findFirst({ where: { id, tenantId } });
      if (!current) throw notFound('branches');
      if (
        input.status &&
        input.status !== current.status &&
        !branchStatus.can(current.status as 'active' | 'closed', input.status)
      ) {
        throw badRequest('invalid_state_transition', `Branch cannot go from ${current.status} to ${input.status}`);
      }
      const { rowVersion, ...fields } = input;
      const result = await tx.branch.updateMany({
        where: { id, tenantId, rowVersion },
        data: { ...fields, updatedBy: auth.userId, rowVersion: { increment: 1 } },
      });
      if (result.count !== 1) throw staleVersion();
      const updated = await tx.branch.findFirstOrThrow({ where: { id, tenantId } });
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'branch.updated',
        entityType: 'branch',
        entityId: id,
        branchId: id,
        changes: diff(current as unknown as Record<string, unknown>, fields),
      });
      return updated;
    });
  }
}
