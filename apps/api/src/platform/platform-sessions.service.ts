import { Injectable } from '@nestjs/common';
import type { PlatformRole } from '@ros/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { randomToken, sha256 } from '../common/crypto';
import type { PlatformContext } from '../common/auth-context';
import { config } from '../config';

const HOUR = 3600_000;
/** Operator sessions are shorter than tenant sessions: 2 h idle, 12 h absolute. */
const IDLE_HOURS = 2;
const ABSOLUTE_HOURS = 12;

@Injectable()
export class PlatformSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(platformUserId: string, meta: { ip?: string; userAgent?: string }) {
    const token = randomToken();
    const csrfToken = randomToken();
    const now = Date.now();
    const expiresAt = new Date(now + Math.min(ABSOLUTE_HOURS, config().SESSION_ABSOLUTE_HOURS) * HOUR);
    await this.prisma.withPlatform((tx) =>
      tx.platformSession.create({
        data: {
          platformUserId,
          tokenHash: sha256(token),
          csrfTokenHash: sha256(csrfToken),
          ip: meta.ip,
          userAgent: meta.userAgent?.slice(0, 300),
          idleExpiresAt: new Date(now + IDLE_HOURS * HOUR),
          expiresAt,
        },
      }),
    );
    return { token, csrfToken, expiresAt };
  }

  resolve(token: string): Promise<{ platform: PlatformContext; csrfTokenHash: string } | null> {
    return this.prisma.withPlatform(async (tx) => {
      const session = await tx.platformSession.findUnique({
        where: { tokenHash: sha256(token) },
        include: { platformUser: true },
      });
      if (!session) return null;
      const now = Date.now();
      if (
        session.expiresAt.getTime() <= now ||
        session.idleExpiresAt.getTime() <= now ||
        session.platformUser.disabledAt
      ) {
        await tx.platformSession.deleteMany({ where: { id: session.id } });
        return null;
      }
      await tx.platformSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now), idleExpiresAt: new Date(now + IDLE_HOURS * HOUR) },
      });
      return {
        csrfTokenHash: session.csrfTokenHash,
        platform: {
          sessionId: session.id,
          platformUserId: session.platformUserId,
          email: session.platformUser.email,
          fullName: session.platformUser.fullName,
          role: session.platformUser.role as PlatformRole,
        },
      };
    });
  }

  async revoke(sessionId: string) {
    await this.prisma.withPlatform((tx) => tx.platformSession.deleteMany({ where: { id: sessionId } }));
  }
}
