import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  kitchenStationCreateSchema,
  kitchenStationUpdateSchema,
  kitchenTicketStatusSchema,
  kitchenTicketsQuery,
  type KitchenStationCreateInput,
  type KitchenStationUpdateInput,
  type KitchenTicketStatusInput,
  type KitchenTicketsQuery,
} from '@ros/contracts';
import { RequirePermissions, Tenant, type TenantContext } from '../common/auth-context';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../common/zod';
import { KitchenService } from './kitchen.service';

const stationsQuery = z.object({ branchId: z.string().uuid() });

/** Kitchen display (P7-5): station set-up by managers, tickets for kitchen staff. */
@ApiTags('kitchen')
@Controller('kitchen')
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  @RequirePermissions('kitchen.view')
  @Get('branches')
  branches(@Tenant() auth: TenantContext) {
    return this.kitchen.branches(auth);
  }

  @RequirePermissions('kitchen.view')
  @Get('stations')
  @ApiZodQuery(stationsQuery)
  stations(@Tenant() auth: TenantContext, @Query(new ZodPipe(stationsQuery)) q: z.infer<typeof stationsQuery>) {
    return this.kitchen.stations(auth, q.branchId);
  }

  @RequirePermissions('catalog.manage')
  @Post('stations')
  @ApiZodBody(kitchenStationCreateSchema)
  createStation(
    @Tenant() auth: TenantContext,
    @Body(new ZodPipe(kitchenStationCreateSchema)) body: KitchenStationCreateInput,
  ) {
    return this.kitchen.createStation(auth, body);
  }

  @RequirePermissions('catalog.manage')
  @Patch('stations/:id')
  @ApiZodBody(kitchenStationUpdateSchema)
  updateStation(
    @Tenant() auth: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(kitchenStationUpdateSchema)) body: KitchenStationUpdateInput,
  ) {
    return this.kitchen.updateStation(auth, id, body);
  }

  @RequirePermissions('kitchen.view')
  @Get('tickets')
  @ApiZodQuery(kitchenTicketsQuery)
  tickets(@Tenant() auth: TenantContext, @Query(new ZodPipe(kitchenTicketsQuery)) q: KitchenTicketsQuery) {
    return this.kitchen.tickets(auth, q);
  }

  @RequirePermissions('kitchen.view')
  @Get('tickets/:id')
  ticket(@Tenant() auth: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.kitchen.ticket(auth, id);
  }

  @RequirePermissions('kitchen.update')
  @Post('tickets/:id/status')
  @ApiZodBody(kitchenTicketStatusSchema)
  move(
    @Tenant() auth: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(kitchenTicketStatusSchema)) body: KitchenTicketStatusInput,
  ) {
    return this.kitchen.move(auth, id, body);
  }
}
