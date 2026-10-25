import { randomUUID } from 'node:crypto';
import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import type { Env } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { ActivityModule } from './modules/activity/activity.module.js';
import { AssetsModule } from './modules/assets/assets.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { PagesModule } from './modules/pages/pages.module.js';
import { PreviewModule } from './modules/preview/preview.module.js';
import { PrivacyModule } from './modules/privacy/privacy.module.js';
import { PublicDeliveryModule } from './modules/public-delivery/public-delivery.module.js';
import { PublishingModule } from './modules/publishing/publishing.module.js';
import { RevalidationModule } from './modules/revalidation/revalidation.module.js';
import { SitesModule } from './modules/sites/sites.module.js';
import { WorkspacesModule } from './modules/workspaces/workspaces.module.js';
import { EnvModule } from './shared/env.js';
import { serializeRequest } from './shared/log-redaction.js';
import { OriginGuard } from './shared/origin.guard.js';
import { PersistenceModule } from './shared/persistence/persistence.module.js';
import { ProblemFilter } from './shared/problem.filter.js';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        EnvModule.forRoot(env),
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.LOG_LEVEL,
            genReqId: (req, res) => {
              const incoming = req.headers['x-request-id'];
              const id =
                typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            redact: [
              'req.headers.cookie',
              'req.headers.authorization',
              'res.headers["set-cookie"]',
            ],
            // `req.url` and the route params of /public/preview/{token} carry a preview token.
            serializers: { req: serializeRequest },
          },
        }),
        MongooseModule.forRoot(env.MONGODB_URI),
        ThrottlerModule.forRoot([
          { name: 'default', ttl: 60_000, limit: env.AUTH_RATE_LIMIT_PER_MINUTE },
        ]),
        PersistenceModule,
        HealthModule,
        WorkspacesModule,
        AuthModule,
        SitesModule,
        ActivityModule,
        AssetsModule,
        PagesModule,
        PublishingModule,
        PreviewModule,
        PrivacyModule,
        PublicDeliveryModule,
        RevalidationModule,
      ],
      providers: [
        { provide: APP_FILTER, useClass: ProblemFilter },
        { provide: APP_GUARD, useClass: OriginGuard },
      ],
    };
  }
}
