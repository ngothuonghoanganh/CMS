import { problemSchema, type Site, siteListResponseSchema } from '@plp/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { explainAggregate, recordCalls } from '../../../test/explain.js';
import { insertLeads, storedLead } from '../../../test/leads.js';
import { createLivePage, createPage, editHeroHeading, uniqueSlug } from '../../../test/pages.js';
import { addMember, createSite } from '../../../test/resources.js';
import { PAGES_SITE_LIVE_INDEX } from '../pages/page.schema.js';

const DAY_MS = 86_400_000;

/**
 * `GET /workspaces/:id/sites` counts each site's pages, live pages and leads of the last 7 days
 * for the Sites screen (ADR-028), within the member's sites and permissions (ADR-020, ADR-024).
 */
describe('site list counts', () => {
  let t: TestApp;
  let owner: TestClient;
  let workspaceId: string;
  let smile: Site;
  let kitchen: Site;
  let spa: Site;

  beforeAll(async () => {
    t = await createTestApp('plp_test_site_list');
    ({ client: owner, workspaceId } = await signedUpClient(t.app));
    smile = await createSite(owner, workspaceId, { name: 'Nha khoa Smile Care' });
    kitchen = await createSite(owner, workspaceId, { name: 'Bếp Nhà Mây' });
    spa = await createSite(owner, workspaceId, { name: 'Spa Lá Xanh' });

    // Nha khoa Smile Care: a draft, a live page, a live page with changes and an unpublished one.
    await createPage(owner, smile.id, { title: 'Bản nháp' });
    const live = await createLivePage(owner, smile.id, uniqueSlug('live'));
    const changed = await createLivePage(owner, smile.id, uniqueSlug('doi'));
    await editHeroHeading(owner, smile.id, changed.pageId, 'Ưu đãi mới');
    const removed = await createLivePage(owner, smile.id, uniqueSlug('go'));
    await owner
      .post(`/sites/${smile.id}/pages/${removed.pageId}/pointer`, {
        targetReleaseId: null,
        expectedCurrentReleaseId: removed.published.release.id,
        reason: 'Hết ưu đãi',
      })
      .expect(200);
    // Bếp Nhà Mây has one live page; Spa Lá Xanh nothing yet.
    const kitchenPage = await createLivePage(owner, kitchen.id, uniqueSlug('bep'));

    const leadOf = (
      siteId: string,
      page: Awaited<ReturnType<typeof createLivePage>>,
      options: { createdAt?: Date; spam?: boolean } = {},
    ) =>
      storedLead({
        workspaceId,
        siteId,
        pageId: page.pageId,
        releaseId: page.published.release.id,
        ...options,
      });
    await insertLeads(t, [
      leadOf(smile.id, live),
      leadOf(smile.id, live, { createdAt: new Date(Date.now() - DAY_MS) }),
      // Neither spam nor leads older than 7 days count, as on the dashboard's card.
      leadOf(smile.id, live, { spam: true }),
      leadOf(smile.id, changed, { createdAt: new Date(Date.now() - 8 * DAY_MS) }),
      leadOf(kitchen.id, kitchenPage),
    ]);
  });

  afterAll(async () => {
    await t.close();
  });

  async function summaries(client: TestClient) {
    const response = await client.get(`/workspaces/${workspaceId}/sites`).expect(200);
    return siteListResponseSchema
      .parse(response.body)
      .items.map(({ name, summary }) => ({ name, summary }));
  }

  it('counts the pages, live pages and leads of the last 7 days of every site', async () => {
    expect(await summaries(owner)).toEqual([
      { name: smile.name, summary: { pages: 4, livePages: 2, leadsLast7Days: 2 } },
      { name: kitchen.name, summary: { pages: 1, livePages: 1, leadsLast7Days: 1 } },
      { name: spa.name, summary: { pages: 0, livePages: 0, leadsLast7Days: 0 } },
    ]);
  });

  it("counts only the member's sites, and leads only for roles that see them", async () => {
    // Biên tập does not see leads (ADR-020); kept to one site, it lists that one.
    const editor = await addMember(t, workspaceId, 'editor', [smile.id]);
    expect(await summaries(editor.client)).toEqual([
      { name: smile.name, summary: { pages: 4, livePages: 2, leadsLast7Days: null } },
    ]);

    const support = await addMember(t, workspaceId, 'support', [kitchen.id, spa.id]);
    expect(await summaries(support.client)).toEqual([
      { name: kitchen.name, summary: { pages: 1, livePages: 1, leadsLast7Days: 1 } },
      { name: spa.name, summary: { pages: 0, livePages: 0, leadsLast7Days: 0 } },
    ]);

    const viewer = await addMember(t, workspaceId, 'viewer');
    expect((await summaries(viewer.client)).map(({ summary }) => summary.leadsLast7Days)).toEqual([
      null,
      null,
      null,
    ]);

    // A member whose sites are all gone (ADR-027) sees none, and nothing is counted.
    const unassigned = await addMember(t, workspaceId, 'editor', []);
    expect(await summaries(unassigned.client)).toEqual([]);
  });

  it('answers 404 outside the workspace and 401 without a session', async () => {
    const stranger = (await signedUpClient(t.app)).client;
    const response = await stranger.get(`/workspaces/${workspaceId}/sites`).expect(404);
    expect(problemSchema.parse(response.body).title).toBe('Không tìm thấy workspace');
    await stranger.get('/workspaces/not-an-id/sites').expect(404);
    await request(t.app.getHttpServer()).get(`/workspaces/${workspaceId}/sites`).expect(401);
  });

  it('counts pages from their index, without reading the pages', async () => {
    const workspaceDb = t.workspaceDb(workspaceId);
    const sent = await recordCalls(workspaceDb, 'pages', async () => {
      await summaries(owner);
    });
    expect(sent.map((call) => call.method)).toEqual(['aggregate']);
    const [call] = sent;
    if (call === undefined) {
      throw new Error('The site list sent no aggregation');
    }
    const explained = await explainAggregate(workspaceDb, call);
    expect(explained.indexes).toEqual([PAGES_SITE_LIVE_INDEX]);
    expect(explained.docsExamined).toBe(0);
  });
});
