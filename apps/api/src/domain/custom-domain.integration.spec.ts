import { randomUUID } from 'node:crypto';

import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Model } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { ApiExceptionFilter } from '../common/filters/api-exception.filter';
import { env } from '../config/env';
import { DOMAIN_VERIFICATION_RESOLVER } from './domain-verification-resolver';
import { CustomDomainRecord } from '../persistence/schemas/custom-domain.schema';
import { WorkspaceRecord } from '../persistence/schemas/workspace.schema';
import { withTestTenant } from '../testing/tenant-test-context';

const integrationEnabled = process.env.RUN_MONGO_TESTS === 'true';

const payload = (title: string) => ({
  version: 1 as const,
  metadata: { documentTitle: title, documentDescription: 'Public description' },
  root: { id: 'root', type: 'root' as const, props: {}, children: [] },
});

describe.skipIf(!integrationEnabled)('custom domain and SEO API', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let workspaceModel: Model<WorkspaceRecord>;
  let domainModel: Model<CustomDomainRecord>;
  const txtRecords = new Map<string, string[]>();

  beforeAll(async () => {
    const moduleBuilder = Test.createTestingModule({ imports: [AppModule] });
    moduleBuilder.overrideProvider(DOMAIN_VERIFICATION_RESOLVER).useValue({
      resolveTxt: async (hostname: string) => txtRecords.get(hostname) ?? [],
    });
    moduleRef = await moduleBuilder.compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    workspaceModel = moduleRef.get<Model<WorkspaceRecord>>(
      getModelToken(WorkspaceRecord.name),
    );
    domainModel = moduleRef.get<Model<CustomDomainRecord>>(
      getModelToken(CustomDomainRecord.name),
    );
    await app.init();
  }, 15_000);

  afterAll(async () => {
    await app.close();
  });

  it('verifies ownership, isolates unpublished content, resolves SEO and removes mappings', () =>
    withTestTenant(moduleRef, async () => {
      const suffix = randomUUID().slice(0, 8);
      const hostname = `landing-${suffix}.example.com`;
      const agent = request.agent(app.getHttpServer());
      await agent
        .post('/api/v1/auth/login')
        .send({ email: env.AUTH_EMAIL, password: env.AUTH_PASSWORD })
        .expect(200);
      const session = await agent.get('/api/v1/auth/me').expect(200);
      const workspaceId = session.body.workspace.id as string;

      const site = await agent
        .post(`/api/v1/workspaces/${workspaceId}/sites`)
        .send({ name: `Domain site ${suffix}`, slug: `domain-site-${suffix}` })
        .expect(201);
      const page = await agent
        .post(`/api/v1/sites/${site.body.id}/pages`)
        .send({
          name: `Domain page ${suffix}`,
          slug: `domain-page-${suffix}`,
          payload: payload('Domain v1'),
        })
        .expect(201);

      const domain = await agent
        .post(`/api/v1/workspaces/${workspaceId}/domains`)
        .send({
          hostname: `HTTPS://${hostname}/`,
          landingPageId: page.body.id,
          isPrimary: true,
        })
        .expect(400);
      expect(domain.body.error.code).toBe('INVALID_CUSTOM_DOMAIN');

      const created = await agent
        .post(`/api/v1/workspaces/${workspaceId}/domains`)
        .send({ hostname, landingPageId: page.body.id, isPrimary: true })
        .expect(201);
      expect(created.body.status).toBe('pending');
      expect(created.body.verificationToken).toBeTruthy();

      await agent.post(`/api/v1/pages/${page.body.id}/publish`).send({}).expect(201);
      await request(app.getHttpServer())
        .get(`/api/v1/public/domains/resolve?hostname=${hostname}`)
        .expect(404);

      const failed = await agent
        .post(`/api/v1/workspaces/${workspaceId}/domains/${created.body.id}/verify`)
        .expect(201);
      expect(failed.body.status).toBe('failed');
      await new Promise((resolve) => setTimeout(resolve, 1_050));
      txtRecords.set(created.body.verificationHostname, [created.body.verificationToken]);
      const active = await agent
        .post(`/api/v1/workspaces/${workspaceId}/domains/${created.body.id}/verify`)
        .expect(201);
      expect(active.body.status).toBe('active');

      const resolved = await request(app.getHttpServer())
        .get(`/api/v1/public/domains/resolve?hostname=${hostname}`)
        .expect(200);
      expect(resolved.body.payload.metadata.documentTitle).toBe('Domain v1');

      await agent
        .patch(`/api/v1/pages/${page.body.id}/seo`)
        .send({
          title: 'SEO title',
          description: 'SEO description',
          canonicalUrl: `https://${hostname}/`,
          ogTitle: 'OG title',
          twitterCard: 'summary_large_image',
          favicon: '/assets/favicon.ico',
        })
        .expect(200);
      const seoResolved = await request(app.getHttpServer())
        .get(`/api/v1/public/domains/resolve?hostname=${hostname}`)
        .expect(200);
      expect(seoResolved.body.seo).toMatchObject({
        title: 'SEO title',
        description: 'SEO description',
        ogTitle: 'OG title',
        twitterCard: 'summary_large_image',
      });
      expect(seoResolved.body.canonicalUrl).toBe(`https://${hostname}/`);

      await agent
        .post(`/api/v1/pages/${page.body.id}/versions`)
        .send({ expectedVersionNumber: 1, payload: payload('Domain draft') })
        .expect(201);
      const stillV1 = await request(app.getHttpServer())
        .get(`/api/v1/public/domains/resolve?hostname=${hostname}`)
        .expect(200);
      expect(stillV1.body.payload.metadata.documentTitle).toBe('Domain v1');

      await agent
        .post(`/api/v1/pages/${page.body.id}/publish`)
        .send({ versionNumber: 2 })
        .expect(201);
      const publishedV2 = await request(app.getHttpServer())
        .get(`/api/v1/public/domains/resolve?hostname=${hostname}`)
        .expect(200);
      expect(publishedV2.body.payload.metadata.documentTitle).toBe('Domain draft');

      await agent
        .post(`/api/v1/workspaces/${workspaceId}/domains`)
        .send({ hostname })
        .expect(409);
      await request(app.getHttpServer())
        .get(`/api/v1/public/domains/resolve?hostname=unknown-${suffix}.example.com`)
        .expect(404);

      const workspaceB = randomUUID();
      await workspaceModel.create({ _id: workspaceB, name: `Other ${suffix}` });
      await agent.get(`/api/v1/workspaces/${workspaceB}/domains`).expect(404);

      await agent
        .delete(`/api/v1/workspaces/${workspaceId}/domains/${created.body.id}`)
        .expect(204);
      await request(app.getHttpServer())
        .get(`/api/v1/public/domains/resolve?hostname=${hostname}`)
        .expect(404);
      expect(await domainModel.exists({ _id: created.body.id })).toBeNull();
    }));
});
