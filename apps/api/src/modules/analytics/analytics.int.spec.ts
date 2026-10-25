import {
  ANALYTICS_OTHER_SOURCE,
  type AnalyticsReport,
  analyticsReportSchema,
  addVnDays,
  leadListResponseSchema,
  type Site,
  vnDayOf,
  vnDayStart,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pageView, sendPageView } from '../../../test/analytics.js';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import {
  createLiveFormPage,
  DESKTOP_UA,
  insertLeads,
  leadBody,
  PHONE_UA,
  storedLead,
  submitLead,
} from '../../../test/leads.js';
import {
  createLivePage,
  createPage,
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { configurePrivacy } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { addEditor, createSite } from '../../../test/resources.js';

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-A556E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

/** "Hiệu quả" (board 11, ADR-019): counting views without cookies, and the report. */
describe('analytics', () => {
  let t: TestApp;
  let owner: TestClient;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_analytics', {
      ...withRevalidationRecorder(new RecordingRevalidationClient()),
      env: { LEAD_LIMIT_PER_CLIENT: 1000, LEAD_LIMIT_PER_SITE_PER_HOUR: 1000 },
    });
    const signedUp = await signedUpClient(t.app);
    owner = signedUp.client;
    workspaceId = signedUp.workspaceId;
  });

  afterAll(async () => {
    await t.close();
  });

  interface LiveSite {
    site: Site;
    pageId: string;
    slug: string;
    releaseId: string;
  }

  /** A site with a live page that has a lead form. */
  async function liveSite(): Promise<LiveSite> {
    const site = await createSite(owner, workspaceId);
    await configurePrivacy(owner, site.id);
    await addConfirmedRecipient(t, owner, site.id);
    const slug = uniqueSlug('uu-dai');
    const { pageId, published } = await createLiveFormPage(owner, site.id, slug);
    return { site, pageId, slug, releaseId: published.release.id };
  }

  async function report(site: Site, query = ''): Promise<AnalyticsReport> {
    const response = await owner.get(`/sites/${site.id}/analytics${query}`).expect(200);
    return analyticsReportSchema.parse(response.body);
  }

  async function view(live: LiveSite, options: Parameters<typeof sendPageView>[3] = {}) {
    await sendPageView(t, live.site.subdomain, pageView(`/${live.slug}`), options).expect(204);
  }

  it('counts each view, and each visitor once a day, on the site and on the page', async () => {
    const live = await liveSite();
    await view(live);
    await view(live);
    await view(live, { userAgent: PHONE_UA, ip: '203.0.113.9' });

    const site = await report(live.site);
    const today = vnDayOf(new Date());
    expect(site.totals).toEqual({ views: 3, visitors: 2, leads: 0 });
    expect(site.daily.at(-1)).toEqual({ day: today, views: 3, visitors: 2, leads: 0 });
    expect(site.devices).toEqual({ mobile: 1, desktop: 1 });
    expect(site.pages).toEqual([
      { page: { id: live.pageId, title: 'Đăng ký tư vấn' }, visitors: 2, leads: 0 },
    ]);
    const page = await report(live.site, `?pageId=${live.pageId}`);
    expect(page.totals).toEqual({ views: 3, visitors: 2, leads: 0 });
    expect(page.pages).toEqual([]);
    // Neither the address nor the browser is stored anywhere.
    const stored = JSON.stringify([
      await t.connection.collection('analytics_seen').find().toArray(),
      await t.connection.collection('analytics_daily').find().toArray(),
    ]);
    expect(stored).not.toContain('203.0.113');
    expect(stored).not.toContain('Mozilla');
  });

  it('counts the visitor again once the day’s salt changes', async () => {
    const live = await liveSite();
    await view(live);
    // The next day has another salt: the same address and browser hash differently.
    await t.connection
      .collection('analytics_salts')
      .updateOne({ day: vnDayOf(new Date()) }, { $set: { salt: 'muoi-cua-ngay-khac' } });
    await view(live);
    expect((await report(live.site)).totals).toEqual({ views: 2, visitors: 2, leads: 0 });
  });

  it('does not count bots, unsigned requests, other paths or other sites', async () => {
    const live = await liveSite();
    for (const userAgent of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0 Safari/537.36',
      'facebookexternalhit/1.1',
    ]) {
      await view(live, { userAgent });
    }
    await sendPageView(t, live.site.subdomain, pageView(`/${live.slug}`), {
      unsigned: true,
    }).expect(401);
    // A draft that was never published, and a path nothing lives at.
    const draft = await createPage(owner, live.site.id, {
      title: 'Nháp',
      slug: uniqueSlug('nhap'),
    });
    await sendPageView(t, live.site.subdomain, pageView(`/${draft.page.slug}`)).expect(204);
    await sendPageView(t, live.site.subdomain, pageView('/khong-co')).expect(204);
    await sendPageView(t, 'khong-ton-tai', pageView(`/${live.slug}`)).expect(204);

    expect((await report(live.site)).totals).toEqual({ views: 0, visitors: 0, leads: 0 });
  });

  it('reads the path as the renderer serves it, trailing slash included', async () => {
    const live = await liveSite();
    await sendPageView(t, live.site.subdomain, pageView(`/${live.slug}/`)).expect(204);
    expect((await report(live.site)).totals.views).toBe(1);
  });

  it('names where visitors came from, as for leads', async () => {
    const live = await liveSite();
    await sendPageView(
      t,
      live.site.subdomain,
      pageView(`/${live.slug}`, { utmSource: 'Facebook', utmMedium: 'CPC', utmCampaign: 't11' }),
    ).expect(204);
    await sendPageView(
      t,
      live.site.subdomain,
      pageView(`/${live.slug}`, { referrer: 'https://www.google.com.vn/' }),
      { ip: '203.0.113.20' },
    ).expect(204);
    // A link between the site's own pages is not a referral.
    await sendPageView(
      t,
      live.site.subdomain,
      pageView(`/${live.slug}`, { referrer: `http://${live.site.subdomain}.localhost:3101/` }),
      { ip: '203.0.113.21' },
    ).expect(204);

    const sources = (await report(live.site)).sources;
    expect(sources).toEqual(
      expect.arrayContaining([
        { source: 'facebook', medium: 'cpc', visitors: 1, leads: 0 },
        { source: 'google', medium: 'organic', visitors: 1, leads: 0 },
        { source: '(direct)', medium: '(none)', visitors: 1, leads: 0 },
      ]),
    );
  });

  it('counts the 51st new source pair of a day as "khác"', async () => {
    const live = await liveSite();
    const day = vnDayOf(new Date());
    const siteId = new Types.ObjectId(live.site.id);
    await t.connection.collection('analytics_daily').insertMany(
      Array.from({ length: 50 }, (_, index) => ({
        workspaceId: new Types.ObjectId(workspaceId),
        siteId,
        pageId: null,
        day,
        source: `nguon-${String(index)}`,
        medium: 'referral',
        device: 'desktop',
        views: 1,
        visitors: 1,
        expiresAt: vnDayStart(addVnDays(day, 400)),
      })),
    );
    await sendPageView(
      t,
      live.site.subdomain,
      pageView(`/${live.slug}`, { utmSource: 'moi' }),
    ).expect(204);
    await sendPageView(
      t,
      live.site.subdomain,
      pageView(`/${live.slug}`, { utmSource: 'nguon-7', utmMedium: 'referral' }),
      { ip: '203.0.113.30' },
    ).expect(204);

    const rows = await t.connection
      .collection('analytics_daily')
      .find({ siteId, pageId: null, day, views: { $gt: 1 } })
      .toArray();
    expect(rows).toEqual([expect.objectContaining({ source: 'nguon-7', views: 2 })]);
    const other = await t.connection
      .collection('analytics_daily')
      .findOne({ siteId, pageId: null, day, ...ANALYTICS_OTHER_SOURCE });
    expect(other).toMatchObject({ views: 1, visitors: 1 });
  });

  it('reports leads not suspected of spam, with their source and page, against the period before', async () => {
    const live = await liveSite();
    await view(live, { userAgent: ANDROID_UA });
    await submitLead(
      t,
      live.site.subdomain,
      leadBody(live.releaseId, {
        name: 'Nguyễn Thu Hà',
        source: { utmSource: 'facebook', utmMedium: 'cpc', utmCampaign: null, referrer: null },
      }),
      { userAgent: ANDROID_UA },
    ).expect(201);
    await submitLead(
      t,
      live.site.subdomain,
      leadBody(live.releaseId, { name: 'Bot quảng cáo', honeypot: 'https://spam.example' }),
    ).expect(201);
    // Eight days ago: the previous period of "7 ngày".
    const earlier = vnDayStart(addVnDays(vnDayOf(new Date()), -8));
    await insertLeads(t, [
      storedLead({
        workspaceId,
        siteId: live.site.id,
        pageId: live.pageId,
        releaseId: live.releaseId,
        createdAt: new Date(earlier.getTime() + 3_600_000),
      }),
    ]);

    const site = await report(live.site);
    expect(site.totals).toEqual({ views: 1, visitors: 1, leads: 1 });
    expect(site.previousTotals).toEqual({ views: 0, visitors: 0, leads: 1 });
    expect(site.daily.at(-1)?.leads).toBe(1);
    expect(site.pages).toEqual([
      { page: { id: live.pageId, title: 'Đăng ký tư vấn' }, visitors: 1, leads: 1 },
    ]);
    expect(site.sources).toEqual(
      expect.arrayContaining([{ source: 'facebook', medium: 'cpc', visitors: 0, leads: 1 }]),
    );

    // Moving the lead to spam shows at once.
    const lead = leadListResponseSchema
      .parse((await owner.get(`/sites/${live.site.id}/leads`).expect(200)).body)
      .items.find((item) => item.name === 'Nguyễn Thu Hà');
    await owner.patch(`/leads/${lead?.id ?? ''}`, { spam: true }).expect(200);
    expect((await report(live.site)).totals.leads).toBe(0);
  });

  it('covers 7, 30 or 90 days, today included, and the same number just before', async () => {
    const live = await liveSite();
    const today = vnDayOf(new Date());
    for (const [range, days] of [
      ['7d', 7],
      ['30d', 30],
      ['90d', 90],
    ] as const) {
      const result = await report(live.site, `?range=${range}`);
      expect(result.daily).toHaveLength(days);
      expect(result.period).toEqual({ from: addVnDays(today, 1 - days), to: today });
      expect(result.previousPeriod).toEqual({
        from: addVnDays(today, 1 - 2 * days),
        to: addVnDays(today, -days),
      });
    }
    await owner.get(`/sites/${live.site.id}/analytics?range=365d`).expect(422);
  });

  it('lets editors read the report and hides it from other workspaces', async () => {
    const live = await liveSite();
    const editor = (await addEditor(t, workspaceId)).client;
    await editor.get(`/sites/${live.site.id}/analytics`).expect(200);
    const outsider = (await signedUpClient(t.app)).client;
    await outsider.get(`/sites/${live.site.id}/analytics`).expect(404);
    // A page of another site is no way into this one.
    const other = await liveSite();
    await view(other);
    const filtered = await report(live.site, `?pageId=${other.pageId}`);
    expect(filtered.totals).toEqual({ views: 0, visitors: 0, leads: 0 });
  });
});

