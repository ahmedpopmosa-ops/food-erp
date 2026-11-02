import { Module } from '@nestjs/common';
import { BranchesController, SettingsController } from './setup.controller';
import { BranchesService } from './branches.service';
import { SettingsService } from './settings.service';

@Module({
  controllers: [BranchesController, SettingsController],
  providers: [BranchesService, SettingsService],
})
export class SetupModule {}
