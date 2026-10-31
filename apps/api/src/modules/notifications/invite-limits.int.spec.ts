import { type LeadRecipient, leadRecipientSchema, problemSchema, type Site } from '@plp/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { createSite } from '../../../test/resources.js';

/**
 * The daily caps on confirmation emails (ADR-018), counted for real: 5 per site and address, 30
 * per address from every site, 50 per workspace. Only emails that went out count.
 */
describe('confirmation email caps', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_invite_limits');
  });

  afterAll(async () => {
    await t.close();
  });

  function add(client: TestClient, site: Site, email: string) {
    return client.post(`/sites/${site.id}/lead-recipients`, { email });
  }

  async function added(client: TestClient, site: Site, email: string): Promise<LeadRecipient> {
    return leadRecipientSchema.parse((await add(client, site, email).expect(201)).body);
  }

  function resend(client: TestClient, site: Site, recipient: LeadRecipient) {
    return client.post(`/sites/${site.id}/lead-recipients/${recipient.id}/resend`);
  }

  /** Adds `email` to a new site of the workspace and sends it the link `times` times in all. */
  async function inviteOnNewSite(
    owner: { client: TestClient; workspaceId: string },
    email: string,
    times: number,
  ): Promise<{ site: Site; recipient: LeadRecipient }> {
    const site = await createSite(owner.client, owner.workspaceId);
    const recipient = await added(owner.client, site, email);
    for (let sent = 1; sent < times; sent += 1) {
      await resend(owner.client, site, recipient).expect(200);
    }
    return { site, recipient };
  }

  async function expectCapped(response: Promise<{ body: unknown }>): Promise<void> {
    expect(problemSchema.parse((await response).body)).toMatchObject({
      status: 429,
      code: 'rate_limited',
      title: 'Đã gửi quá nhiều thư xác nhận',
    });
  }

  it('sends one address at most 30 links a day, from every site of every workspace', async () => {
    const agency = await signedUpClient(t.app);
    const other = await signedUpClient(t.app);
    const email = 'chung@smilecare.vn';
    // 25 from five sites of one workspace (5 each, the most per site), 5 from another workspace.
    for (let site = 0; site < 5; site += 1) {
      await inviteOnNewSite(agency, email, 5);
    }
    await inviteOnNewSite(other, email, 5);
    expect(t.emails.to(email)).toHaveLength(30);

    const third = await signedUpClient(t.app);
    const site = await createSite(third.client, third.workspaceId);
    await expectCapped(add(third.client, site, email).expect(429));
    await expectCapped(
      add(agency.client, await createSite(agency.client, agency.workspaceId), email).expect(429),
    );
    expect(t.emails.to(email)).toHaveLength(30);
    // Other addresses are not held back.
    await added(third.client, site, 'rieng@smilecare.vn');
  });

  it('sends at most 50 links a day from one workspace, whatever the addresses', async () => {
    const owner = await signedUpClient(t.app);
    const sites: Site[] = [];
    for (let index = 0; index < 10; index += 1) {
      sites.push(await createSite(owner.client, owner.workspaceId));
    }
    for (const [index, site] of sites.entries()) {
      for (let address = 0; address < 5; address += 1) {
        await added(owner.client, site, `nv${index}-${address}@workspace-cap.vn`);
      }
    }
    const extra = await createSite(owner.client, owner.workspaceId);
    await expectCapped(add(owner.client, extra, 'moi@workspace-cap.vn').expect(429));
    expect(
      t.emails.sent.filter((email) => email.to[0]?.endsWith('@workspace-cap.vn')),
    ).toHaveLength(50);
    // Another workspace still sends.
    const neighbour = await signedUpClient(t.app);
    await added(
      neighbour.client,
      await createSite(neighbour.client, neighbour.workspaceId),
      'moi@workspace-cap.vn',
    );
  });

  it('counts no email for a request it refused or an email that could not be sent', async () => {
    const owner = await signedUpClient(t.app);
    const { site, recipient } = await inviteOnNewSite(owner, 'kien-nhan@smilecare.vn', 5);
    // Clicking "Gửi lại" again and again past the cap of this address sends nothing, and leaves
    // the workspace's other 45 emails alone.
    for (let index = 0; index < 20; index += 1) {
      await expectCapped(resend(owner.client, site, recipient).expect(429));
    }
    // Adding an address twice, or a sixth one, is refused too, and sends nothing.
    for (let index = 1; index < 5; index += 1) {
      await added(owner.client, site, `them-${index}@smilecare.vn`);
    }
    for (let index = 0; index < 5; index += 1) {
      await add(owner.client, site, 'them-1@smilecare.vn').expect(409);
      await add(owner.client, site, 'thu-sau@smilecare.vn').expect(409);
    }
    // An email that failed is not one sent.
    t.emails.failNext('smtp_unavailable');
    const unsent = await added(
      owner.client,
      await createSite(owner.client, owner.workspaceId),
      'loi-gui@smilecare.vn',
    );
    expect(unsent.status).toBe('unsent');
    // 5 + 4 emails went out: 41 are left.
    for (let index = 0; index < 8; index += 1) {
      const more = await createSite(owner.client, owner.workspaceId);
      for (let address = 0; address < 5; address += 1) {
        await added(owner.client, more, `con-lai-${index}-${address}@smilecare.vn`);
      }
    }
    const last = await createSite(owner.client, owner.workspaceId);
    await added(owner.client, last, 'thu-50@smilecare.vn');
    await expectCapped(add(owner.client, last, 'thu-51@smilecare.vn').expect(429));
  });
});
