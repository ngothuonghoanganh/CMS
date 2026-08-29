import { createHash, randomUUID } from 'node:crypto';

import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Model } from 'mongoose';
import {
  PAGE_PAYLOAD_MAX_NODES,
  type PageNode,
  type FormField,
  type PagePayload,
} from '@payload/contracts';

import { AppModule } from '../app.module';
import { ApiExceptionFilter } from '../common/filters/api-exception.filter';
import { env } from '../config/env';
import { withTestTenant } from '../testing/tenant-test-context';
import { AuthSessionRecord } from '../persistence/schemas/auth-session.schema';
import { FormSubmissionRecord } from '../persistence/schemas/form-submission.schema';
import { PageRecord } from '../persistence/schemas/page.schema';
import { PageVersionRecord } from '../persistence/schemas/page-version.schema';
import { SiteRecord } from '../persistence/schemas/site.schema';
import { WorkspaceRecord } from '../persistence/schemas/workspace.schema';

const integrationEnabled = process.env.RUN_MONGO_TESTS === 'true';

function createPayload(documentTitle: string): PagePayload {
  return {
    version: 1,
    metadata: { documentTitle },
    root: { id: 'root', type: 'root', props: {}, children: [] },
  };
}

function createNodeLimitPayload(): PagePayload {
  const children: PageNode[] = Array.from(
    { length: PAGE_PAYLOAD_MAX_NODES },
    (_, index) => ({
      id: `section-${index}`,
      type: 'section',
      props: {},
      children: [],
    }),
  );

  return {
    ...createPayload('Node limit'),
    root: { id: 'root', type: 'root', props: {}, children },
  };
}

function createFormPayload(title: string, fields: FormField[]): PagePayload {
  return {
    version: 2,
    metadata: { documentTitle: title },
    root: {
      id: 'root',
      type: 'root',
      props: {},
      children: [
        {
          id: 'form-section',
          type: 'section',
          props: {},
          children: [
            {
              id: 'contact-form',
              type: 'form',
              props: {
                fields,
                submitLabel: 'Send',
                successMessage: 'Thanks for reaching out.',
              },
              children: [],
            },
          ],
        },
      ],
    },
  };
}

const nameField: FormField = {
  id: 'name',
  type: 'text',
  label: 'Name',
  name: 'name',
  required: true,
};
const emailField: FormField = {
  id: 'email',
  type: 'email',
  label: 'Email',
  name: 'email',
  required: true,
};
const phoneField: FormField = {
  id: 'phone',
  type: 'phone',
  label: 'Phone',
  name: 'phone',
  required: true,
};

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function readCookie(setCookie: string[] | undefined, name: string): string {
  const value = setCookie
    ?.find((cookie) => cookie.startsWith(`${name}=`))
    ?.split(';', 1)[0]
    ?.slice(name.length + 1);
  if (!value) {
    throw new Error(`Cookie ${name} was not set`);
  }
  return value;
}

