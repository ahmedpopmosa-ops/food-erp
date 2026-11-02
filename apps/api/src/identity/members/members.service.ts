import { Injectable } from '@nestjs/common';
import type { MemberInviteInput, MemberUpdateInput, PaginationQuery } from '@ros/contracts';
import { membershipStatus } from '@ros/domain';
import { PrismaService, type Tx } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EntitlementsService } from '../../setup/entitlements.service';
import { TokensService } from '../auth/tokens.service';
import { assertCanGrant } from '../roles/roles.service';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors';
import type { TenantContext } from '../../common/auth-context';

type MemberStatus = 'invited' | 'active' | 'disabled';

const memberInclude = {
  user: { select: { id: true, email: true, fullName: true, lastLoginAt: true } },
  role: { select: { id: true, name: true, templateKey: true } },
  branches: { select: { branchId: true } },
} as const;

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
    private readonly tokens: TokensService,
  ) {}

  list(auth: TenantContext, page: PaginationQuery) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const where = { tenantId: auth.tenantId };
      const [items, total] = await Promise.all([
        tx.membership.findMany({
          where,
          include: memberInclude,
          orderBy: { createdAt: 'asc' },
          skip: (page.page - 1) * page.pageSize,
          take: page.pageSize,
        }),
        tx.membership.count({ where }),
      ]);
      return { items: items.map((m) => this.present(m)), page: page.page, pageSize: page.pageSize, total };
    });
  }

  async invite(auth: TenantContext, input: MemberInviteInput) {
    const tenantId = auth.tenantId;
    const result = await this.prisma.withTenant(tenantId, async (tx) => {
      const role = await this.loadGrantableRole(tx, auth, input.roleId);
      await this.assertBranchesGrantable(tx, auth, input.allBranches, input.branchIds);
      await this.entitlements.assertWithinLimit(tx, tenantId, 'limit.users', () =>
        tx.membership.count({ where: { tenantId, status: { not: 'disabled' } } }),
      );

      const user =
        (await tx.user.findUnique({ where: { email: input.email } })) ??
        (await tx.user.create({ data: { email: input.email, fullName: input.fullName } }));
      if (await tx.membership.findFirst({ where: { tenantId, userId: user.id } })) {
        throw conflict('members.alreadyMember', 'This person is already a member');
      }
      const membership = await tx.membership.create({
        data: {
          tenantId,
          userId: user.id,
          roleId: role.id,
          status: user.passwordHash ? 'active' : 'invited',
          allBranches: input.allBranches,
          createdBy: auth.userId,
          updatedBy: auth.userId,
          branches: input.allBranches
            ? undefined
            : { create: input.branchIds.map((branchId) => ({ tenantId, branchId })) },
        },
        include: memberInclude,
      });
      const inviteToken = user.passwordHash ? null : await this.tokens.issue(user.id, 'invite', tx);
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'member.invited',
        entityType: 'membership',
        entityId: membership.id,
        changes: { email: user.email, roleId: role.id, allBranches: input.allBranches, branchIds: input.branchIds },
      });
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { displayName: true } });
      return { membership, inviteToken, email: user.email, tenantName: tenant.displayName };
    });

    // Mail is sent after commit so a rolled-back invitation never e-mails a working link.
    if (result.inviteToken) await this.tokens.sendInvite(result.email, result.inviteToken, result.tenantName);
    else await this.tokens.sendMemberAdded(result.email, result.tenantName);
    return this.present(result.membership);
  }

  update(auth: TenantContext, id: string, input: MemberUpdateInput) {
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const current = await tx.membership.findFirst({ where: { id, tenantId }, include: memberInclude });
      if (!current) throw notFound('members');
      if (current.id === auth.membershipId)
        throw forbidden('members.cannotEditSelf', 'You cannot change your own access');
      if (current.role.templateKey === 'owner' && auth.roleTemplate !== 'owner') {
        throw forbidden('members.ownerProtected', 'Only an owner can change another owner');
      }
      // Changing someone's access requires holding their current permissions too (no demoting your betters).
      const currentPerms = await tx.rolePermission.findMany({ where: { roleId: current.roleId, tenantId } });
      assertCanGrant(
        auth,
        currentPerms.map((p) => p.permissionKey),
      );

      const role = input.roleId ? await this.loadGrantableRole(tx, auth, input.roleId) : current.role;
      if (input.status && input.status !== current.status) {
        if (!membershipStatus.can(current.status as MemberStatus, input.status)) {
          throw badRequest('invalid_state_transition', `Member cannot go from ${current.status} to ${input.status}`);
        }
      }
      const allBranches = input.allBranches ?? current.allBranches;
      const branchIds = input.branchIds ?? current.branches.map((b) => b.branchId);
      if (input.allBranches !== undefined || input.branchIds !== undefined) {
        if (!allBranches && branchIds.length === 0) throw badRequest('validation', 'Choose at least one branch');
        await this.assertBranchesGrantable(tx, auth, allBranches, branchIds);
      }

      const losesOwner =
        current.role.templateKey === 'owner' &&
        current.status === 'active' &&
        (role.templateKey !== 'owner' || input.status === 'disabled');
      if (losesOwner) {
        const owners = await tx.membership.count({
          where: { tenantId, status: 'active', role: { templateKey: 'owner' } },
        });
        if (owners <= 1) throw conflict('members.lastOwner', 'A restaurant must keep at least one active owner');
      }

      await tx.membership.update({
        where: { id },
        data: {
          roleId: role.id,
          status: input.status,
          allBranches,
          updatedBy: auth.userId,
          rowVersion: { increment: 1 },
        },
      });
      if (input.allBranches !== undefined || input.branchIds !== undefined) {
        await tx.membershipBranch.deleteMany({ where: { membershipId: id, tenantId } });
        if (!allBranches)
          await tx.membershipBranch.createMany({
            data: branchIds.map((branchId) => ({ tenantId, membershipId: id, branchId })),
          });
      }
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'member.updated',
        entityType: 'membership',
        entityId: id,
        changes: {
          ...(role.id !== current.roleId ? { roleId: { from: current.roleId, to: role.id } } : {}),
          ...(input.status && input.status !== current.status
            ? { status: { from: current.status, to: input.status } }
            : {}),
          ...(input.allBranches !== undefined || input.branchIds !== undefined
            ? {
                branches: {
                  from: current.allBranches ? 'all' : current.branches.map((b) => b.branchId),
                  to: allBranches ? 'all' : branchIds,
                },
              }
            : {}),
        },
      });
      return this.present(await tx.membership.findFirstOrThrow({ where: { id, tenantId }, include: memberInclude }));
    });
  }

  private async loadGrantableRole(tx: Tx, auth: TenantContext, roleId: string) {
    const role = await tx.role.findFirst({
      where: { id: roleId, tenantId: auth.tenantId },
      include: { rolePermissions: true },
    });
    if (!role) throw badRequest('members.unknownRole', 'Role not found');
    if (role.templateKey === 'owner' && auth.roleTemplate !== 'owner') {
      throw forbidden('members.ownerProtected', 'Only an owner can make someone an owner');
    }
    assertCanGrant(
      auth,
      role.rolePermissions.map((rp) => rp.permissionKey),
    );
    return role;
  }

  /** Branch access can only be granted within the actor's own scope, and only for this tenant's branches. */
  private async assertBranchesGrantable(tx: Tx, auth: TenantContext, allBranches: boolean, branchIds: string[]) {
    if (allBranches && !auth.allBranches)
      throw forbidden('members.branchScope', 'You cannot grant access to all branches');
    if (allBranches) return;
    if (!auth.allBranches && branchIds.some((b) => !auth.branchIds.includes(b))) {
      throw forbidden('members.branchScope', 'You cannot grant access to branches outside your own');
    }
    const found = await tx.branch.count({ where: { tenantId: auth.tenantId, id: { in: branchIds } } });
    if (found !== new Set(branchIds).size) throw badRequest('members.unknownBranch', 'Branch not found');
  }

  private present(m: {
    id: string;
    status: string;
    allBranches: boolean;
    createdAt: Date;
    user: { id: string; email: string; fullName: string; lastLoginAt: Date | null };
    role: { id: string; name: string; templateKey: string | null };
    branches: { branchId: string }[];
  }) {
    return {
      id: m.id,
      status: m.status,
      user: m.user,
      role: m.role,
      allBranches: m.allBranches,
      branchIds: m.branches.map((b) => b.branchId),
      createdAt: m.createdAt,
    };
  }
}
