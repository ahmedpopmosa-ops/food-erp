import { Controller, Get, HttpStatus, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma/prisma.service';
import { Public } from './common/auth-context';
import { AppError } from './common/errors';

@ApiTags('health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Process is up (liveness probe). */
  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Dependencies reachable (readiness probe). Redis joins this check when the worker is introduced. */
  @Public()
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'health.databaseUnavailable', 'Database unavailable');
    }
    return { status: 'ok', checks: { database: 'ok' } };
  }
}
