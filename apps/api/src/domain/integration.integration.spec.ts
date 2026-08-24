import { randomUUID } from 'node:crypto';

import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { env } from '../config/env';
import { ApiExceptionFilter } from '../common/filters/api-exception.filter';
import {
  IntegrationDeliveryRecord,
  IntegrationRecord,
  WorkspaceRecord,
} from '../persistence/schemas';
import { withTestTenant } from '../testing/tenant-test-context';

const integrationEnabled = process.env.RUN_MONGO_TESTS === 'true';

const formPayload = (title: string) => ({
  version: 2 as const,
  metadata: { documentTitle: title },
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
});

describe.skipIf(!integrationEnabled || env.INTEGRATION_EMAIL_PROVIDER !== 'fake')(
  'integration delivery API',
  () => {
    let app: INestApplication;
    let moduleRef: TestingModule;
    let integrationModel: Model<IntegrationRecord>;
    let deliveryModel: Model<IntegrationDeliveryRecord>;
    let workspaceModel: Model<WorkspaceRecord>;

    beforeAll(async () => {
      moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleRef.createNestApplication();
      app.setGlobalPrefix('api/v1');
      app.useGlobalFilters(new ApiExceptionFilter());
      integrationModel = moduleRef.get<Model<IntegrationRecord>>(
        getModelToken(IntegrationRecord.name),
      );
      deliveryModel = moduleRef.get<Model<IntegrationDeliveryRecord>>(
        getModelToken(IntegrationDeliveryRecord.name),
      );
      workspaceModel = moduleRef.get<Model<WorkspaceRecord>>(
        getModelToken(WorkspaceRecord.name),
      );
      await app.init();
    }, 15_000);

    afterAll(async () => {
      await app.close();
    });

    it('persists an enabled integration and delivers after submission', () =>
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
          .send({
            name: `Integration site ${suffix}`,
            slug: `integration-site-${suffix}`,
          })
          .expect(201);
        const page = await agent
          .post(`/api/v1/sites/${site.body.id}/pages`)
          .send({
            name: `Integration page ${suffix}`,
            slug: `integration-page-${suffix}`,
            payload: formPayload(`Integration ${suffix}`),
          })
          .expect(201);
        const integration = await agent
          .post(`/api/v1/workspaces/${workspaceId}/integrations`)
          .send({
            type: 'email',
            name: 'Sales email',
            enabled: true,
            config: {
              recipients: [`sales-${suffix}@example.com`],
              subjectTemplate: 'New submission from {{pageTitle}}',
            },
          })
          .expect(201);
        expect(integration.body.secret).toBeUndefined();
        expect(integration.body.config.type).toBe('email');

        await agent
          .patch(`/api/v1/pages/${page.body.id}/form-integrations/contact-form`)
          .send({ integrationIds: [integration.body.id] })
          .expect(200);
        await agent.post(`/api/v1/pages/${page.body.id}/publish`).send({}).expect(201);
        await request(app.getHttpServer())
          .post(
            `/api/v1/public/sites/integration-site-${suffix}/pages/integration-page-${suffix}/forms/contact-form/submissions`,
          )
          .send({ values: [{ fieldId: 'name', value: 'Jane' }] })
          .expect(201);

        let submissionId = '';
        for (let attempt = 0; attempt < 10 && !submissionId; attempt += 1) {
          const submissions = await agent
            .get(`/api/v1/submissions?search=Jane&limit=100`)
            .expect(200);
          submissionId = submissions.body.items.find((item: { pageName: string }) =>
            item.pageName.includes(suffix),
          )?.id;
          if (!submissionId) await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(submissionId).toBeTruthy();

        let deliveries = await agent
          .get(`/api/v1/integration-deliveries?submissionId=${submissionId}`)
          .expect(200);
        for (let attempt = 0; attempt < 30; attempt += 1) {
          if (deliveries.body.items[0]?.status === 'delivered') break;
          await new Promise((resolve) => setTimeout(resolve, 100));
          deliveries = await agent
            .get(`/api/v1/integration-deliveries?submissionId=${submissionId}`)
            .expect(200);
        }
        expect(deliveries.body.items).toEqual([
          expect.objectContaining({
            integrationName: 'Sales email',
            status: 'delivered',
            attemptCount: 1,
          }),
        ]);
        expect(
          await deliveryModel.findOne({ submissionId, workspaceId }).lean().exec(),
        ).toMatchObject({ status: 'delivered' });
        expect(await integrationModel.countDocuments({ workspaceId })).toBeGreaterThan(0);
      }));

    it('enforces workspace scoping for integration APIs', () =>
      withTestTenant(moduleRef, async () => {
        const agent = request.agent(app.getHttpServer());
        await agent
          .post('/api/v1/auth/login')
          .send({ email: env.AUTH_EMAIL, password: env.AUTH_PASSWORD })
          .expect(200);
        const workspaceB = randomUUID();
        await workspaceModel.create({ _id: workspaceB, name: 'Other workspace' });

        await agent.get(`/api/v1/workspaces/${workspaceB}/integrations`).expect(404);
        await agent
          .get(`/api/v1/workspaces/${workspaceB}/integrations/${randomUUID()}`)
          .expect(404);
      }));
  },
);
