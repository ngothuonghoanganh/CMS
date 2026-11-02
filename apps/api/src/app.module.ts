import { randomUUID } from 'node:crypto';
import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { Options as PinoHttpOptions } from 'pino-http';
import type { Env } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { ActivityModule } from './modules/activity/activity.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { AssetsModule } from './modules/assets/assets.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DataRequestsModule } from './modules/data-requests/data-requests.module.js';
import { LeadsModule } from './modules/leads/leads.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { PagesModule } from './modules/pages/pages.module.js';
import { PreviewModule } from './modules/preview/preview.module.js';
import { PrivacyModule } from './modules/privacy/privacy.module.js';
import { PublicDeliveryModule } from './modules/public-delivery/public-delivery.module.js';
import { PublishingModule } from './modules/publishing/publishing.module.js';
import { RevalidationModule } from './modules/revalidation/revalidation.module.js';
import { DomainsModule } from './modules/domains/domains.module.js';
import { MembersModule } from './modules/members/members.module.js';
import { SitesModule } from './modules/sites/sites.module.js';
import { TemplatesModule } from './modules/templates/templates.module.js';
import { WorkspacesModule } from './modules/workspaces/workspaces.module.js';
import { EnvModule } from './shared/env.js';
import { LOG_REDACT_PATHS, serializeError, serializeRequest } from './shared/log-redaction.js';
import { OriginGuard } from './shared/origin.guard.js';
import { PersistenceModule } from './shared/persistence/persistence.module.js';
import { ProblemFilter } from './shared/problem.filter.js';

/** The request log: one line per request, with its id and without secrets or personal data. */
function requestLogOptions(env: Env): PinoHttpOptions {
  return {
    level: env.LOG_LEVEL,
    genReqId: (req, res) => {
      const incoming = req.headers['x-request-id'];
      const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
    redact: [...LOG_REDACT_PATHS],
    // `req.url` and the route params of /public/preview/{token} carry a preview token; a logged
    // error can carry the hash of an address.
    serializers: { req: serializeRequest, err: serializeError },
  };
}

@Module({})
export class AppModule {
  /** `logDestination` replaces stdout as the log's output, so a test can read what is logged. */
  static forRoot(env: Env, logDestination?: DestinationStream): DynamicModule {
    const requestLog = requestLogOptions(env);
    return {
      module: AppModule,
      imports: [
        EnvModule.forRoot(env),
        LoggerModule.forRoot({
          pinoHttp: logDestination ? [requestLog, logDestination] : requestLog,
        }),
        // `IndexBuilder` creates the collections and indexes before the API serves, instead of in
        // the background; opening a model never creates a workspace database by itself (ADR-025).
        MongooseModule.forRoot(env.MONGODB_URI, { autoIndex: false, autoCreate: false }),
        ThrottlerModule.forRoot([
          { name: 'default', ttl: 60_000, limit: env.AUTH_RATE_LIMIT_PER_MINUTE },
        ]),
        PersistenceModule,
        HealthModule,
        WorkspacesModule,
        AuthModule,
        SitesModule,
        MembersModule,
        DomainsModule,
        ActivityModule,
        AssetsModule,
        PagesModule,
        TemplatesModule,
        PublishingModule,
        LeadsModule,
        DataRequestsModule,
        AnalyticsModule,
        NotificationsModule,
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
