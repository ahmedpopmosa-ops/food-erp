import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { SessionsService } from './auth/sessions.service';
import { RolesService } from './roles/roles.service';
import { MembersService } from './members/members.service';
import { AuditQueryService } from './audit/audit.query.service';
import { AuditController, MembersController, PermissionsController, RolesController } from './identity.controller';

@Module({
  controllers: [AuthController, RolesController, PermissionsController, MembersController, AuditController],
  providers: [AuthService, SessionsService, RolesService, MembersService, AuditQueryService],
  exports: [SessionsService],
})
export class IdentityModule {}
