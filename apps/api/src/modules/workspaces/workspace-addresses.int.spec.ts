import { randomUUID } from 'node:crypto';
import {
  meResponseSchema,
  problemSchema,
  SESSION_COOKIE,
  type MeResponse,
  type Site,
  siteSchema,
} from '@plp/contracts';
import { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signupInput } from '../../../test/client.js';
import { TEST_ADMIN_ORIGIN } from '../../../test/env.js';
import { insertLeads, storedLead } from '../../../test/leads.js';
import { uniqueSubdomain } from '../../../test/resources.js';
import { LeadNotifier } from '../notifications/lead-notifier.service.js';

const TEMPLATE = 'http://{slug}.localhost:3100';
const originOf = (slug: string) => `http://${slug}.localhost:3100`;

/**
 * A browser at one admin address. It keeps the session cookie itself: supertest's agent would not
 * send back a cookie whose `Domain` differs from the test server's host.
 */
class AddressClient {
  private cookie: string | null = null;

  constructor(
    private readonly t: TestApp,
    readonly origin: string,
  ) {}

  private send(test: request.Test) {
    return this.cookie === null ? test : test.set('Cookie', this.cookie);
  }

  get(path: string) {
    return this.send(request(this.t.app.getHttpServer()).get(path));
  }

  post(path: string, body?: object) {
    const test = this.send(
      request(this.t.app.getHttpServer()).post(path).set('Origin', this.origin),
    );
    return body === undefined ? test : test.send(body);
  }

  async signUp(workspaceName: string): Promise<MeResponse> {
    const response = await this.post('/auth/signup', signupInput({ workspaceName })).expect(201);
    this.keep(response.headers['set-cookie']);
    return meResponseSchema.parse(response.body);
  }

  async createSite(workspaceId: string): Promise<Site> {
    const response = await this.post(`/workspaces/${workspaceId}/sites`, {
      name: 'Nha khoa Smile Care',
      subdomain: uniqueSubdomain(),
    }).expect(201);
    return siteSchema.parse(response.body);
  }

  /** The same browser opening another admin address: the session goes with it. */
  at(origin: string): AddressClient {
    const other = new AddressClient(this.t, origin);
    other.cookie = this.cookie;
    return other;
  }

  private keep(setCookie: unknown): void {
    const cookies = Array.isArray(setCookie) ? setCookie : [];
    const session = cookies
      .filter((item): item is string => typeof item === 'string')
      .find((item) => item.startsWith(`${SESSION_COOKIE}=`));
    if (session === undefined) {
      throw new Error('No session cookie was set');
    }
    this.cookie = session.split(';')[0] ?? null;
  }
}

function workspaceOf(me: MeResponse) {
  const [membership] = me.memberships;
  if (membership === undefined) {
    throw new Error('Signup made no workspace');
  }
  return membership.workspace;
}

