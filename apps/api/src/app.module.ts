import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { env } from './config/env';
import { AuthModule } from './auth/auth.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { AuthenticationModule } from './common/guards/authentication.module';
import { DomainModule } from './domain/domain.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    MongooseModule.forRoot(env.MONGODB_URI, {
      connectTimeoutMS: 3000,
      serverSelectionTimeoutMS: 3000,
    }),
    BootstrapModule,
    AuthenticationModule,
    AuthModule,
    DomainModule,
    HealthModule,
  ],
})
export class AppModule {}
