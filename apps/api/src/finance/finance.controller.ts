import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  balanceSheetQuery,
  bankMatchSchema,
  bankPostLineSchema,
  bankStatementCreateSchema,
  bankUnmatchSchema,
  generalLedgerQuery,
  type BankMatchInput,
  type BankPostLineInput,
  type BankStatementCreateInput,
  type BankUnmatchInput,
  journalReverseSchema,
  manualJournalCreateSchema,
  periodReopenSchema,
  statementRangeQuery,
  type GeneralLedgerQuery,
  type JournalReverseInput,
  type ManualJournalCreateInput,
  type PeriodReopenInput,
  type StatementRangeQuery,
} from '@ros/contracts';
import { RequirePermissions, Tenant, type TenantContext } from '../common/auth-context';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../common/zod';
import { Idempotent } from '../common/idempotency';
import { JournalService } from './journal.service';
import { PeriodsService } from './periods.service';
import { StatementsService } from './statements.service';
import { ReconciliationService } from './reconciliation.service';
import { BankService } from './bank.service';

/** General ledger, periods, statements, reconciliation and bank reconciliation (doc 07, Phase 6). */
@ApiTags('accounting')
@Controller('accounting')
export class FinanceController {
  constructor(
    private readonly journal: JournalService,
    private readonly periods: PeriodsService,
    private readonly statements: StatementsService,
    private readonly reconciliation: ReconciliationService,
    private readonly bank: BankService,
  ) {}

  @RequirePermissions('accounting.view')
  @Get('journal-entries/:id')
  entry(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.journal.detail(auth, id);
  }

  @RequirePermissions('accounting.journal.post')
  @Post('journal-entries')
  @Idempotent()
  @ApiZodBody(manualJournalCreateSchema)
  createEntry(
    @Tenant() auth: TenantContext,
    @Body(new ZodPipe(manualJournalCreateSchema)) body: ManualJournalCreateInput,
  ) {
    return this.journal.createManual(auth, body);
  }

  @RequirePermissions('accounting.journal.post')
  @Post('journal-entries/:id/reverse')
  @Idempotent()
  @ApiZodBody(journalReverseSchema)
  reverse(
    @Tenant() auth: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(journalReverseSchema)) body: JournalReverseInput,
  ) {
    return this.journal.reverse(auth, id, body);
  }

  @RequirePermissions('accounting.view')
  @Get('fiscal-years')
  fiscalYears(@Tenant() auth: TenantContext) {
    return this.periods.fiscalYears(auth);
  }

  @RequirePermissions('accounting.period_close')
  @Post('fiscal-years/next')
  nextYear(@Tenant() auth: TenantContext) {
    return this.periods.nextYear(auth);
  }

  @RequirePermissions('accounting.period_close')
  @Post('fiscal-years/:id/close')
  @Idempotent()
  closeYear(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.periods.closeYear(auth, id);
  }

  @RequirePermissions('accounting.view')
  @Get('periods/:id/checklist')
  checklist(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.periods.checklist(auth, id);
  }

  @RequirePermissions('accounting.period_close')
  @Post('periods/:id/soft-close')
  softClose(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.periods.softClose(auth, id);
  }

  @RequirePermissions('accounting.period_close')
  @Post('periods/:id/close')
  close(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.periods.close(auth, id);
  }

  @RequirePermissions('accounting.period_reopen')
  @Post('periods/:id/reopen')
  @ApiZodBody(periodReopenSchema)
  reopen(
    @Tenant() auth: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(periodReopenSchema)) body: PeriodReopenInput,
  ) {
    return this.periods.reopen(auth, id, body);
  }

  @RequirePermissions('reports.financial')
  @Get('reports/profit-and-loss')
  @ApiZodQuery(statementRangeQuery)
  profitAndLoss(@Tenant() auth: TenantContext, @Query(new ZodPipe(statementRangeQuery)) q: StatementRangeQuery) {
    return this.statements.profitAndLoss(auth, q);
  }

  @RequirePermissions('reports.financial')
  @Get('reports/balance-sheet')
  @ApiZodQuery(balanceSheetQuery)
  balanceSheet(
    @Tenant() auth: TenantContext,
    @Query(new ZodPipe(balanceSheetQuery)) q: z.infer<typeof balanceSheetQuery>,
  ) {
    return this.statements.balanceSheet(auth, q.asOf);
  }

  @RequirePermissions('reports.financial')
  @Get('reports/cash-flow')
  @ApiZodQuery(statementRangeQuery)
  cashFlow(@Tenant() auth: TenantContext, @Query(new ZodPipe(statementRangeQuery)) q: StatementRangeQuery) {
    return this.statements.cashFlow(auth, q);
  }

  @RequirePermissions('reports.financial')
  @Get('reports/general-ledger')
  @ApiZodQuery(generalLedgerQuery)
  generalLedger(@Tenant() auth: TenantContext, @Query(new ZodPipe(generalLedgerQuery)) q: GeneralLedgerQuery) {
    return this.statements.generalLedger(auth, q);
  }

  @RequirePermissions('accounting.view')
  @Get('bank-statements')
  bankStatements(@Tenant() auth: TenantContext) {
    return this.bank.list(auth);
  }

  @RequirePermissions('accounting.journal.post')
  @Post('bank-statements')
  @Idempotent()
  @ApiZodBody(bankStatementCreateSchema)
  importStatement(
    @Tenant() auth: TenantContext,
    @Body(new ZodPipe(bankStatementCreateSchema)) body: BankStatementCreateInput,
  ) {
    return this.bank.create(auth, body);
  }

  @RequirePermissions('accounting.view')
  @Get('bank-statements/:id')
  bankStatement(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.bank.detail(auth, id);
  }

  @RequirePermissions('accounting.journal.post')
  @Post('bank-statements/:id/auto-match')
  autoMatch(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.bank.autoMatch(auth, id);
  }

  @RequirePermissions('accounting.journal.post')
  @Post('bank-statements/:id/match')
  @ApiZodBody(bankMatchSchema)
  match(
    @Tenant() auth: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(bankMatchSchema)) body: BankMatchInput,
  ) {
    return this.bank.match(auth, id, body);
  }

  @RequirePermissions('accounting.journal.post')
  @Post('bank-statements/:id/unmatch')
  @ApiZodBody(bankUnmatchSchema)
  unmatch(
    @Tenant() auth: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(bankUnmatchSchema)) body: BankUnmatchInput,
  ) {
    return this.bank.unmatch(auth, id, body);
  }

  @RequirePermissions('accounting.journal.post')
  @Post('bank-statements/:id/post-line')
  @Idempotent()
  @ApiZodBody(bankPostLineSchema)
  postLine(
    @Tenant() auth: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(bankPostLineSchema)) body: BankPostLineInput,
  ) {
    return this.bank.postLine(auth, id, body);
  }

  @RequirePermissions('accounting.journal.post')
  @Post('bank-statements/:id/complete')
  completeStatement(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.bank.complete(auth, id);
  }

  @RequirePermissions('reports.financial')
  @Get('reconciliation')
  @ApiZodQuery(statementRangeQuery)
  reconcile(@Tenant() auth: TenantContext, @Query(new ZodPipe(statementRangeQuery)) q: StatementRangeQuery) {
    return this.reconciliation.report(auth, q);
  }
}
