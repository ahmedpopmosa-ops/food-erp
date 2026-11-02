import { Module } from '@nestjs/common';
import { PlatformAuthController, PlatformTenantsController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformSessionsService } from './platform-sessions.service';
import { OnboardingService } from './onboarding.service';
import { AccountingModule } from '../accounting/accounting.module';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [AccountingModule, CatalogModule],
  controllers: [PlatformAuthController, PlatformTenantsController],
  providers: [PlatformService, PlatformSessionsService, OnboardingService],
  exports: [PlatformSessionsService, OnboardingService],
})
export class PlatformModule {}
