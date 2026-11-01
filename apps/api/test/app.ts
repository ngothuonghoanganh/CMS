import 'reflect-metadata';
import { getConnectionToken } from '@nestjs/mongoose';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import type { DestinationStream } from 'pino';
import { AppModule } from '../src/app.module.js';
import { type Env, type EnvInput, parseEnv } from '../src/config/env.js';
import { configureApp, NEST_APP_OPTIONS } from '../src/configure-app.js';
import { DomainDns } from '../src/modules/domains/domain-dns.js';
import { DomainTls } from '../src/modules/domains/domain-tls.js';
import { EmailSender } from '../src/modules/notifications/email-sender.js';
import { NOTIFICATION_RETRY_DELAYS } from '../src/modules/notifications/lead-notifier.service.js';
import { FakeDomainDns, FakeDomainTls } from './domains.js';
import { RecordingEmailSender } from './email.js';
import { testEnvInput } from './env.js';
import { dropDatabase, isolatedMongoUri } from './mongo.js';

export interface TestApp {
  app: NestExpressApplication;
  env: Env;
  connection: Connection;
  /** What the API emailed (ADR-018); nothing leaves the test unless `realEmail` is set. */
  emails: RecordingEmailSender;
  /** The DNS and HTTPS custom domains are checked against (ADR-022). */
  dns: FakeDomainDns;
  tls: FakeDomainTls;
  close(): Promise<void>;
}

export interface TestAppOptions {
  env?: Partial<EnvInput>;
  /** Replace providers, e.g. the revalidation client: `builder.overrideProvider(X).useValue(y)`. */
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  /** Send through `SMTP_URL` (Mailpit) instead of recording. */
  realEmail?: boolean;
  /** Waits between notification attempts; short in tests of retries. */
  notificationRetryDelaysMs?: readonly number[];
  /**
   * Where the log goes instead of stdout; set `env.LOG_LEVEL` too, since tests run `silent`.
   * nestjs-pino builds one logger per process, so the first app of a test file decides both.
   */
  logDestination?: DestinationStream;
}

/** Boots the whole API against a database of its own, with every index built. */
export async function createTestApp(
  prefix: string,
  options: TestAppOptions = {},
): Promise<TestApp> {
  const mongoUri = isolatedMongoUri(prefix);
  const env = parseEnv(testEnvInput({ ...options.env, MONGODB_URI: mongoUri }));
  const emails = new RecordingEmailSender();
  const dns = new FakeDomainDns();
  const tls = new FakeDomainTls();
  let builder = Test.createTestingModule({
    imports: [AppModule.forRoot(env, options.logDestination)],
  })
    .overrideProvider(DomainDns)
    .useValue(dns)
    .overrideProvider(DomainTls)
    .useValue(tls);
  if (options.realEmail !== true) {
    builder = builder.overrideProvider(EmailSender).useValue(emails);
  }
  if (options.notificationRetryDelaysMs) {
    builder = builder
      .overrideProvider(NOTIFICATION_RETRY_DELAYS)
      .useValue(options.notificationRetryDelaysMs);
  }
  if (options.override) {
    builder = options.override(builder);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
    ...NEST_APP_OPTIONS,
  });
  configureApp(app, env);
  await app.init();
  // Its collections and indexes exist once it is initialized (`IndexBuilder`), as before serving.
  const connection = app.get<Connection>(getConnectionToken());
  return {
    app,
    env,
    connection,
    emails,
    dns,
    tls,
    async close() {
      await app.close();
      await dropDatabase(mongoUri);
    },
  };
}
