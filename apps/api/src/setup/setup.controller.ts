import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  branchCreateSchema,
  branchUpdateSchema,
  settingsUpdateSchema,
  type BranchCreateInput,
  type BranchUpdateInput,
  type SettingsUpdateInput,
} from '@ros/contracts';
import { BranchesService } from './branches.service';
import { SettingsService } from './settings.service';
import { RequirePermissions, Tenant, type TenantContext } from '../common/auth-context';
import { ApiZodBody, ZodPipe } from '../common/zod';

@ApiTags('setup')
@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @RequirePermissions('setup.branches.view')
  @Get()
  list(@Tenant() auth: TenantContext) {
    return this.branches.list(auth);
  }

  @RequirePermissions('setup.branches.view')
  @Get(':id')
  get(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.branches.get(auth, id);
  }

  @RequirePermissions('setup.branches.manage')
  @Post()
  @ApiZodBody(branchCreateSchema)
  create(@Tenant() auth: TenantContext, @Body(new ZodPipe(branchCreateSchema)) body: BranchCreateInput) {
    return this.branches.create(auth, body);
  }

  @RequirePermissions('setup.branches.manage')
  @Patch(':id')
  @ApiZodBody(branchUpdateSchema)
  update(
    @Tenant() auth: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(branchUpdateSchema)) body: BranchUpdateInput,
  ) {
    return this.branches.update(auth, id, body);
  }
}

@ApiTags('setup')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @RequirePermissions('setup.settings.view')
  @Get()
  get(@Tenant() auth: TenantContext) {
    return this.settings.get(auth);
  }

  @RequirePermissions('setup.settings.manage')
  @Patch()
  @ApiZodBody(settingsUpdateSchema)
  update(@Tenant() auth: TenantContext, @Body(new ZodPipe(settingsUpdateSchema)) body: SettingsUpdateInput) {
    return this.settings.update(auth, body);
  }
}
