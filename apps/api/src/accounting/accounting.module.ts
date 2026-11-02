import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { PostingService } from './posting.service';
import { AccountingSetupService } from './accounting-setup.service';

@Module({
  controllers: [AccountingController],
  providers: [PostingService, AccountingSetupService],
  exports: [PostingService, AccountingSetupService],
})
export class AccountingModule {}
