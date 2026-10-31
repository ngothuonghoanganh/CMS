import {
  type LeadListResponse,
  leadListResponseSchema,
  type LeadStatus,
  type Site,
} from '@plp/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { recordCalls } from '../../../test/explain.js';
import { createLiveFormPage, insertLeads, storedLead } from '../../../test/leads.js';
import {
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { configurePrivacy } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { createSite } from '../../../test/resources.js';

const HOUR = 3_600_000;
const BOM = '﻿';

/** One seeded lead, as the test knows it: what the filters look at. */
interface Seeded {
  name: string;
  page: 'a' | 'b';
  status: LeadStatus;
  spam: boolean;
  phone: string;
  createdAt: Date;
  /** Insertion order: among leads of the same instant, the later one has the larger id. */
  order: number;
}

/**
 * Paging the inbox past one page (50 leads) when many leads share an instant (ADR-018): no lead
 * twice, none skipped, with filters and a search, and the folder counts, the pages and the CSV
 * export hold the same leads in the same order.
 */
describe('inbox paging past 50 leads', () => {
  let t: TestApp;
  let owner: TestClient;
  let site: Site;
  let pageIds: { a: string; b: string };
  const seeded: Seeded[] = [];

  beforeAll(async () => {
    t = await createTestApp('plp_test_inbox_paging', {
      ...withRevalidationRecorder(new RecordingRevalidationClient()),
    });
    const signedUp = await signedUpClient(t.app);
    owner = signedUp.client;
    site = await createSite(owner, signedUp.workspaceId);
    await configurePrivacy(owner, site.id);
    await addConfirmedRecipient(t, owner, site.id);
    const a = await createLiveFormPage(owner, site.id, uniqueSlug('trang-a'));
    const b = await createLiveFormPage(owner, site.id, uniqueSlug('trang-b'));
    // 170 leads at 7 instants (25 at most of them share one), so ties straddle every page
    // boundary. Statuses are skewed: mostly "Đã chốt", a few "Mới".
    const now = Date.now();
    const instants = [1, 2, 3, 26, 27, 50, 75].map((hours) => new Date(now - hours * HOUR));
    const records: Record<string, unknown>[] = [];
    for (let index = 0; index < 170; index += 1) {
      const lead: Seeded = {
        name: `Khách ${String(index).padStart(3, '0')}`,
        page: index % 3 === 0 ? 'b' : 'a',
        status: index % 7 === 0 ? 'new' : index % 5 === 0 ? 'contacted' : 'won',
        spam: index % 11 === 10,
        phone: `+8490${index % 2 === 0 ? '1' : '2'}${String(100000 + index)}`,
        createdAt: instants[index % instants.length] ?? new Date(now),
        order: index,
      };
      seeded.push(lead);
      const page = lead.page === 'a' ? a : b;
      records.push(
        storedLead({
          workspaceId: signedUp.workspaceId,
          siteId: site.id,
          pageId: page.pageId,
          releaseId: page.published.release.id,
          name: lead.name,
          phone: lead.phone,
          status: lead.status,
          spam: lead.spam,
          createdAt: lead.createdAt,
        }),
      );
    }
    // One insert, in order: ids grow with `order`.
    await insertLeads(t, records);
    pageIds = { a: a.pageId, b: b.pageId };
  });

  afterAll(async () => {
    await t.close();
  });

  /** The expected leads, newest first and the larger id first among equals, found by hand. */
  function expected(match: (lead: Seeded) => boolean): string[] {
    return seeded
      .filter(match)
      .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime() || y.order - x.order)
      .map((lead) => lead.name);
  }

  /** Every page of a list, following `nextCursor`; checks each page holds at most 50. */
  async function allPages(
    fetchPage: (cursor: string | null) => Promise<LeadListResponse>,
  ): Promise<{ names: string[]; pages: LeadListResponse[] }> {
    const pages: LeadListResponse[] = [];
    let cursor: string | null = null;
    do {
      const page = await fetchPage(cursor);
      expect(page.items.length).toBeLessThanOrEqual(50);
      pages.push(page);
      cursor = page.nextCursor;
    } while (cursor !== null && pages.length < 20);
    return { names: pages.flatMap((page) => page.items.map((item) => item.name)), pages };
  }

  function listed(query: string) {
    return allPages(async (cursor) => {
      const suffix = cursor === null ? '' : `&cursor=${cursor}`;
      const response = await owner.get(`/sites/${site.id}/leads?${query}${suffix}`).expect(200);
      return leadListResponseSchema.parse(response.body);
    });
  }

  function searched(body: Record<string, unknown>) {
    return allPages(async (cursor) => {
      const response = await owner
        .post(`/sites/${site.id}/leads/search`, cursor === null ? body : { ...body, cursor })
        .expect(200);
      return leadListResponseSchema.parse(response.body);
    });
  }

  /** The names in a CSV export with the same filters, in file order. */
  async function exported(filters: Record<string, unknown>): Promise<string[]> {
    const response = await owner.post(`/sites/${site.id}/leads/export`, filters).expect(200);
    const [, ...rows] = response.text
      .slice(BOM.length)
      .split('\r\n')
      .filter((line) => line !== '');
    return rows.map((row) => row.split(',')[1] ?? '');
  }

  it('lists every lead of the inbox once, in order, across 4 pages', async () => {
    const want = expected((lead) => !lead.spam);
    expect(want).toHaveLength(155);
    const { names, pages } = await listed('range=all');
    expect(pages.map((page) => page.items.length)).toEqual([50, 50, 50, 5]);
    expect(names).toEqual(want);
    expect(pages[0]?.counts).toEqual({
      inbox: { count: 155, capped: false },
      spam: { count: 15, capped: false },
    });
    expect(await exported({ range: 'all' })).toEqual(want);
  });

  it('pages a page + status filter, and its folder counts match the pages', async () => {
    const want = expected((lead) => !lead.spam && lead.page === 'a' && lead.status === 'won');
    expect(want).toHaveLength(71);
    const { names, pages } = await listed(`range=all&pageId=${pageIds.a}&status=won`);
    expect(pages.map((page) => page.items.length)).toEqual([50, 21]);
    expect(names).toEqual(want);
    const spam = expected((lead) => lead.spam && lead.page === 'a' && lead.status === 'won');
    expect(spam).toHaveLength(7);
    expect(pages[1]?.counts).toEqual({
      inbox: { count: 71, capped: false },
      spam: { count: 7, capped: false },
    });
    expect(await exported({ range: 'all', pageId: pageIds.a, status: 'won' })).toEqual(want);
    // The spam folder of the same filter pages the same way.
    const spamPages = await listed(`range=all&folder=spam&pageId=${pageIds.a}&status=won`);
    expect(spamPages.names).toEqual(spam);
  });

  it('pages a search by phone prefix and by name with filters, and exports the same leads', async () => {
    const byPhone = expected((lead) => !lead.spam && lead.phone.startsWith('+84901'));
    expect(byPhone).toHaveLength(77);
    const phone = await searched({ q: '0901', range: 'all' });
    expect(phone.pages.map((page) => page.items.length)).toEqual([50, 27]);
    expect(phone.names).toEqual(byPhone);
    expect(phone.pages[0]?.counts.inbox).toEqual({ count: 77, capped: false });
    expect(await exported({ q: '0901', range: 'all' })).toEqual(byPhone);

    // A name is searched without accents, anywhere in it: "khach 1" is Khách 100 to Khách 169.
    const byName = expected((lead) => !lead.spam && lead.name.startsWith('Khách 1'));
    expect(byName).toHaveLength(64);
    const name = await searched({ q: 'khach 1', range: '7d' });
    expect(name.pages.map((page) => page.items.length)).toEqual([50, 14]);
    expect(name.names).toEqual(byName);
    expect(name.pages[0]?.counts.inbox).toEqual({ count: 64, capped: false });
    expect(await exported({ q: 'khach 1', range: '7d' })).toEqual(byName);
  });

  it('keeps a lead between two pages when its instant straddles them', async () => {
    // With 20 a page, the leads of one instant fall on two pages; the cursor's id breaks the tie.
    const want = expected((lead) => !lead.spam && lead.page === 'b');
    expect(want).toHaveLength(52);
    const pages: string[][] = [];
    let cursor: string | null = null;
    do {
      const suffix: string = cursor === null ? '' : `&cursor=${cursor}`;
      const response = await owner
        .get(`/sites/${site.id}/leads?range=all&limit=20&pageId=${pageIds.b}${suffix}`)
        .expect(200);
      const page = leadListResponseSchema.parse(response.body);
      pages.push(page.items.map((item) => item.name));
      cursor = page.nextCursor;
    } while (cursor !== null);
    expect(pages.map((names) => names.length)).toEqual([20, 20, 12]);
    expect(pages.flat()).toEqual(want);
    expect(new Set(pages.flat()).size).toBe(52);
  });

  it('reads a page + status filter through an inbox index, in index order', async () => {
    const sent = await recordCalls(t.connection, 'leads', async () => {
      await owner
        .get(`/sites/${site.id}/leads?range=30d&pageId=${pageIds.a}&status=new`)
        .expect(200);
    });
    const find = sent.find((call) => call.method === 'find');
    if (find === undefined) {
      throw new Error('The inbox sent no find');
    }
    const [filter, options] = find.params;
    const explained: unknown = await t.connection
      .collection('leads')
      .find(filter, options)
      .explain('executionStats');
    const plan = planStages(explained);
    // Either index narrows by site, folder and one of the two filters, and already holds the
    // leads newest first: no collection scan and no sort in memory.
    expect(plan).not.toContain('COLLSCAN');
    expect(plan).not.toContain('SORT');
    expect(
      plan.some(
        (stage) => stage === 'IXSCAN leads_inbox_page' || stage === 'IXSCAN leads_inbox_status',
      ),
    ).toBe(true);
  });
});

/** Every stage of an explained find's winning plan, as "STAGE" or "IXSCAN index". */
function planStages(explained: unknown): string[] {
  const winning =
    typeof explained === 'object' &&
    explained !== null &&
    'queryPlanner' in explained &&
    typeof explained.queryPlanner === 'object' &&
    explained.queryPlanner !== null &&
    'winningPlan' in explained.queryPlanner
      ? explained.queryPlanner.winningPlan
      : null;
  const stages: string[] = [];
  const visit = (stage: unknown): void => {
    if (typeof stage !== 'object' || stage === null) {
      return;
    }
    if ('stage' in stage && typeof stage.stage === 'string') {
      const index =
        'indexName' in stage && typeof stage.indexName === 'string' ? stage.indexName : '';
      stages.push(index === '' ? stage.stage : `${stage.stage} ${index}`);
    }
    // The slot-based engine nests the query plan one level down; $or plans branch.
    if ('queryPlan' in stage) {
      visit(stage.queryPlan);
    }
    if ('inputStage' in stage) {
      visit(stage.inputStage);
    }
    if ('inputStages' in stage && Array.isArray(stage.inputStages)) {
      stage.inputStages.forEach(visit);
    }
  };
  visit(winning);
  return stages;
}
