import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  priceChangeSchema,
  productCreateSchema,
  productUpdateSchema,
  type CategoryCreateInput,
  type CategoryUpdateInput,
  type PriceChangeInput,
  type ProductCreateInput,
  type ProductUpdateInput,
} from '@ros/contracts';
import { CatalogService } from './catalog.service';
import { RequirePermissions, Tenant, type TenantContext } from '../common/auth-context';
import { ApiZodBody, ZodPipe } from '../common/zod';

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @RequirePermissions('catalog.view')
  @Get('tax-categories')
  taxCategories(@Tenant() auth: TenantContext) {
    return this.catalog.taxCategories(auth);
  }

  @RequirePermissions('catalog.view')
  @Get('payment-methods')
  paymentMethods(@Tenant() auth: TenantContext) {
    return this.catalog.paymentMethods(auth);
  }

  @RequirePermissions('catalog.view')
  @Get('categories')
  categories(@Tenant() auth: TenantContext) {
    return this.catalog.categories(auth);
  }

  @RequirePermissions('catalog.manage')
  @Post('categories')
  @ApiZodBody(categoryCreateSchema)
  createCategory(@Tenant() auth: TenantContext, @Body(new ZodPipe(categoryCreateSchema)) body: CategoryCreateInput) {
    return this.catalog.createCategory(auth, body);
  }

  @RequirePermissions('catalog.manage')
  @Patch('categories/:id')
  @ApiZodBody(categoryUpdateSchema)
  updateCategory(
    @Tenant() auth: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(categoryUpdateSchema)) body: CategoryUpdateInput,
  ) {
    return this.catalog.updateCategory(auth, id, body);
  }

  @RequirePermissions('catalog.view')
  @Get('products')
  products(@Tenant() auth: TenantContext) {
    return this.catalog.products(auth);
  }

  /** Creating a product sets its first price, so it also needs the price permission. */
  @RequirePermissions('catalog.manage', 'catalog.prices.manage')
  @Post('products')
  @ApiZodBody(productCreateSchema)
  createProduct(@Tenant() auth: TenantContext, @Body(new ZodPipe(productCreateSchema)) body: ProductCreateInput) {
    return this.catalog.createProduct(auth, body);
  }

  @RequirePermissions('catalog.manage')
  @Patch('products/:id')
  @ApiZodBody(productUpdateSchema)
  updateProduct(
    @Tenant() auth: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(productUpdateSchema)) body: ProductUpdateInput,
  ) {
    return this.catalog.updateProduct(auth, id, body);
  }

  @RequirePermissions('catalog.prices.manage')
  @Post('variants/:id/prices')
  @ApiZodBody(priceChangeSchema)
  changePrice(
    @Tenant() auth: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(priceChangeSchema)) body: PriceChangeInput,
  ) {
    return this.catalog.changePrice(auth, id, body);
  }
}
