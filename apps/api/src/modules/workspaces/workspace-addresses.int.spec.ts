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
import { publishableDraft } from '../../../test/compositions.js';
import { insertLeads, storedLead } from '../../../test/leads.js';
import { insertMembership, uniqueSubdomain } from '../../../test/resources.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { LeadNotifier } from '../notifications/lead-notifier.service.js';

// The common address takes the reserved name `app`; public sites stay on `*.localhost`.
const COMMON = 'http://app.admin.test:3100';
const TEMPLATE = 'http://{slug}.admin.test:3100';
const originOf = (slug: string) => `http://${slug}.admin.test:3100`;

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

  put(path: string, body: object) {
    return this.send(
      request(this.t.app.getHttpServer()).put(path).set('Origin', this.origin).send(body),
    );
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
      env: {
        ADMIN_ORIGIN: COMMON,
        ADMIN_WORKSPACE_ORIGIN_TEMPLATE: TEMPLATE,
        SESSION_COOKIE_DOMAIN: 'admin.test',
      },
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

    const first = workspaceOf(await new AddressClient(t, COMMON).signUp(name));
    const second = workspaceOf(await new AddressClient(t, COMMON).signUp(name));

    expect(first.slug).toBe(base);
    expect(second.slug).toBe(`${base}-2`);
    const stored = await t.connection
      .collection('workspaces')
      .findOne({ _id: new Types.ObjectId(second.id) });
    expect(stored?.['slug']).toBe(`${base}-2`);
  });

  it('never gives a reserved address', async () => {
    const workspace = workspaceOf(await new AddressClient(t, COMMON).signUp('App'));
    expect(workspace.slug).not.toBe('app');
    expect(workspace.slug).toMatch(/^app-\d+$/);
  });

  it('gives sign-ups racing for one name different addresses', async () => {
    const name = `Đua ${randomUUID().slice(0, 6)}`;
    const results = await Promise.all(
      Array.from({ length: 6 }, () => new AddressClient(t, COMMON).signUp(name)),
    );
    const slugs = results.map((me) => workspaceOf(me).slug);
    expect(new Set(slugs).size).toBe(6);
  });

  it('numbers long names that share their first 40 characters', async () => {
    // Every name below asks for `cong-ty-co-phan-dau-tu-va-phat-trien-ha`; numbered forms are cut.
    const names = ['Hà Nội', 'Hà Nam', 'Hà Giang', 'Hà Tĩnh'].map(
      (place) => `Công ty Cổ phần Đầu tư và Phát triển ${place}`,
    );
    const slugs: string[] = [];
    for (const name of names) {
      slugs.push(workspaceOf(await new AddressClient(t, COMMON).signUp(name)).slug);
    }
    expect(slugs).toEqual([
      'cong-ty-co-phan-dau-tu-va-phat-trien-ha',
      'cong-ty-co-phan-dau-tu-va-phat-trien-h-2',
      'cong-ty-co-phan-dau-tu-va-phat-trien-h-3',
      'cong-ty-co-phan-dau-tu-va-phat-trien-h-4',
    ]);
  });

  it('looks past the first batch of taken addresses without reading them all', async () => {
    const base = `lo-${randomUUID().slice(0, 6)}`;
    await t.connection.collection('workspaces').insertMany(
      Array.from({ length: 25 }, (_, index) => ({
        name: base,
        slug: index === 0 ? base : `${base}-${(index + 1).toString()}`,
        siteSeq: 0,
        createdBy: new Types.ObjectId(),
        createdAt: new Date(),
      })),
    );
    const workspace = workspaceOf(await new AddressClient(t, COMMON).signUp(base));
    expect(workspace.slug).toBe(`${base}-26`);
  });

  it('signs in on the parent domain of every address, and signs out there too', async () => {
    const response = await new AddressClient(t, COMMON)
      .post('/auth/signup', signupInput())
      .expect(201);
    const session = (response.headers['set-cookie'] as unknown as string[]).find((item) =>
      item.startsWith(`${SESSION_COOKIE}=`),
    );
    expect(session).toMatch(/; Domain=admin\.test/i);

    const cookie = session?.split(';')[0] ?? '';
    const out = await request(t.app.getHttpServer())
      .post('/auth/logout')
      .set('Origin', COMMON)
      .set('Cookie', cookie)
      .expect(204);
    expect((out.headers['set-cookie'] as unknown as string[])[0]).toMatch(/; Domain=admin\.test/i);
  });

  it('takes any session the browser still holds, and signing out ends them all', async () => {
    const user = signupInput();
    await new AddressClient(t, COMMON).post('/auth/signup', user).expect(201);
    const logIn = async () => {
      const response = await request(t.app.getHttpServer())
        .post('/auth/login')
        .set('Origin', COMMON)
        .send({ email: user.email, password: user.password })
        .expect(200);
      const cookies = response.headers['set-cookie'] as unknown as string[];
      // The new cookie on the parent domain, and the host-only one of the same name cleared.
      expect(cookies.filter((item) => item.startsWith(`${SESSION_COOKIE}=`))).toHaveLength(2);
      expect(
        cookies.some((item) => !/; Domain=/i.test(item) && /Expires=Thu, 01 Jan 1970/.test(item)),
      ).toBe(true);
      const session = cookies.find((item) => /; Domain=admin\.test/i.test(item)) ?? '';
      return session.split(';')[0] ?? '';
    };
    const older = await logIn();
    const newer = await logIn();
    const me = (cookie: string) =>
      request(t.app.getHttpServer()).get('/auth/me').set('Cookie', cookie);

    // A cookie of another scope first, as the browser sends the older one first.
    await me(`${SESSION_COOKIE}=not-a-session; ${newer}`).expect(200);
    await me(`${older}; ${newer}`).expect(200);

    const out = await request(t.app.getHttpServer())
      .post('/auth/logout')
      .set('Origin', COMMON)
      .set('Cookie', `${older}; ${newer}`)
      .expect(204);
    const cleared = out.headers['set-cookie'] as unknown as string[];
    expect(cleared.some((item) => /; Domain=admin\.test/i.test(item))).toBe(true);
    expect(cleared.some((item) => !/; Domain=/i.test(item))).toBe(true);
    await me(older).expect(401);
    await me(newer).expect(401);
  });

  it('takes state changes from the common address and every workspace address only', async () => {
    const login = (origin: string) =>
      request(t.app.getHttpServer())
        .post('/auth/login')
        .set('Origin', origin)
        .send({ email: `${randomUUID()}@example.com`, password: 'sai-mat-khau-123' });

    for (const origin of [COMMON, originOf('may-xanh'), originOf('nha-khoa-2')]) {
      await login(origin).expect(401);
    }
    for (const origin of [
      'http://evil.test:3100',
      TEST_ADMIN_ORIGIN,
      'https://may-xanh.admin.test:3100',
      'http://may-xanh.admin.test:3101',
      'http://a.b.admin.test:3100',
      'http://ab.admin.test:3100',
      'http://may-xanh.admin.test:3100.evil.test',
      // Reserved names belong to other services of the domain, never to a workspace.
      'http://cdn.admin.test:3100',
      'http://api.admin.test:3100',
      'http://mail.admin.test:3100',
    ]) {
      const response = await login(origin).expect(403);
      expect(problemSchema.parse(response.body).code).toBe('origin_rejected');
    }
  });

  it('keeps a workspace whose sign-up committed though its answer was lost', async () => {
    const input = signupInput();
    const runner = t.app.get(TransactionRunner);
    const lost = vi.spyOn(runner, 'run').mockImplementationOnce(async (work) => {
      // The once-implementation is used up: this runs the real transaction, which commits.
      await runner.run(work);
      throw new Error('The commit answer was lost');
    });
    try {
      await new AddressClient(t, COMMON).post('/auth/signup', input).expect(500);
    } finally {
      lost.mockRestore();
    }

    const user = await t.connection.collection('users').findOne({ email: input.email });
    const membership = await t.connection
      .collection('memberships')
      .findOne({ userId: user?.['_id'] });
    const workspaceId = membership?.['workspaceId'] as Types.ObjectId | undefined;
    expect(workspaceId).toBeDefined();
    // Its database is still there, with its collections: the account can be used.
    expect(
      (await t.workspaceDb(workspaceId ?? new Types.ObjectId()).listCollections()).length,
    ).toBeGreaterThan(0);
  });

  it('links invitations to the workspace’s address', async () => {
    const owner = new AddressClient(t, COMMON);
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

  it('links access requests and approval requests to the workspace’s address', async () => {
    const owner = new AddressClient(t, COMMON);
    const ownerMe = await owner.signUp(`Duyệt ${randomUUID().slice(0, 6)}`);
    const workspace = workspaceOf(ownerMe);
    const at = owner.at(originOf(workspace.slug));
    const site = await at.createSite(workspace.id);
    const slug = `trang-${randomUUID().slice(0, 6)}`;
    const created = await at
      .post(`/sites/${site.id}/pages`, { title: 'Ưu đãi', slug, start: { kind: 'blank' } })
      .expect(201);
    const pageId = (created.body as { page: { id: string } }).page.id;
    const saved = await at
      .put(`/sites/${site.id}/pages/${pageId}/draft`, {
        baseRevision: 0,
        ...publishableDraft(slug),
      })
      .expect(200);
    const revision = (saved.body as { revision: number }).revision;

    // A member who asks: for more access, and for a publish.
    const member = new AddressClient(t, COMMON);
    const memberMe = await member.signUp(`Riêng ${randomUUID().slice(0, 6)}`);
    await insertMembership(t, workspace.id, memberMe.user.id, 'contributor');
    const memberAt = member.at(originOf(workspace.slug));
    await memberAt
      .post(`/workspaces/${workspace.id}/access-requests`, {
        role: 'editor',
        wholeWorkspace: false,
        note: '',
      })
      .expect(201);
    await memberAt
      .post(`/sites/${site.id}/pages/${pageId}/approval`, {
        expectedRevision: revision,
        expectedPublishedReleaseId: null,
        approvalId: null,
        note: '',
      })
      .expect(200);

    const texts = t.emails.to(ownerMe.user.email).map((message) => message.text);
    expect(texts.join('\n')).toContain(
      `${originOf(workspace.slug)}/workspaces/${workspace.id}/members?request=`,
    );
    expect(texts.join('\n')).toContain(
      `${originOf(workspace.slug)}/sites/${site.id}/pages/${pageId}/edit`,
    );
  });

  it('answers an accepted invitation with the address of the workspace joined', async () => {
    const owner = new AddressClient(t, COMMON);
    const workspace = workspaceOf(await owner.signUp(`Nhận ${randomUUID().slice(0, 6)}`));
    const invited = new AddressClient(t, COMMON);
    const me = await invited.signUp(`Riêng ${randomUUID().slice(0, 6)}`);
    await owner
      .at(originOf(workspace.slug))
      .post(`/workspaces/${workspace.id}/invitations`, {
        emails: [me.user.email],
        role: 'viewer',
        siteIds: null,
      })
      .expect(200);
    const token = /#token=([A-Za-z0-9_-]{43})/.exec(t.emails.to(me.user.email)[0]?.text ?? '')?.[1];

    const accepted = await invited
      .at(originOf(workspace.slug))
      .post('/invitations/accept', { token })
      .expect(200);
    expect(accepted.body).toEqual({ workspaceId: workspace.id, slug: workspace.slug });
  });

  it('links lead emails to the workspace’s address, and address confirmations to the common one', async () => {
    const owner = new AddressClient(t, COMMON);
    const workspace = workspaceOf(await owner.signUp(`Lead ${randomUUID().slice(0, 6)}`));
    const site = await owner.createSite(workspace.id);
    const recipient = `${randomUUID().slice(0, 8)}@example.com`;

    await owner.post(`/sites/${site.id}/lead-recipients`, { email: recipient }).expect(201);
    const [confirmation] = t.emails.to(recipient);
    expect(confirmation?.text).toContain(
      `${COMMON}/lead-recipients/confirm#site=${site.id}&token=`,
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
