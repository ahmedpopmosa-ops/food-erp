import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CategoryCreateInput,
  CategoryUpdateInput,
  PriceChangeInput,
  ProductCreateInput,
  ProductUpdateInput,
} from '@ros/contracts';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { AuditService } from '../identity/audit/audit.service';
import { badRequest, conflict, isUniqueViolation, notFound, staleVersion } from '../common/errors';
import { canAccessBranch, type TenantContext } from '../common/auth-context';

const productInclude = {
  variants: {
    where: { archivedAt: null },
    orderBy: { sort: 'asc' as const },
    include: { prices: { orderBy: { validFrom: 'desc' as const } } },
  },
};

/** The audit log notes that an image changed (and its size), not the image itself. */
const imageNote = (image: string | null | undefined) =>
  image === undefined ? undefined : image === null ? null : `[image ${image.length} chars]`;

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  taxCategories(auth: TenantContext) {
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.taxCategory.findMany({
        where: { tenantId: auth.tenantId, archivedAt: null },
        include: { rates: { include: { taxRate: true } } },
        orderBy: { code: 'asc' },
      }),
    );
  }

  paymentMethods(auth: TenantContext) {
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.paymentMethod.findMany({ where: { tenantId: auth.tenantId }, orderBy: { sort: 'asc' } }),
    );
  }

  categories(auth: TenantContext) {
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.category.findMany({
        where: { tenantId: auth.tenantId, archivedAt: null },
        orderBy: [{ sort: 'asc' }, { nameEn: 'asc' }],
      }),
    );
  }

  createCategory(auth: TenantContext, input: CategoryCreateInput) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const category = await tx.category.create({ data: { tenantId: auth.tenantId, ...input } });
      await this.audit.record(tx, auth.tenantId, this.audit.user(auth), {
        action: 'category.created',
        entityType: 'category',
        entityId: category.id,
        changes: { ...input, image: imageNote(input.image) },
      });
      return category;
    });
  }

  updateCategory(auth: TenantContext, id: string, input: CategoryUpdateInput) {
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      if (!(await tx.category.findFirst({ where: { id, tenantId } }))) throw notFound('categories');
      const { rowVersion, ...fields } = input;
      const res = await tx.category.updateMany({
        where: { id, tenantId, rowVersion },
        data: { ...fields, rowVersion: { increment: 1 } },
      });
      if (res.count !== 1) throw staleVersion();
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'category.updated',
        entityType: 'category',
        entityId: id,
        changes: { ...fields, image: imageNote(fields.image) },
      });
      return tx.category.findUniqueOrThrow({ where: { id } });
    });
  }

  products(auth: TenantContext) {
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.product.findMany({ where: { tenantId: auth.tenantId }, include: productInclude, orderBy: { nameEn: 'asc' } }),
    );
  }

  async createProduct(auth: TenantContext, input: ProductCreateInput) {
    const tenantId = auth.tenantId;
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        await this.assertRefs(tx, tenantId, input.categoryId, input.taxCategoryId);
        const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { baseCurrency: true } });
        const product = await tx.product.create({
          data: {
            tenantId,
            categoryId: input.categoryId,
            taxCategoryId: input.taxCategoryId,
            sku: input.sku,
            nameAr: input.nameAr,
            nameEn: input.nameEn,
            createdBy: auth.userId,
            updatedBy: auth.userId,
          },
        });
        const variant = await tx.productVariant.create({ data: { tenantId, productId: product.id, isDefault: true } });
        await tx.productPrice.create({
          data: {
            tenantId,
            variantId: variant.id,
            price: new Prisma.Decimal(input.price),
            currencyCode: tenant.baseCurrency,
            validFrom: new Date(),
            createdBy: auth.userId,
          },
        });
        await this.audit.record(tx, tenantId, this.audit.user(auth), {
          action: 'product.created',
          entityType: 'product',
          entityId: product.id,
          changes: { nameEn: input.nameEn, nameAr: input.nameAr, price: input.price },
        });
        return tx.product.findUniqueOrThrow({ where: { id: product.id }, include: productInclude });
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('products.duplicateSku', 'A product with this SKU already exists');
      throw err;
    }
  }

  updateProduct(auth: TenantContext, id: string, input: ProductUpdateInput) {
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const current = await tx.product.findFirst({ where: { id, tenantId } });
      if (!current) throw notFound('products');
      await this.assertRefs(tx, tenantId, input.categoryId, input.taxCategoryId);
      const { rowVersion, archived, ...fields } = input;
      const res = await tx.product.updateMany({
        where: { id, tenantId, rowVersion },
        data: {
          ...fields,
          ...(archived === undefined ? {} : { archivedAt: archived ? (current.archivedAt ?? new Date()) : null }),
          updatedBy: auth.userId,
          rowVersion: { increment: 1 },
        },
      });
      if (res.count !== 1) throw staleVersion();
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'product.updated',
        entityType: 'product',
        entityId: id,
        changes: { ...input },
      });
      return tx.product.findUniqueOrThrow({ where: { id }, include: productInclude });
    });
  }

  /**
   * Price change (doc 04 §4): rows already in effect are never edited — the open row of the same scope is
   * closed at `validFrom` and a new row starts there. A future-dated change is a scheduled price change.
   */
  changePrice(auth: TenantContext, variantId: string, input: PriceChangeInput) {
    const tenantId = auth.tenantId;
    if (input.branchId && !canAccessBranch(auth, input.branchId)) throw notFound('branches');
    return this.prisma.withTenant(tenantId, async (tx) => {
      const variant = await tx.productVariant.findFirst({ where: { id: variantId, tenantId } });
      if (!variant) throw notFound('variants');
      if (input.branchId && !(await tx.branch.findFirst({ where: { id: input.branchId, tenantId } })))
        throw notFound('branches');
      const from = input.validFrom ? new Date(input.validFrom) : new Date();
      const scope = { tenantId, variantId, branchId: input.branchId, channel: input.channel };
      if (await tx.productPrice.findFirst({ where: { ...scope, validFrom: { gte: from } } })) {
        throw conflict(
          'prices.laterChangeExists',
          'A price change at or after this time already exists for this scope',
        );
      }
      const open = await tx.productPrice.findFirst({ where: { ...scope, validTo: null } });
      if (open) await tx.productPrice.update({ where: { id: open.id }, data: { validTo: from } });
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { baseCurrency: true } });
      const row = await tx.productPrice.create({
        data: {
          ...scope,
          price: new Prisma.Decimal(input.price),
          currencyCode: tenant.baseCurrency,
          validFrom: from,
          createdBy: auth.userId,
        },
      });
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'price.changed',
        entityType: 'product_variant',
        entityId: variantId,
        branchId: input.branchId,
        changes: {
          from: open ? open.price.toString() : null,
          to: input.price,
          validFrom: from.toISOString(),
          channel: input.channel,
        },
      });
      return row;
    });
  }

  private async assertRefs(tx: Tx, tenantId: string, categoryId?: string, taxCategoryId?: string) {
    if (categoryId && !(await tx.category.findFirst({ where: { id: categoryId, tenantId, archivedAt: null } }))) {
      throw badRequest('products.unknownCategory', 'Category not found');
    }
    if (
      taxCategoryId &&
      !(await tx.taxCategory.findFirst({ where: { id: taxCategoryId, tenantId, archivedAt: null } }))
    ) {
      throw badRequest('products.unknownTaxCategory', 'Tax category not found');
    }
  }
}
