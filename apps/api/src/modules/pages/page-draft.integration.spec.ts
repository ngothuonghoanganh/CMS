import { randomUUID } from 'node:crypto';

import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Model } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module';
import { ApiExceptionFilter } from '../../common/filters/api-exception.filter';
import { env } from '../../config/env';
import { PageDraftRecord } from '../../persistence/schemas/page-draft.schema';
import { PageRecord } from '../../persistence/schemas/page.schema';
import { PageVersionRecord } from '../../persistence/schemas/page-version.schema';
import { SiteRecord } from '../../persistence/schemas/site.schema';
import { MASTER_CONNECTION } from '../../tenancy/master-connection';
import { PublicSiteRouteRecord } from '../../tenancy/schemas/public-site-route.schema';
import { withTestTenant } from '../../testing/tenant-test-context';

const integrationEnabled = process.env.RUN_MONGO_TESTS === 'true';

describe.skipIf(!integrationEnabled)('canonical Draft API and Mongo persistence', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let drafts: Model<PageDraftRecord>;
  let pages: Model<PageRecord>;
  let versions: Model<PageVersionRecord>;
  let sites: Model<SiteRecord>;
  let routes: Model<PublicSiteRouteRecord>;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    drafts = moduleRef.get(getModelToken(PageDraftRecord.name));
    pages = moduleRef.get(getModelToken(PageRecord.name));
    versions = moduleRef.get(getModelToken(PageVersionRecord.name));
    sites = moduleRef.get(getModelToken(SiteRecord.name));
    routes = moduleRef.get(getModelToken(PublicSiteRouteRecord.name, MASTER_CONNECTION));
    await app.init();
  }, 15_000);

  afterAll(async () => {
    await app?.close();
  });

  it(
    'creates, saves and reloads one Draft; rejects invalid, stale and foreign writes',
    () =>
      withTestTenant(moduleRef, async () => {
        const suffix = randomUUID().slice(0, 8);
        const agent = request.agent(app.getHttpServer());
        await agent
          .post('/api/v1/auth/login')
          .send({ email: env.AUTH_EMAIL, password: env.AUTH_PASSWORD })
          .expect(200);
        const session = await agent.get('/api/v1/auth/me').expect(200);
        const workspaceId = session.body.workspace.id as string;

        const site = await agent
          .post(`/api/v1/workspaces/${workspaceId}/sites`)
          .send({ name: `Draft site ${suffix}`, slug: `draft-site-${suffix}` })
          .expect(201);
        const siteId = site.body.id as string;

        try {
          const homeDraft = await agent
            .get(`/api/v1/pages/${site.body.homePageId as string}/draft`)
            .expect(200);
          expect(homeDraft.body.versionNumber).toBe(1);

          const page = await agent
            .post(`/api/v1/sites/${siteId}/pages`)
            .send({ name: `Canonical ${suffix}`, path: `/canonical-${suffix}` })
            .expect(201);
          const pageId = page.body.id as string;
          expect(page.body.currentDraftVersionId).toBeUndefined();
          expect(await versions.countDocuments({ landingPageId: pageId })).toBe(0);

          const initial = await agent.get(`/api/v1/pages/${pageId}/draft`).expect(200);
          expect(initial.body.versionNumber).toBe(1);
          expect(initial.body.composition).toEqual({
            version: 1,
            root: { id: 'root', type: 'root', props: {}, children: [] },
            settings: {},
          });

          const composition = {
            version: 1,
            root: {
              id: 'root',
              type: 'root',
              props: {},
              children: [
                {
                  id: 'hero',
                  type: 'section',
                  props: {},
                  children: [
                    {
                      id: 'copy',
                      type: 'text',
                      props: { text: 'Saved content' },
                      children: [],
                    },
                  ],
                },
              ],
            },
            settings: {},
          };
          const saved = await agent
            .put(`/api/v1/pages/${pageId}/draft`)
            .send({ expectedVersionNumber: 1, composition })
            .expect(200);
          expect(saved.body.versionNumber).toBe(2);
          expect(saved.body.composition).toEqual(composition);
          const reloaded = await agent.get(`/api/v1/pages/${pageId}/draft`).expect(200);
          expect(reloaded.body.composition).toEqual(composition);

          const invalid = await agent
            .put(`/api/v1/pages/${pageId}/draft`)
            .send({
              expectedVersionNumber: 2,
              composition: { ...composition, root: { ...composition.root, id: 'wrong' } },
            })
            .expect(400);
          expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
          const unchanged = await agent.get(`/api/v1/pages/${pageId}/draft`).expect(200);
          expect(unchanged.body.versionNumber).toBe(2);
          expect(unchanged.body.composition).toEqual(composition);

          const stale = await agent
            .put(`/api/v1/pages/${pageId}/draft`)
            .send({ expectedVersionNumber: 1, composition })
            .expect(409);
          expect(stale.body.error.code).toBe('DRAFT_VERSION_CONFLICT');

          await agent.get(`/api/v1/pages/${randomUUID()}/draft`).expect(404);
          expect(await drafts.countDocuments({ pageId })).toBe(1);
          await expect(
            drafts.create({
              _id: randomUUID(),
              workspaceId,
              siteId,
              pageId,
              versionNumber: 1,
              composition,
            }),
          ).rejects.toMatchObject({ code: 11000 });
        } finally {
          await drafts.deleteMany({ siteId, workspaceId }).exec();
          await versions.deleteMany({ siteId, workspaceId }).exec();
          await pages.deleteMany({ siteId, workspaceId }).exec();
          await sites.deleteOne({ _id: siteId, workspaceId }).exec();
          await routes.deleteMany({ siteId, workspaceId }).exec();
        }
      }),
    30_000,
  );
});
