import 'reflect-metadata';
import { getConnectionToken } from '@nestjs/mongoose';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import { AppModule } from '../src/app.module.js';
import { configureApp, NEST_APP_OPTIONS } from '../src/configure-app.js';
import { DomainDns } from '../src/modules/domains/domain-dns.js';
import { DomainTls } from '../src/modules/domains/domain-tls.js';
import { EmailSender } from '../src/modules/notifications/email-sender.js';
import type { TestApp } from './app.js';
import { RecordingEmailSender } from './email.js';

/**
 * Another API process on the database of `first`, with the same environment: what a second
 * instance behind a load balancer shares with the first (MongoDB) and what it does not (anything
 * held in memory). It records emails like `createTestApp`, and asks the same DNS and HTTPS as
 * `first`. Closing it leaves the database to `first`, which drops it.
 */
export async function createSecondInstance(first: TestApp): Promise<TestApp> {
  const emails = new RecordingEmailSender();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(first.env)] })
    .overrideProvider(EmailSender)
    .useValue(emails)
    .overrideProvider(DomainDns)
    .useValue(first.dns)
    .overrideProvider(DomainTls)
    .useValue(first.tls)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
    ...NEST_APP_OPTIONS,
  });
  configureApp(app, first.env);
  await app.init();
  return {
    app,
    env: first.env,
    connection: app.get<Connection>(getConnectionToken()),
    workspaceDb: first.workspaceDb,
    emails,
    dns: first.dns,
    tls: first.tls,
    async close() {
      await app.close();
      emails.checkContract();
    },
  };
}
