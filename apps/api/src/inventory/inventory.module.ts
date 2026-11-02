import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ConsumptionService } from './consumption.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { LedgerService } from './ledger.service';

@Module({
  imports: [AccountingModule],
  controllers: [InventoryController],
  providers: [InventoryService, LedgerService, ConsumptionService],
  exports: [LedgerService, ConsumptionService, InventoryService],
})
export class InventoryModule {}
