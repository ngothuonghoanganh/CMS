import { randomUUID } from 'node:crypto';

import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { ApiExceptionFilter } from '../common/filters/api-exception.filter';
import { env } from '../config/env';

const analyticsEnabled = process.env.RUN_MONGO_TESTS === 'true';

const publishedPayload = {
  version: 2 as const,
  metadata: { documentTitle: 'Analytics test page' },
  root: {
    id: 'root',
    type: 'root' as const,
    props: {},
    children: [
      {
        id: 'section',
        type: 'section' as const,
        props: {},
        children: [
          {
            id: 'cta-button',
            type: 'button' as const,
            props: { label: 'Start', href: '/start', target: '_self' as const },
            children: [],
          },
          {
            id: 'contact-form',
            type: 'form' as const,
            props: {
              fields: [
                {
                  id: 'name',
                  type: 'text' as const,
                  label: 'Name',
                  name: 'name',
                  required: true,
                },
              ],
              submitLabel: 'Submit',
              successMessage: 'Thanks',
            },
            children: [],
          },
        ],
      },
    ],
  },
};

describe.skipIf(!analyticsEnabled)('analytics API', () => {
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let workspaceId: string;
  let siteSlug: string;
  let pageSlug: string;
  let pageId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();

    agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ email: env.AUTH_EMAIL, password: env.AUTH_PASSWORD })
      .expect(200);
    const session = await agent.get('/api/v1/auth/me').expect(200);
    workspaceId = session.body.workspace.id;
    const suffix = randomUUID().slice(0, 8);
    siteSlug = `analytics-site-${suffix}`;
    pageSlug = `analytics-page-${suffix}`;
    const site = await agent
      .post(`/api/v1/workspaces/${workspaceId}/sites`)
      .send({ name: `Analytics site ${suffix}`, slug: siteSlug })
      .expect(201);
    const page = await agent
      .post(`/api/v1/sites/${site.body.id}/pages`)
      .send({
        name: `Analytics page ${suffix}`,
        slug: pageSlug,
        payload: publishedPayload,
      })
      .expect(201);
    pageId = page.body.id;
    await agent.post(`/api/v1/pages/${pageId}/publish`).send({}).expect(201);
  }, 15_000);

  afterAll(async () => {
    await app.close();
  });

  it('accepts published events, records server-side conversion and aggregates metrics', async () => {
    const sessionId = randomUUID();
    const rangeFrom = new Date(Date.now() - 60_000).toISOString();
    const rangeTo = new Date(Date.now() + 60_000).toISOString();

    await request(app.getHttpServer())
      .post('/api/v1/analytics/events')
      .set('user-agent', 'Mozilla/5.0')
      .send({
        version: 1,
        event: 'page.viewed',
        siteSlug,
        pageSlug,
        sessionId,
        context: {
          referrer: 'https://search.example/results?email=private@example.com#token',
          utmSource: 'newsletter',
          utmMedium: 'email',
          utmCampaign: 'launch',
          deviceType: 'desktop',
        },
      })
      .expect(202, { accepted: true });
    await request(app.getHttpServer())
      .post('/api/v1/analytics/events')
      .send({
        version: 1,
        event: 'element.clicked',
        siteSlug,
        pageSlug,
        nodeId: 'cta-button',
        sessionId,
      })
      .expect(202, { accepted: true });
    await request(app.getHttpServer())
      .post(
        `/api/v1/public/sites/${siteSlug}/pages/${pageSlug}/forms/contact-form/submissions`,
      )
      .send({
        analyticsSessionId: sessionId,
        values: [{ fieldId: 'name', value: 'Visitor' }],
      })
      .expect(201);

    const overview = await agent
      .get(
        `/api/v1/analytics/overview?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`,
      )
      .expect(200);
    expect(overview.body.metrics).toMatchObject({
      pageViews: expect.any(Number),
      sessions: expect.any(Number),
      submissions: expect.any(Number),
      ctaClicks: expect.any(Number),
    });
    expect(overview.body.metrics.pageViews).toBeGreaterThanOrEqual(1);
    expect(overview.body.metrics.submissions).toBeGreaterThanOrEqual(1);
    expect(overview.body.topReferrers).toContainEqual(
      expect.objectContaining({ name: 'search.example' }),
    );
    expect(overview.body.topCampaigns).toContainEqual(
      expect.objectContaining({ name: 'newsletter / email / launch' }),
    );
    expect(overview.body.topPages).toContainEqual(
      expect.objectContaining({ id: pageId }),
    );

    const pageReport = await agent
      .get(
        `/api/v1/analytics/pages/${pageId}?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`,
      )
      .expect(200);
    expect(pageReport.body.page.metrics.submissions).toBe(1);
  });

  it('rejects invalid targets and keeps analytics queries workspace-scoped', async () => {
    const sessionId = randomUUID();
    await request(app.getHttpServer())
      .post('/api/v1/analytics/events')
      .send({
        version: 1,
        event: 'element.clicked',
        siteSlug,
        pageSlug,
        nodeId: 'missing-button',
        sessionId,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/analytics/events')
      .send({
        version: 1,
        event: 'page.viewed',
        siteSlug,
        pageSlug,
        sessionId,
        email: 'should-not-be-accepted@example.com',
      })
      .expect(400);
    await agent.get(`/api/v1/analytics/pages/${randomUUID()}`).expect(404);
  });
});
