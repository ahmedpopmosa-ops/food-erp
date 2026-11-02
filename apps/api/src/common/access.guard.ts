import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, type Permission, type PlatformRole } from '@ros/contracts';
import {
  AppRequest,
  AUTHENTICATED,
  DEVICE_ACCESS,
  IS_PUBLIC,
  PLATFORM_ROLES,
  REQUIRED_PERMISSIONS,
} from './auth-context';
import { AppError, forbidden, unauthorized } from './errors';
import { matchesHash } from './crypto';
import { SessionsService } from '../identity/auth/sessions.service';
import { PlatformSessionsService } from '../platform/platform-sessions.service';
import { DevicesService } from '../devices/devices.service';
import { CSRF_HEADER, PLATFORM_SESSION_COOKIE, SESSION_COOKIE } from '../config';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Single global access decision, in order: route classification → session → CSRF (double-submit on
 * writes) → tenant state → permissions. Tenant and operator sessions use different cookies and are never
 * accepted for each other's routes. A route without an access decorator is denied.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
    private readonly platformSessions: PlatformSessionsService,
    private readonly devices: DevicesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const meta = <T>(key: string) => this.reflector.getAllAndOverride<T | undefined>(key, targets);
    if (meta<boolean>(IS_PUBLIC)) return true;

    const req = context.switchToHttp().getRequest<AppRequest>();
    const platformRoles = meta<PlatformRole[]>(PLATFORM_ROLES);
    if (platformRoles) return this.platformAccess(req, platformRoles);
    if (meta<boolean>(DEVICE_ACCESS)) return this.deviceAccess(req);

    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw unauthorized();
    const resolved = await this.sessions.resolve(token);
    if (!resolved) throw unauthorized('auth.sessionExpired');
    this.checkCsrf(req, resolved.csrfTokenHash);
    req.auth = { ...resolved.auth, ip: req.ip, requestId: req.id };

    if (meta<boolean>(AUTHENTICATED)) return true;

    const required = meta<Permission[]>(REQUIRED_PERMISSIONS);
    if (!required) throw forbidden('auth.routeNotClassified', 'This route has no access rule');

    const auth = req.auth;
    if (!auth.tenantId) throw forbidden('auth.noTenant', 'No active restaurant for this session');
    if (auth.tenantStatus === 'suspended' && !SAFE_METHODS.has(req.method)) {
      throw forbidden('tenant.suspended', 'This account is suspended; data is read-only');
    }
    if (!hasPermission(auth.permissions, required)) throw forbidden();
    return true;
  }

  private async platformAccess(req: AppRequest, roles: PlatformRole[]): Promise<boolean> {
    const token = req.cookies?.[PLATFORM_SESSION_COOKIE];
    if (!token) throw unauthorized();
    const resolved = await this.platformSessions.resolve(token);
    if (!resolved) throw unauthorized('auth.sessionExpired');
    this.checkCsrf(req, resolved.csrfTokenHash);
    req.platform = { ...resolved.platform, ip: req.ip, requestId: req.id };
    const role = resolved.platform.role;
    if (roles.length > 0 && role !== 'owner' && !roles.includes(role)) throw forbidden();
    return true;
  }

  /** Bearer access token of a paired device. No cookies, so no CSRF exposure. */
  private async deviceAccess(req: AppRequest): Promise<boolean> {
    const header = req.header('authorization') ?? '';
    const match = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(header);
    if (!match) throw unauthorized('devices.invalidToken');
    const result = await this.devices.authenticate(match[1]!);
    if ('error' in result) {
      if (result.error === 'device_disabled') throw forbidden('device_disabled', 'This device is disabled');
      throw unauthorized(result.error);
    }
    if (result.tenantStatus === 'suspended') {
      throw new AppError(
        HttpStatus.PAYMENT_REQUIRED,
        'subscription_suspended',
        'The subscription is suspended; operations are kept on the device',
      );
    }
    if (result.tenantStatus === 'closed') throw forbidden('tenant.closed', 'This account is closed');
    req.device = { ...result.device, ip: req.ip, requestId: req.id };
    return true;
  }

  private checkCsrf(req: AppRequest, csrfTokenHash: string) {
    if (SAFE_METHODS.has(req.method)) return;
    const header = req.header(CSRF_HEADER) ?? '';
    if (!header || !matchesHash(header, csrfTokenHash)) throw forbidden('auth.csrf', 'Missing or invalid CSRF token');
  }
}
