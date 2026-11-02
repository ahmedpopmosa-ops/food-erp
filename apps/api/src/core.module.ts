import { Global, Module } from '@nestjs/common';
import { AuditService } from './identity/audit/audit.service';
import { EntitlementsService } from './setup/entitlements.service';
import { LogMailer, MAILER } from './common/mailer';
import { TokensService } from './identity/auth/tokens.service';

/** Cross-cutting services every domain module may use (audit, entitlements, mail, one-time tokens). */
@Global()
@Module({
  providers: [AuditService, EntitlementsService, TokensService, LogMailer, { provide: MAILER, useExisting: LogMailer }],
  exports: [AuditService, EntitlementsService, TokensService, MAILER, LogMailer],
})
export class CoreModule {}