describe('analytics rate limits', () => {
  let t: TestApp;
  let owner: TestClient;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_analytics_limits', {
      ...withRevalidationRecorder(new RecordingRevalidationClient()),
      env: { PAGE_VIEW_LIMIT_PER_CLIENT: 3, PAGE_VIEW_LIMIT_PER_SITE_PER_HOUR: 6 },
    });
    const signedUp = await signedUpClient(t.app);
    owner = signedUp.client;
    workspaceId = signedUp.workspaceId;
  });

  afterAll(async () => {
    await t.close();
  });

  it('counts 3 views per address and 6 per site, then drops the others quietly', async () => {
    const site = await createSite(owner, workspaceId);
    const slug = uniqueSlug('trang');
    await createLivePage(owner, site.id, slug);
    const send = (ip: string | null) =>
      sendPageView(t, site.subdomain, pageView(`/${slug}`), { ip, userAgent: DESKTOP_UA }).expect(
        204,
      );
    for (let index = 0; index < 5; index += 1) {
      await send('203.0.113.7');
    }
    // Without a trusted address only the site's limit applies.
    for (let index = 0; index < 5; index += 1) {
      await send(null);
    }
    const response = await owner.get(`/sites/${site.id}/analytics`).expect(200);
    expect(analyticsReportSchema.parse(response.body).totals.views).toBe(6);
  });
});
