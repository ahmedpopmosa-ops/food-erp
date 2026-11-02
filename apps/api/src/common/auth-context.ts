import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission, PlatformRole } from '@ros/contracts';
import type { Request } from 'express';

/** Resolved identity of a tenant-side request (set by AccessGuard). */
export interface AuthContext {
  sessionId: string;
  userId: string;
  email: string;
  fullName: string;
  locale: string;
  /** null when the user has no usable membership (all disabled, tenant closed). */
  tenantId: string | null;
  tenantStatus: string | null;
  membershipId: string | null;
  roleId: string | null;
  roleTemplate: string | null;
  permissions: string[];
  allBranches: boolean;
  branchIds: string[];
  ip?: string;
  requestId?: string;
}

/** AuthContext once AccessGuard has guaranteed an active tenant membership. */
export type TenantContext = AuthContext & { tenantId: string; membershipId: string; roleId: string };

/** Resolved identity of an operator-console request. */
export interface PlatformContext {
  sessionId: string;
  platformUserId: string;
  email: string;
  fullName: string;
  role: PlatformRole;
  ip?: string;
  requestId?: string;
}

export type AppRequest = Request & {
  auth?: AuthContext;
  platform?: PlatformContext;
  device?: DeviceContext;
  id?: string;
};

// Every route must declare exactly one access rule; AccessGuard denies unclassified routes.
export const IS_PUBLIC = 'access:public';
export const AUTHENTICATED = 'access:authenticated';
export const REQUIRED_PERMISSIONS = 'access:permissions';
export const PLATFORM_ROLES = 'access:platform';
export const DEVICE_ACCESS = 'access:device';

/** Identity of a paired POS device (Bearer access token, ADR-0009). */
export interface DeviceContext {
  deviceId: string;
  tenantId: string;
  branchId: string;
  deviceCode: string;
  branchCode: string;
  ip?: string;
  requestId?: string;
}

/** Route for paired POS devices (sync); people's session cookies are not accepted. */
export const DeviceAccess = () => SetMetadata(DEVICE_ACCESS, true);

export const Device = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): DeviceContext => ctx.switchToHttp().getRequest<AppRequest>().device!,
);

/** No session required (login, password reset, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Any signed-in user, even without an active tenant (me, logout, switch tenant). */
export const Authenticated = () => SetMetadata(AUTHENTICATED, true);

/** Signed-in member of the active tenant holding every listed permission. */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(REQUIRED_PERMISSIONS, permissions);

/** Operator console route; with no roles listed any operator may call it (`owner` may call every route). */
export const PlatformAccess = (...roles: PlatformRole[]) => SetMetadata(PLATFORM_ROLES, roles);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => ctx.switchToHttp().getRequest<AppRequest>().auth!,
);

export const Tenant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TenantContext =>
    ctx.switchToHttp().getRequest<AppRequest>().auth as TenantContext,
);

export const Operator = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): PlatformContext => ctx.switchToHttp().getRequest<AppRequest>().platform!,
);

/** Branch ids the user may act on, or null for all branches. */
export const branchScope = (auth: AuthContext): string[] | null => (auth.allBranches ? null : auth.branchIds);

export const canAccessBranch = (auth: AuthContext, branchId: string) =>
  auth.allBranches || auth.branchIds.includes(branchId);