describe.skipIf(!integrationEnabled)('domain API integration', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let pageModel: Model<PageRecord>;
  let versionModel: Model<PageVersionRecord>;
  let submissionModel: Model<FormSubmissionRecord>;
  let siteModel: Model<SiteRecord>;
  let workspaceModel: Model<WorkspaceRecord>;
  let authSessionModel: Model<AuthSessionRecord>;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    pageModel = moduleRef.get<Model<PageRecord>>(getModelToken(PageRecord.name));
    versionModel = moduleRef.get<Model<PageVersionRecord>>(
      getModelToken(PageVersionRecord.name),
    );
    submissionModel = moduleRef.get<Model<FormSubmissionRecord>>(
      getModelToken(FormSubmissionRecord.name),
    );
    authSessionModel = moduleRef.get<Model<AuthSessionRecord>>(
      getModelToken(AuthSessionRecord.name),
    );
    siteModel = moduleRef.get<Model<SiteRecord>>(getModelToken(SiteRecord.name));
    workspaceModel = moduleRef.get<Model<WorkspaceRecord>>(
      getModelToken(WorkspaceRecord.name),
    );
    await app.init();
  }, 15_000);

  afterAll(async () => {
    await app.close();
  });

  it('persists, rotates, expires and revokes refresh sessions', () =>
    withTestTenant(moduleRef, async () => {
      const basePath = '/api/v1/auth';
      const refreshCookieName = env.AUTH_REFRESH_TOKEN_COOKIE_NAME;
      const credentials = { email: env.AUTH_EMAIL, password: env.AUTH_PASSWORD };
      const agent = request.agent(app.getHttpServer());

      const loginResponse = await agent
        .post(`${basePath}/login`)
        .send(credentials)
        .expect(200);
      const initialRefreshToken = readCookie(
        loginResponse.headers['set-cookie'],
        refreshCookieName,
      );
      expect(
        await authSessionModel.findOne({
          refreshTokenHash: hashRefreshToken(initialRefreshToken),
        }),
      ).toBeTruthy();

      const refreshResponse = await agent.post(`${basePath}/refresh`).expect(200);
      const rotatedRefreshToken = readCookie(
        refreshResponse.headers['set-cookie'],
        refreshCookieName,
      );
      expect(rotatedRefreshToken).not.toBe(initialRefreshToken);

      const staleResponse = await request(app.getHttpServer())
        .post(`${basePath}/refresh`)
        .set('Cookie', `${refreshCookieName}=${initialRefreshToken}`)
        .expect(401);
      expect(staleResponse.body.error.code).toBe('REFRESH_TOKEN_INVALID');

      await authSessionModel.updateOne(
        { refreshTokenHash: hashRefreshToken(rotatedRefreshToken) },
        { $set: { expiresAt: new Date(Date.now() - 1_000) } },
      );
      const expiredResponse = await request(app.getHttpServer())
        .post(`${basePath}/refresh`)
        .set('Cookie', `${refreshCookieName}=${rotatedRefreshToken}`)
        .expect(401);
      expect(expiredResponse.body.error.code).toBe('REFRESH_TOKEN_EXPIRED');

      await agent.post(`${basePath}/login`).send(credentials).expect(200);
      await agent.post(`${basePath}/logout`).expect(204);
      await agent.get(`${basePath}/me`).expect(401);
    }));

  it('covers ownership, page/version creation, pagination and immutable snapshots', () =>
    withTestTenant(moduleRef, async () => {
      const suffix = randomUUID().slice(0, 8);
      const payloadV1 = createPayload(`Integration ${suffix} V1`);
      const payloadV2 = createPayload(`Integration ${suffix} V2`);
      const agent = request.agent(app.getHttpServer());

      await agent
        .post('/api/v1/auth/login')
        .send({ email: env.AUTH_EMAIL, password: env.AUTH_PASSWORD })
        .expect(200);

      const sessionResponse = await agent.get('/api/v1/auth/me').expect(200);
      const workspaceA = (sessionResponse.body as { workspace: { id: string } }).workspace
        .id;

      const workspaceB = randomUUID();
      await workspaceModel.create({
        _id: workspaceB,
        name: `Workspace B ${suffix}`,
      });

      const siteAResponse = await agent
        .post(`/api/v1/workspaces/${workspaceA}/sites`)
        .send({ name: `Site A ${suffix}`, slug: `site-a-${suffix}` })
        .expect(201);
      const siteA = (siteAResponse.body as { id: string }).id;

      const siteB = randomUUID();
      await siteModel.create({
        _id: siteB,
        name: `Site B ${suffix}`,
        slug: `site-b-${suffix}`,
        workspaceId: workspaceB,
      });

      await agent.get(`/api/v1/workspaces/${workspaceA}/sites/${siteB}`).expect(404);

      const pageB = randomUUID();
      const versionB = randomUUID();
      await pageModel.create({
        _id: pageB,
        workspaceId: workspaceB,
        siteId: siteB,
        name: `Page B ${suffix}`,
        slug: `page-b-${suffix}`,
        currentDraftVersionId: versionB,
      });
      await versionModel.create({
        _id: versionB,
        workspaceId: workspaceB,
        siteId: siteB,
        landingPageId: pageB,
        versionNumber: 1,
        payload: payloadV1,
      });
      await agent.post(`/api/v1/pages/${pageB}/publish`).send({}).expect(404);

      const pageResponse = await agent
        .post(`/api/v1/sites/${siteA}/pages`)
        .send({ name: `Page ${suffix}`, slug: `page-${suffix}`, payload: payloadV1 })
        .expect(201);
      const page = pageResponse.body as {
        id: string;
        currentDraftVersionId: string;
      };

      const pageListResponse = await agent
        .get(`/api/v1/sites/${siteA}/pages`)
        .expect(200);
      // Site provisioning creates the invariant homepage before user-created pages.
      expect(pageListResponse.body.items).toHaveLength(2);
      expect(pageListResponse.body.pagination).toMatchObject({
        limit: 20,
        offset: 0,
        total: 2,
        hasNextPage: false,
      });
      await agent.get(`/api/v1/sites/${siteA}/pages?limit=101`).expect(400);

      const firstVersionsResponse = await agent
        .get(`/api/v1/pages/${page.id}/versions`)
        .expect(200);
      expect(firstVersionsResponse.body.items).toHaveLength(1);
      expect(firstVersionsResponse.body.items[0].versionNumber).toBe(1);
      expect(firstVersionsResponse.body.items[0].id).toBe(page.currentDraftVersionId);

      const versionTwoResponse = await agent
        .post(`/api/v1/pages/${page.id}/versions`)
        .send({ expectedVersionNumber: 1, payload: payloadV2 })
        .expect(201);
      const versionTwoId = (versionTwoResponse.body as { id: string }).id;
      const staleVersionResponse = await agent
        .post(`/api/v1/pages/${page.id}/versions`)
        .send({ expectedVersionNumber: 1, payload: payloadV1 })
        .expect(409);
      expect(staleVersionResponse.body.error.code).toBe('PAGE_VERSION_CONFLICT');

      const updatedPageResponse = await agent.get(`/api/v1/pages/${page.id}`).expect(200);
      expect(updatedPageResponse.body.currentDraftVersionId).toBe(versionTwoId);

      const firstPageResponse = await agent
        .get(`/api/v1/pages/${page.id}/versions?limit=1&offset=1`)
        .expect(200);
      expect(firstPageResponse.body.items[0]).toMatchObject({
        versionNumber: 1,
        payload: payloadV1,
      });
      expect(firstPageResponse.body.pagination.hasNextPage).toBe(false);

      const secondPageResponse = await agent
        .get(`/api/v1/pages/${page.id}/versions?limit=1&offset=0`)
        .expect(200);
      expect(secondPageResponse.body.items[0]).toMatchObject({
        versionNumber: 2,
        payload: payloadV2,
      });
      expect(secondPageResponse.body.pagination.hasNextPage).toBe(true);

      const staleResponse = await agent
        .patch(`/api/v1/pages/${page.id}`)
        .send({ expectedVersionNumber: 1, name: 'Stale write' })
        .expect(409);
      expect(staleResponse.body.error.code).toBe('PAGE_VERSION_CONFLICT');

      await agent
        .post(`/api/v1/sites/${siteA}/pages`)
        .send({ name: 'Duplicate slug', slug: `page-${suffix}`, payload: payloadV1 })
        .expect(409);

      await agent.delete(`/api/v1/pages/${page.id}`).expect(204);
      const missingPageResponse = await agent.get(`/api/v1/pages/${page.id}`);
      expect(missingPageResponse.status, JSON.stringify(missingPageResponse.body)).toBe(
        404,
      );
      await agent.get(`/api/v1/pages/${page.id}/versions`).expect(404);
    }));

  it('validates unsafe URLs and resource limits through the HTTP boundary', () =>
    withTestTenant(moduleRef, async () => {
      const suffix = randomUUID().slice(0, 8);
      const agent = request.agent(app.getHttpServer());
      await agent
        .post('/api/v1/auth/login')
        .send({ email: env.AUTH_EMAIL, password: env.AUTH_PASSWORD })
        .expect(200);
      const sessionResponse = await agent.get('/api/v1/auth/me').expect(200);
      const workspaceId = (sessionResponse.body as { workspace: { id: string } })
        .workspace.id;
      const siteResponse = await agent
        .post(`/api/v1/workspaces/${workspaceId}/sites`)
        .send({ name: `Validation Site ${suffix}`, slug: `validation-${suffix}` })
        .expect(201);
      const siteId = (siteResponse.body as { id: string }).id;
      const pageResponse = await agent
        .post(`/api/v1/sites/${siteId}/pages`)
        .send({ name: `Validation Page ${suffix}`, payload: createPayload('Valid') })
        .expect(201);
      const pageId = (pageResponse.body as { id: string }).id;

      const unsafePayload = {
        ...createPayload('Unsafe URL'),
        root: {
          id: 'root',
          type: 'root',
          props: {},
          children: [
            {
              id: 'unsafe-button',
              type: 'button',
              props: { label: 'Unsafe', href: 'javascript:alert(1)', target: '_self' },
              children: [],
            },
          ],
        },
      };
      const unsafeResponse = await agent
        .post(`/api/v1/pages/${pageId}/versions`)
        .send({ payload: unsafePayload })
        .expect(400);
      expect(unsafeResponse.body.error.code).toBe('INVALID_PAGE_PAYLOAD');

      const limitResponse = await agent
        .post(`/api/v1/pages/${pageId}/versions`)
        .send({ payload: createNodeLimitPayload() })
        .expect(400);
      expect(limitResponse.body.error.code).toBe('PAGE_PAYLOAD_LIMIT_EXCEEDED');
    }));

  it('keeps public delivery on the published immutable snapshot', () =>
    withTestTenant(moduleRef, async () => {
      const suffix = randomUUID().slice(0, 8);
      const payloadV1 = createPayload(`Public ${suffix} V1`);
      const payloadV2 = createPayload(`Public ${suffix} V2`);
      const agent = request.agent(app.getHttpServer());

      await agent
        .post('/api/v1/auth/login')
        .send({ email: env.AUTH_EMAIL, password: env.AUTH_PASSWORD })
        .expect(200);
      const sessionResponse = await agent.get('/api/v1/auth/me').expect(200);
      const workspaceId = (sessionResponse.body as { workspace: { id: string } })
        .workspace.id;
      const siteResponse = await agent
        .post(`/api/v1/workspaces/${workspaceId}/sites`)
        .send({ name: `Public site ${suffix}`, slug: `public-site-${suffix}` })
        .expect(201);
      const siteId = (siteResponse.body as { id: string }).id;
      const pageResponse = await agent
        .post(`/api/v1/sites/${siteId}/pages`)
        .send({
          name: `Public page ${suffix}`,
          slug: `public-page-${suffix}`,
          payload: payloadV1,
        })
        .expect(201);
      const pageId = (pageResponse.body as { id: string }).id;
      const publicPath = `/api/v1/public/sites/public-site-${suffix}/pages/public-page-${suffix}`;

      await request(app.getHttpServer()).get(publicPath).expect(404);

      const publishResponse = await agent
        .post(`/api/v1/pages/${pageId}/publish`)
        .send({})
        .expect(201);
      expect(publishResponse.body.publishedVersionId).toBeTruthy();

      const firstPublicResponse = await request(app.getHttpServer())
        .get(publicPath)
        .expect(200);
      expect(firstPublicResponse.body).toEqual({
        tenantSlug: env.AUTH_TENANT_SLUG,
        page: { name: `Public page ${suffix}`, slug: `public-page-${suffix}` },
        payload: payloadV1,
        site: { name: `Public site ${suffix}`, slug: `public-site-${suffix}` },
      });
      expect(firstPublicResponse.body.workspaceId).toBeUndefined();

      await agent
        .post(`/api/v1/pages/${pageId}/versions`)
        .send({ expectedVersionNumber: 1, payload: payloadV2 })
        .expect(201);
      const draftResponse = await request(app.getHttpServer())
        .get(publicPath)
        .expect(200);
      expect(draftResponse.body.payload).toEqual(payloadV1);

      const previewResponse = await agent
        .get(`/api/v1/preview/pages/${pageId}`)
        .expect(200);
      expect(previewResponse.body.payload).toEqual(payloadV2);
      expect(previewResponse.body.page).toMatchObject({
        name: `Public page ${suffix}`,
        slug: `public-page-${suffix}`,
      });
      await request(app.getHttpServer())
        .get(`/api/v1/preview/pages/${pageId}`)
        .expect(401);

      await agent
        .post(`/api/v1/pages/${pageId}/publish`)
        .send({ versionNumber: 2 })
        .expect(201);
      const republishedResponse = await request(app.getHttpServer())
        .get(publicPath)
        .expect(200);
      expect(republishedResponse.body.payload).toEqual(payloadV2);

      await agent.post(`/api/v1/pages/${pageId}/unpublish`).expect(201);
      await request(app.getHttpServer()).get(publicPath).expect(404);
    }));

  it('enforces the unique page version index at MongoDB level', () =>
    withTestTenant(moduleRef, async () => {
      const page = await versionModel.findOne().sort({ createdAt: -1 }).exec();
      expect(page).not.toBeNull();
      if (!page) {
        return;
      }

      await versionModel.init();
      const duplicate = {
        _id: randomUUID(),
        workspaceId: page.workspaceId,
        siteId: page.siteId,
        landingPageId: page.landingPageId,
        versionNumber: page.versionNumber,
        payload: createPayload('Index duplicate'),
      };
      await expect(versionModel.create(duplicate)).rejects.toMatchObject({ code: 11000 });
    }));

  it('accepts only published form schemas and keeps submissions scoped to that version', () =>
    withTestTenant(moduleRef, async () => {
      const suffix = randomUUID().slice(0, 8);
      const agent = request.agent(app.getHttpServer());
      await agent
        .post('/api/v1/auth/login')
        .send({ email: env.AUTH_EMAIL, password: env.AUTH_PASSWORD })
        .expect(200);
      const sessionResponse = await agent.get('/api/v1/auth/me').expect(200);
      const workspaceId = (sessionResponse.body as { workspace: { id: string } })
        .workspace.id;
      const siteResponse = await agent
        .post(`/api/v1/workspaces/${workspaceId}/sites`)
        .send({ name: `Forms site ${suffix}`, slug: `forms-site-${suffix}` })
        .expect(201);
      const siteId = (siteResponse.body as { id: string }).id;
      const initialPayload = createFormPayload(`Form ${suffix}`, [nameField, emailField]);
      const pageResponse = await agent
        .post(`/api/v1/sites/${siteId}/pages`)
        .send({
          name: `Form page ${suffix}`,
          slug: `form-page-${suffix}`,
          payload: initialPayload,
        })
        .expect(201);
      const pageId = (pageResponse.body as { id: string }).id;
      const publicPath = `/api/v1/public/sites/forms-site-${suffix}/pages/form-page-${suffix}`;
      const submitPath = `${publicPath}/forms/contact-form/submissions`;

      await request(app.getHttpServer())
        .post(submitPath)
        .send({ values: [{ fieldId: 'name', value: 'Draft visitor' }] })
        .expect(404);

      await agent.post(`/api/v1/pages/${pageId}/publish`).send({}).expect(201);
      const validResponse = await request(app.getHttpServer())
        .post(submitPath)
        .send({
          values: [
            { fieldId: 'name', value: 'Jane Visitor' },
            { fieldId: 'email', value: 'jane@example.com' },
          ],
        })
        .expect(201);
      expect(validResponse.body).toEqual({ success: true });

      await request(app.getHttpServer())
        .post(submitPath)
        .send({
          values: [
            { fieldId: 'name', value: 'Jane Visitor' },
            { fieldId: 'email', value: 'not-an-email' },
          ],
        })
        .expect(400);
      await request(app.getHttpServer())
        .post(submitPath)
        .send({
          values: [
            { fieldId: 'name', value: 'Jane Visitor' },
            { fieldId: 'email', value: 'jane@example.com' },
            { fieldId: 'workspaceId', value: 'spoofed' },
          ],
        })
        .expect(400);

      const draftPayload = createFormPayload(`Form ${suffix} draft`, [
        nameField,
        phoneField,
      ]);
      await agent
        .post(`/api/v1/pages/${pageId}/versions`)
        .send({ expectedVersionNumber: 1, payload: draftPayload })
        .expect(201);
      await request(app.getHttpServer())
        .post(submitPath)
        .send({
          values: [
            { fieldId: 'name', value: 'Still published' },
            { fieldId: 'email', value: 'still@example.com' },
          ],
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(submitPath)
        .send({
          values: [
            { fieldId: 'name', value: 'Draft schema' },
            { fieldId: 'phone', value: '0901234567' },
          ],
        })
        .expect(400);

      await agent
        .post(`/api/v1/pages/${pageId}/publish`)
        .send({ versionNumber: 2 })
        .expect(201);
      await request(app.getHttpServer())
        .post(submitPath)
        .send({
          values: [
            { fieldId: 'name', value: 'New schema' },
            { fieldId: 'phone', value: '0901234567' },
          ],
        })
        .expect(201);

      for (let attempt = 0; attempt < 15; attempt += 1) {
        const response = await request(app.getHttpServer())
          .post(submitPath)
          .send({
            values: [
              { fieldId: 'name', value: `Rate test ${attempt}` },
              { fieldId: 'phone', value: '0901234567' },
            ],
          });
        expect(response.status).toBe(attempt === 14 ? 429 : 201);
        if (attempt === 14) {
          expect(response.body.error.code).toBe('FORM_RATE_LIMITED');
        }
      }

      const submissions = await agent
        .get('/api/v1/submissions?limit=10&search=jane@example.com')
        .expect(200);
      expect(submissions.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            pageName: `Form page ${suffix}`,
            fields: expect.arrayContaining([
              expect.objectContaining({ fieldId: 'email', value: 'jane@example.com' }),
            ]),
          }),
        ]),
      );
      const submissionId = submissions.body.items[0].id as string;
      await agent
        .patch(`/api/v1/submissions/${submissionId}`)
        .send({ status: 'read' })
        .expect(200);
      expect(
        await submissionModel.findOne({ _id: submissionId, workspaceId }).exec(),
      ).toMatchObject({ status: 'read', pageVersionId: expect.any(String) });

      const workspaceB = randomUUID();
      await workspaceModel.create({ _id: workspaceB, name: `Other ${suffix}` });
      await submissionModel.create({
        _id: randomUUID(),
        workspaceId: workspaceB,
        siteId,
        landingPageId: pageId,
        pageVersionId: (pageResponse.body as { currentDraftVersionId: string })
          .currentDraftVersionId,
        formNodeId: 'contact-form',
        values: [{ fieldId: 'name', value: 'Private' }],
        status: 'new',
        submittedAt: new Date(),
      });
      await agent.get('/api/v1/submissions?limit=100').expect(200);
      expect((await agent.get('/api/v1/submissions?limit=100')).body.items).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ workspaceId: workspaceB })]),
      );
    }));
});
