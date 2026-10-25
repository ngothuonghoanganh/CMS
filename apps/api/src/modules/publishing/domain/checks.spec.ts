import {
  type CheckItem,
  checksResultSchema,
  type Composition,
  MAX_SECTIONS,
  type SectionInstance,
  type Seo,
} from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import {
  cleanSeo,
  composition,
  heroSection,
  leadFormSection,
  sampleSection,
} from '../../../../test/compositions.js';
import {
  type ChecksInput,
  evaluateChecks,
  type LivePageRef,
  PASSED_CHECK_TITLES,
} from './checks.js';
import type { LeadCaptureGap } from './lead-capture.js';

const PAGE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_PAGE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const ASSET_ID = 'cccccccccccccccccccccccc';
const MISSING_ASSET_ID = 'dddddddddddddddddddddddd';

function run(
  sections: SectionInstance[] | Composition,
  options: {
    slug?: string;
    seo?: Seo;
    otherLivePages?: LivePageRef[];
    assets?: string[];
    revision?: number;
    leadCaptureGaps?: LeadCaptureGap[];
    leadDestinationReady?: boolean;
  } = {},
) {
  const input: ChecksInput = {
    revision: options.revision ?? 7,
    pageId: PAGE_ID,
    snapshot: {
      slug: options.slug ?? 'uu-dai',
      composition: Array.isArray(sections) ? composition(sections) : sections,
      seo: options.seo ?? cleanSeo(),
    },
    existingAssetIds: new Set(options.assets ?? [ASSET_ID]),
    otherLivePages: options.otherLivePages ?? [],
    leadCaptureGaps: options.leadCaptureGaps ?? [],
    leadDestinationReady: options.leadDestinationReady ?? true,
  };
  return checksResultSchema.parse(evaluateChecks(input));
}

function codes(items: CheckItem[]): string[] {
  return items.map((item) => item.code);
}

function only(items: CheckItem[], code: CheckItem['code']): CheckItem {
  const found = items.filter((item) => item.code === code);
  expect(found).toHaveLength(1);
  const [item] = found;
  if (!item) {
    throw new Error(`No ${code}`);
  }
  return item;
}

describe('evaluateChecks: a clean draft', () => {
  it('has no finding, passes every group and carries the revision', () => {
    const result = run([heroSection()], { revision: 12 });
    expect(result.revision).toBe(12);
    expect(result.blocking).toEqual([]);
    expect(result.warnings).toEqual([]);
    // The policy link and the lead destination only matter on a page with a form.
    expect(result.passed.map((item) => item.title)).toEqual(
      Object.values(PASSED_CHECK_TITLES).filter(
        (title) =>
          title !== PASSED_CHECK_TITLES.privacy_policy &&
          title !== PASSED_CHECK_TITLES.lead_destination,
      ),
    );
    expect(result.passed.map((item) => item.title)).toEqual([
      'Tiêu đề SEO',
      'Mô tả SEO',
      'Đường dẫn hợp lệ, không trùng',
      'Tương phản màu đạt AA',
      'Liên kết nội bộ hoạt động',
      'Hiển thị tốt trên điện thoại',
      'Ảnh có mô tả',
      'Không còn nội dung mẫu',
    ]);
  });
});

