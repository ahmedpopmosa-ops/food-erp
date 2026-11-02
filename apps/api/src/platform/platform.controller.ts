import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import {
  loginSchema,
  tenantOnboardSchema,
  tenantStatusChangeSchema,
  type LoginInput,
  type TenantOnboardInput,
} from '@ros/contracts';
import { PlatformService } from './platform.service';
import { PlatformSessionsService } from './platform-sessions.service';
import { OnboardingService } from './onboarding.service';
import { AppRequest, Operator, PlatformAccess, Public, type PlatformContext } from '../common/auth-context';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../common/zod';
import { config, PLATFORM_COOKIE_PATH, PLATFORM_CSRF_COOKIE, PLATFORM_SESSION_COOKIE } from '../config';

const tenantListQuery = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

@ApiTags('platform')
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(
    private readonly platform: PlatformService,
    private readonly sessions: PlatformSessionsService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiZodBody(loginSchema)
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.platform.login(body.email, body.password, {
      ip: req.ip,
      userAgent: req.header('user-agent'),
      requestId: req.id,
    });
    // Scoped to the platform path: the cookie is never sent to tenant routes, and vice versa.
    const base = {
      sameSite: 'strict' as const,
      secure: config().COOKIE_SECURE,
      path: PLATFORM_COOKIE_PATH,
      expires: session.expiresAt,
    };
    res.cookie(PLATFORM_SESSION_COOKIE, session.token, { ...base, httpOnly: true });
    res.cookie(PLATFORM_CSRF_COOKIE, session.csrfToken, { ...base, httpOnly: false });
    return { ok: true };
  }

  @PlatformAccess()
  @Post('logout')
  @HttpCode(200)
  async logout(@Operator() op: PlatformContext, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(op.sessionId);
    res.clearCookie(PLATFORM_SESSION_COOKIE, { path: PLATFORM_COOKIE_PATH });
    res.clearCookie(PLATFORM_CSRF_COOKIE, { path: PLATFORM_COOKIE_PATH });
    return { ok: true };
  }

  @PlatformAccess()
  @Get('me')
  me(@Operator() op: PlatformContext) {
    return { id: op.platformUserId, email: op.email, fullName: op.fullName, role: op.role };
  }
}

@ApiTags('platform')
@Controller('platform')
export class PlatformTenantsController {
  constructor(
    private readonly platform: PlatformService,
    private readonly onboarding: OnboardingService,
  ) {}

  @PlatformAccess()
  @Get('plans')
  plans() {
    return this.platform.listPlans();
  }

  @PlatformAccess()
  @Get('tenants')
  @ApiZodQuery(tenantListQuery)
  tenants(@Query(new ZodPipe(tenantListQuery)) q: z.infer<typeof tenantListQuery>) {
    return this.platform.listTenants(q);
  }

  @PlatformAccess()
  @Get('tenants/:id')
  tenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.getTenant(id);
  }

  @PlatformAccess('support')
  @Post('tenants')
  @ApiZodBody(tenantOnboardSchema)
  onboard(@Operator() op: PlatformContext, @Body(new ZodPipe(tenantOnboardSchema)) body: TenantOnboardInput) {
    return this.onboarding.onboard(op, body);
  }

  @PlatformAccess('billing')
  @Post('tenants/:id/suspend')
  @HttpCode(200)
  @ApiZodBody(tenantStatusChangeSchema)
  suspend(
    @Operator() op: PlatformContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(tenantStatusChangeSchema)) body: { reason: string },
  ) {
    return this.platform.changeStatus(op, id, 'suspended', body.reason);
  }

  @PlatformAccess('billing')
  @Post('tenants/:id/reactivate')
  @HttpCode(200)
  @ApiZodBody(tenantStatusChangeSchema)
  reactivate(
    @Operator() op: PlatformContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(tenantStatusChangeSchema)) body: { reason: string },
  ) {
    return this.platform.changeStatus(op, id, 'active', body.reason);
  }
}
