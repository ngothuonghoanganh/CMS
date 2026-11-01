import { Writable } from 'node:stream';
import {
  PREVIEW_TTL_SECONDS,
  previewLinkResponseSchema,
  problemSchema,
  publicPreviewResponseSchema,
  publicPreviewStatusResponseSchema,
  type Site,
} from '@plp/contracts';
import { SignJWT } from 'jose';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, TestClient } from '../../../test/client.js';
import {
  createLivePage,
  createPage,
  editHeroHeading,
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { createSite } from '../../../test/resources.js';
import { PREVIEW_KEY_ID, type PreviewClaims, PreviewTokens } from './preview-tokens.js';

/** Text of the draft each page holds; a refused preview must not show any of it. */
const DRAFT_HEADING = 'Bản nháp chỉ người có link được xem';

/**
 * Invalid preview links through the public route (ADR-010): each answers 404 with a bare problem,
 * like a page that does not exist, and the log holds neither the token nor anything it names.
 */
describe('preview links that must not open', () => {
  const output: string[] = [];
  let t: TestApp;
  let owner: TestClient;
  let visitor: TestClient;
  let workspaceId: string;
  let site: Site;
  let otherSite: Site;
  let foreignWorkspaceId: string;
  let foreignSite: Site;
  let pageId: string;
  let otherSitePageId: string;
  let otherSiteReleaseId: string;
  let foreignPageId: string;
  let foreignReleaseId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_preview_links', {
      ...withRevalidationRecorder(new RecordingRevalidationClient()),
      env: { LOG_LEVEL: 'info' },
      logDestination: new Writable({
        write(chunk: Buffer, _encoding, done) {
          output.push(chunk.toString('utf8'));
          done();
        },
      }),
    });
    const signedUp = await signedUpClient(t.app);
    owner = signedUp.client;
    workspaceId = signedUp.workspaceId;
    site = await createSite(owner, workspaceId);
    otherSite = await createSite(owner, workspaceId);
    visitor = new TestClient(t.app);

    pageId = (await createLivePage(owner, site.id, uniqueSlug('xem'))).pageId;
    await editHeroHeading(owner, site.id, pageId, DRAFT_HEADING);
    const otherSitePage = await createLivePage(owner, otherSite.id, uniqueSlug('khac'));
    otherSitePageId = otherSitePage.pageId;
    otherSiteReleaseId = otherSitePage.published.release.id;
    await editHeroHeading(owner, otherSite.id, otherSitePageId, DRAFT_HEADING);

    const foreign = await signedUpClient(t.app);
    foreignWorkspaceId = foreign.workspaceId;
    foreignSite = await createSite(foreign.client, foreign.workspaceId);
    const foreignPage = await createLivePage(foreign.client, foreignSite.id, uniqueSlug('ngoai'));
    foreignPageId = foreignPage.pageId;
    foreignReleaseId = foreignPage.published.release.id;
    await editHeroHeading(foreign.client, foreignSite.id, foreignPageId, DRAFT_HEADING);
  });

  afterAll(async () => {
    await t.close();
  });

  function siteClaims(of: Site, workspace: string) {
    return { siteId: of.id, workspaceId: workspace, subdomain: of.subdomain };
  }

  /** A token signed with the API's own key and key id, as if the claims had been issued. */
  async function signed(claims: PreviewClaims, now?: Date): Promise<string> {
    return (await t.app.get(PreviewTokens).sign(claims, now)).token;
  }

  /** Signs `claims` with the preview secret but a header of the caller's choosing. */
  function signedWithHeader(claims: object, header: { alg: string; kid?: string }) {
    return new SignJWT({ ...claims })
      .setProtectedHeader(header)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 600)
      .sign(new TextEncoder().encode(t.env.PREVIEW_SECRET));
  }

  /**
   * Requests the preview, and its status as the renderer's proxy does, and expects each to be a
   * 404 that says nothing about the page or the token.
   */
  async function expectRefused(token: string, requestId: string): Promise<void> {
    await expectRefusedAt(`/public/preview/${token}`, token, requestId);
    await expectRefusedAt(`/public/preview/${token}/status`, token, `${requestId}-status`);
  }

  async function expectRefusedAt(path: string, token: string, requestId: string): Promise<void> {
    const response = await visitor.get(path).set('x-request-id', requestId).expect(404);
    const problem = problemSchema.parse(response.body);
    expect(problem).toEqual({
      type: 'about:blank',
      title: 'Không tìm thấy trang',
      status: 404,
      code: 'not_found',
      requestId,
    });
    // Like a successful preview, a refused one is never cached nor indexed.
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    const body = JSON.stringify(response.body);
    for (const secret of [DRAFT_HEADING, pageId, otherSitePageId, foreignPageId, site.id]) {
      expect(body).not.toContain(secret);
    }
    await expectLogged(requestId);
    const log = output.join('');
    for (const part of token.split('.').filter((segment) => segment.length > 8)) {
      expect(log).not.toContain(part);
    }
    expect(log).not.toContain(DRAFT_HEADING);
  }

  /** Waits for the request's log line; pino-http writes it once the response has finished. */
  async function expectLogged(requestId: string): Promise<void> {
    await vi.waitFor(() => {
      expect(output.join('')).toContain(`"id":"${requestId}"`);
    });
  }

  it('opens a valid link, so the refusals below are about the token alone', async () => {
    const response = await owner
      .post(`/sites/${site.id}/pages/${pageId}/preview-links`, { kind: 'draft' })
      .expect(201);
    const token = previewLinkResponseSchema.parse(response.body).url.split('/_preview/')[1];
    const preview = publicPreviewResponseSchema.parse(
      (await visitor.get(`/public/preview/${token ?? ''}`).expect(200)).body,
    );
    expect(JSON.stringify(preview.data.page.composition)).toContain(DRAFT_HEADING);
  });

  it('answers the status of a valid link without any of the page', async () => {
    const draft = await signed({ kind: 'draft', pageId, ...siteClaims(site, workspaceId) });
    const release = await signed({
      kind: 'release',
      releaseId: otherSiteReleaseId,
      ...siteClaims(otherSite, workspaceId),
    });
    const draftStatus = await visitor.get(`/public/preview/${draft}/status`).expect(200);
    expect(publicPreviewStatusResponseSchema.strict().parse(draftStatus.body)).toEqual({
      kind: 'draft',
      subdomain: site.subdomain,
    });
    expect(draftStatus.headers['cache-control']).toBe('no-store');
    expect(draftStatus.headers['x-robots-tag']).toBe('noindex, nofollow');
    const releaseStatus = await visitor.get(`/public/preview/${release}/status`).expect(200);
    expect(publicPreviewStatusResponseSchema.strict().parse(releaseStatus.body)).toEqual({
      kind: 'release',
      subdomain: otherSite.subdomain,
    });
  });

  it('refuses an expired link', async () => {
    const issued = new Date(Date.now() - (PREVIEW_TTL_SECONDS + 1) * 1000);
    await expectRefused(
      await signed({ kind: 'draft', pageId, ...siteClaims(site, workspaceId) }, issued),
      'preview-expired',
    );
  });

  it('refuses a link signed under another key id, another algorithm or no algorithm', async () => {
    const claims = { kind: 'draft', pageId, ...siteClaims(site, workspaceId) };
    await expectRefused(
      await signedWithHeader(claims, { alg: 'HS256', kid: 'v0' }),
      'preview-other-kid',
    );
    await expectRefused(await signedWithHeader(claims, { alg: 'HS256' }), 'preview-no-kid');
    await expectRefused(
      await signedWithHeader(claims, { alg: 'HS512', kid: PREVIEW_KEY_ID }),
      'preview-hs512',
    );
    const unsigned = [
      Buffer.from(JSON.stringify({ alg: 'none', kid: PREVIEW_KEY_ID })).toString('base64url'),
      Buffer.from(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + 600 })).toString(
        'base64url',
      ),
      '',
    ].join('.');
    await expectRefused(unsigned, 'preview-alg-none');
  });

  it('refuses a link whose claims or signature were changed', async () => {
    const token = await signed({ kind: 'draft', pageId, ...siteClaims(site, workspaceId) });
    const [header, payload, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as object;
    const swapped = Buffer.from(JSON.stringify({ ...claims, pageId: otherSitePageId })).toString(
      'base64url',
    );
    await expectRefused(`${header ?? ''}.${swapped}.${signature ?? ''}`, 'preview-claims-changed');
    const flipped = `${signature?.startsWith('A') ? 'B' : 'A'}${signature?.slice(1) ?? ''}`;
    await expectRefused(`${header ?? ''}.${payload ?? ''}.${flipped}`, 'preview-signature-changed');
    const other = new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'HS256', kid: PREVIEW_KEY_ID })
      .setExpirationTime(Math.floor(Date.now() / 1000) + 600)
      .sign(new TextEncoder().encode(`${t.env.PREVIEW_SECRET}-other`));
    await expectRefused(await other, 'preview-other-secret');
  });

  it('refuses a validly signed link to a page or release of another site', async () => {
    await expectRefused(
      await signed({ kind: 'draft', pageId: otherSitePageId, ...siteClaims(site, workspaceId) }),
      'preview-other-site-page',
    );
    await expectRefused(
      await signed({
        kind: 'release',
        releaseId: otherSiteReleaseId,
        ...siteClaims(site, workspaceId),
      }),
      'preview-other-site-release',
    );
    await expectRefused(
      await signed({
        kind: 'release',
        releaseId: foreignReleaseId,
        ...siteClaims(site, workspaceId),
      }),
      'preview-foreign-release',
    );
  });

  it('refuses a validly signed link that crosses workspaces', async () => {
    // A page of another workspace, under this workspace's site.
    await expectRefused(
      await signed({ kind: 'draft', pageId: foreignPageId, ...siteClaims(site, workspaceId) }),
      'preview-foreign-page',
    );
    // The other workspace's site and page, claimed for this workspace.
    await expectRefused(
      await signed({
        kind: 'draft',
        pageId: foreignPageId,
        ...siteClaims(foreignSite, workspaceId),
      }),
      'preview-foreign-workspace-claim',
    );
    // This workspace's page and site, claimed for the other workspace.
    await expectRefused(
      await signed({ kind: 'draft', pageId, ...siteClaims(site, foreignWorkspaceId) }),
      'preview-wrong-workspace-claim',
    );
    // A site id that is not the subdomain's.
    await expectRefused(
      await signed({
        kind: 'draft',
        pageId,
        siteId: otherSite.id,
        workspaceId,
        subdomain: site.subdomain,
      }),
      'preview-wrong-site-id',
    );
    // A subdomain that is not the site's.
    await expectRefused(
      await signed({
        kind: 'draft',
        pageId,
        siteId: site.id,
        workspaceId,
        subdomain: foreignSite.subdomain,
      }),
      'preview-wrong-subdomain',
    );
  });

  it('refuses a link to a page that no longer exists, and malformed claims', async () => {
    const gone = await createPage(owner, site.id);
    const token = await signed({
      kind: 'draft',
      pageId: gone.page.id,
      ...siteClaims(site, workspaceId),
    });
    await visitor.get(`/public/preview/${token}`).expect(200);
    await visitor.get(`/public/preview/${token}/status`).expect(200);
    await t
      .workspaceDb(workspaceId)
      .collection('pages')
      .deleteOne({ _id: new Types.ObjectId(gone.page.id) });
    await expectRefused(token, 'preview-page-gone');

    await expectRefused(
      await signedWithHeader(
        { kind: 'draft', pageId: 'not-an-id', ...siteClaims(site, workspaceId) },
        { alg: 'HS256', kid: PREVIEW_KEY_ID },
      ),
      'preview-malformed-claims',
    );
    await expectRefused('khong-phai-token', 'preview-not-a-token');
  });
});
