import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { TenantModelsModule } from '../tenancy/tenant-models.module';
import { TenantModule } from '../tenancy/tenant.module';
import { AuthenticationModule } from '../common/guards/authentication.module';
import { MASTER_CONNECTION } from '../tenancy/master-connection';
import {
  PlatformRoleRecord,
  PlatformRoleSchema,
} from '../tenancy/schemas/platform-role.schema';
import {
  PlatformRoleAssignmentRecord,
  PlatformRoleAssignmentSchema,
} from '../tenancy/schemas/platform-role-assignment.schema';
import {
  PlatformAuditLogRecord,
  PlatformAuditLogSchema,
} from '../tenancy/schemas/platform-audit-log.schema';
import {
  PlatformUserRecord,
  PlatformUserSchema,
} from '../tenancy/schemas/platform-user.schema';
import { AuditService } from './audit.service';
import { AuthorizationService } from './authorization.service';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformAuthorizationService } from './platform-authorization.service';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';
import { AuditController } from './audit.controller';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { EventBus } from '../extensions/event-bus';

@Module({
  imports: [
    AuthenticationModule,
    TenantModule,
    TenantModelsModule,
    MongooseModule.forFeature(
      [
        { name: PlatformUserRecord.name, schema: PlatformUserSchema },
        { name: PlatformRoleRecord.name, schema: PlatformRoleSchema },
        { name: PlatformRoleAssignmentRecord.name, schema: PlatformRoleAssignmentSchema },
        { name: PlatformAuditLogRecord.name, schema: PlatformAuditLogSchema },
      ],
      MASTER_CONNECTION,
    ),
  ],
  providers: [
    AuthorizationService,
    PlatformAuthorizationService,
    AuditService,
    PlatformAuditService,
    RoleService,
    UserService,
    EventBus,
  ],
  controllers: [RoleController, AuditController, UserController],
  exports: [
    AuthorizationService,
    PlatformAuthorizationService,
    AuditService,
    PlatformAuditService,
    RoleService,
    UserService,
    EventBus,
  ],
})
export class SecurityModule {}