describe('evaluateChecks: blocking', () => {
  it('reports an invalid section defensively and points at it', () => {
    const hero = { ...heroSection({ id: 'hero00000001' }), variant: 'khong-co' };
    const result = run([hero]);
    const item = only(result.blocking, 'composition_invalid');
    expect(item.target).toEqual({ kind: 'section', sectionId: hero.id, fieldPath: null });
    expect(item.fingerprint).toBe(`composition_invalid:section:${hero.id}`);
    expect(item.title).toBe('Section “Hero” có dữ liệu không hợp lệ');
  });

  it('points an invalid content value at its field', () => {
    const hero = heroSection({ id: 'hero00000001' });
    const broken = { ...hero, content: { ...hero.content, heading: 42 } };
    const item = only(run([broken]).blocking, 'composition_invalid');
    expect(item.target).toEqual({ kind: 'section', sectionId: hero.id, fieldPath: 'heading' });
  });

  it('reports a composition that cannot be read at page level', () => {
    const sections = Array.from({ length: MAX_SECTIONS + 1 }, () => heroSection());
    const result = run(sections);
    expect(codes(result.blocking)).toEqual(['composition_invalid']);
    expect(result.blocking[0]?.target).toEqual({ kind: 'page' });
  });

  it('reports an empty required text with the field and a readable place', () => {
    const hero = heroSection({ id: 'hero00000001', heading: '   ' });
    const item = only(run([hero]).blocking, 'required_field_empty');
    expect(item.title).toBe('Section “Hero” chưa có tiêu đề');
    expect(item.target).toEqual({ kind: 'section', sectionId: hero.id, fieldPath: 'heading' });
    expect(item.fingerprint).toBe(`required_field_empty:section:${hero.id}:heading`);
  });

  it('names the list item of an empty required text', () => {
    const faq = sampleSection('faq', undefined, 'faqs00000001');
    const content = structuredClone(faq.content) as { items: { answer: string }[] };
    const second = content.items[1];
    if (!second) {
      throw new Error('FAQ sample has fewer than two items');
    }
    second.answer = '';
    const item = only(run([{ ...faq, content, samplePaths: [] }]).blocking, 'required_field_empty');
    expect(item.title).toBe('Câu hỏi 2 trong section “Câu hỏi thường gặp” chưa có trả lời');
    expect(item.target).toEqual({
      kind: 'section',
      sectionId: faq.id,
      fieldPath: 'items.1.answer',
    });
  });

  it('requires the label and the link of a required button', () => {
    const noLabel = heroSection({ id: 'hero00000001', ctaLabel: '' });
    const labelItem = run([noLabel]).blocking.find(
      (item) => item.target.kind === 'section' && item.target.fieldPath === 'primaryCta.label',
    );
    expect(labelItem?.code).toBe('required_field_empty');
    expect(labelItem?.title).toBe('Nút chính ở section “Hero” chưa có chữ trên nút');

    const noLink = heroSection({ id: 'hero00000002', ctaLink: { kind: 'none' } });
    const linkItem = only(run([noLink]).blocking, 'required_field_empty');
    expect(linkItem.target).toEqual({
      kind: 'section',
      sectionId: noLink.id,
      fieldPath: 'primaryCta.link',
    });
    expect(linkItem.title).toBe('Nút “Đặt lịch tư vấn” ở section “Hero” chưa có nơi đưa tới');
  });

  it('requires a link for an optional button only when it is used', () => {
    const used = heroSection({
      secondaryLabel: 'Gọi ngay',
      secondaryLink: { kind: 'phone', phone: '' },
    });
    expect(only(run([used]).blocking, 'required_field_empty').target).toMatchObject({
      fieldPath: 'secondaryCta.link',
    });
    const unused = heroSection({ secondaryLabel: '', secondaryLink: { kind: 'none' } });
    expect(run([unused]).blocking).toEqual([]);
  });

  it('skips fields the variant hides', () => {
    const centered = heroSection({
      variant: 'centered',
      secondaryLabel: 'Ẩn đi',
      secondaryLink: { kind: 'none' },
      image: { assetId: MISSING_ASSET_ID, alt: '', decorative: false },
    });
    const result = run([{ ...centered, samplePaths: ['secondaryCta.label'] }]);
    expect(result.blocking).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('blocks a button that leads to a section no longer on the page', () => {
    const target = sampleSection('faq', undefined, 'faqs00000001');
    const linked = heroSection({ ctaLink: { kind: 'section', sectionId: 'faqs00000001' } });
    expect(run([linked, { ...target, samplePaths: [] }]).blocking).toEqual([]);
    const item = only(run([linked]).blocking, 'section_link_broken');
    expect(item.title).toBe('Nút “Đặt lịch tư vấn” ở section “Hero” trỏ tới section đã bị xóa');
  });

  it('blocks an image whose asset is not in the site', () => {
    const hero = heroSection({
      id: 'hero00000001',
      image: { assetId: MISSING_ASSET_ID, alt: 'Ảnh', decorative: false },
    });
    const item = only(run([hero]).blocking, 'asset_missing');
    expect(item.target).toEqual({ kind: 'section', sectionId: hero.id, fieldPath: 'image' });
    expect(item.title).toBe('Ảnh ở section “Hero” không còn trong thư viện');
  });

  it('blocks a share image whose asset is not in the site', () => {
    const item = only(
      run([heroSection()], { seo: cleanSeo({ shareImageAssetId: MISSING_ASSET_ID }) }).blocking,
      'asset_missing',
    );
    expect(item.target).toEqual({ kind: 'seo', field: 'shareImage' });
    expect(
      run([heroSection()], { seo: cleanSeo({ shareImageAssetId: ASSET_ID }) }).blocking,
    ).toEqual([]);
  });

  it.each([
    ['Uu-Dai', 'Chỉ dùng chữ thường không dấu, số và dấu gạch ngang'],
    ['api', 'Đường dẫn này được hệ thống giữ lại'],
  ])('blocks the invalid slug %s', (slug, message) => {
    const item = only(run([heroSection()], { slug }).blocking, 'slug_invalid');
    expect(item.target).toEqual({ kind: 'slug' });
    expect(item.description).toBe(message);
  });

  it('blocks a slug another page is live at, and only that', () => {
    const live: LivePageRef[] = [
      { id: OTHER_PAGE_ID, title: 'Khuyến mãi tháng 10', slug: 'uu-dai' },
    ];
    const item = only(run([heroSection()], { otherLivePages: live }).blocking, 'slug_taken');
    expect(item.title).toBe('Đường dẫn /uu-dai đang được trang “Khuyến mãi tháng 10” dùng');
    expect(item.fingerprint).toBe('slug_taken:slug');
    expect(run([heroSection()], { otherLivePages: live, slug: 'uu-dai-2' }).blocking).toEqual([]);
  });

  it('blocks a page with no section visible on a device group', () => {
    const desktopOnly = { ...heroSection(), visibility: { desktop: true, mobile: false } };
    expect(codes(run([desktopOnly]).blocking)).toEqual(['no_visible_section_mobile']);
    const mobileOnly = { ...heroSection(), visibility: { desktop: false, mobile: true } };
    expect(codes(run([mobileOnly]).blocking)).toEqual(['no_visible_section_desktop']);
  });

  it('blocks an empty page on both device groups', () => {
    const result = run([]);
    expect(codes(result.blocking)).toEqual([
      'no_visible_section_desktop',
      'no_visible_section_mobile',
    ]);
    expect(result.blocking.every((item) => item.target.kind === 'page')).toBe(true);
    expect(result.passed.map((item) => item.code)).not.toContain('mobile_visible');
  });
});

describe('evaluateChecks: warnings', () => {
  it('warns about an image without description, like the board', () => {
    const hero = heroSection({
      id: 'hero00000001',
      image: { assetId: ASSET_ID, alt: ' ', decorative: false },
    });
    const result = run([hero]);
    expect(result.blocking).toEqual([]);
    const item = only(result.warnings, 'image_alt_missing');
    expect(item.title).toBe('Ảnh Hero chưa có mô tả');
    expect(item.description).toBe(
      'Người dùng trình đọc màn hình và công cụ tìm kiếm không biết ảnh nói gì.',
    );
    expect(item.fingerprint).toBe(`image_alt_missing:section:${hero.id}:image`);
    expect(result.passed.map((passed) => passed.code)).not.toContain('images_described');
  });

  it('accepts a described or decorative image', () => {
    for (const image of [
      { assetId: ASSET_ID, alt: 'Phòng khám', decorative: false },
      { assetId: ASSET_ID, alt: '', decorative: true },
    ]) {
      expect(run([heroSection({ image })]).warnings).toEqual([]);
    }
  });

  it('names the list item of an image without description', () => {
    const benefits = sampleSection('benefits', 'alternate', 'bene00000001');
    const content = structuredClone(benefits.content) as {
      items: { image: { assetId: string | null } }[];
    };
    const first = content.items[0];
    if (!first) {
      throw new Error('Benefits sample has no item');
    }
    first.image.assetId = ASSET_ID;
    const item = only(
      run([heroSection(), { ...benefits, content, samplePaths: [] }]).warnings,
      'image_alt_missing',
    );
    expect(item.title).toBe('Ảnh của Lợi ích 1 trong section “Lợi ích” chưa có mô tả');
    expect(item.target).toMatchObject({ fieldPath: 'items.0.image' });
  });

  it('warns once per section with sample text, counting visible fields only', () => {
    const hero = heroSection({ id: 'hero00000001' });
    const sampled = { ...hero, samplePaths: ['heading', 'subheading', 'image.alt'] };
    const item = only(run([sampled]).warnings, 'sample_content');
    expect(item.title).toBe('Section “Hero” còn nội dung mẫu');
    expect(item.description).toBe('Còn 2 đoạn chữ mẫu chưa được thay bằng nội dung thật.');
    expect(item.target).toEqual({ kind: 'section', sectionId: hero.id, fieldPath: 'heading' });
    expect(item.fingerprint).toBe(`sample_content:section:${hero.id}`);
  });

  it('keeps the sample-content fingerprint when the count changes', () => {
    const hero = heroSection({ id: 'hero00000001' });
    const two = only(
      run([{ ...hero, samplePaths: ['heading', 'subheading'] }]).warnings,
      'sample_content',
    );
    const one = only(run([{ ...hero, samplePaths: ['subheading'] }]).warnings, 'sample_content');
    expect(one.fingerprint).toBe(two.fingerprint);
  });

  it('warns about a missing or long SEO title and description', () => {
    expect(
      codes(run([heroSection()], { seo: cleanSeo({ title: '', description: '' }) }).warnings),
    ).toEqual(['seo_title_missing', 'seo_description_missing']);
    const long = run([heroSection()], {
      seo: cleanSeo({ title: 'a'.repeat(61), description: 'b'.repeat(161) }),
    });
    expect(codes(long.warnings)).toEqual(['seo_title_too_long', 'seo_description_too_long']);
    expect(long.warnings.map((item) => item.target)).toEqual([
      { kind: 'seo', field: 'title' },
      { kind: 'seo', field: 'description' },
    ]);
    expect(
      run([heroSection()], {
        seo: cleanSeo({ title: 'a'.repeat(60), description: 'b'.repeat(160) }),
      }).warnings,
    ).toEqual([]);
    expect(long.passed.map((item) => item.code)).not.toContain('seo_title');
    expect(long.passed.map((item) => item.code)).not.toContain('seo_description');
  });

  it('warns about a button that leads to a page that is not live', () => {
    const linked = heroSection({ ctaLink: { kind: 'page', pageId: OTHER_PAGE_ID } });
    const item = only(run([linked]).warnings, 'page_link_not_live');
    expect(item.title).toBe('Nút “Đặt lịch tư vấn” ở section “Hero” trỏ tới trang chưa live');
    const live = [{ id: OTHER_PAGE_ID, title: 'Bảng giá', slug: 'bang-gia' }];
    expect(run([linked], { otherLivePages: live }).warnings).toEqual([]);
  });

  it('does not warn about a button that leads to the page itself', () => {
    const self = heroSection({ ctaLink: { kind: 'page', pageId: PAGE_ID } });
    expect(run([self]).warnings).toEqual([]);
  });

  it('warns about a section hidden on every device', () => {
    const hidden = {
      ...heroSection({ id: 'hero00000002' }),
      visibility: { desktop: false, mobile: false },
    };
    const result = run([heroSection(), hidden]);
    const item = only(result.warnings, 'section_hidden_everywhere');
    expect(item.target).toEqual({ kind: 'section', sectionId: hidden.id, fieldPath: null });
    expect(item.title).toBe('Section “Hero” đang ẩn trên mọi thiết bị');
  });
});

describe('evaluateChecks: lead form', () => {
  const form = leadFormSection({ id: 'form00000001' });

  it('blocks a form while the site misses consent settings, pointing at the settings', () => {
    const result = run([heroSection(), form], { leadCaptureGaps: ['privacy', 'consent'] });
    const item = only(result.blocking, 'consent_not_configured');
    expect(item).toMatchObject({
      title: 'Form đăng ký chưa có nội dung đồng ý',
      description:
        'Owner của workspace cần nhập đơn vị thu thập dữ liệu và link chính sách quyền riêng tư, rồi lưu nội dung đồng ý ở mục “Dữ liệu & đồng ý”.',
      target: { kind: 'privacy', sectionId: 'form00000001' },
      fingerprint: 'consent_not_configured:privacy:form00000001',
    });
    expect(result.passed.map((passed) => passed.code)).not.toContain('privacy_policy');
  });

  it('says what is still missing', () => {
    expect(
      only(run([form], { leadCaptureGaps: ['privacy'] }).blocking, 'consent_not_configured')
        .description,
    ).toBe(
      'Owner của workspace cần nhập đơn vị thu thập dữ liệu và link chính sách quyền riêng tư ở mục “Dữ liệu & đồng ý”.',
    );
    expect(
      only(run([form], { leadCaptureGaps: ['consent'] }).blocking, 'consent_not_configured')
        .description,
    ).toBe('Owner của workspace cần lưu nội dung đồng ý ở mục “Dữ liệu & đồng ý”.');
  });

  it('passes the policy check once the settings are complete', () => {
    const result = run([heroSection(), form]);
    expect(result.blocking).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.passed.map((passed) => passed.title)).toContain(
      'Có liên kết chính sách quyền riêng tư',
    );
  });

  it('ignores missing settings on a page without a form', () => {
    const result = run([heroSection()], { leadCaptureGaps: ['privacy', 'consent'] });
    expect(result.blocking).toEqual([]);
  });

  it('blocks a form until a confirmed address receives its leads (ADR-018)', () => {
    const result = run([heroSection(), form], { leadDestinationReady: false });
    expect(only(result.blocking, 'lead_destination_missing')).toMatchObject({
      title: 'Form đăng ký chưa có nơi nhận lead',
      description:
        'Khách gửi form sẽ không đến được ai. Thêm ít nhất một email nhận lead và bấm xác nhận trong thư gửi tới email đó.',
      target: { kind: 'lead_recipients', sectionId: 'form00000001' },
      fingerprint: 'lead_destination_missing:lead_recipients:form00000001',
    });
    expect(result.passed.map((passed) => passed.code)).not.toContain('lead_destination');
    expect(run([heroSection(), form]).passed.map((passed) => passed.title)).toContain(
      'Có nơi nhận lead',
    );
  });

  it('needs no address on a page without a form', () => {
    const result = run([heroSection()], { leadDestinationReady: false });
    expect(result.blocking).toEqual([]);
    expect(result.passed.map((passed) => passed.code)).not.toContain('lead_destination');
  });
});

describe('evaluateChecks: fingerprints', () => {
  it('are stable across evaluations and unique within one result', () => {
    const sections = [
      heroSection({
        id: 'hero00000001',
        heading: '',
        image: { assetId: ASSET_ID, alt: '', decorative: false },
      }),
      { ...sampleSection('benefits', undefined, 'bene00000001') },
    ];
    const first = run(sections, { seo: cleanSeo({ title: '' }) });
    const second = run(structuredClone(sections), { seo: cleanSeo({ title: '' }) });
    const fingerprints = [...first.blocking, ...first.warnings].map((item) => item.fingerprint);
    expect(fingerprints).toEqual(
      [...second.blocking, ...second.warnings].map((item) => item.fingerprint),
    );
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
    for (const item of [...first.blocking, ...first.warnings]) {
      expect(item.fingerprint.startsWith(`${item.code}:`)).toBe(true);
    }
  });
});
