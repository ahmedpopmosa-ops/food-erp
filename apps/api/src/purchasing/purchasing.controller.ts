import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  goodsReceiptCreateSchema,
  purchaseOrderCreateSchema,
  supplierCreateSchema,
  supplierInvoiceCreateSchema,
  supplierPaymentCreateSchema,
  supplierReturnCreateSchema,
  type GoodsReceiptCreateInput,
  type PurchaseOrderCreateInput,
  type SupplierCreateInput,
  type SupplierInvoiceCreateInput,
  type SupplierPaymentCreateInput,
  type SupplierReturnCreateInput,
} from '@ros/contracts';
import { PurchasingService } from './purchasing.service';
import { RequirePermissions, Tenant, type TenantContext } from '../common/auth-context';
import { ApiZodBody, ZodPipe } from '../common/zod';
import { Idempotent } from '../common/idempotency';

/**
 * Purchasing (doc 07 §3.6). Receiving and returning goods is warehouse work (`inventory.manage`, branch
 * scoped); supplier invoices and payments are payables work (`suppliers.payments`, all branches).
 */
@ApiTags('purchasing')
@Controller('purchasing')
export class PurchasingController {
  constructor(private readonly purchasing: PurchasingService) {}

  @RequirePermissions('purchasing.view')
  @Get('suppliers')
  suppliers(@Tenant() auth: TenantContext) {
    return this.purchasing.suppliers(auth);
  }

  @RequirePermissions('purchasing.manage')
  @Post('suppliers')
  @ApiZodBody(supplierCreateSchema)
  createSupplier(@Tenant() auth: TenantContext, @Body(new ZodPipe(supplierCreateSchema)) body: SupplierCreateInput) {
    return this.purchasing.createSupplier(auth, body);
  }

  @RequirePermissions('suppliers.payments')
  @Get('suppliers/:id/statement')
  statement(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchasing.statement(auth, id);
  }

  @RequirePermissions('purchasing.view')
  @Get('orders')
  orders(@Tenant() auth: TenantContext) {
    return this.purchasing.orders(auth);
  }

  @RequirePermissions('purchasing.view')
  @Get('orders/:id')
  order(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchasing.order(auth, id);
  }

  @RequirePermissions('purchasing.manage')
  @Post('orders')
  @ApiZodBody(purchaseOrderCreateSchema)
  createOrder(
    @Tenant() auth: TenantContext,
    @Body(new ZodPipe(purchaseOrderCreateSchema)) body: PurchaseOrderCreateInput,
  ) {
    return this.purchasing.createOrder(auth, body);
  }

  @RequirePermissions('purchasing.approve')
  @Post('orders/:id/approve')
  approveOrder(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchasing.approveOrder(auth, id);
  }

  @RequirePermissions('purchasing.manage')
  @Post('orders/:id/cancel')
  cancelOrder(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchasing.cancelOrder(auth, id);
  }

  @RequirePermissions('purchasing.view')
  @Get('receipts')
  receipts(@Tenant() auth: TenantContext) {
    return this.purchasing.receipts(auth);
  }

  @RequirePermissions('purchasing.view')
  @Get('receipts/:id')
  receipt(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchasing.receipt(auth, id);
  }

  @RequirePermissions('inventory.manage')
  @Post('receipts')
  @Idempotent()
  @ApiZodBody(goodsReceiptCreateSchema)
  createReceipt(
    @Tenant() auth: TenantContext,
    @Body(new ZodPipe(goodsReceiptCreateSchema)) body: GoodsReceiptCreateInput,
  ) {
    return this.purchasing.createReceipt(auth, body);
  }

  @RequirePermissions('suppliers.payments')
  @Get('invoices')
  invoices(@Tenant() auth: TenantContext) {
    return this.purchasing.invoices(auth);
  }

  @RequirePermissions('suppliers.payments')
  @Get('invoices/:id')
  invoice(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchasing.invoice(auth, id);
  }

  @RequirePermissions('suppliers.payments')
  @Post('invoices')
  @Idempotent()
  @ApiZodBody(supplierInvoiceCreateSchema)
  createInvoice(
    @Tenant() auth: TenantContext,
    @Body(new ZodPipe(supplierInvoiceCreateSchema)) body: SupplierInvoiceCreateInput,
  ) {
    return this.purchasing.createInvoice(auth, body);
  }

  @RequirePermissions('suppliers.payments')
  @Get('payments')
  payments(@Tenant() auth: TenantContext) {
    return this.purchasing.payments(auth);
  }

  @RequirePermissions('suppliers.payments')
  @Post('payments')
  @Idempotent()
  @ApiZodBody(supplierPaymentCreateSchema)
  createPayment(
    @Tenant() auth: TenantContext,
    @Body(new ZodPipe(supplierPaymentCreateSchema)) body: SupplierPaymentCreateInput,
  ) {
    return this.purchasing.createPayment(auth, body);
  }

  @RequirePermissions('purchasing.view')
  @Get('returns')
  returns(@Tenant() auth: TenantContext) {
    return this.purchasing.returns(auth);
  }

  @RequirePermissions('inventory.manage')
  @Post('returns')
  @Idempotent()
  @ApiZodBody(supplierReturnCreateSchema)
  createReturn(
    @Tenant() auth: TenantContext,
    @Body(new ZodPipe(supplierReturnCreateSchema)) body: SupplierReturnCreateInput,
  ) {
    return this.purchasing.createReturn(auth, body);
  }

  @RequirePermissions('reports.financial')
  @Get('reconciliation')
  reconciliation(@Tenant() auth: TenantContext) {
    return this.purchasing.reconciliation(auth);
  }
}