/** ADR-025, slice D2: every workspace opens at an admin address of its own. */
describe('workspace addresses', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_ws_addresses', {
      env: { ADMIN_WORKSPACE_ORIGIN_TEMPLATE: TEMPLATE, SESSION_COOKIE_DOMAIN: 'localhost' },
    });
  });

  afterAll(async () => {
    await t.close();
  });

  it('gives a new workspace the address its name asks for, numbered when taken', async () => {
    const name = `Mây Xanh ${randomUUID().slice(0, 6)}`;
    const base = name
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');

    const first = workspaceOf(await new AddressClient(t, TEST_ADMIN_ORIGIN).signUp(name));
    const second = workspaceOf(await new AddressClient(t, TEST_ADMIN_ORIGIN).signUp(name));

    expect(first.slug).toBe(base);
    expect(second.slug).toBe(`${base}-2`);
    const stored = await t.connection
      .collection('workspaces')
      .findOne({ _id: new Types.ObjectId(second.id) });
    expect(stored?.['slug']).toBe(`${base}-2`);
  });

  it('never gives a reserved address', async () => {
    const workspace = workspaceOf(await new AddressClient(t, TEST_ADMIN_ORIGIN).signUp('App'));
    expect(workspace.slug).not.toBe('app');
    expect(workspace.slug).toMatch(/^app-\d+$/);
  });

  it('gives sign-ups racing for one name different addresses', async () => {
    const name = `Đua ${randomUUID().slice(0, 6)}`;
    const results = await Promise.all(
      Array.from({ length: 4 }, () => new AddressClient(t, TEST_ADMIN_ORIGIN).signUp(name)),
    );
    const slugs = results.map((me) => workspaceOf(me).slug);
    expect(new Set(slugs).size).toBe(4);
  });

  it('signs in on the parent domain of every address, and signs out there too', async () => {
    const response = await new AddressClient(t, TEST_ADMIN_ORIGIN)
      .post('/auth/signup', signupInput())
      .expect(201);
    const session = (response.headers['set-cookie'] as unknown as string[]).find((item) =>
      item.startsWith(`${SESSION_COOKIE}=`),
    );
    expect(session).toMatch(/; Domain=localhost/i);

    const cookie = session?.split(';')[0] ?? '';
    const out = await request(t.app.getHttpServer())
      .post('/auth/logout')
      .set('Origin', TEST_ADMIN_ORIGIN)
      .set('Cookie', cookie)
      .expect(204);
    expect((out.headers['set-cookie'] as unknown as string[])[0]).toMatch(/; Domain=localhost/i);
  });

  it('takes state changes from the common address and every workspace address only', async () => {
    const login = (origin: string) =>
      request(t.app.getHttpServer())
        .post('/auth/login')
        .set('Origin', origin)
        .send({ email: `${randomUUID()}@example.com`, password: 'sai-mat-khau-123' });

    for (const origin of [TEST_ADMIN_ORIGIN, originOf('may-xanh'), originOf('nha-khoa-2')]) {
      await login(origin).expect(401);
    }
    for (const origin of [
      'http://evil.test:3100',
      'https://may-xanh.localhost:3100',
      'http://may-xanh.localhost:3101',
      'http://a.b.localhost:3100',
      'http://ab.localhost:3100',
      'http://may-xanh.localhost:3100.evil.test',
    ]) {
      const response = await login(origin).expect(403);
      expect(problemSchema.parse(response.body).code).toBe('origin_rejected');
    }
  });

  it('links invitations to the workspace’s address', async () => {
    const owner = new AddressClient(t, TEST_ADMIN_ORIGIN);
    const workspace = workspaceOf(await owner.signUp(`Mời ${randomUUID().slice(0, 6)}`));
    const at = owner.at(originOf(workspace.slug));
    const email = `${randomUUID().slice(0, 8)}@example.com`;

    await at
      .post(`/workspaces/${workspace.id}/invitations`, {
        emails: [email],
        role: 'editor',
        siteIds: null,
      })
      .expect(200);

    const [message] = t.emails.to(email);
    expect(message?.text).toContain(`${originOf(workspace.slug)}/invite#token=`);
  });

  it('links lead emails to the workspace’s address, and address confirmations to the common one', async () => {
    const owner = new AddressClient(t, TEST_ADMIN_ORIGIN);
    const workspace = workspaceOf(await owner.signUp(`Lead ${randomUUID().slice(0, 6)}`));
    const site = await owner.createSite(workspace.id);
    const recipient = `${randomUUID().slice(0, 8)}@example.com`;

    await owner.post(`/sites/${site.id}/lead-recipients`, { email: recipient }).expect(201);
    const [confirmation] = t.emails.to(recipient);
    expect(confirmation?.text).toContain(
      `${TEST_ADMIN_ORIGIN}/lead-recipients/confirm#site=${site.id}&token=`,
    );

    // The address confirmed, and a lead waiting for its email.
    await t
      .workspaceDb(workspace.id)
      .collection('sites')
      .updateOne(
        { _id: new Types.ObjectId(site.id) },
        { $set: { 'leadRecipients.0.confirmedAt': new Date() } },
      );
    const leadId = new Types.ObjectId();
    await insertLeads(t, [
      {
        ...storedLead({
          workspaceId: workspace.id,
          siteId: site.id,
          pageId: new Types.ObjectId().toHexString(),
          releaseId: new Types.ObjectId().toHexString(),
          notification: { status: 'pending' },
        }),
        _id: leadId,
      },
    ]);
    t.app.get(LeadNotifier).enqueue({ workspaceId: new Types.ObjectId(workspace.id), leadId });

    await vi.waitFor(
      () => {
        const lead = t.emails
          .to(recipient)
          .find((message) => !message.subject.startsWith('Xác nhận nhận lead'));
        expect(lead?.text).toContain(
          `${originOf(workspace.slug)}/sites/${site.id}/leads?lead=${leadId.toHexString()}`,
        );
      },
      { timeout: 5000, interval: 20 },
    );
  });
});
