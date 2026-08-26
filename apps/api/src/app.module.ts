import { Module, RequestMethod, type MiddlewareConsumer } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from './auth/auth.module';
import { TenantBootstrapModule } from './bootstrap/tenant-bootstrap.module';
import { AuthenticationModule } from './common/guards/authentication.module';
import { DomainModule } from './domain/domain.module';
import { HealthModule } from './health/health.module';
import { MASTER_CONNECTION, masterDatabaseUri } from './tenancy/master-connection';
import { ControlPlaneModule } from './tenancy/control-plane.module';
import { TenantResolutionMiddleware } from './tenancy/tenant-resolution.middleware';
import { TenantManagementModule } from './tenancy/tenant-management.module';
import { SecurityModule } from './security/security.module';

@Module({
  imports: [
    MongooseModule.forRoot(masterDatabaseUri(), {
      connectionName: MASTER_CONNECTION,
      connectTimeoutMS: 3000,
      serverSelectionTimeoutMS: 3000,
    }),
    ControlPlaneModule,
    SecurityModule,
    TenantBootstrapModule,
    AuthenticationModule,
    AuthModule,
    DomainModule,
    TenantManagementModule,
    HealthModule,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantResolutionMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
