import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ModifierGroupCreateInput, TableCreateInput } from '@ros/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../identity/audit/audit.service';
import { badRequest, conflict, isUniqueViolation, notFound } from '../common/errors';
import { canAccessBranch, type TenantContext } from '../common/auth-context';

/** Modifier groups (e.g. "Size", "Extras") and the branch floor plan (areas and tables). */
@Injectable()
export class DineInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  modifierGroups(auth: TenantContext) {
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.modifierGroup.findMany({
        where: { tenantId: auth.tenantId, archivedAt: null },
        include: { modifiers: { where: { archivedAt: null }, orderBy: { sort: 'asc' } } },
        orderBy: { nameEn: 'asc' },
      }),
    );
  }

  createModifierGroup(auth: TenantContext, input: ModifierGroupCreateInput) {
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const group = await tx.modifierGroup.create({
        data: {
          tenantId,
          nameAr: input.nameAr,
          nameEn: input.nameEn,
          minSelect: input.minSelect,
          maxSelect: input.maxSelect,
          modifiers: {
            create: input.modifiers.map((mo, sort) => ({
              tenantId,
              nameAr: mo.nameAr,
              nameEn: mo.nameEn,
              priceDelta: new Prisma.Decimal(mo.priceDelta),
              sort,
            })),
          },
        },
        include: { modifiers: { orderBy: { sort: 'asc' } } },
      });
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'modifier_group.created',
        entityType: 'modifier_group',
        entityId: group.id,
        changes: { ...input },
      });
      return group;
    });
  }

  /** Replaces the modifier groups offered with a product (order = list order). */
  setProductGroups(auth: TenantContext, productId: string, groupIds: string[]) {
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      if (!(await tx.product.findFirst({ where: { id: productId, tenantId } }))) throw notFound('products');
      if (
        (await tx.modifierGroup.count({ where: { tenantId, id: { in: groupIds }, archivedAt: null } })) !==
        new Set(groupIds).size
      ) {
        throw badRequest('products.unknownModifierGroup', 'Modifier group not found');
      }
      await tx.productModifierGroup.deleteMany({ where: { productId, tenantId } });
      await tx.productModifierGroup.createMany({
        data: groupIds.map((groupId, sort) => ({ tenantId, productId, groupId, sort })),
      });
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'product.modifierGroupsSet',
        entityType: 'product',
        entityId: productId,
        changes: { groupIds },
      });
      return { productId, groupIds };
    });
  }

  tables(auth: TenantContext, branchId: string) {
    if (!canAccessBranch(auth, branchId)) throw notFound('branches');
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      if (!(await tx.branch.findFirst({ where: { id: branchId, tenantId: auth.tenantId } })))
        throw notFound('branches');
      return tx.serviceArea.findMany({
        where: { branchId },
        include: { tables: { orderBy: { label: 'asc' } } },
        orderBy: { sort: 'asc' },
      });
    });
  }

  /** Adds a table; its service area is found or created by name. */
  async createTable(auth: TenantContext, branchId: string, input: TableCreateInput) {
    if (!canAccessBranch(auth, branchId)) throw notFound('branches');
    const tenantId = auth.tenantId;
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        if (!(await tx.branch.findFirst({ where: { id: branchId, tenantId } }))) throw notFound('branches');
        const area =
          (await tx.serviceArea.findFirst({ where: { branchId, nameEn: input.areaNameEn } })) ??
          (await tx.serviceArea.create({
            data: { tenantId, branchId, nameAr: input.areaNameAr, nameEn: input.areaNameEn },
          }));
        const table = await tx.diningTable.create({
          data: { tenantId, branchId, serviceAreaId: area.id, label: input.label, seats: input.seats },
        });
        await this.audit.record(tx, tenantId, this.audit.user(auth), {
          action: 'table.created',
          entityType: 'dining_table',
          entityId: table.id,
          branchId,
          changes: { ...input },
        });
        return table;
      });
    } catch (err) {
      if (isUniqueViolation(err))
        throw conflict('tables.duplicateLabel', 'A table with this label already exists in the branch');
      throw err;
    }
  }
}
