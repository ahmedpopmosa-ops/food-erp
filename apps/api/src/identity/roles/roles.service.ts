import { Injectable } from '@nestjs/common';
import { PERMISSIONS, type Permission, type RoleCreateInput, type RoleUpdateInput } from '@ros/contracts';
import { PrismaService, type Tx } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { conflict, forbidden, isUniqueViolation, notFound, staleVersion } from '../../common/errors';
import type { TenantContext } from '../../common/auth-context';

/**
 * Prevents privilege escalation: a user may only grant (or take away) permissions they hold themselves.
 * Tenant owners hold every permission, so they can manage any role.
 */
export function assertCanGrant(auth: TenantContext, permissions: readonly string[]) {
  const missing = permissions.filter((p) => !auth.permissions.includes(p));
  if (missing.length > 0) {
    throw forbidden('roles.escalation', `You cannot grant permissions you do not have: ${missing.join(', ')}`);
  }
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  catalog() {
    return PERMISSIONS.map((p) => ({ key: p.key, module: p.module, sensitive: p.sensitive }));
  }

  list(auth: TenantContext) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const roles = await tx.role.findMany({
        where: { tenantId: auth.tenantId },
        include: { rolePermissions: true, _count: { select: { memberships: true } } },
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      });
      return roles.map((r) => this.present(r));
    });
  }

  async get(auth: TenantContext, id: string) {
    const role = await this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.role.findFirst({
        where: { id, tenantId: auth.tenantId },
        include: { rolePermissions: true, _count: { select: { memberships: true } } },
      }),
    );
    if (!role) throw notFound('roles');
    return this.present(role);
  }

  async create(auth: TenantContext, input: RoleCreateInput) {
    assertCanGrant(auth, input.permissions);
    const tenantId = auth.tenantId;
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const role = await tx.role.create({
          data: { tenantId, name: input.name, createdBy: auth.userId, updatedBy: auth.userId },
        });
        await this.setPermissions(tx, tenantId, role.id, input.permissions);
        await this.audit.record(tx, tenantId, this.audit.user(auth), {
          action: 'role.created',
          entityType: 'role',
          entityId: role.id,
          changes: { name: role.name, permissions: input.permissions },
        });
        return { id: role.id, name: role.name, permissions: input.permissions, rowVersion: role.rowVersion };
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('roles.duplicateName', 'A role with this name already exists');
      throw err;
    }
  }

  async update(auth: TenantContext, id: string, input: RoleUpdateInput) {
    const tenantId = auth.tenantId;
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const current = await tx.role.findFirst({ where: { id, tenantId }, include: { rolePermissions: true } });
        if (!current) throw notFound('roles');
        if (current.templateKey === 'owner')
          throw forbidden('roles.ownerImmutable', 'The owner role cannot be changed');
        const before = current.rolePermissions.map((rp) => rp.permissionKey);
        if (input.permissions) assertCanGrant(auth, [...new Set([...before, ...input.permissions])]);

        const updated = await tx.role.updateMany({
          where: { id, tenantId, rowVersion: input.rowVersion },
          data: { name: input.name, updatedBy: auth.userId, rowVersion: { increment: 1 } },
        });
        if (updated.count !== 1) throw staleVersion();
        if (input.permissions) {
          await tx.rolePermission.deleteMany({ where: { roleId: id, tenantId } });
          await this.setPermissions(tx, tenantId, id, input.permissions);
        }
        await this.audit.record(tx, tenantId, this.audit.user(auth), {
          action: 'role.updated',
          entityType: 'role',
          entityId: id,
          changes: {
            ...(input.name && input.name !== current.name ? { name: { from: current.name, to: input.name } } : {}),
            ...(input.permissions
              ? {
                  permissionsAdded: input.permissions.filter((p) => !before.includes(p)),
                  permissionsRemoved: before.filter((p) => !input.permissions!.includes(p as Permission)),
                }
              : {}),
          },
        });
        const role = await tx.role.findFirstOrThrow({
          where: { id, tenantId },
          include: { rolePermissions: true, _count: { select: { memberships: true } } },
        });
        return this.present(role);
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('roles.duplicateName', 'A role with this name already exists');
      throw err;
    }
  }

  /** Only unused custom roles can be deleted; system roles and roles with members stay. */
  remove(auth: TenantContext, id: string) {
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const role = await tx.role.findFirst({
        where: { id, tenantId },
        include: { _count: { select: { memberships: true } } },
      });
      if (!role) throw notFound('roles');
      if (role.isSystem) throw forbidden('roles.systemRole', 'System roles cannot be deleted');
      if (role._count.memberships > 0) throw conflict('roles.inUse', 'Move the members of this role first');
      await tx.role.delete({ where: { id } });
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'role.deleted',
        entityType: 'role',
        entityId: id,
        changes: { name: role.name },
      });
      return { ok: true };
    });
  }

  private async setPermissions(tx: Tx, tenantId: string, roleId: string, permissions: readonly string[]) {
    if (permissions.length === 0) return;
    await tx.rolePermission.createMany({
      data: permissions.map((permissionKey) => ({ tenantId, roleId, permissionKey })),
    });
  }

  private present(role: {
    id: string;
    name: string;
    templateKey: string | null;
    isSystem: boolean;
    rowVersion: number;
    rolePermissions: { permissionKey: string }[];
    _count: { memberships: number };
  }) {
    return {
      id: role.id,
      name: role.name,
      templateKey: role.templateKey,
      isSystem: role.isSystem,
      rowVersion: role.rowVersion,
      permissions: role.rolePermissions.map((rp) => rp.permissionKey).sort(),
      memberCount: role._count.memberships,
    };
  }
}
