import {
  activityListResponseSchema,
  problemSchema,
  siteListResponseSchema,
  siteSchema,
  subdomainAvailabilitySchema,
} from '@plp/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { addEditor, createSite, uniqueSubdomain, uploadImage } from '../../../test/resources.js';
import { ActivityRepository } from '../activity/activity.repository.js';

describe('sites', () => {
  let t: TestApp;
  let owner: TestClient;
  let ownerName: string;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_sites', {
      env: { PUBLIC_SITE_ORIGIN_TEMPLATE: 'https://{subdomain}.payload.example' },
    });
    const signedUp = await signedUpClient(t.app, { name: 'Chủ Workspace' });
    owner = signedUp.client;
    ownerName = signedUp.me.user.name;
    workspaceId = signedUp.workspaceId;
  });

  afterAll(async () => {
    await t.close();
  });

  describe('create, list, get', () => {
    it('creates a site with the default theme and its default origin from the template', async () => {
      const subdomain = uniqueSubdomain('smile');
      const response = await owner
        .post(`/workspaces/${workspaceId}/sites`, {
          name: '  Nha khoa Smile Care  ',
          subdomain: subdomain.toUpperCase(),
        })
        .expect(201);
      const site = siteSchema.parse(response.body);
      expect(site).toMatchObject({
        workspaceId,
        name: 'Nha khoa Smile Care',
        subdomain,
        themePresetId: 'mint',
        logoAssetId: null,
        defaultShareImageAssetId: null,
        defaultOrigin: `https://${subdomain}.payload.example`,
      });

      const fetched = await owner.get(`/sites/${site.id}`).expect(200);
      expect(siteSchema.parse(fetched.body)).toEqual(site);
    });

    it('lists the sites of the workspace, oldest first', async () => {
      const { client, workspaceId: ownWorkspace } = await signedUpClient(t.app);
      const first = await createSite(client, ownWorkspace, { name: 'Site A' });
      const second = await createSite(client, ownWorkspace, {
        name: 'Site B',
        themePresetId: 'indigo',
      });
      const response = await client.get(`/workspaces/${ownWorkspace}/sites`).expect(200);
      expect(siteListResponseSchema.parse(response.body).items).toEqual([first, second]);
    });

    it('records site.created with the creator as actor', async () => {
      const site = await createSite(owner, workspaceId);
      const response = await owner.get(`/sites/${site.id}/activity`).expect(200);
      const { items } = activityListResponseSchema.parse(response.body);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        type: 'site.created',
        siteId: site.id,
        page: null,
        actor: { name: ownerName },
        undoable: false,
      });
    });

    it('rejects a duplicate subdomain, whatever its case, with 409 subdomain_taken', async () => {
      const subdomain = uniqueSubdomain('dup');
      await createSite(owner, workspaceId, { subdomain });
      const response = await owner
        .post(`/workspaces/${workspaceId}/sites`, {
          name: 'Bản sao',
          subdomain: subdomain.toUpperCase(),
        })
        .expect(409);
      const problem = problemSchema.parse(response.body);
      expect(problem.code).toBe('subdomain_taken');
      expect(problem.title).toBe('Tên miền con này đã có người dùng');
      expect(problem.issues?.[0]?.path).toEqual(['subdomain']);
    });

    it('validates the body with the contract schema, including reserved names', async () => {
      const response = await owner
        .post(`/workspaces/${workspaceId}/sites`, { name: '', subdomain: 'admin' })
        .expect(422);
      const issues = problemSchema.parse(response.body).issues ?? [];
      expect(issues.map((issue) => issue.path)).toEqual([['name'], ['subdomain']]);
      expect(issues[1]?.message).toBe('Tên này được hệ thống giữ lại, hãy chọn tên khác');
    });

    it('answers 404 for an unknown or malformed site id', async () => {
      const unknown = await owner.get('/sites/0123456789abcdef01234567').expect(404);
      expect(problemSchema.parse(unknown.body).title).toBe('Không tìm thấy site');
      await owner.get('/sites/not-an-id').expect(404);
    });

    it('requires a session', async () => {
      await request(t.app.getHttpServer()).get(`/workspaces/${workspaceId}/sites`).expect(401);
    });
  });

  describe('subdomain availability', () => {
    async function check(subdomain: string) {
      const response = await owner
        .get('/sites/subdomain-availability')
        .query({ subdomain })
        .expect(200);
      return subdomainAvailabilitySchema.parse(response.body);
    }

    it('reports a format problem with the contract message', async () => {
      expect(await check('ab')).toEqual({
        subdomain: 'ab',
        available: false,
        reason: 'invalid',
        message: 'Tên miền con cần ít nhất 3 ký tự',
      });
      expect((await check('-bad-')).reason).toBe('invalid');
    });

    it('reports reserved names', async () => {
      expect(await check('Admin')).toEqual({
        subdomain: 'admin',
        available: false,
        reason: 'reserved',
        message: 'Tên này được hệ thống giữ lại, hãy chọn tên khác',
      });
    });

    it('reports a taken subdomain case-insensitively', async () => {
      const site = await createSite(owner, workspaceId);
      expect(await check(site.subdomain.toUpperCase())).toEqual({
        subdomain: site.subdomain,
        available: false,
        reason: 'taken',
        message: 'Tên miền con này đã có người dùng',
      });
    });

    it('reports a free subdomain as available', async () => {
      const subdomain = uniqueSubdomain('free');
      expect(await check(` ${subdomain} `)).toEqual({
        subdomain,
        available: true,
        reason: null,
        message: null,
      });
    });

    it('requires the subdomain query parameter and a session', async () => {
      await owner.get('/sites/subdomain-availability').expect(422);
      await request(t.app.getHttpServer())
        .get('/sites/subdomain-availability?subdomain=abc')
        .expect(401);
    });
  });

  describe('settings', () => {
    it('updates name and theme', async () => {
      const site = await createSite(owner, workspaceId);
      const response = await owner
        .patch(`/sites/${site.id}`, { name: 'Tên mới', themePresetId: 'sunset' })
        .expect(200);
      expect(siteSchema.parse(response.body)).toMatchObject({
        id: site.id,
        name: 'Tên mới',
        themePresetId: 'sunset',
        subdomain: site.subdomain,
      });
      const fetched = await owner.get(`/sites/${site.id}`).expect(200);
      expect(siteSchema.parse(fetched.body).name).toBe('Tên mới');
    });

    it('rejects an empty patch', async () => {
      const site = await createSite(owner, workspaceId);
      const response = await owner.patch(`/sites/${site.id}`, {}).expect(422);
      expect(problemSchema.parse(response.body).issues?.[0]?.message).toBe(
        'Không có thay đổi nào để lưu',
      );
    });

    it('sets and clears the logo and default share image from the site library', async () => {
      const site = await createSite(owner, workspaceId);
      const logo = await uploadImage(owner, site.id);
      const share = await uploadImage(owner, site.id, { decorative: 'true' });

      const set = await owner
        .patch(`/sites/${site.id}`, { logoAssetId: logo.id, defaultShareImageAssetId: share.id })
        .expect(200);
      expect(siteSchema.parse(set.body)).toMatchObject({
        logoAssetId: logo.id,
        defaultShareImageAssetId: share.id,
      });

      const cleared = await owner.patch(`/sites/${site.id}`, { logoAssetId: null }).expect(200);
      expect(siteSchema.parse(cleared.body)).toMatchObject({
        logoAssetId: null,
        defaultShareImageAssetId: share.id,
      });
    });

    it('rejects images of another site or unknown ids with 422 on the field', async () => {
      const site = await createSite(owner, workspaceId);
      const otherSite = await createSite(owner, workspaceId);
      const foreign = await uploadImage(owner, otherSite.id);

      const response = await owner
        .patch(`/sites/${site.id}`, {
          logoAssetId: foreign.id,
          defaultShareImageAssetId: '0123456789abcdef01234567',
        })
        .expect(422);
      const problem = problemSchema.parse(response.body);
      expect(problem.code).toBe('validation_failed');
      expect(problem.issues).toEqual([
        {
          path: ['logoAssetId'],
          code: 'asset_not_found',
          message: 'Ảnh không có trong thư viện của site này',
        },
        {
          path: ['defaultShareImageAssetId'],
          code: 'asset_not_found',
          message: 'Ảnh không có trong thư viện của site này',
        },
      ]);
      const fetched = await owner.get(`/sites/${site.id}`).expect(200);
      expect(siteSchema.parse(fetched.body).logoAssetId).toBeNull();
    });

    it('cannot change the subdomain', async () => {
      const site = await createSite(owner, workspaceId);
      await owner.patch(`/sites/${site.id}`, { subdomain: uniqueSubdomain('moved') }).expect(422);
    });
  });

  describe('owner-only rules', () => {
    it('lets an editor read sites but not create them or change settings', async () => {
      const site = await createSite(owner, workspaceId);
      const editor = await addEditor(t, workspaceId);

      const list = await editor.client.get(`/workspaces/${workspaceId}/sites`).expect(200);
      expect(siteListResponseSchema.parse(list.body).items.map((item) => item.id)).toContain(
        site.id,
      );
      await editor.client.get(`/sites/${site.id}`).expect(200);

      const create = await editor.client
        .post(`/workspaces/${workspaceId}/sites`, {
          name: 'Site của editor',
          subdomain: uniqueSubdomain('editor'),
        })
        .expect(403);
      expect(problemSchema.parse(create.body)).toMatchObject({
        code: 'forbidden',
        title: 'Chỉ Owner của workspace được thực hiện thao tác này',
      });

      const update = await editor.client
        .patch(`/sites/${site.id}`, { name: 'Đổi tên' })
        .expect(403);
      expect(problemSchema.parse(update.body).code).toBe('forbidden');
    });
  });
});

describe('site creation transaction', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_sites_tx', {
      override: (builder) =>
        builder.overrideProvider(ActivityRepository).useValue({
          record: () => Promise.reject(new Error('activity store unavailable')),
        }),
    });
  });

  afterAll(async () => {
    await t.close();
  });

  it('does not keep the site when its activity cannot be recorded', async () => {
    const { client, workspaceId } = await signedUpClient(t.app);
    await client
      .post(`/workspaces/${workspaceId}/sites`, { name: 'Site', subdomain: uniqueSubdomain() })
      .expect(500);
    expect(await t.connection.collection('sites').countDocuments()).toBe(0);
  });
});
