import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  inventoryItemCreateSchema,
  paginationQuery,
  recipeVersionCreateSchema,
  stockAdjustmentCreateSchema,
  stockCountCreateSchema,
  stockCountLinesSchema,
  stockTransferCreateSchema,
  stockTransferReceiveSchema,
  type InventoryItemCreateInput,
  type RecipeVersionCreateInput,
  type StockAdjustmentCreateInput,
  type StockCountLinesInput,
  type StockTransferCreateInput,
  type StockTransferReceiveInput,
} from '@ros/contracts';
import { InventoryService } from './inventory.service';
import { RequirePermissions, Tenant, type TenantContext } from '../common/auth-context';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../common/zod';
import { Idempotent } from '../common/idempotency';

const movementsQuery = paginationQuery.extend({
  itemId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
});
const balancesQuery = z.object({ warehouseId: z.string().uuid().optional() });
const warehousesQuery = z.object({ destinations: z.enum(['true', 'false']).optional() });
const recipesQuery = z.object({ variantId: z.string().uuid().optional() });

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @RequirePermissions('inventory.view')
  @Get('warehouses')
  @ApiZodQuery(warehousesQuery)
  warehouses(@Tenant() auth: TenantContext, @Query(new ZodPipe(warehousesQuery)) q: z.infer<typeof warehousesQuery>) {
    return this.inventory.warehouses(auth, q.destinations === 'true');
  }

  @RequirePermissions('inventory.view')
  @Get('items')
  items(@Tenant() auth: TenantContext) {
    return this.inventory.items(auth);
  }

  @RequirePermissions('inventory.manage')
  @Post('items')
  @ApiZodBody(inventoryItemCreateSchema)
  createItem(
    @Tenant() auth: TenantContext,
    @Body(new ZodPipe(inventoryItemCreateSchema)) body: InventoryItemCreateInput,
  ) {
    return this.inventory.createItem(auth, body);
  }

  @RequirePermissions('inventory.view')
  @Get('recipes')
  @ApiZodQuery(recipesQuery)
  recipes(@Tenant() auth: TenantContext, @Query(new ZodPipe(recipesQuery)) q: z.infer<typeof recipesQuery>) {
    return this.inventory.recipes(auth, q.variantId);
  }

  @RequirePermissions('recipes.manage')
  @Post('recipes')
  @ApiZodBody(recipeVersionCreateSchema)
  createRecipeVersion(
    @Tenant() auth: TenantContext,
    @Body(new ZodPipe(recipeVersionCreateSchema)) body: RecipeVersionCreateInput,
  ) {
    return this.inventory.createRecipeVersion(auth, body);
  }

  @RequirePermissions('inventory.view')
  @Get('adjustments')
  adjustments(@Tenant() auth: TenantContext) {
    return this.inventory.documents(auth, 'adjustments');
  }

  @RequirePermissions('inventory.adjust')
  @Post('adjustments')
  @Idempotent()
  @ApiZodBody(stockAdjustmentCreateSchema)
  createAdjustment(
    @Tenant() auth: TenantContext,
    @Body(new ZodPipe(stockAdjustmentCreateSchema)) body: StockAdjustmentCreateInput,
  ) {
    return this.inventory.createAdjustment(auth, body);
  }

  @RequirePermissions('inventory.view')
  @Get('counts')
  counts(@Tenant() auth: TenantContext) {
    return this.inventory.documents(auth, 'counts');
  }

  @RequirePermissions('inventory.view')
  @Get('counts/:id')
  count(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.count(auth, id);
  }

  @RequirePermissions('inventory.manage')
  @Post('counts')
  @ApiZodBody(stockCountCreateSchema)
  startCount(@Tenant() auth: TenantContext, @Body(new ZodPipe(stockCountCreateSchema)) body: { warehouseId: string }) {
    return this.inventory.startCount(auth, body.warehouseId);
  }

  @RequirePermissions('inventory.manage')
  @Put('counts/:id/lines')
  @ApiZodBody(stockCountLinesSchema)
  enterCount(
    @Tenant() auth: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(stockCountLinesSchema)) body: StockCountLinesInput,
  ) {
    return this.inventory.enterCount(auth, id, body);
  }

  @RequirePermissions('inventory.count.approve')
  @Post('counts/:id/approve')
  @Idempotent()
  approveCount(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.approveCount(auth, id);
  }

  @RequirePermissions('inventory.view')
  @Get('transfers')
  transfers(@Tenant() auth: TenantContext) {
    return this.inventory.documents(auth, 'transfers');
  }

  @RequirePermissions('inventory.view')
  @Get('transfers/:id')
  transfer(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.transferDetail(auth, id);
  }

  @RequirePermissions('inventory.manage')
  @Post('transfers')
  @ApiZodBody(stockTransferCreateSchema)
  createTransfer(
    @Tenant() auth: TenantContext,
    @Body(new ZodPipe(stockTransferCreateSchema)) body: StockTransferCreateInput,
  ) {
    return this.inventory.createTransfer(auth, body);
  }

  @RequirePermissions('inventory.manage')
  @Post('transfers/:id/dispatch')
  @Idempotent()
  dispatchTransfer(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.dispatchTransfer(auth, id);
  }

  @RequirePermissions('inventory.manage')
  @Post('transfers/:id/receive')
  @Idempotent()
  @ApiZodBody(stockTransferReceiveSchema)
  receiveTransfer(
    @Tenant() auth: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(stockTransferReceiveSchema)) body: StockTransferReceiveInput,
  ) {
    return this.inventory.receiveTransfer(auth, id, body);
  }

  @RequirePermissions('inventory.view')
  @Get('balances')
  @ApiZodQuery(balancesQuery)
  balances(@Tenant() auth: TenantContext, @Query(new ZodPipe(balancesQuery)) q: z.infer<typeof balancesQuery>) {
    return this.inventory.balances(auth, q.warehouseId);
  }

  @RequirePermissions('inventory.view')
  @Get('movements')
  @ApiZodQuery(movementsQuery)
  movements(@Tenant() auth: TenantContext, @Query(new ZodPipe(movementsQuery)) q: z.infer<typeof movementsQuery>) {
    return this.inventory.movements(auth, q);
  }

  @RequirePermissions('reports.inventory')
  @Get('reconciliation')
  reconciliation(@Tenant() auth: TenantContext) {
    return this.inventory.reconciliation(auth);
  }
}
