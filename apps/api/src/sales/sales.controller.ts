import { Controller, Get, Module, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { paginationQuery, type PaginationQuery } from '@ros/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { branchScope, canAccessBranch, RequirePermissions, Tenant, type TenantContext } from '../common/auth-context';
import { notFound } from '../common/errors';
import { ApiZodQuery, ZodPipe } from '../common/zod';

/** Read side of sales recorded through sync. Writing happens only via POS operations. */
@ApiTags('sales')
@Controller('sales')
export class SalesController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermissions('sales.view')
  @Get('invoices')
  @ApiZodQuery(paginationQuery)
  invoices(@Tenant() auth: TenantContext, @Query(new ZodPipe(paginationQuery)) q: PaginationQuery) {
    const scope = branchScope(auth);
    const where = { tenantId: auth.tenantId, ...(scope ? { branchId: { in: scope } } : {}) };
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.invoice.findMany({
          where,
          orderBy: { issuedAt: 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        tx.invoice.count({ where }),
      ]);
      const open = await tx.saleDiscrepancy.groupBy({
        by: ['invoiceId'],
        where: { tenantId: auth.tenantId, status: 'open', invoiceId: { in: items.map((i) => i.id) } },
        _count: true,
      });
      return {
        items: items.map((i) => ({ ...i, openDiscrepancies: open.find((o) => o.invoiceId === i.id)?._count ?? 0 })),
        page: q.page,
        pageSize: q.pageSize,
        total,
      };
    });
  }

  @RequirePermissions('sales.view')
  @Get('invoices/:id')
  async invoice(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    const result = await this.prisma.withTenant(auth.tenantId, async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id, tenantId: auth.tenantId },
        include: { lines: { orderBy: { lineNo: 'asc' } }, taxes: true, payments: true },
      });
      if (!invoice || !canAccessBranch(auth, invoice.branchId)) return null;
      const [journal, discrepancies] = await Promise.all([
        invoice.journalEntryId
          ? tx.journalEntry.findUnique({
              where: { id: invoice.journalEntryId },
              include: { lines: { orderBy: { lineNo: 'asc' } } },
            })
          : null,
        tx.saleDiscrepancy.findMany({ where: { invoiceId: id } }),
      ]);
      return { ...invoice, journal, discrepancies };
    });
    if (!result) throw notFound('invoices');
    return result;
  }
}

@Module({ controllers: [SalesController] })
export class SalesModule {}
