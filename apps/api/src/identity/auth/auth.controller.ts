import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  switchTenantSchema,
  type LoginInput,
  type PasswordResetConfirmInput,
} from '@ros/contracts';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';
import { AppRequest, Authenticated, AuthContext, CurrentUser, Public } from '../../common/auth-context';
import { ApiZodBody, ZodPipe } from '../../common/zod';
import { config, CSRF_COOKIE, SESSION_COOKIE } from '../../config';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
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
    const session = await this.auth.login(body, { ip: req.ip, userAgent: req.header('user-agent'), requestId: req.id });
    const base = { sameSite: 'lax' as const, secure: config().COOKIE_SECURE, path: '/', expires: session.expiresAt };
    res.cookie(SESSION_COOKIE, session.token, { ...base, httpOnly: true });
    // Readable by the web app and echoed in the x-csrf-token header (double-submit).
    res.cookie(CSRF_COOKIE, session.csrfToken, { ...base, httpOnly: false });
    return { ok: true };
  }

  @Authenticated()
  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() auth: AuthContext, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(auth.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Authenticated()
  @Get('me')
  me(@CurrentUser() auth: AuthContext) {
    return this.auth.me(auth);
  }

  @Authenticated()
  @Post('switch-tenant')
  @HttpCode(200)
  @ApiZodBody(switchTenantSchema)
  async switchTenant(
    @CurrentUser() auth: AuthContext,
    @Body(new ZodPipe(switchTenantSchema)) body: { tenantId: string },
  ) {
    await this.auth.switchTenant(auth, body.tenantId);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password-reset/request')
  @HttpCode(202)
  @ApiZodBody(passwordResetRequestSchema)
  async requestReset(@Body(new ZodPipe(passwordResetRequestSchema)) body: { email: string }) {
    await this.auth.requestPasswordReset(body.email);
    return { ok: true };
  }

  /** Also used to accept an invitation (the link carries an invite token). */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password-reset/confirm')
  @HttpCode(200)
  @ApiZodBody(passwordResetConfirmSchema)
  async confirmReset(@Body(new ZodPipe(passwordResetConfirmSchema)) body: PasswordResetConfirmInput) {
    await this.auth.confirmPasswordReset(body);
    return { ok: true };
  }
}
