import {
  type Asset,
  checksResultSchema,
  type PublicPageData,
  problemSchema,
  resolveResponseSchema,
  type SectionInstance,
  type Site,
} from '@plp/contracts';
import { setAtPath } from '@plp/sections/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, TestClient } from '../../../test/client.js';
import {
  cleanSeo,
  composition,
  heroSection,
  nextSectionId,
  sampleSection,
} from '../../../test/compositions.js';
import {
  createPage,
  currentPublishBody,
  getPage,
  publish,
  publishRequest,
  RecordingRevalidationClient,
  replaceDraft,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { createSite, uploadImage } from '../../../test/resources.js';

/** A section's sample content with `changes` applied at content paths, sample markers kept. */
function withContent(section: SectionInstance, changes: Record<string, unknown>): SectionInstance {
  let content = section.content;
  for (const [path, value] of Object.entries(changes)) {
    content = setAtPath(content, path, value);
  }
  return { ...section, content };
}

function photo(asset: Asset) {
  return { assetId: asset.id, alt: asset.alt, decorative: false };
}

/**
 * The cards of screen 04 added on 2026-11-02 (ADR-007): the steps of a process, partner logos,
 * before and after, quick contact. They are saved, checked, published and served like any section.
 */
describe('sections of the 2026-11-02 cards', () => {
  let t: TestApp;
  let client: TestClient;
  let visitor: TestClient;
  let site: Site;

  beforeAll(async () => {
    t = await createTestApp(
      'plp_test_section_cards',
      withRevalidationRecorder(new RecordingRevalidationClient()),
    );
    const owner = await signedUpClient(t.app);
    client = owner.client;
    site = await createSite(client, owner.workspaceId, { name: 'Nha khoa Smile Care' });
    // The renderer has no session cookie.
    visitor = new TestClient(t.app);
  });

  afterAll(async () => {
    await t.close();
  });

  async function resolvePage(slug: string): Promise<PublicPageData> {
    const response = await visitor
      .get(`/public/sites/${site.subdomain}/resolve?path=${slug}`)
      .expect(200);
    const resolved = resolveResponseSchema.parse(response.body);
    if (resolved.kind !== 'page') {
      throw new Error(`Expected a page at "${slug}", got a redirect`);
    }
    return resolved.data;
  }

  it('saves their sample content, and the checks say what blocks publishing, field by field', async () => {
    const slug = uniqueSlug('the-moi');
    const page = await createPage(client, site.id, { slug });
    const sections = [
      heroSection(),
      sampleSection('benefits', 'steps', nextSectionId('step')),
      sampleSection('logos', 'row', nextSectionId('logo')),
      sampleSection('before_after', 'side_by_side', nextSectionId('pair')),
      sampleSection('quick_contact', 'buttons', nextSectionId('quick')),
    ];
    const saved = await replaceDraft(client, site.id, page.page.id, {
      slug,
      composition: composition(sections),
      seo: cleanSeo(),
    });
    expect((await getPage(client, site.id, page.page.id)).draft.composition).toEqual(
      composition(sections),
    );

    const [, steps, logos, pair, quick] = sections;
    const blocking = saved.checks.blocking.map((item) =>
      item.target.kind === 'section' ? [item.target.sectionId, item.target.fieldPath] : [],
    );
    expect(blocking).toEqual([
      ...[0, 1, 2, 3].map((index) => [logos?.id, `items.${index}.image`]),
      [pair?.id, 'beforeImage'],
      [pair?.id, 'afterImage'],
      [quick?.id, 'call.link'],
      [quick?.id, 'zalo.link'],
    ]);
    // Sample text warns, section by section; the steps have nothing else to fix.
    expect(
      saved.checks.warnings
        .filter((item) => item.code === 'sample_content')
        .map((item) => (item.target.kind === 'section' ? item.target.sectionId : null)),
    ).toEqual([steps?.id, logos?.id, pair?.id, quick?.id]);

    const body = await currentPublishBody(client, site.id, page.page.id);
    const refused = await publishRequest(client, site.id, page.page.id, body).expect(422);
    const problem = problemSchema.parse(refused.body);
    expect(problem.code).toBe('publish_blocked');
    expect(checksResultSchema.parse(problem.context?.['checks']).blocking).toHaveLength(8);
  });

  it('blocks a quick contact without any button', async () => {
    const slug = uniqueSlug('lien-he');
    const page = await createPage(client, site.id, { slug });
    const quick = withContent(sampleSection('quick_contact', 'buttons', nextSectionId('quick')), {
      'call.label': '',
      'zalo.label': '',
    });
    const saved = await replaceDraft(client, site.id, page.page.id, {
      slug,
      composition: composition([heroSection(), quick]),
      seo: cleanSeo(),
    });
    expect(saved.checks.blocking).toEqual([
      expect.objectContaining({
        code: 'required_field_empty',
        title: 'Section “Gọi / Zalo nhanh” chưa có nút nào',
        target: { kind: 'section', sectionId: quick.id, fieldPath: 'call.label' },
      }),
    ]);
  });

  it('publishes them once filled in, and serves them with their images', async () => {
    const uploaded: Asset[] = [];
    for (const alt of [
      'Bệnh viện Hòa Bình',
      'Trường Đại học Y',
      'Phòng khám An Tâm',
      'Trước',
      'Sau',
    ]) {
      uploaded.push(await uploadImage(client, site.id, { alt }));
    }
    const [first, second, third, before, after] = uploaded;
    if (!first || !second || !third || !before || !after) {
      throw new Error('An upload returned nothing');
    }
    const slug = uniqueSlug('ket-qua');
    const page = await createPage(client, site.id, { slug });
    const logos = withContent(sampleSection('logos', 'row', nextSectionId('logo')), {
      items: [first, second, third].map((asset) => ({ image: photo(asset) })),
    });
    const pair = withContent(sampleSection('before_after', 'side_by_side', nextSectionId('pair')), {
      beforeImage: photo(before),
      afterImage: photo(after),
    });
    const quick = withContent(sampleSection('quick_contact', 'buttons', nextSectionId('quick')), {
      'call.link': { kind: 'phone', phone: '0901 234 567' },
      'zalo.label': '',
    });
    const steps = sampleSection('benefits', 'steps', nextSectionId('step'));
    const sections = [heroSection(), steps, logos, pair, quick];
    const saved = await replaceDraft(client, site.id, page.page.id, {
      slug,
      composition: composition(sections),
      seo: cleanSeo(),
    });
    expect(saved.checks.blocking).toEqual([]);
    expect(saved.checks.passed.map((item) => item.code)).toContain('images_described');

    await publish(client, site.id, page.page.id);
    const data = await resolvePage(slug);
    expect(data.page.composition).toEqual(composition(sections));
    expect(Object.keys(data.assets).sort()).toEqual(
      [first, second, third, before, after].map((asset) => asset.id).sort(),
    );
    expect(data.assets[before.id]).toEqual({
      url: before.url,
      width: before.width,
      height: before.height,
    });
    // No form, no consent texts: the footer of this page links no privacy policy.
    expect(data.leadCapture).toBeNull();
  });
});
