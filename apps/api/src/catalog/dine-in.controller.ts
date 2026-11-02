import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  modifierGroupCreateSchema,
  productModifierGroupsSchema,
  tableCreateSchema,
  tableUpdateSchema,
  type ModifierGroupCreateInput,
  type TableCreateInput,
  type TableUpdateInput,
} from '@ros/contracts';
import { DineInService } from './dine-in.service';
import { RequirePermissions, Tenant, type TenantContext } from '../common/auth-context';
import { ApiZodBody, ZodPipe } from '../common/zod';

@ApiTags('catalog')
@Controller()
export class DineInController {
  constructor(private readonly dineIn: DineInService) {}

  @RequirePermissions('catalog.view')
  @Get('catalog/modifier-groups')
  modifierGroups(@Tenant() auth: TenantContext) {
    return this.dineIn.modifierGroups(auth);
  }

  @RequirePermissions('catalog.manage', 'catalog.prices.manage')
  @Post('catalog/modifier-groups')
  @ApiZodBody(modifierGroupCreateSchema)
  createModifierGroup(
    @Tenant() auth: TenantContext,
    @Body(new ZodPipe(modifierGroupCreateSchema)) body: ModifierGroupCreateInput,
  ) {
    return this.dineIn.createModifierGroup(auth, body);
  }

  @RequirePermissions('catalog.manage')
  @Put('catalog/products/:id/modifier-groups')
  @ApiZodBody(productModifierGroupsSchema)
  setProductGroups(
    @Tenant() auth: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(productModifierGroupsSchema)) body: { groupIds: string[] },
  ) {
    return this.dineIn.setProductGroups(auth, id, body.groupIds);
  }

  @RequirePermissions('setup.branches.view')
  @Get('branches/:id/tables')
  tables(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.dineIn.tables(auth, id);
  }

  @RequirePermissions('setup.branches.manage')
  @Post('branches/:id/tables')
  @ApiZodBody(tableCreateSchema)
  createTable(
    @Tenant() auth: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(tableCreateSchema)) body: TableCreateInput,
  ) {
    return this.dineIn.createTable(auth, id, body);
  }

  @RequirePermissions('setup.branches.manage')
  @Patch('tables/:id')
  @ApiZodBody(tableUpdateSchema)
  updateTable(
    @Tenant() auth: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(tableUpdateSchema)) body: TableUpdateInput,
  ) {
    return this.dineIn.updateTable(auth, id, body);
  }
}
