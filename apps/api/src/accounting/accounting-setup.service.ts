import { Injectable } from '@nestjs/common';
import type { Tx } from '../prisma/prisma.service';
import { CHART_OF_ACCOUNTS, DEFAULT_MAPPINGS, normalBalance } from './templates';

/**
 * Seeds a tenant's chart of accounts, default mappings and the current fiscal year. Idempotent and additive:
 * accounts and mappings added to the templates later are created for existing tenants, nothing is changed.
 */
@Injectable()
export class AccountingSetupService {
  async seed(tx: Tx, tenantId: string, opts: { timezone: string; now?: Date }) {
    const existing = await tx.account.findMany({ where: { tenantId }, select: { id: true, code: true } });
    const ids = new Map(existing.map((a) => [a.code, a.id]));
    const fresh = existing.length === 0;
    for (const a of CHART_OF_ACCOUNTS) {
      if (ids.has(a.code)) continue;
      const row = await tx.account.create({
        data: {
          tenantId,
          code: a.code,
          nameEn: a.nameEn,
          nameAr: a.nameAr,
          type: a.type,
          subtype: a.subtype,
          normalBalance: normalBalance(a.type, a.subtype),
          isPostable: a.postable ?? true,
          isControl: a.control ?? false,
          parentId: a.parent ? ids.get(a.parent) : null,
        },
      });
      ids.set(a.code, row.id);
    }
    const mapped = new Set(
      (
        await tx.accountingMapping.findMany({ where: { tenantId, scopeType: 'tenant' }, select: { mappingKey: true } })
      ).map((m) => m.mappingKey),
    );
    await tx.accountingMapping.createMany({
      data: Object.entries(DEFAULT_MAPPINGS)
        .filter(([mappingKey]) => !mapped.has(mappingKey))
        .map(([mappingKey, code]) => ({ tenantId, mappingKey, scopeType: 'tenant', accountId: ids.get(code)! })),
    });
    if (!fresh || (await tx.fiscalYear.count({ where: { tenantId } })) > 0) return fresh;

    // Calendar fiscal year in the tenant's timezone, twelve monthly periods.
    const year = Number(
      new Intl.DateTimeFormat('en-CA', { timeZone: opts.timezone, year: 'numeric' }).format(opts.now ?? new Date()),
    );
    const fy = await tx.fiscalYear.create({
      data: {
        tenantId,
        name: `FY${year}`,
        startDate: new Date(Date.UTC(year, 0, 1)),
        endDate: new Date(Date.UTC(year, 11, 31)),
      },
    });
    await tx.accountingPeriod.createMany({
      data: Array.from({ length: 12 }, (_, m) => ({
        tenantId,
        fiscalYearId: fy.id,
        periodNo: m + 1,
        startDate: new Date(Date.UTC(year, m, 1)),
        endDate: new Date(Date.UTC(year, m + 1, 0)),
      })),
    });
    return true;
  }

  accountId(tx: Tx, tenantId: string, code: string) {
    return tx.account.findFirstOrThrow({ where: { tenantId, code }, select: { id: true } }).then((a) => a.id);
  }
}
