import { Injectable } from '@nestjs/common';
import type { EmployeeCreateInput, EmployeeUpdateInput } from '@ros/contracts';
import { hashPin } from '@ros/domain';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { AuditService } from '../identity/audit/audit.service';
import { assertCanGrant } from '../identity/roles/roles.service';
import { badRequest, conflict, isUniqueViolation, notFound, staleVersion } from '../common/errors';
import { branchScope, type TenantContext } from '../common/auth-context';
import { config } from '../config';

const select = {
  id: true,
  employeeNo: true,
  fullNameAr: true,
  fullNameEn: true,
  roleId: true,
  status: true,
  rowVersion: true,
  posPinHash: true,
  branches: { select: { branchId: true } },
} as const;

type Row = { posPinHash: string | null; branches: { branchId: string }[] } & Record<string, unknown>;
/** The PIN hash never leaves the API towards people — only devices receive it (pull). */
const present = ({ posPinHash, branches, ...e }: Row) => ({
  ...e,
  hasPin: posPinHash !== null,
  branchIds: branches.map((b) => b.branchId),
});

/** POS staff (minimal Phase 4 slice of the people module): identity, POS role, branches and PIN. */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(auth: TenantContext) {
    const scope = branchScope(auth);
    return this.prisma.withTenant(auth.tenantId, async (tx) =>
      (
        await tx.employee.findMany({
          where: { tenantId: auth.tenantId, ...(scope ? { branches: { some: { branchId: { in: scope } } } } : {}) },
          select,
          orderBy: { employeeNo: 'asc' },
        })
      ).map(present),
    );
  }

  async create(auth: TenantContext, input: EmployeeCreateInput) {
    const tenantId = auth.tenantId;
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        await this.checkRefs(tx, auth, input.roleId, input.branchIds);
        const e = await tx.employee.create({
          data: {
            tenantId,
            employeeNo: input.employeeNo,
            fullNameAr: input.fullNameAr,
            fullNameEn: input.fullNameEn,
            roleId: input.roleId,
            createdBy: auth.userId,
            updatedBy: auth.userId,
            branches: { create: input.branchIds.map((branchId) => ({ tenantId, branchId })) },
          },
          select,
        });
        await this.audit.record(tx, tenantId, this.audit.user(auth), {
          action: 'employee.created',
          entityType: 'employee',
          entityId: e.id,
          changes: { ...input },
        });
        return present(e);
      });
    } catch (err) {
      if (isUniqueViolation(err))
        throw conflict('employees.duplicateNumber', 'An employee with this number already exists');
      throw err;
    }
  }

  update(auth: TenantContext, id: string, input: EmployeeUpdateInput) {
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const current = await this.load(tx, auth, id);
      if (input.roleId || input.branchIds)
        await this.checkRefs(tx, auth, input.roleId ?? current.roleId, input.branchIds ?? []);
      const { rowVersion, branchIds, ...fields } = input;
      const res = await tx.employee.updateMany({
        where: { id, tenantId, rowVersion },
        data: { ...fields, updatedBy: auth.userId, rowVersion: { increment: 1 } },
      });
      if (res.count !== 1) throw staleVersion();
      if (branchIds) {
        await tx.employeeBranch.deleteMany({ where: { employeeId: id, tenantId } });
        await tx.employeeBranch.createMany({
          data: branchIds.map((branchId) => ({ tenantId, employeeId: id, branchId })),
        });
      }
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'employee.updated',
        entityType: 'employee',
        entityId: id,
        changes: { ...input },
      });
      return present(await tx.employee.findUniqueOrThrow({ where: { id }, select }));
    });
  }

  /** Sets the POS PIN. Hashed here; the plain PIN is never stored or logged. */
  async setPin(auth: TenantContext, id: string, pin: string) {
    const hash = await hashPin(pin, config().POS_PIN_ITERATIONS);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      await this.load(tx, auth, id);
      await tx.employee.update({
        where: { id },
        data: { posPinHash: hash, updatedBy: auth.userId, rowVersion: { increment: 1 } },
      });
      await this.audit.record(tx, auth.tenantId, this.audit.user(auth), {
        action: 'employee.pinChanged',
        entityType: 'employee',
        entityId: id,
      });
      return { ok: true };
    });
  }

  private async load(tx: Tx, auth: TenantContext, id: string) {
    const scope = branchScope(auth);
    const e = await tx.employee.findFirst({
      where: { id, tenantId: auth.tenantId, ...(scope ? { branches: { some: { branchId: { in: scope } } } } : {}) },
    });
    if (!e) throw notFound('employees');
    return e;
  }

  /** Role must exist and be grantable by the actor; branches must be this tenant's and within the actor's scope. */
  private async checkRefs(tx: Tx, auth: TenantContext, roleId: string, branchIds: string[]) {
    const role = await tx.role.findFirst({
      where: { id: roleId, tenantId: auth.tenantId },
      include: { rolePermissions: true },
    });
    if (!role) throw badRequest('employees.unknownRole', 'Role not found');
    assertCanGrant(
      auth,
      role.rolePermissions.map((p) => p.permissionKey),
    );
    const scope = branchScope(auth);
    if (scope && branchIds.some((b) => !scope.includes(b))) throw notFound('branches');
    if (
      branchIds.length &&
      (await tx.branch.count({ where: { tenantId: auth.tenantId, id: { in: branchIds } } })) !== new Set(branchIds).size
    ) {
      throw badRequest('employees.unknownBranch', 'Branch not found');
    }
  }
}
