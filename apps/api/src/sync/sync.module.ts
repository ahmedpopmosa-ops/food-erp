import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SaleFinalizedHandler } from './sale.handler';
import { CashMovementHandler, CashSessionClosedHandler, CashSessionOpenedHandler } from './cash.handlers';
import { RefundIssuedHandler } from './refund.handler';
import { OrderCancelledHandler } from './order-cancelled.handler';
import { ApprovalsService } from './approvals.service';
import { KitchenFiredHandler, KitchenVoidedHandler } from '../kitchen/kitchen.handlers';
import { AccountingModule } from '../accounting/accounting.module';
import { DevicesModule } from '../devices/devices.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [AccountingModule, DevicesModule, InventoryModule],
  controllers: [SyncController],
  providers: [
    SyncService,
    ApprovalsService,
    SaleFinalizedHandler,
    CashSessionOpenedHandler,
    CashMovementHandler,
    CashSessionClosedHandler,
    RefundIssuedHandler,
    OrderCancelledHandler,
    KitchenFiredHandler,
    KitchenVoidedHandler,
  ],
})
export class SyncModule {}
