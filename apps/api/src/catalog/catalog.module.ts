import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CatalogSetupService } from './catalog-setup.service';
import { DineInController } from './dine-in.controller';
import { DineInService } from './dine-in.service';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [AccountingModule],
  controllers: [CatalogController, DineInController],
  providers: [CatalogService, CatalogSetupService, DineInService],
  exports: [CatalogSetupService],
})
export class CatalogModule {}
