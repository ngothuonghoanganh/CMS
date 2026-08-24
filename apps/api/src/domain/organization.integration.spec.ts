import { randomUUID } from 'node:crypto';

import { getModelToken } from '@nestjs/mongoose';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Model } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { ApiExceptionFilter } from '../common/filters/api-exception.filter';
import { env } from '../config/env';
import { MASTER_CONNECTION } from '../tenancy/master-connection';
import { TenantRecord } from '../tenancy/schemas/tenant.schema';

const integrationEnabled = process.env.RUN_MONGO_TESTS === 'true';

describe.skipIf(!integrationEnabled)('tenant control-plane integration', () => {
  let app: INestApplication;
  let tenantModel: Model<TenantRecord>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    tenantModel = moduleRef.get<Model<TenantRecord>>(
      getModelToken(TenantRecord.name, MASTER_CONNECTION),
    );
    await app.init();
  }, 15_000);

  afterAll(async () => {
    await app.close();
  });

  it('provisions isolated databases and rejects cross-tenant context access', async () => {
    const suffix = randomUUID().slice(0, 8);
    const slug = `tenant-${suffix}`;
    const ownerEmail = `owner-${suffix}@example.com`;
    const ownerPassword = 'owner-password-123';
    const platformAgent = request.agent(app.getHttpServer());
    await platformAgent
      .post('/api/v1/auth/login')
      .send({
        email: env.AUTH_EMAIL,
        password: env.AUTH_PASSWORD,
        tenantSlug: env.AUTH_TENANT_SLUG,
      })
      .expect(200);

    const tenantResponse = await platformAgent
      .post('/api/v1/control-plane/tenants')
      .send({
        name: `Tenant ${suffix}`,
        slug,
        ownerEmail,
        ownerPassword,
      })
      .expect(201);
    expect(tenantResponse.body.status).toBe('active');
    expect(tenantResponse.body.databaseName).toContain(slug);
    await platformAgent
      .post(`/api/v1/control-plane/tenants/${tenantResponse.body.id}/provision`)
      .send({
        name: `Tenant ${suffix}`,
        slug,
        ownerEmail,
        ownerPassword,
      })
      .expect(201);

    const tenantAgent = request.agent(app.getHttpServer());
    await tenantAgent
      .post('/api/v1/auth/login')
      .send({ email: ownerEmail, password: ownerPassword, tenantSlug: slug })
      .expect(200);
    const tenantSession = await tenantAgent.get('/api/v1/auth/me').expect(200);
    const tenantWorkspaceId = tenantSession.body.workspace.id as string;

    const tenantSite = await tenantAgent
      .post(`/api/v1/workspaces/${tenantWorkspaceId}/sites`)
      .send({ name: 'Shared slug site', slug: `shared-slug-${suffix}` })
      .expect(201);

    const platformSession = await platformAgent.get('/api/v1/auth/me').expect(200);
    const platformWorkspaceId = platformSession.body.workspace.id as string;
    const platformSite = await platformAgent
      .post(`/api/v1/workspaces/${platformWorkspaceId}/sites`)
      .send({ name: 'Shared slug site', slug: `shared-slug-${suffix}` })
      .expect(201);

    expect(platformSite.body.id).not.toBe(tenantSite.body.id);
    expect(platformSite.body.workspaceId).not.toBe(tenantSite.body.workspaceId);
    await platformAgent.get(`/api/v1/workspaces/${tenantWorkspaceId}/sites`).expect(404);

    await tenantModel
      .updateOne({ _id: tenantResponse.body.id }, { $set: { status: 'archived' } })
      .exec();
  });
});
