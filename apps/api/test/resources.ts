import {
  type Asset,
  assetSchema,
  type CreateSiteRequest,
  type MeResponse,
  type Site,
  siteSchema,
} from '@plp/contracts';
import { Types } from 'mongoose';
import sharp from 'sharp';
import type { AuthenticatedUser } from '../src/modules/auth/authenticated-user.js';
import { AccessService } from '../src/modules/workspaces/access.service.js';
import type { WorkspaceScope } from '../src/modules/workspaces/workspace-scope.js';
import type { TestApp } from './app.js';
import { signedUpClient, type TestClient } from './client.js';
import { TEST_ADMIN_ORIGIN } from './env.js';

let subdomainCounter = 0;

/** A valid subdomain that no other site in this test process uses. */
export function uniqueSubdomain(prefix = 'site'): string {
  subdomainCounter += 1;
  return `${prefix}-${process.pid.toString(36)}-${subdomainCounter.toString(36)}`;
}

/** Creates a site as the client (who must be the workspace owner) and returns it. */
export async function createSite(
  client: TestClient,
  workspaceId: string,
  overrides: Partial<CreateSiteRequest> = {},
): Promise<Site> {
  const response = await client
    .post(`/workspaces/${workspaceId}/sites`, {
      name: 'Nha khoa Smile Care',
      subdomain: uniqueSubdomain(),
      ...overrides,
    })
    .expect(201);
  return siteSchema.parse(response.body);
}

/** A small, real PNG. */
export function pngImage(width = 8, height = 6): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 15, g: 94, b: 85 } },
  })
    .png()
    .toBuffer();
}

/** Sends `POST /sites/:siteId/assets` as multipart; the caller sets the expected status. */
export function uploadRequest(
  client: TestClient,
  siteId: string,
  file: Buffer | null,
  fields: Record<string, string> = { alt: 'Phòng khám sáng sủa' },
  filename = 'image.png',
) {
  let request = client.agent.post(`/sites/${siteId}/assets`).set('Origin', TEST_ADMIN_ORIGIN);
  for (const [name, value] of Object.entries(fields)) {
    request = request.field(name, value);
  }
  return file === null ? request : request.attach('file', file, filename);
}

/** Uploads a generated PNG and returns the created asset. */
export async function uploadImage(
  client: TestClient,
  siteId: string,
  fields: Record<string, string> = { alt: 'Phòng khám sáng sủa' },
): Promise<Asset> {
  const response = await uploadRequest(client, siteId, await pngImage(), fields).expect(201);
  return assetSchema.parse(response.body);
}

/**
 * Signs up another user and makes them an editor of `workspaceId`. There are no invitations in
 * MVP A, so the membership is inserted directly.
 */
export async function addEditor(
  t: TestApp,
  workspaceId: string,
): Promise<{ client: TestClient; me: MeResponse }> {
  const { client, me } = await signedUpClient(t.app);
  await t.connection.collection('memberships').insertOne({
    workspaceId: new Types.ObjectId(workspaceId),
    userId: new Types.ObjectId(me.user.id),
    role: 'editor',
    createdAt: new Date(),
  });
  return { client, me };
}

/** The `WorkspaceScope` of a signed-up user, built the only legitimate way (AccessService). */
export function scopeOf(t: TestApp, me: MeResponse, workspaceId: string): Promise<WorkspaceScope> {
  const user: AuthenticatedUser = {
    id: new Types.ObjectId(me.user.id),
    name: me.user.name,
    email: me.user.email,
  };
  return t.app.get(AccessService).scopeFor(user, new Types.ObjectId(workspaceId));
}
