import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { LeaseService } from './lease.service';

@Module({
  controllers: [DevicesController],
  providers: [DevicesService, LeaseService],
  exports: [DevicesService, LeaseService],
})
export class DevicesModule {}
