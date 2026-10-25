import { randomUUID } from 'node:crypto';
import {
  type CreatePageRequest,
  IDEMPOTENCY_KEY_HEADER,
  type PageDetailResponse,
  pageDetailResponseSchema,
  type PageListResponse,
  pageListResponseSchema,
  type PublishRequest,
  type PublishResponse,
  publishResponseSchema,
  type RevalidationResult,
  type SaveDraftRequest,
  type SaveDraftResponse,
  saveDraftResponseSchema,
} from '@plp/contracts';
import { RevalidationClient } from '../src/modules/revalidation/revalidation.client.js';
import type { TestAppOptions } from './app.js';
import type { TestClient } from './client.js';
import { publishableDraft } from './compositions.js';
import { TEST_ADMIN_ORIGIN } from './env.js';

/** Stands in for the renderer webhook: records every site it was asked to refresh. */
export class RecordingRevalidationClient {
  readonly calls: string[] = [];
  result: RevalidationResult = 'ok';

  revalidateSite(subdomain: string): Promise<RevalidationResult> {
    this.calls.push(subdomain);
    return Promise.resolve(this.result);
  }
}

/** `createTestApp` options that replace the revalidation client with `recorder`. */
export function withRevalidationRecorder(recorder: RecordingRevalidationClient): TestAppOptions {
  return { override: (builder) => builder.overrideProvider(RevalidationClient).useValue(recorder) };
}

let slugCounter = 0;

/** A valid page slug not used by any other helper call in this process. */
export function uniqueSlug(prefix = 'trang'): string {
  slugCounter += 1;
  return `${prefix}-${slugCounter.toString(36)}`;
}

export async function createPage(
  client: TestClient,
  siteId: string,
  overrides: Partial<CreatePageRequest> = {},
): Promise<PageDetailResponse> {
  const response = await client
    .post(`/sites/${siteId}/pages`, {
      title: 'Ưu đãi niềng răng',
      slug: uniqueSlug(),
      start: { kind: 'blank' },
      ...overrides,
    })
    .expect(201);
  return pageDetailResponseSchema.parse(response.body);
}

export async function getPage(client: TestClient, pageId: string): Promise<PageDetailResponse> {
  const response = await client.get(`/pages/${pageId}`).expect(200);
  return pageDetailResponseSchema.parse(response.body);
}

export async function saveDraft(
  client: TestClient,
  pageId: string,
  body: SaveDraftRequest,
): Promise<SaveDraftResponse> {
  const response = await client.put(`/pages/${pageId}/draft`, body).expect(200);
  return saveDraftResponseSchema.parse(response.body);
}

/** Loads the page and saves `draft` on top of its current revision. */
export async function replaceDraft(
  client: TestClient,
  pageId: string,
  draft: Omit<SaveDraftRequest, 'baseRevision'>,
): Promise<SaveDraftResponse> {
  const detail = await getPage(client, pageId);
  return saveDraft(client, pageId, { baseRevision: detail.draft.revision, ...draft });
}

/** Changes the heading of the draft's first Hero, keeping every section id. */
export async function editHeroHeading(
  client: TestClient,
  pageId: string,
  heading: string,
): Promise<SaveDraftResponse> {
  const detail = await getPage(client, pageId);
  const sections = detail.draft.composition.sections.map((section, index, all) =>
    section.type === 'hero' && all.findIndex((other) => other.type === 'hero') === index
      ? { ...section, content: { ...section.content, heading } }
      : section,
  );
  return saveDraft(client, pageId, {
    baseRevision: detail.draft.revision,
    slug: detail.draft.slug,
    composition: { ...detail.draft.composition, sections },
    seo: detail.draft.seo,
  });
}

/** Sends `POST /pages/:pageId/releases`; the caller sets the expected status. */
export function publishRequest(
  client: TestClient,
  pageId: string,
  body: PublishRequest,
  idempotencyKey: string | null = randomUUID(),
) {
  const request = client.agent.post(`/pages/${pageId}/releases`).set('Origin', TEST_ADMIN_ORIGIN);
  return (
    idempotencyKey === null ? request : request.set(IDEMPOTENCY_KEY_HEADER, idempotencyKey)
  ).send(body);
}

/** The body the publish dialog sends for the page as it is now, skipping every warning. */
export async function currentPublishBody(
  client: TestClient,
  pageId: string,
  note = '',
): Promise<PublishRequest> {
  const detail = await getPage(client, pageId);
  return {
    expectedRevision: detail.draft.revision,
    expectedPublishedReleaseId: detail.page.liveRelease?.id ?? null,
    acknowledgedWarnings: detail.checks.warnings.map((warning) => warning.fingerprint),
    acknowledgedSiteChanges: detail.page.siteChanges.map((change) => change.label),
    note,
  };
}

/** Publishes the current draft, acknowledging its warnings. */
export async function publish(
  client: TestClient,
  pageId: string,
  note = '',
): Promise<PublishResponse> {
  const body = await currentPublishBody(client, pageId, note);
  const response = await publishRequest(client, pageId, body).expect(201);
  return publishResponseSchema.parse(response.body);
}

/** Creates a page with a publishable draft at `slug` and publishes it as v1. */
export async function createLivePage(
  client: TestClient,
  siteId: string,
  slug: string,
  heading = 'Niềng răng trong suốt',
  title = 'Ưu đãi niềng răng',
): Promise<{ pageId: string; published: PublishResponse }> {
  const page = await createPage(client, siteId, { title, slug });
  await replaceDraft(client, page.page.id, publishableDraft(slug, heading));
  return { pageId: page.page.id, published: await publish(client, page.page.id) };
}

export async function listPages(
  client: TestClient,
  siteId: string,
  query = '',
): Promise<PageListResponse> {
  const response = await client.get(`/sites/${siteId}/pages${query}`).expect(200);
  return pageListResponseSchema.parse(response.body);
}
