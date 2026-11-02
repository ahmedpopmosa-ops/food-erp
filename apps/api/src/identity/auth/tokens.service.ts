import { Inject, Injectable } from '@nestjs/common';
import { PrismaService, type Tx } from '../../prisma/prisma.service';
import { randomToken, sha256 } from '../../common/crypto';
import { MAILER, type Mailer } from '../../common/mailer';
import { config } from '../../config';

const TTL_MS = { reset: 30 * 60_000, invite: 7 * 24 * 3600_000 } as const;

/** Single-use, hashed, expiring tokens for password reset and invitation links. */
@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  /** Issues a token (invalidating earlier unused tokens of the same purpose) and returns the plain value. */
  async issue(userId: string, purpose: 'reset' | 'invite', tx: Tx | PrismaService = this.prisma): Promise<string> {
    const token = randomToken();
    await tx.passwordResetToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
    await tx.passwordResetToken.create({
      data: { userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TTL_MS[purpose]) },
    });
    return token;
  }

  link(path: 'reset-password' | 'accept-invite', token: string) {
    return `${config().APP_BASE_URL}/${path}?token=${encodeURIComponent(token)}`;
  }

  async sendInvite(email: string, token: string, tenantName: string) {
    await this.mailer.send({
      to: email,
      kind: 'invite',
      subject: `You are invited to ${tenantName} on RestaurantOS`,
      text: `Set your password to join ${tenantName}: ${this.link('accept-invite', token)}\nThe link expires in 7 days.`,
    });
  }

  async sendReset(email: string, token: string) {
    await this.mailer.send({
      to: email,
      kind: 'password_reset',
      subject: 'Reset your RestaurantOS password',
      text: `Reset your password: ${this.link('reset-password', token)}\nThe link expires in 30 minutes. If you did not ask for this, ignore this e-mail.`,
    });
  }

  async sendMemberAdded(email: string, tenantName: string) {
    await this.mailer.send({
      to: email,
      kind: 'member_added',
      subject: `You now have access to ${tenantName}`,
      text: `Your RestaurantOS account was added to ${tenantName}. Sign in with your existing password.`,
    });
  }
}
