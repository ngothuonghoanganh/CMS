import { analyticsReportSchema, problemSchema, type Site } from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pageView, sendPageView } from '../../../test/analytics.js';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, TestClient } from '../../../test/client.js';
import {
  createLiveFormPage,
  DESKTOP_UA,
  leadBody,
  PHONE_UA,
  submitLead,
  type VisitorOptions,
} from '../../../test/leads.js';
import {
  createLivePage,
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { configurePrivacy } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { createSite } from '../../../test/resources.js';

const MINUTE = 60_000;

/**
 * Behind a trusted edge proxy, with the default limits: the renderer (`TRUST_PROXY=true`) signs the
 * last `X-Forwarded-For` entry as the visitor's address, and the API (`TRUST_PROXY_HOPS=1`) trusts
 * only that signed address on the relay routes (ADR-004, ADR-016, ADR-019). Live runs so far had
 * no trusted address, so every visitor of a site shared one bucket.
 */
describe('visitor addresses behind a trusted proxy', () => {
  let t: TestApp;
  let owner: TestClient;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_trusted_proxy', {
      ...withRevalidationRecorder(new RecordingRevalidationClient()),
      env: { TRUST_PROXY_HOPS: 1, AUTH_RATE_LIMIT_PER_MINUTE: 3 },
    });
    const signedUp = await signedUpClient(t.app);
    owner = signedUp.client;
    workspaceId = signedUp.workspaceId;
  });

  afterAll(async () => {
    await t.close();
  });

  async function formSite(): Promise<{ site: Site; releaseId: string }> {
    const site = await createSite(owner, workspaceId);
    await configurePrivacy(owner, site.id);
    await addConfirmedRecipient(t, owner, site.id);
    const { published } = await createLiveFormPage(owner, site.id, uniqueSlug('dang-ky'));
    return { site, releaseId: published.release.id };
  }

  async function liveSite(): Promise<{ site: Site; slug: string }> {
    const site = await createSite(owner, workspaceId);
    const slug = uniqueSlug('trang');
    await createLivePage(owner, site.id, slug);
    return { site, slug };
  }

  /**
   * A lead relayed by the renderer for the visitor at `ip`. `forwardedFor` is an
   * `X-Forwarded-For` that reached the API too, e.g. added by a proxy between the renderer and the
   * API: the API must not read it on a relay route, even when it trusts one proxy hop.
   */
  function lead(
    form: { site: Site; releaseId: string },
    ip: string,
    forwardedFor?: string,
    options: VisitorOptions = {},
  ) {
    const sent = submitLead(t, form.site.subdomain, leadBody(form.releaseId), { ...options, ip });
    return forwardedFor === undefined ? sent : sent.set('X-Forwarded-For', forwardedFor);
  }

  function view(
    live: { site: Site; slug: string },
    options: VisitorOptions,
    forwardedFor?: string,
  ) {
    const sent = sendPageView(t, live.site.subdomain, pageView(`/${live.slug}`), options);
    return (forwardedFor === undefined ? sent : sent.set('X-Forwarded-For', forwardedFor)).expect(
      204,
    );
  }

  async function totals(site: Site) {
    const response = await owner.get(`/sites/${site.id}/analytics`).expect(200);
    return analyticsReportSchema.parse(response.body).totals;
  }

  function storedLeadCount(site: Site): Promise<number> {
    return t
      .workspaceDb(workspaceId)
      .collection('leads')
      .countDocuments({ siteId: new Types.ObjectId(site.id) });
  }

  it('takes 5 leads per address in 10 minutes, whatever X-Forwarded-For says', async () => {
    const form = await formSite();
    const before = Date.now();
    for (let index = 0; index < 5; index += 1) {
      // A forged leading entry changes nothing: the renderer signed the address the edge added.
      await lead(form, '203.0.113.7', `198.51.100.${index}, 203.0.113.7`).expect(201);
    }
    const limited = await lead(form, '203.0.113.7', '198.51.100.99, 203.0.113.7').expect(429);
    expect(problemSchema.parse(limited.body)).toMatchObject({
      code: 'rate_limited',
      title: 'Bạn đã gửi nhiều lần, hãy thử lại sau ít phút.',
    });
    // Nor does a header naming someone else entirely.
    await lead(form, '203.0.113.7', '198.51.100.20').expect(429);
    // Another address has its own five.
    for (let index = 0; index < 5; index += 1) {
      await lead(form, '198.51.100.20', '203.0.113.7').expect(201);
    }
    await lead(form, '198.51.100.20').expect(429);
    expect(await storedLeadCount(form.site)).toBe(10);

    // Both buckets close 10 minutes after their first lead.
    const buckets = await t.connection
      .collection('lead_limits')
      .find({ key: { $regex: `^lead:ip:${form.site.id}:` } })
      .toArray();
    // Refused requests count too, as for sign-ins: 7 from the first address, 6 from the other.
    expect(buckets.map((bucket) => bucket['count'] as number).sort()).toEqual([6, 7]);
    for (const bucket of buckets) {
      const closes = (bucket['expiresAt'] as Date).getTime();
      expect(closes).toBeGreaterThanOrEqual(before + 10 * MINUTE);
      expect(closes).toBeLessThan(Date.now() + 10 * MINUTE);
    }
  });

  it('counts 60 views per address in 10 minutes, then answers 204 without counting', async () => {
    const live = await liveSite();
    for (let index = 0; index < 60; index += 1) {
      await view(live, { ip: '203.0.113.7' }, `198.51.100.${index}, 203.0.113.7`);
    }
    expect(await totals(live.site)).toMatchObject({ views: 60, visitors: 1 });
    await view(live, { ip: '203.0.113.7' });
    await view(live, { ip: '203.0.113.7', userAgent: PHONE_UA }, '198.51.100.250');
    expect(await totals(live.site)).toMatchObject({ views: 60, visitors: 1 });
    // The limit belongs to that address only.
    await view(live, { ip: '198.51.100.7' });
    expect(await totals(live.site)).toMatchObject({ views: 61, visitors: 2 });
  });

  it('counts two addresses with the same browser as two visitors, each once a day', async () => {
    const live = await liveSite();
    await view(live, { ip: '203.0.113.7', userAgent: DESKTOP_UA });
    await view(live, { ip: '198.51.100.7', userAgent: DESKTOP_UA });
    await view(live, { ip: '203.0.113.7', userAgent: DESKTOP_UA });
    expect(await totals(live.site)).toMatchObject({ views: 3, visitors: 2 });
    // A forwarded header is not the visitor: the same signed address is the same visitor.
    await view(live, { ip: '203.0.113.7', userAgent: DESKTOP_UA }, '192.0.2.1, 192.0.2.2');
    expect(await totals(live.site)).toMatchObject({ views: 4, visitors: 2 });
    // Another browser at the same address is another visitor.
    await view(live, { ip: '203.0.113.7', userAgent: PHONE_UA });
    expect(await totals(live.site)).toMatchObject({ views: 5, visitors: 3 });
  });

  it('reads an IPv6 address in any spelling, and an IPv4-mapped one as the IPv4 address', async () => {
    const live = await liveSite();
    await view(live, { ip: '2001:db8:85a3::8a2e:370:7334' });
    await view(live, { ip: '2001:DB8:85A3:0:0:8A2E:0370:7334' });
    await view(live, { ip: '203.0.113.9' });
    await view(live, { ip: '::ffff:203.0.113.9' });
    expect(await totals(live.site)).toMatchObject({ views: 4, visitors: 2 });
    // Another device of the same network (/64) is another visitor.
    await view(live, { ip: '2001:db8:85a3:0:1234::1' });
    expect(await totals(live.site)).toMatchObject({ views: 5, visitors: 3 });
  });

  it('limits leads per IPv6 network (/64), since one subscriber holds all of its addresses', async () => {
    const form = await formSite();
    // Five addresses of one /64, as a phone or a home router hands out: one bucket.
    for (const host of ['::1', '::2', '::a:b', ':ffff:ffff:ffff:fffe', ':1234:5678:9abc:def0']) {
      await lead(form, `2001:db8:85a3:1${host}`).expect(201);
    }
    await lead(form, '2001:db8:85a3:1::99').expect(429);
    // The next /64 is someone else.
    await lead(form, '2001:db8:85a3:2::1').expect(201);
    // An IPv4 visitor reached through an IPv6 socket is the same IPv4 visitor.
    for (let index = 0; index < 5; index += 1) {
      await lead(form, index % 2 === 0 ? '203.0.113.50' : '::ffff:203.0.113.50').expect(201);
    }
    await lead(form, '::FFFF:cb00:7132').expect(429);
    await lead(form, '203.0.113.50').expect(429);
    expect(await storedLeadCount(form.site)).toBe(11);
  });

  it('limits views per IPv6 network (/64) too', async () => {
    const live = await liveSite();
    for (let index = 0; index < 60; index += 1) {
      await view(live, { ip: `2001:db8:85a3:7::${(index + 1).toString(16)}` });
    }
    await view(live, { ip: '2001:db8:85a3:7:ffff::1' });
    expect((await totals(live.site)).views).toBe(60);
    await view(live, { ip: '2001:db8:85a3:8::1' });
    expect((await totals(live.site)).views).toBe(61);
  });

  it('keys the sign-in limit on the address the edge added, not on forged entries before it', async () => {
    // `/auth/*` is the one place the API reads X-Forwarded-For itself (Express `trust proxy`).
    const body = { email: 'nobody@example.com', password: 'whatever-123' };
    const attempt = (forwardedFor: string) =>
      new TestClient(t.app).post('/auth/login', body).set('X-Forwarded-For', forwardedFor);
    for (let index = 0; index < 3; index += 1) {
      await attempt(`192.0.2.${index}, 198.51.100.60`).expect(401);
    }
    await attempt('192.0.2.200, 198.51.100.60').expect(429);
    await attempt('10.0.0.1, 192.0.2.201, 198.51.100.60').expect(429);
    await attempt('198.51.100.61').expect(401);
  });
});
