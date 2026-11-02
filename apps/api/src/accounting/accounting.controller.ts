import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions, Tenant, type TenantContext } from '../common/auth-context';
import { ApiZodQuery, ZodPipe } from '../common/zod';

const dateRange = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
type DateRange = z.infer<typeof dateRange>;

const range = (q: DateRange) => ({
  ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}),
  ...(q.to ? { lte: new Date(`${q.to}T00:00:00Z`) } : {}),
});

@ApiTags('accounting')
@Controller('accounting')
export class AccountingController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermissions('accounting.view')
  @Get('accounts')
  accounts(@Tenant() auth: TenantContext) {
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.account.findMany({ where: { tenantId: auth.tenantId }, orderBy: { code: 'asc' } }),
    );
  }

  @RequirePermissions('accounting.view')
  @Get('journal-entries')
  @ApiZodQuery(dateRange)
  journal(@Tenant() auth: TenantContext, @Query(new ZodPipe(dateRange)) q: DateRange) {
    const where = { tenantId: auth.tenantId, status: 'posted', ...(q.from || q.to ? { entryDate: range(q) } : {}) };
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const [items, total, accounts] = await Promise.all([
        tx.journalEntry.findMany({
          where,
          include: { lines: { orderBy: { lineNo: 'asc' } } },
          orderBy: [{ entryDate: 'desc' }, { number: 'desc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        tx.journalEntry.count({ where }),
        tx.account.findMany({
          where: { tenantId: auth.tenantId },
          select: { id: true, code: true, nameEn: true, nameAr: true },
        }),
      ]);
      const byId = new Map(accounts.map((a) => [a.id, a]));
      return {
        items: items.map((e) => ({ ...e, lines: e.lines.map((l) => ({ ...l, account: byId.get(l.accountId) })) })),
        page: q.page,
        pageSize: q.pageSize,
        total,
      };
    });
  }

  /** Debit/credit totals per account from posted lines only; `balanced` exposes any mismatch (doc 07 I12). */
  @RequirePermissions('accounting.view')
  @Get('trial-balance')
  @ApiZodQuery(dateRange)
  trialBalance(@Tenant() auth: TenantContext, @Query(new ZodPipe(dateRange)) q: DateRange) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const rows = await tx.$queryRaw<
        {
          account_id: string;
          code: string;
          name_en: string;
          name_ar: string;
          debit: Prisma.Decimal;
          credit: Prisma.Decimal;
        }[]
      >`
        SELECT a.id AS account_id, a.code, a.name_en, a.name_ar, sum(l.debit) AS debit, sum(l.credit) AS credit
        FROM journal_lines l
        JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted'
        JOIN accounts a ON a.id = l.account_id
        WHERE l.tenant_id = ${auth.tenantId}::uuid
          AND (${q.from ?? null}::date IS NULL OR e.entry_date >= ${q.from ?? null}::date)
          AND (${q.to ?? null}::date IS NULL OR e.entry_date <= ${q.to ?? null}::date)
        GROUP BY a.id, a.code, a.name_en, a.name_ar
        ORDER BY a.code`;
      const debit = rows.reduce((s, r) => s.plus(r.debit), new Prisma.Decimal(0));
      const credit = rows.reduce((s, r) => s.plus(r.credit), new Prisma.Decimal(0));
      return {
        accounts: rows.map((r) => ({
          accountId: r.account_id,
          code: r.code,
          nameEn: r.name_en,
          nameAr: r.name_ar,
          debit: r.debit.toFixed(2),
          credit: r.credit.toFixed(2),
        })),
        totalDebit: debit.toFixed(2),
        totalCredit: credit.toFixed(2),
        balanced: debit.equals(credit),
      };
    });
  }
}
