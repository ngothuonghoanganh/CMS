import { type Asset, problemSchema, type Site, siteListResponseSchema } from '@plp/contracts';
import { Types } from 'mongoose';
import type { Test } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import {
  createSite,
  pngImage,
  uniqueSubdomain,
  uploadImage,
  uploadRequest,
} from '../../../test/resources.js';

/** ADR-003: another workspace's sites, activity and assets answer 404, never 403. */
describe('workspace isolation of sites, activity and assets', () => {
  let t: TestApp;
  let ownerA: TestClient;
  let workspaceA: string;
  let siteA: Site;
  let assetA: Asset;
  let userB: TestClient;
  let workspaceB: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_isolation_resources');
    const a = await signedUpClient(t.app);
    ownerA = a.client;
    workspaceA = a.workspaceId;
    siteA = await createSite(ownerA, workspaceA);
    assetA = await uploadImage(ownerA, siteA.id);
    const b = await signedUpClient(t.app);
    userB = b.client;
    workspaceB = b.workspaceId;
  });

  afterAll(async () => {
    await t.close();
  });

  async function expectNotFound(test: Test): Promise<void> {
    const response = await test.expect(404);
    expect(problemSchema.parse(response.body).code).toBe('not_found');
  }

  it('hides the sites of workspace A from user B', async () => {
    await expectNotFound(userB.get(`/workspaces/${workspaceA}/sites`));
    await expectNotFound(
      userB.post(`/workspaces/${workspaceA}/sites`, {
        name: 'Chen ngang',
        subdomain: uniqueSubdomain(),
      }),
    );
    await expectNotFound(userB.get(`/sites/${siteA.id}`));
    await expectNotFound(userB.patch(`/sites/${siteA.id}`, { name: 'Đổi tên' }));
  });

  it('hides the activity of site A from user B', async () => {
    await expectNotFound(userB.get(`/sites/${siteA.id}/activity`));
  });

  it('hides the assets of site A from user B', async () => {
    await expectNotFound(userB.get(`/sites/${siteA.id}/assets`));
    await expectNotFound(uploadRequest(userB, siteA.id, await pngImage()));
    await expectNotFound(
      userB.patch(`/assets/${assetA.id}`, { alt: 'Sửa trộm', decorative: false }),
    );
  });

  it('does not let user B use an asset of site A as a logo', async () => {
    const siteB = await createSite(userB, workspaceB);
    const response = await userB
      .patch(`/sites/${siteB.id}`, { logoAssetId: assetA.id })
      .expect(422);
    expect(problemSchema.parse(response.body).issues?.[0]?.path).toEqual(['logoAssetId']);
  });

  it('leaves workspace A untouched', async () => {
    const sites = await ownerA.get(`/workspaces/${workspaceA}/sites`).expect(200);
    expect(siteListResponseSchema.parse(sites.body).items).toEqual([siteA]);
    const asset = await t.connection
      .collection('assets')
      .findOne({ _id: new Types.ObjectId(assetA.id) });
    expect(asset?.['alt']).toBe(assetA.alt);
  });
});
