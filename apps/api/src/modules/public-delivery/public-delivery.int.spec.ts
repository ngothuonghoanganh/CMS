import {
  PREVIEW_TTL_SECONDS,
  previewLinkResponseSchema,
  problemSchema,
  type PublicPageData,
  publicPreviewResponseSchema,
  type ResolveResponse,
  resolveResponseSchema,
  type Site,
  sitemapResponseSchema,
} from '@plp/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, TestClient } from '../../../test/client.js';
import {
  cleanSeo,
  composition,
  heroSection,
  publishableDraft,
} from '../../../test/compositions.js';
import {
  createLivePage,
  createPage,
  editHeroHeading,
  getPage,
  publish,
  RecordingRevalidationClient,
  replaceDraft,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { createSite, uploadImage } from '../../../test/resources.js';
import { PreviewTokens } from '../preview/preview-tokens.js';

function heroHeading(data: PublicPageData): unknown {
  return data.page.composition.sections.find((section) => section.type === 'hero')?.content[
    'heading'
  ];
}

describe('public delivery and previews', () => {
  let t: TestApp;
  let client: TestClient;
  let visitor: TestClient;
  let workspaceId: string;
  let site: Site;

  beforeAll(async () => {
    t = await createTestApp(
      'plp_test_public',
      withRevalidationRecorder(new RecordingRevalidationClient()),
    );
    const owner = await signedUpClient(t.app);
    client = owner.client;
    workspaceId = owner.workspaceId;
    site = await createSite(client, workspaceId, { name: 'Nha khoa Smile Care' });
    // The renderer has no session cookie.
    visitor = new TestClient(t.app);
  });

  afterAll(async () => {
    await t.close();
  });

  async function resolve(siteRef: Site, path: string): Promise<ResolveResponse> {
    const response = await visitor
      .get(`/public/sites/${siteRef.subdomain}/resolve?path=${encodeURIComponent(path)}`)
      .expect(200);
    return resolveResponseSchema.parse(response.body);
  }

  async function resolvePage(siteRef: Site, path: string): Promise<PublicPageData> {
    const resolved = await resolve(siteRef, path);
    if (resolved.kind !== 'page') {
      throw new Error(`Expected a page at "${path}", got a redirect`);
    }
    return resolved.data;
  }

  async function previewLink(pageId: string, body: object): Promise<string> {
    const response = await client.post(`/pages/${pageId}/preview-links`, body).expect(201);
    const link = previewLinkResponseSchema.parse(response.body);
    const [origin, token] = link.url.split('/_preview/');
    expect(origin).toBe(site.defaultOrigin);
    expect(Date.parse(link.expiresAt) - Date.now()).toBeGreaterThan(
      (PREVIEW_TTL_SECONDS - 60) * 1000,
    );
    if (!token) {
      throw new Error(`No token in ${link.url}`);
    }
    return token;
  }

  describe('GET /public/sites/:subdomain/resolve', () => {
    it('serves the live release, never the newer draft', async () => {
      const slug = uniqueSlug('ban-live');
      const { pageId, published } = await createLivePage(client, site.id, slug, 'Bản đã xuất bản');
      await editHeroHeading(client, pageId, 'Bản nháp chưa xuất bản');
      const data = await resolvePage(site, slug);
      expect(heroHeading(data)).toBe('Bản đã xuất bản');
      expect(data.page).toMatchObject({ id: pageId, slug });
      expect(data.site).toEqual({
        id: site.id,
        name: 'Nha khoa Smile Care',
        subdomain: site.subdomain,
        themePresetId: site.themePresetId,
        logo: null,
        origin: site.defaultOrigin,
      });
      expect(data.page.seo).toEqual({
        title: cleanSeo().title,
        description: cleanSeo().description,
        shareImage: null,
        noindex: false,
        canonicalUrl: `${site.defaultOrigin}/${slug}`,
      });
      const body = JSON.stringify(data);
      expect(body).not.toContain('Bản nháp chưa xuất bản');
      expect(body).not.toContain(workspaceId);
      expect(body).not.toContain(published.release.id);
    });

    it('serves the home page at the empty path and accepts surrounding slashes', async () => {
      const homeSite = await createSite(client, workspaceId);
      const { pageId } = await createLivePage(client, homeSite.id, '', 'Trang chủ');
      expect((await resolvePage(homeSite, '')).page.id).toBe(pageId);
      expect((await resolvePage(homeSite, '/')).page.id).toBe(pageId);
      await visitor.get(`/public/sites/${homeSite.subdomain}/resolve`).expect(200);
    });

    it('includes only the referenced assets, with public URLs, and the share images', async () => {
      const used = await uploadImage(client, site.id, { alt: 'Phòng khám' });
      await uploadImage(client, site.id, { alt: 'Không dùng' });
      const share = await uploadImage(client, site.id, { alt: 'Ảnh chia sẻ' });
      const slug = uniqueSlug('anh');
      const page = await createPage(client, site.id, { slug });
      await replaceDraft(client, page.page.id, {
        slug,
        composition: composition([
          heroSection({ image: { assetId: used.id, alt: 'Phòng khám', decorative: false } }),
        ]),
        seo: cleanSeo({ shareImageAssetId: share.id }),
      });
      await publish(client, page.page.id);
      const data = await resolvePage(site, slug);
      expect(data.assets).toEqual({
        [used.id]: { url: used.url, width: used.width, height: used.height },
      });
      expect(data.page.seo.shareImage).toEqual({
        url: share.url,
        width: share.width,
        height: share.height,
      });
      const image = await fetch(used.url);
      expect(image.status).toBe(200);
    });

    it('resolves linked pages to their live path, or null when not live', async () => {
      const target = await createLivePage(client, site.id, uniqueSlug('bang-gia'), 'Bảng giá');
      const draftOnly = await createPage(client, site.id);
      const slug = uniqueSlug('lien-ket');
      const page = await createPage(client, site.id, { slug });
      await replaceDraft(client, page.page.id, {
        slug,
        composition: composition([
          heroSection({
            ctaLink: { kind: 'page', pageId: target.pageId },
            secondaryLabel: 'Sắp ra mắt',
            secondaryLink: { kind: 'page', pageId: draftOnly.page.id },
          }),
        ]),
        seo: cleanSeo(),
      });
      await publish(client, page.page.id);
      expect((await resolvePage(site, slug)).pageLinks).toEqual({
        [target.pageId]: `/${target.published.release.slug}`,
        [draftOnly.page.id]: null,
      });
    });

    it('answers 404 for an unknown site, an unknown path and a page that was never published', async () => {
      await visitor.get('/public/sites/khong-co-site-nay/resolve?path=').expect(404);
      await visitor.get(`/public/sites/${site.subdomain}/resolve?path=khong-co`).expect(404);
      const slug = uniqueSlug('chi-nhap');
      const page = await createPage(client, site.id, { slug });
      await replaceDraft(client, page.page.id, publishableDraft(slug));
      const response = await visitor
        .get(`/public/sites/${site.subdomain}/resolve?path=${slug}`)
        .expect(404);
      expect(problemSchema.parse(response.body).code).toBe('not_found');
    });
  });

  describe('GET /public/sites/:subdomain/sitemap', () => {
    it('lists live pages that may be indexed, with the release time', async () => {
      const mapSite = await createSite(client, workspaceId);
      const indexed = await createLivePage(client, mapSite.id, uniqueSlug('co-index'));
      const hidden = await createLivePage(client, mapSite.id, uniqueSlug('noindex'));
      const detail = await getPage(client, hidden.pageId);
      await replaceDraft(client, hidden.pageId, {
        slug: detail.draft.slug,
        composition: detail.draft.composition,
        seo: { ...detail.draft.seo, noindex: true },
      });
      await publish(client, hidden.pageId);
      const draftOnly = await createPage(client, mapSite.id);
      await replaceDraft(client, draftOnly.page.id, publishableDraft(draftOnly.page.slug));

      const response = await visitor.get(`/public/sites/${mapSite.subdomain}/sitemap`).expect(200);
      expect(sitemapResponseSchema.parse(response.body)).toEqual({
        origin: mapSite.defaultOrigin,
        entries: [
          {
            path: `/${indexed.published.release.slug}`,
            lastModified: indexed.published.release.createdAt,
          },
        ],
      });
      await visitor.get('/public/sites/khong-co-site-nay/sitemap').expect(404);
    });
  });

  describe('previews', () => {
    it('shows the latest draft with a draft token', async () => {
      const slug = uniqueSlug('xem-truoc');
      const page = await createPage(client, site.id, { slug });
      await replaceDraft(client, page.page.id, publishableDraft(slug, 'Bản nháp 1'));
      const token = await previewLink(page.page.id, { kind: 'draft' });

      const first = publicPreviewResponseSchema.parse(
        (await visitor.get(`/public/preview/${token}`).expect(200)).body,
      );
      expect(heroHeading(first.data)).toBe('Bản nháp 1');
      expect(first.preview).toMatchObject({ kind: 'draft', version: null });

      await editHeroHeading(client, page.page.id, 'Bản nháp 2');
      const response = await visitor.get(`/public/preview/${token}`).expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(heroHeading(publicPreviewResponseSchema.parse(response.body).data)).toBe('Bản nháp 2');
    });

    it('shows one release with a release token', async () => {
      const { pageId, published } = await createLivePage(
        client,
        site.id,
        uniqueSlug('phien-ban'),
        'Bản 1',
      );
      await editHeroHeading(client, pageId, 'Bản 2');
      await publish(client, pageId);
      const token = await previewLink(pageId, { kind: 'release', releaseId: published.release.id });
      const preview = publicPreviewResponseSchema.parse(
        (await visitor.get(`/public/preview/${token}`).expect(200)).body,
      );
      expect(heroHeading(preview.data)).toBe('Bản 1');
      expect(preview.preview).toMatchObject({ kind: 'release', version: 1 });
    });

    it('only links releases of the page', async () => {
      const a = await createLivePage(client, site.id, uniqueSlug('a'));
      const b = await createLivePage(client, site.id, uniqueSlug('b'));
      await client
        .post(`/pages/${a.pageId}/preview-links`, {
          kind: 'release',
          releaseId: b.published.release.id,
        })
        .expect(404);
    });

    it('answers 404 for a tampered, expired or malformed token', async () => {
      const page = await createPage(client, site.id);
      const token = await previewLink(page.page.id, { kind: 'draft' });
      const [header, payload, signature] = token.split('.');
      const tampered = `${header}.${payload}.${signature?.startsWith('A') ? 'B' : 'A'}${signature?.slice(1) ?? ''}`;
      await visitor.get(`/public/preview/${tampered}`).expect(404);
      await visitor.get('/public/preview/khong-phai-token').expect(404);

      const expired = await t.app.get(PreviewTokens).sign(
        {
          kind: 'draft',
          pageId: page.page.id,
          siteId: site.id,
          workspaceId,
          subdomain: site.subdomain,
        },
        new Date(Date.now() - (PREVIEW_TTL_SECONDS + 60) * 1000),
      );
      await visitor.get(`/public/preview/${expired.token}`).expect(404);
    });

    it('answers 404 when the token claims do not match the stored site', async () => {
      const page = await createPage(client, site.id);
      const otherSite = await createSite(client, workspaceId);
      const forged = await t.app.get(PreviewTokens).sign({
        kind: 'draft',
        pageId: page.page.id,
        siteId: otherSite.id,
        workspaceId,
        subdomain: otherSite.subdomain,
      });
      await visitor.get(`/public/preview/${forged.token}`).expect(404);
    });
  });
});
