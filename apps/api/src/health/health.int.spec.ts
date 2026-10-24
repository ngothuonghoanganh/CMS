import 'reflect-metadata';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { healthResponseSchema } from '@plp/contracts';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dropDatabase, isolatedMongoUri } from '../../test/mongo.js';
import { AppModule } from '../app.module.js';
import { parseEnv } from '../config/env.js';

describe('GET /health', () => {
  const mongoUri = isolatedMongoUri('plp_test_health');
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const env = parseEnv({ MONGODB_URI: mongoUri, NODE_ENV: 'test', LOG_LEVEL: 'silent' });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(env)],
    }).compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await dropDatabase(mongoUri);
  });

  it('reports the API and database as healthy', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(healthResponseSchema.parse(response.body)).toEqual({ status: 'ok', mongo: 'up' });
  });

  it('echoes the caller request id for log correlation', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'test-request-id')
      .expect(200);
    expect(response.headers['x-request-id']).toBe('test-request-id');
  });

  it('runs MongoDB as a replica set, which publish transactions require', async () => {
    const db = app.get<Connection>(getConnectionToken()).db;
    if (!db) {
      throw new Error('Database connection is not ready');
    }
    const hello: { setName?: string } = await db.admin().command({ hello: 1 });
    expect(hello.setName).toBe('rs0');
  });
});
