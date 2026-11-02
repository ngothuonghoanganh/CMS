import {
  type Composition,
  MAX_SECTIONS,
  problemSchema,
  type ProblemIssue,
  resolveResponseSchema,
  type SectionInstance,
  type Site,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, TestClient } from '../../../test/client.js';
import {
  cleanSeo,
  composition,
  heroSection,
  leadFormSection,
  sampleSection,
} from '../../../test/compositions.js';
import {
  createPage,
  getPage,
  publish,
  RecordingRevalidationClient,
  saveDraft,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { createSite, uploadImage } from '../../../test/resources.js';

/** Marks every value no schema knows, so one search finds any that got through. */
const STRAY = 'gia-tri-la-khong-duoc-luu';

function withItems(section: SectionInstance, count: number): SectionInstance {
  const items = section.content['items'];
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`Section ${section.type} has no items to copy`);
  }
  return {
    ...section,
    content: {
      ...section.content,
      items: Array.from(
        { length: count },
        (_unused, index): unknown => items[index % items.length],
      ),
    },
    samplePaths: [],
  };
}

describe('composition validation on the server', () => {
  let t: TestApp;
  let client: TestClient;
  let workspaceId: string;
  let site: Site;

  beforeAll(async () => {
    t = await createTestApp(
      'plp_test_composition',
      withRevalidationRecorder(new RecordingRevalidationClient()),
    );
    const owner = await signedUpClient(t.app);
    client = owner.client;
    workspaceId = owner.workspaceId;
    site = await createSite(client, workspaceId, { name: 'Nha khoa Smile Care' });
  });

  afterAll(async () => {
    await t.close();
  });

  /** The draft as MongoDB holds it, so nothing the API filters on the way out can hide a value. */
  async function storedDraft(pageId: string): Promise<{ revision: number; composition: unknown }> {
    const page = await t
      .workspaceDb(workspaceId)
      .collection<{ draft: { revision: number; composition: unknown } }>('pages')
      .findOne({ _id: new Types.ObjectId(pageId) });
    if (!page) {
      throw new Error(`Page ${pageId} is not stored`);
    }
    return page.draft;
  }

  /** Sends a hand-made composition as the next draft; the caller sets the expected status. */
  async function put(sections: readonly unknown[], frame: object = {}) {
    const page = await createPage(client, site.id);
    const response = await client.put(`/sites/${site.id}/pages/${page.page.id}/draft`, {
      baseRevision: 0,
      slug: page.page.slug,
      composition: { version: 1, sections, ...frame },
      seo: cleanSeo(),
    });
    return { pageId: page.page.id, response };
  }

  /** Expects 422 with exactly these issues, and the stored draft untouched. */
  async function expectRejected(
    sections: readonly unknown[],
    expected: Partial<ProblemIssue>[],
  ): Promise<void> {
    const { pageId, response } = await put(sections);
    expect(response.status).toBe(422);
    const problem = problemSchema.parse(response.body);
    expect(problem.code).toBe('validation_failed');
    expect(problem.issues).toEqual(
      expected.map((issue): unknown => expect.objectContaining(issue)),
    );
    expect(await storedDraft(pageId)).toMatchObject({
      revision: 0,
      composition: { version: 1, sections: [] },
    });
  }

  describe('keys no schema knows', () => {
    it('stores, publishes and serves only what the schemas validated', async () => {
      const hero = heroSection({ ctaLink: { kind: 'url', url: 'https://smilecare.vn/dat-lich' } });
      const benefits = withItems(sampleSection('benefits', 'grid'), 3);
      const footer = sampleSection('footer');
      const handMade = [
        {
          ...hero,
          html: `<b>${STRAY}</b>`,
          content: {
            ...hero.content,
            script: STRAY,
            primaryCta: {
              label: 'Đặt lịch tư vấn',
              style: STRAY,
              link: { kind: 'url', url: 'https://smilecare.vn/dat-lich', onclick: STRAY },
            },
            secondaryCta: { label: '', link: { kind: 'none', url: STRAY } },
            image: { assetId: null, alt: '', decorative: false, src: STRAY },
          },
          samplePaths: ['heading', 'heading', 'primaryCta.label', `khong.co.${STRAY}`],
        },
        {
          ...benefits,
          content: {
            ...benefits.content,
            items: (benefits.content['items'] as Record<string, unknown>[]).map((item) => ({
              ...item,
              onclick: STRAY,
            })),
          },
        },
        {
          ...footer,
          content: {
            ...footer.content,
            links: [
              {
                link: {
                  label: 'Chính sách',
                  link: { kind: 'url', url: 'https://smilecare.vn/chinh-sach', rel: STRAY },
                },
                x: STRAY,
              },
            ],
          },
          samplePaths: ['links.0.link.label', 'links.5.link.label', 'copyright'],
        },
      ];
      const { pageId, response } = await put(handMade, { theme: STRAY });
      expect(response.status).toBe(200);

      const stored = await storedDraft(pageId);
      expect(JSON.stringify(stored)).not.toContain(STRAY);
      const [storedHero, , storedFooter] = (stored.composition as Composition).sections;
      expect(storedHero?.content).toEqual(
        expect.objectContaining({
          primaryCta: {
            label: 'Đặt lịch tư vấn',
            link: { kind: 'url', url: 'https://smilecare.vn/dat-lich' },
          },
        }),
      );
      // Sample paths name real text fields once; the rest say nothing about the content.
      expect(storedHero?.samplePaths).toEqual(['heading', 'primaryCta.label']);
      expect(storedFooter?.samplePaths).toEqual(['links.0.link.label', 'copyright']);
      expect(JSON.stringify((await getPage(client, site.id, pageId)).draft)).not.toContain(STRAY);

      const published = await publish(client, site.id, pageId);
      const release = await t
        .workspaceDb(workspaceId)
        .collection('releases')
        .findOne({ _id: new Types.ObjectId(published.release.id) });
      expect(release).not.toBeNull();
      expect(JSON.stringify(release)).not.toContain(STRAY);
      const resolved = await new TestClient(t.app)
        .get(`/public/sites/${site.subdomain}/resolve?path=${published.release.slug}`)
        .expect(200);
      expect(resolveResponseSchema.parse(resolved.body).kind).toBe('page');
      expect(JSON.stringify(resolved.body)).not.toContain(STRAY);
    });

    it('publishes the parsed sections of a draft stored before drafts were parsed', async () => {
      const page = await createPage(client, site.id);
      const hero = heroSection();
      await saveDraft(client, site.id, page.page.id, {
        baseRevision: 0,
        slug: page.page.slug,
        composition: composition([hero]),
        seo: cleanSeo(),
      });
      // Written straight to MongoDB, as an older API version that stored the raw input would.
      await t
        .workspaceDb(workspaceId)
        .collection('pages')
        .updateOne(
          { _id: new Types.ObjectId(page.page.id) },
          { $set: { 'draft.composition.sections.0.content.script': STRAY } },
        );
      const published = await publish(client, site.id, page.page.id);
      const release = await t
        .workspaceDb(workspaceId)
        .collection('releases')
        .findOne({ _id: new Types.ObjectId(published.release.id) });
      expect(JSON.stringify(release)).not.toContain(STRAY);
    });

    it('ignores a composition sent with a new page; pages start blank or from a goal', async () => {
      const response = await client
        .post(`/sites/${site.id}/pages`, {
          title: 'Trang tự dựng',
          slug: uniqueSlug('tu-dung'),
          start: { kind: 'blank', composition: composition([heroSection()]) },
          composition: { version: 1, sections: [{ id: 'x', type: 'hero', html: STRAY }] },
        })
        .expect(201);
      const pageId = (response.body as { page: { id: string } }).page.id;
      expect(await storedDraft(pageId)).toMatchObject({
        revision: 0,
        composition: { version: 1, sections: [] },
      });

      const goal = await client
        .post(`/sites/${site.id}/pages`, {
          title: 'Trang theo mục tiêu',
          slug: uniqueSlug('muc-tieu'),
          start: {
            kind: 'goal',
            goal: 'lead',
            brief: { offer: 'Niềng răng', audience: 'Người đi làm', phone: '0901234567' },
            style: 'calm',
            sections: [{ html: STRAY }],
          },
        })
        .expect(201);
      const goalDraft = await storedDraft((goal.body as { page: { id: string } }).page.id);
      expect(JSON.stringify(goalDraft)).not.toContain(STRAY);
      expect(
        (goalDraft.composition as Composition).sections.map((section) => section.type),
      ).toEqual(expect.arrayContaining(['navbar', 'hero', 'lead_form', 'footer']));
    });
  });

  describe('page structure', () => {
    it('refuses a navigation bar that is not first and a footer that is not last', async () => {
      await expectRejected(
        [heroSection(), sampleSection('navbar')],
        [{ path: ['composition', 'sections', 1, 'type'], code: 'invalid_position' }],
      );
      await expectRejected(
        [sampleSection('footer'), heroSection()],
        [
          {
            path: ['composition', 'sections', 0, 'type'],
            code: 'invalid_position',
            message: 'Chân trang phải là section cuối cùng của trang',
          },
        ],
      );
    });

    it('refuses a second form', async () => {
      await expectRejected(
        [heroSection(), leadFormSection(), leadFormSection()],
        [
          {
            path: ['composition', 'sections', 2, 'type'],
            code: 'duplicate_singleton',
            message: 'Một trang chỉ có một section Form đăng ký',
          },
        ],
      );
    });

    it(`refuses a section over ${MAX_SECTIONS}`, async () => {
      await expectRejected(
        Array.from({ length: MAX_SECTIONS + 1 }, () => heroSection()),
        [
          {
            path: ['composition', 'sections'],
            message: `Một trang có tối đa ${MAX_SECTIONS} section`,
          },
        ],
      );
    });

    it('refuses a variant the section does not have', async () => {
      await expectRejected(
        [{ ...heroSection(), variant: 'video' }],
        [
          {
            path: ['composition', 'sections', 0, 'variant'],
            code: 'invalid_variant',
            message: 'Kiểu bố cục "video" không có trong section Hero',
          },
        ],
      );
    });
  });

  describe('lists', () => {
    it('needs 3 items in the benefits grid and the testimonial cards', async () => {
      await expectRejected(
        [withItems(sampleSection('benefits', 'grid'), 2)],
        [
          {
            path: ['composition', 'sections', 0, 'content', 'items'],
            code: 'too_small',
            message: 'Bố cục “Lưới 3–6 lợi ích” cần ít nhất 3 lợi ích',
          },
        ],
      );
      await expectRejected(
        [withItems(sampleSection('testimonials', 'cards'), 2)],
        [
          {
            path: ['composition', 'sections', 0, 'content', 'items'],
            code: 'too_small',
            message: 'Bố cục “Nhận xét dạng thẻ” cần ít nhất 3 nhận xét',
          },
        ],
      );
      const { response } = await put([
        withItems(sampleSection('benefits', 'alternate'), 2),
        withItems(sampleSection('testimonials', 'quote'), 1),
      ]);
      expect(response.status).toBe(200);
    });

    it('keeps a process to 5 steps and partner logos to 3–12', async () => {
      await expectRejected(
        [withItems(sampleSection('benefits', 'steps'), 6)],
        [
          {
            path: ['composition', 'sections', 0, 'content', 'items'],
            code: 'too_big',
            message: 'Bố cục “Quy trình 3 bước” có tối đa 5 bước',
          },
        ],
      );
      for (const count of [2, 13]) {
        await expectRejected(
          [withItems(sampleSection('logos'), count)],
          [{ path: ['composition', 'sections', 0, 'content', 'items'] }],
        );
      }
      const { response } = await put([
        withItems(sampleSection('benefits', 'steps'), 5),
        withItems(sampleSection('logos'), 12),
      ]);
      expect(response.status).toBe(200);
    });

    it('refuses lists over their maximum', async () => {
      const tooMany = (path: string): Partial<ProblemIssue> => ({
        path: ['composition', 'sections', 0, 'content', ...path.split('.')],
        code: 'too_big',
      });
      await expectRejected([withItems(sampleSection('benefits'), 7)], [tooMany('items')]);
      await expectRejected([withItems(sampleSection('testimonials'), 7)], [tooMany('items')]);
      await expectRejected([withItems(sampleSection('faq'), 13)], [tooMany('items')]);
      const footer = sampleSection('footer');
      await expectRejected(
        [
          {
            ...footer,
            content: {
              ...footer.content,
              links: Array.from({ length: 7 }, () => ({
                link: { label: 'Liên kết', link: { kind: 'none' } },
              })),
            },
          },
        ],
        [tooMany('links')],
      );
    });
  });

  describe('buttons limited to one kind of link', () => {
    it('lets the quick contact call and open Zalo, and nothing else', async () => {
      const quick = sampleSection('quick_contact');
      const withLink = (key: 'call' | 'zalo', link: object) => ({
        ...quick,
        content: { ...quick.content, [key]: { label: 'Liên hệ', link } },
      });
      await expectRejected(
        [withLink('call', { kind: 'url', url: 'https://smilecare.vn' })],
        [
          { path: ['composition', 'sections', 0, 'content', 'call', 'link', 'kind'] },
          { path: ['composition', 'sections', 0, 'content', 'call', 'link', 'phone'] },
        ],
      );
      await expectRejected(
        [withLink('zalo', { kind: 'phone', phone: '0901 234 567' })],
        [{ path: ['composition', 'sections', 0, 'content', 'zalo', 'link', 'kind'] }],
      );
      const { response } = await put([withLink('call', { kind: 'phone', phone: '0901 234 567' })]);
      expect(response.status).toBe(200);
    });
  });

  describe('fields the variant hides', () => {
    it('validates them like any field, since switching variants shows them again', async () => {
      await expectRejected(
        [
          heroSection({
            variant: 'centered',
            secondaryLabel: 'Xem thêm',
            secondaryLink: { kind: 'url', url: 'javascript:alert(1)' },
          }),
        ],
        [
          {
            path: ['composition', 'sections', 0, 'content', 'secondaryCta', 'link', 'url'],
            message: 'Đường dẫn phải bắt đầu bằng http:// hoặc https://',
          },
        ],
      );
      const grid = withItems(sampleSection('benefits', 'grid'), 3);
      await expectRejected(
        [
          {
            ...grid,
            content: {
              ...grid.content,
              items: (grid.content['items'] as Record<string, unknown>[]).map((item, index) =>
                index === 1
                  ? { ...item, image: { assetId: null, alt: 'x'.repeat(251), decorative: false } }
                  : item,
              ),
            },
          },
        ],
        [
          {
            path: ['composition', 'sections', 0, 'content', 'items', 1, 'image', 'alt'],
            message: 'Tối đa 250 ký tự',
          },
        ],
      );
    });

    it('refuses a hidden image of another site, and keeps valid hidden values', async () => {
      const foreign = await uploadImage(client, (await createSite(client, workspaceId)).id);
      await expectRejected(
        [
          heroSection({
            variant: 'centered',
            image: { assetId: foreign.id, alt: 'Ảnh', decorative: false },
          }),
        ],
        [
          {
            path: ['composition', 'sections', 0, 'content', 'image'],
            code: 'asset_not_found',
          },
        ],
      );

      const own = await uploadImage(client, site.id);
      const hero = heroSection({
        variant: 'centered',
        secondaryLabel: 'Xem bảng giá',
        secondaryLink: { kind: 'url', url: 'https://smilecare.vn/bang-gia' },
        image: { assetId: own.id, alt: 'Phòng khám', decorative: false },
      });
      const { pageId, response } = await put([hero]);
      expect(response.status).toBe(200);
      // ADR-007: switching variants keeps the values of the fields the new variant hides.
      expect((await storedDraft(pageId)).composition).toEqual(composition([hero]));
    });
  });
});
