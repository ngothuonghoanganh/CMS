import request from 'supertest';
import { healthResponseSchema } from '@plp/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../test/app.js';

describe('GET /health', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_health');
  });

  afterAll(async () => {
    await t.close();
  });

  it('reports the API and database as healthy without a session', async () => {
    const response = await request(t.app.getHttpServer()).get('/health').expect(200);
    expect(healthResponseSchema.parse(response.body)).toEqual({ status: 'ok', mongo: 'up' });
  });

  it('echoes the caller request id for log correlation', async () => {
    const response = await request(t.app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'test-request-id')
      .expect(200);
    expect(response.headers['x-request-id']).toBe('test-request-id');
  });

  it('runs MongoDB as a replica set, which publish transactions require', async () => {
    const db = t.connection.db;
    if (!db) {
      throw new Error('Database connection is not ready');
    }
    const hello: { setName?: string } = await db.admin().command({ hello: 1 });
    expect(hello.setName).toBe('rs0');
  });
});
