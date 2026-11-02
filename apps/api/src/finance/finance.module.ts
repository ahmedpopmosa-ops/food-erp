import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { FinanceController } from './finance.controller';
import { JournalService } from './journal.service';
import { PeriodsService } from './periods.service';
import { StatementsService } from './statements.service';
import { ReconciliationService } from './reconciliation.service';
import { BankService } from './bank.service';

@Module({
  imports: [AccountingModule, InventoryModule, PurchasingModule],
  controllers: [FinanceController],
  providers: [JournalService, PeriodsService, StatementsService, ReconciliationService, BankService],
  exports: [BankService],
})
export class FinanceModule {}
