import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  deviceCreateSchema,
  devicePairSchema,
  deviceRefreshSchema,
  type DeviceCreateInput,
  type DevicePairInput,
  type DeviceRefreshInput,
} from '@ros/contracts';
import { DevicesService } from './devices.service';
import { AppRequest, Public, RequirePermissions, Tenant, type TenantContext } from '../common/auth-context';
import { ApiZodBody, ZodPipe } from '../common/zod';

@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @RequirePermissions('setup.devices.manage')
  @Get()
  list(@Tenant() auth: TenantContext) {
    return this.devices.list(auth);
  }

  @RequirePermissions('setup.devices.manage')
  @Post()
  @ApiZodBody(deviceCreateSchema)
  create(@Tenant() auth: TenantContext, @Body(new ZodPipe(deviceCreateSchema)) body: DeviceCreateInput) {
    return this.devices.create(auth, body);
  }

  @RequirePermissions('setup.devices.manage')
  @Post(':id/pairing-code')
  newPairingCode(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.newPairingCode(auth, id);
  }

  @RequirePermissions('setup.devices.manage')
  @Post(':id/disable')
  @HttpCode(200)
  disable(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.disable(auth, id);
  }

  /** Called by the POS with the code shown in the dashboard. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('pair')
  @HttpCode(200)
  @ApiZodBody(devicePairSchema)
  pair(@Body(new ZodPipe(devicePairSchema)) body: DevicePairInput, @Req() req: AppRequest) {
    return this.devices.pair(body, { ip: req.ip });
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('token')
  @HttpCode(200)
  @ApiZodBody(deviceRefreshSchema)
  refresh(@Body(new ZodPipe(deviceRefreshSchema)) body: DeviceRefreshInput) {
    return this.devices.refresh(body);
  }
}
