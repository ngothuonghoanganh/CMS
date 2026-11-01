import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { RecordingEmailSender } from '../../../test/email.js';
import { AppModule } from '../../app.module.js';
import { NEST_APP_OPTIONS } from '../../configure-app.js';
import {
  ANALYTICS_SALT_DAY_INDEX,
  ANALYTICS_SALT_MODEL,
} from '../../modules/analytics/analytics.schema.js';
import { EmailSender } from '../../modules/notifications/email-sender.js';

/** Indexes exist before the API serves, or it does not start (ADR-013). */
describe('IndexBuilder', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_indexes');
  });

  afterAll(async () => {
    await t.close();
  });

  it('has created every index the schemas declare once the API is initialized', async () => {
    const models = Object.values(t.connection.models);
    expect(models.length).toBeGreaterThan(10);
    for (const model of models) {
      const { toCreate } = await model.diffIndexes();
      expect({ model: model.modelName, missing: toCreate }).toEqual({
        model: model.modelName,
        missing: [],
      });
    }
  });

  it('does not start when an index cannot be built', async () => {
    // A unique index missing while duplicates got in: serving would keep breaking its invariant.
    const salts = t.connection.collection('analytics_salts');
    await salts.dropIndex(ANALYTICS_SALT_DAY_INDEX);
    const expiresAt = new Date(Date.now() + 86_400_000);
    await salts.insertMany([
      { day: '2026-11-01', salt: 'a', expiresAt },
      { day: '2026-11-01', salt: 'b', expiresAt },
    ]);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(t.env)] })
      .overrideProvider(EmailSender)
      .useValue(new RecordingEmailSender())
      .compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
      ...NEST_APP_OPTIONS,
    });
    try {
      await expect(app.init()).rejects.toMatchObject({
        message: `Creating the collection and indexes of ${ANALYTICS_SALT_MODEL} failed`,
        cause: { code: 11000 },
      });
    } finally {
      await app.close();
    }
  });
});
