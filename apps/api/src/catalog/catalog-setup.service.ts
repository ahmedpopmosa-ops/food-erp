import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Tx } from '../prisma/prisma.service';
import { AccountingSetupService } from '../accounting/accounting-setup.service';

/**
 * Country tax templates are data, not code paths (doc 01 §1). Rates are the statutory standard rates as
 * understood at the time of writing. REVIEW: confirm with a tax adviser before production.
 */
const TAX_TEMPLATES: Record<string, { code: string; nameEn: string; nameAr: string; rate: string }[]> = {
  EG: [{ code: 'VAT14', nameEn: 'VAT 14%', nameAr: 'ضريبة القيمة المضافة 14%', rate: '0.14' }],
};

/** Seeds tax categories/rates and the default payment methods for a new tenant. Idempotent. */
@Injectable()
export class CatalogSetupService {
  constructor(private readonly accounting: AccountingSetupService) {}

  async seed(tx: Tx, tenantId: string, countryCode: string) {
    if ((await tx.taxCategory.count({ where: { tenantId } })) > 0) return false;
    const vatAccount = await this.accounting.accountId(tx, tenantId, '2210');
    const standard = await tx.taxCategory.create({
      data: { tenantId, code: 'STANDARD', nameEn: 'Standard', nameAr: 'قياسي' },
    });
    await tx.taxCategory.create({ data: { tenantId, code: 'EXEMPT', nameEn: 'Exempt', nameAr: 'معفى' } });
    let sequence = 1;
    for (const t of TAX_TEMPLATES[countryCode] ?? []) {
      const rate = await tx.taxRate.create({
        data: {
          tenantId,
          code: t.code,
          nameEn: t.nameEn,
          nameAr: t.nameAr,
          rate: new Prisma.Decimal(t.rate),
          kind: 'vat',
          validFrom: new Date(Date.UTC(2000, 0, 1)),
          outputAccountId: vatAccount,
        },
      });
      await tx.taxCategoryRate.create({
        data: { tenantId, taxCategoryId: standard.id, taxRateId: rate.id, appliesTo: 'sale', sequence: sequence++ },
      });
    }
    await tx.paymentMethod.createMany({
      data: [
        {
          tenantId,
          code: 'CASH',
          nameEn: 'Cash',
          nameAr: 'نقدي',
          kind: 'cash',
          accountId: await this.accounting.accountId(tx, tenantId, '1110'),
          opensDrawer: true,
          allowsChange: true,
          sort: 1,
        },
        {
          tenantId,
          code: 'CARD',
          nameEn: 'Card',
          nameAr: 'بطاقة',
          kind: 'card',
          accountId: await this.accounting.accountId(tx, tenantId, '1120'),
          sort: 2,
        },
      ],
    });
    return true;
  }
}
