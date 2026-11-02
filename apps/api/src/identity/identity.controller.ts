import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  auditQuerySchema,
  memberInviteSchema,
  memberUpdateSchema,
  paginationQuery,
  roleCreateSchema,
  roleUpdateSchema,
  type AuditQuery,
  type MemberInviteInput,
  type MemberUpdateInput,
  type PaginationQuery,
  type RoleCreateInput,
  type RoleUpdateInput,
} from '@ros/contracts';
import { RolesService } from './roles/roles.service';
import { MembersService } from './members/members.service';
import { AuditQueryService } from './audit/audit.query.service';
import { RequirePermissions, Tenant, type TenantContext } from '../common/auth-context';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../common/zod';

@ApiTags('identity')
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @RequirePermissions('roles.view')
  @Get()
  list(@Tenant() auth: TenantContext) {
    return this.roles.list(auth);
  }

  @RequirePermissions('roles.view')
  @Get(':id')
  get(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.roles.get(auth, id);
  }

  @RequirePermissions('roles.manage')
  @Post()
  @ApiZodBody(roleCreateSchema)
  create(@Tenant() auth: TenantContext, @Body(new ZodPipe(roleCreateSchema)) body: RoleCreateInput) {
    return this.roles.create(auth, body);
  }

  @RequirePermissions('roles.manage')
  @Patch(':id')
  @ApiZodBody(roleUpdateSchema)
  update(
    @Tenant() auth: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(roleUpdateSchema)) body: RoleUpdateInput,
  ) {
    return this.roles.update(auth, id, body);
  }

  @RequirePermissions('roles.manage')
  @Delete(':id')
  remove(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.roles.remove(auth, id);
  }
}

@ApiTags('identity')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly roles: RolesService) {}

  @RequirePermissions('roles.view')
  @Get()
  list() {
    return this.roles.catalog();
  }
}

@ApiTags('identity')
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @RequirePermissions('users.view')
  @Get()
  @ApiZodQuery(paginationQuery)
  list(@Tenant() auth: TenantContext, @Query(new ZodPipe(paginationQuery)) page: PaginationQuery) {
    return this.members.list(auth, page);
  }

  @RequirePermissions('users.manage')
  @Post()
  @ApiZodBody(memberInviteSchema)
  invite(@Tenant() auth: TenantContext, @Body(new ZodPipe(memberInviteSchema)) body: MemberInviteInput) {
    return this.members.invite(auth, body);
  }

  @RequirePermissions('users.manage')
  @Patch(':id')
  @ApiZodBody(memberUpdateSchema)
  update(
    @Tenant() auth: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(memberUpdateSchema)) body: MemberUpdateInput,
  ) {
    return this.members.update(auth, id, body);
  }
}

@ApiTags('identity')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditQueryService) {}

  @RequirePermissions('audit.view')
  @Get()
  @ApiZodQuery(auditQuerySchema)
  list(@Tenant() auth: TenantContext, @Query(new ZodPipe(auditQuerySchema)) q: AuditQuery) {
    return this.audit.list(auth, q);
  }
}
