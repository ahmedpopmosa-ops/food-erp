import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { pullQuerySchema, pushRequestSchema, type PushRequest } from '@ros/contracts';
import { SyncService } from './sync.service';
import { Device, DeviceAccess, type DeviceContext } from '../common/auth-context';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../common/zod';

@ApiTags('sync')
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /** Always 200 when the batch parses; each operation carries its own status (docs/06 §3). */
  @DeviceAccess()
  @Post('push')
  @HttpCode(200)
  @ApiZodBody(pushRequestSchema)
  push(@Device() device: DeviceContext, @Body(new ZodPipe(pushRequestSchema)) body: PushRequest) {
    return this.sync.push(device, body);
  }

  @DeviceAccess()
  @Get('pull')
  @ApiZodQuery(pullQuerySchema)
  pull(@Device() device: DeviceContext, @Query(new ZodPipe(pullQuerySchema)) q: { cursor: number; limit: number }) {
    return this.sync.pull(device, q.cursor, q.limit);
  }
}
