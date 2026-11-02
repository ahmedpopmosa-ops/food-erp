import { Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  employeeCreateSchema,
  employeePinSchema,
  employeeUpdateSchema,
  type EmployeeCreateInput,
  type EmployeeUpdateInput,
} from '@ros/contracts';
import { EmployeesService } from './employees.service';
import { RequirePermissions, Tenant, type TenantContext } from '../common/auth-context';
import { ApiZodBody, ZodPipe } from '../common/zod';

@ApiTags('people')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @RequirePermissions('hr.view')
  @Get()
  list(@Tenant() auth: TenantContext) {
    return this.employees.list(auth);
  }

  @RequirePermissions('hr.manage')
  @Post()
  @ApiZodBody(employeeCreateSchema)
  create(@Tenant() auth: TenantContext, @Body(new ZodPipe(employeeCreateSchema)) body: EmployeeCreateInput) {
    return this.employees.create(auth, body);
  }

  @RequirePermissions('hr.manage')
  @Patch(':id')
  @ApiZodBody(employeeUpdateSchema)
  update(
    @Tenant() auth: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(employeeUpdateSchema)) body: EmployeeUpdateInput,
  ) {
    return this.employees.update(auth, id, body);
  }

  @RequirePermissions('hr.manage')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':id/pin')
  @HttpCode(200)
  @ApiZodBody(employeePinSchema)
  setPin(
    @Tenant() auth: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(employeePinSchema)) body: { pin: string },
  ) {
    return this.employees.setPin(auth, id, body.pin);
  }
}

@Module({ controllers: [EmployeesController], providers: [EmployeesService] })
export class PeopleModule {}
