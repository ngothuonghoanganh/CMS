import { ANALYTICS_OTHER_SOURCE, analyticsReportSchema, vnDayOf } from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pageView, sendPageView } from '../../../test/analytics.js';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { createSecondInstance } from '../../../test/instances.js';
import {
  createLivePage,
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { createSite } from '../../../test/resources.js';

/**
 * Two API processes on one database (ADR-019): views and unique visitors add up across them, and
 * the daily cap of 50 source pairs is kept in each instance's memory.
 */
describe('page views on two API instances', () => {
  let a: TestApp;
  let b: TestApp;
  let owner: TestClient;
  let workspaceId: string;

  beforeAll(async () => {
    a = await createTestApp(
      'plp_test_two_instances_views',
      withRevalidationRecorder(new RecordingRevalidationClient()),
    );
    b = await createSecondInstance(a);
    const signedUp = await signedUpClient(a.app);
    owner = signedUp.client;
    workspaceId = signedUp.workspaceId;
  });

  afterAll(async () => {
    await b.close();
    await a.close();
  });

  async function liveSite() {
    const site = await createSite(owner, workspaceId);
    const slug = uniqueSlug('trang');
    await createLivePage(owner, site.id, slug);
    return { site, slug };
  }

  it('counts a visitor once a day whichever instance gets their views', async () => {
    const { site, slug } = await liveSite();
    for (const instance of [a, b, a, b]) {
      await sendPageView(instance, site.subdomain, pageView(`/${slug}`)).expect(204);
    }
    await sendPageView(b, site.subdomain, pageView(`/${slug}`), { ip: '198.51.100.4' }).expect(204);
    const report = analyticsReportSchema.parse(
      (await owner.get(`/sites/${site.id}/analytics`).expect(200)).body,
    );
    expect(report.totals).toEqual({ views: 5, visitors: 2, leads: 0 });
  });

  it('keeps the cap of 50 source pairs per instance: two store almost twice as many', async () => {
    const { site, slug } = await liveSite();
    const day = vnDayOf(new Date());
    const campaign = (instance: TestApp, source: string, ip?: string) =>
      sendPageView(
        instance,
        site.subdomain,
        pageView(`/${slug}`, { utmSource: source, utmMedium: 'cpc' }),
        ip === undefined ? {} : { ip },
      ).expect(204);
    // Each instance reads the stored pairs once, at its first campaign view of the day, then
    // counts alone: A reads none, B reads the one A stored by then.
    for (let index = 0; index < 50; index += 1) {
      await campaign(a, `a-${index}`, `203.0.113.${index}`);
      await campaign(b, `b-${index}`, `198.51.100.${index}`);
    }
    // Past its own 50, each instance counts a new pair as "khác".
    await campaign(a, 'a-moi');
    await campaign(b, 'b-moi');

    const rows = await a.connection
      .collection('analytics_daily')
      .find({ siteId: new Types.ObjectId(site.id), pageId: null, day })
      .toArray();
    const campaigns = new Set(
      rows.filter((row) => row['medium'] === 'cpc').map((row) => String(row['source'])),
    );
    // 50 from A and 49 from B, where one instance alone would have stopped at 50.
    expect(campaigns.size).toBe(99);
    expect([...campaigns].filter((source) => source.startsWith('a-'))).toHaveLength(50);
    expect(rows.find((row) => row['source'] === ANALYTICS_OTHER_SOURCE.source)).toMatchObject({
      views: 3,
    });
  });
});
