import {
  type Asset,
  historyResponseSchema,
  type PageSummary,
  previewLinkResponseSchema,
  problemSchema,
  type PublicPageData,
  publicPreviewResponseSchema,
  resolveResponseSchema,
  type SectionInstance,
  type Site,
  siteSchema,
  type UpdateSiteRequest,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, TestClient } from '../../../test/client.js';
import { cleanSeo, composition, heroSection, sampleSection } from '../../../test/compositions.js';
import {
  createPage,
  currentPublishBody,
  editHeroHeading,
  getPage,
  listPages,
  publish,
  publishRequest,
  RecordingRevalidationClient,
  replaceDraft,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { createSite, uploadImage } from '../../../test/resources.js';

const SITE_NAME = 'Nha khoa Smile Care';

/**
 * ADR-015: a live page shows the site settings (name, theme, logo, default share image) its
 * release snapshotted at publish; changing the site reaches it only through the next publish.
 */
describe('site settings snapshotted into releases', () => {
  let t: TestApp;
  let client: TestClient;
  let visitor: TestClient;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp(
      'plp_test_site_presentation',
      withRevalidationRecorder(new RecordingRevalidationClient()),
    );
    const owner = await signedUpClient(t.app);
    client = owner.client;
    workspaceId = owner.workspaceId;
    // The renderer has no session cookie.
    visitor = new TestClient(t.app);
  });

  afterAll(async () => {
    await t.close();
  });

  async function updateSite(site: Site, body: UpdateSiteRequest): Promise<Site> {
    const response = await client.patch(`/sites/${site.id}`, body).expect(200);
    return siteSchema.parse(response.body);
  }

  async function resolvePage(site: Site, slug: string): Promise<PublicPageData> {
    const response = await visitor
      .get(`/public/sites/${site.subdomain}/resolve?path=${encodeURIComponent(slug)}`)
      .expect(200);
    const resolved = resolveResponseSchema.parse(response.body);
    if (resolved.kind !== 'page') {
      throw new Error(`Expected a page at "${slug}", got a redirect`);
    }
    return resolved.data;
  }

  async function preview(pageId: string, body: object): Promise<PublicPageData> {
    const link = previewLinkResponseSchema.parse(
      (await client.post(`/pages/${pageId}/preview-links`, body).expect(201)).body,
    );
    const token = link.url.split('/_preview/')[1];
    if (token === undefined) {
      throw new Error(`No token in ${link.url}`);
    }
    const response = await visitor.get(`/public/preview/${token}`).expect(200);
    return publicPreviewResponseSchema.parse(response.body).data;
  }

  async function listed(siteId: string, pageId: string): Promise<PageSummary> {
    const summary = (await listPages(client, siteId)).items.find((item) => item.id === pageId);
    if (!summary) {
      throw new Error(`Page ${pageId} is not listed`);
    }
    return summary;
  }

  function storedRelease(releaseId: string) {
    return t.connection.collection('releases').findOne({ _id: new Types.ObjectId(releaseId) });
  }

  /** The navigation bar shows the site name (empty brand text) and the site logo. */
  function navbar(): SectionInstance {
    return {
      ...sampleSection('navbar'),
      content: {
        brandText: '',
        showLogo: true,
        cta: { label: 'Đặt lịch', link: { kind: 'url', url: 'https://example.com/dat-lich' } },
      },
      samplePaths: [],
    };
  }

  function image(asset: Asset) {
    return { url: asset.url, width: asset.width, height: asset.height };
  }

  /**
   * A site with every setting filled, and a live page that shows each of them: the navigation bar
   * shows the name and the logo, the SEO title falls back to the site name (no Hero) and the share
   * image to the site default.
   */
  async function livePageOnStyledSite() {
    const created = await createSite(client, workspaceId, { name: SITE_NAME });
    const [logo, share] = await Promise.all([
      uploadImage(client, created.id, { alt: 'Logo Smile Care' }),
      uploadImage(client, created.id, { alt: 'Ảnh chia sẻ' }),
    ]);
    const site = await updateSite(created, {
      themePresetId: 'mint',
      logoAssetId: logo.id,
      defaultShareImageAssetId: share.id,
    });
    const slug = uniqueSlug('giao-dien');
    const page = await createPage(client, site.id, { slug });
    await replaceDraft(client, page.page.id, {
      slug,
      composition: composition([navbar(), sampleSection('footer')]),
      seo: cleanSeo({ title: '' }),
    });
    const v1 = await publish(client, page.page.id);
    return { site, logo, share, slug, pageId: page.page.id, v1 };
  }

  it('snapshots the site settings into the release when publishing', async () => {
    const { site, logo, share, slug, v1 } = await livePageOnStyledSite();
    const stored = await storedRelease(v1.release.id);
    expect(stored?.['sitePresentation']).toEqual({
      name: SITE_NAME,
      themePresetId: 'mint',
      logoAssetId: logo.id,
      defaultShareImageAssetId: share.id,
    });
    // A first publish has no earlier look to differ from.
    expect(v1.release.changeSummary.filter((change) => change.kind === 'site')).toEqual([]);
    expect(v1.page.siteChanges).toEqual([]);

    const data = await resolvePage(site, slug);
    expect(data.site).toMatchObject({
      name: SITE_NAME,
      themePresetId: 'mint',
      logo: image(logo),
    });
    expect(data.page.seo).toMatchObject({ title: SITE_NAME, shareImage: image(share) });
  });

  describe.each<{
    what: string;
    chip: string;
    /** `other` is an image of the site library that the settings do not use yet. */
    change: (other: Asset) => UpdateSiteRequest;
    applied: (data: PublicPageData, other: Asset) => void;
  }>([
    {
      what: 'the theme',
      chip: 'Giao diện site: giao diện',
      change: () => ({ themePresetId: 'sunset' }),
      applied: (data) => {
        expect(data.site.themePresetId).toBe('sunset');
      },
    },
    {
      what: 'the logo',
      chip: 'Giao diện site: logo',
      change: (other) => ({ logoAssetId: other.id }),
      applied: (data, other) => {
        expect(data.site.logo).toEqual(image(other));
      },
    },
    {
      what: 'removing the logo',
      chip: 'Giao diện site: logo',
      change: () => ({ logoAssetId: null }),
      applied: (data) => {
        expect(data.site.logo).toBeNull();
      },
    },
    {
      what: 'the site name',
      chip: 'Giao diện site: tên site',
      change: () => ({ name: 'Smile Care Quận 3' }),
      applied: (data) => {
        expect(data.site.name).toBe('Smile Care Quận 3');
        // The SEO title of a page without its own title or Hero falls back to the site name.
        expect(data.page.seo.title).toBe('Smile Care Quận 3');
      },
    },
    {
      what: 'the default share image',
      chip: 'Giao diện site: ảnh chia sẻ',
      change: (other) => ({ defaultShareImageAssetId: other.id }),
      applied: (data, other) => {
        expect(data.page.seo.shareImage).toEqual(image(other));
      },
    },
  ])('changing $what', ({ chip, change, applied }) => {
    it('leaves the live page as published until the page is published again', async () => {
      const { site, slug, pageId, v1 } = await livePageOnStyledSite();
      const other = await uploadImage(client, site.id, { alt: 'Ảnh khác' });
      const published = await resolvePage(site, slug);

      await updateSite(site, change(other));
      expect(await resolvePage(site, slug)).toEqual(published);
      const reminder = [{ kind: 'site', label: chip, sectionId: null }];
      // Rule 2 is unchanged: the draft still has the live revision, so the page stays live.
      expect((await getPage(client, pageId)).page).toMatchObject({
        status: { kind: 'live', changeCount: 0, changes: [] },
        siteChanges: reminder,
      });
      expect((await listed(site.id, pageId)).siteChanges).toEqual(reminder);

      // Republishing the unchanged draft applies the new settings.
      const v2 = await publish(client, pageId);
      expect(v2.release.version).toBe(2);
      expect(v2.release.changeSummary).toEqual(reminder);
      expect(v2.page.siteChanges).toEqual([]);
      expect((await listed(site.id, pageId)).siteChanges).toEqual([]);
      const republished = await resolvePage(site, slug);
      applied(republished, other);
      expect(republished.page.composition).toEqual(published.page.composition);

      // Rolling back to v1 serves v1's snapshot again, and the reminder follows the live release.
      await client
        .post(`/pages/${pageId}/pointer`, {
          targetReleaseId: v1.release.id,
          expectedCurrentReleaseId: v2.release.id,
          reason: 'Giao diện mới chưa ổn',
        })
        .expect(200);
      expect(await resolvePage(site, slug)).toEqual(published);
      expect((await listed(site.id, pageId)).siteChanges).toEqual(reminder);
    });
  });

  it('refuses to publish site settings the publisher did not see', async () => {
    const { site, slug, pageId, v1 } = await livePageOnStyledSite();
    // The publish dialog is opened while the site still has the live look.
    const seen = await currentPublishBody(client, pageId);
    expect(seen.acknowledgedSiteChanges).toEqual([]);
    const published = await resolvePage(site, slug);

    await updateSite(site, { themePresetId: 'sunset' });
    const response = await publishRequest(client, pageId, seen).expect(409);
    expect(problemSchema.parse(response.body).code).toBe('site_changed');
    // Nothing went live: same pointer and the same public page.
    expect((await getPage(client, pageId)).page.liveRelease?.id).toBe(v1.release.id);
    expect(await resolvePage(site, slug)).toEqual(published);

    // Once the new look has been shown, the publish goes through.
    const reviewed = await currentPublishBody(client, pageId);
    expect(reviewed.acknowledgedSiteChanges).toEqual(['Giao diện site: giao diện']);
    await publishRequest(client, pageId, reviewed).expect(201);
  });

  it('adds site chips after the page changes in the change summary', async () => {
    const site = await createSite(client, workspaceId);
    const slug = uniqueSlug('ca-hai');
    const page = await createPage(client, site.id, { slug });
    await replaceDraft(client, page.page.id, {
      slug,
      composition: composition([heroSection({ heading: 'Bản 1' })]),
      seo: cleanSeo(),
    });
    await publish(client, page.page.id);
    await editHeroHeading(client, page.page.id, 'Bản 2');
    await updateSite(site, { name: 'Tên mới', themePresetId: 'indigo' });

    const summary = (await getPage(client, page.page.id)).page;
    expect(summary.status).toMatchObject({ kind: 'live_with_changes', changeCount: 1 });
    expect(summary.siteChanges.map((change) => change.label)).toEqual([
      'Giao diện site: giao diện',
      'Giao diện site: tên site',
    ]);
    const v2 = await publish(client, page.page.id);
    expect(v2.release.changeSummary.map((change) => change.label)).toEqual([
      'Sửa: Hero',
      'Giao diện site: giao diện',
      'Giao diện site: tên site',
    ]);
    const history = historyResponseSchema.parse(
      (await client.get(`/pages/${page.page.id}/history`).expect(200)).body,
    );
    const newest = history.items[0];
    expect(newest?.kind === 'release' ? newest.release.changeSummary : null).toEqual(
      v2.release.changeSummary,
    );
  });

  it('previews a release with its snapshot and a draft with the current site', async () => {
    const { site, logo, pageId, v1 } = await livePageOnStyledSite();
    await updateSite(site, { name: 'Smile Care mới', themePresetId: 'sunset', logoAssetId: null });

    const release = await preview(pageId, { kind: 'release', releaseId: v1.release.id });
    expect(release.site).toMatchObject({
      name: SITE_NAME,
      themePresetId: 'mint',
      logo: image(logo),
    });
    expect(release.page.seo.title).toBe(SITE_NAME);

    const draft = await preview(pageId, { kind: 'draft' });
    expect(draft.site).toMatchObject({
      name: 'Smile Care mới',
      themePresetId: 'sunset',
      logo: null,
    });
    expect(draft.page.seo.title).toBe('Smile Care mới');
  });

  it('keeps the reminder out of storage and off pages that are not live', async () => {
    const { site, pageId } = await livePageOnStyledSite();
    const draftOnly = await createPage(client, site.id);
    await updateSite(site, { themePresetId: 'indigo' });

    expect((await listed(site.id, draftOnly.page.id)).siteChanges).toEqual([]);
    const detail = await getPage(client, pageId);
    await client
      .post(`/pages/${pageId}/pointer`, {
        targetReleaseId: null,
        expectedCurrentReleaseId: detail.page.liveRelease?.id ?? null,
        reason: 'Tạm gỡ',
      })
      .expect(200);
    expect(await listed(site.id, pageId)).toMatchObject({
      status: { kind: 'unpublished' },
      siteChanges: [],
    });
    const stored = await t.connection
      .collection('pages')
      .findOne({ _id: new Types.ObjectId(pageId) });
    expect(stored).not.toHaveProperty('siteChanges');
  });

  it('reads a release published before ADR-015, without a snapshot, as the current site', async () => {
    const { site, slug, pageId, v1 } = await livePageOnStyledSite();
    // Releases are immutable for the application; only a raw write can recreate a legacy one.
    await t.connection
      .collection('releases')
      .updateOne({ _id: new Types.ObjectId(v1.release.id) }, { $unset: { sitePresentation: '' } });
    expect(await storedRelease(v1.release.id)).not.toHaveProperty('sitePresentation');

    await updateSite(site, { name: 'Smile Care mới', themePresetId: 'sunset' });
    const legacy = await resolvePage(site, slug);
    expect(legacy.site).toMatchObject({ name: 'Smile Care mới', themePresetId: 'sunset' });
    expect(legacy.page.seo.title).toBe('Smile Care mới');
    // It shows the current site, so there is nothing to remind about.
    expect((await listed(site.id, pageId)).siteChanges).toEqual([]);

    const v2 = await publish(client, pageId);
    expect(v2.release.changeSummary).toEqual([]);
    expect((await storedRelease(v2.release.id))?.['sitePresentation']).toMatchObject({
      name: 'Smile Care mới',
      themePresetId: 'sunset',
    });
    await updateSite(site, { themePresetId: 'indigo' });
    expect((await resolvePage(site, slug)).site.themePresetId).toBe('sunset');
  });
});
