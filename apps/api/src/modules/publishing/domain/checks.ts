import {
  type CheckItem,
  type CheckTarget,
  type ChecksResult,
  compositionSchema,
  ctaSchema,
  imageRefSchema,
  type PassedCheck,
  type ProblemIssue,
  SEO_DESCRIPTION_RECOMMENDED_MAX,
  SEO_TITLE_RECOMMENDED_MAX,
  type SectionInstance,
  sectionInstanceSchema,
  slugSchema,
} from '@plp/contracts';
import {
  type AnySectionDefinition,
  collectLeaves,
  getSectionDefinition,
  isCtaUsed,
  isLinkComplete,
  type LeafOccurrence,
  validateComposition,
} from '@plp/sections/schema';
import type { PageSnapshot } from './snapshot.js';

type CheckCode = CheckItem['code'];
type PassedCode = PassedCheck['code'];

/** A page of the same site that is live right now. */
export interface LivePageRef {
  id: string;
  title: string;
  /** Its live slug ("" is the home page). */
  slug: string;
}

export interface ChecksInput {
  /** Draft revision the checks describe. */
  revision: number;
  /** The page being checked; its own live slug and links to itself never count against it. */
  pageId: string;
  snapshot: PageSnapshot;
  /** Ids of the referenced assets that exist in this page's site. */
  existingAssetIds: ReadonlySet<string>;
  /** Live pages of the site other than this one. */
  otherLivePages: readonly LivePageRef[];
}

export const PASSED_CHECK_TITLES: Record<PassedCode, string> = {
  seo_title: 'Tiêu đề SEO',
  seo_description: 'Mô tả SEO',
  slug_valid: 'Đường dẫn hợp lệ, không trùng',
  contrast_aa: 'Tương phản màu đạt AA',
  internal_links: 'Liên kết nội bộ hoạt động',
  mobile_visible: 'Hiển thị tốt trên điện thoại',
  images_described: 'Ảnh có mô tả',
  no_sample_content: 'Không còn nội dung mẫu',
};

/** Which findings make a passed group fail. `contrast_aa` holds by construction (ADR-007). */
const PASSED_GROUPS: Record<PassedCode, readonly CheckCode[]> = {
  seo_title: ['seo_title_missing', 'seo_title_too_long'],
  seo_description: ['seo_description_missing', 'seo_description_too_long'],
  slug_valid: ['slug_invalid', 'slug_taken'],
  contrast_aa: [],
  internal_links: ['section_link_broken', 'page_link_not_live'],
  mobile_visible: ['no_visible_section_mobile'],
  images_described: ['image_alt_missing'],
  no_sample_content: ['sample_content'],
};

const REQUIRED_DESCRIPTION = 'Đây là nội dung bắt buộc. Điền vào trước khi xuất bản.';
const LINK_DESCRIPTION =
  'Chọn nơi khách được đưa tới khi bấm: một section, một trang khác, đường dẫn, số điện thoại hoặc Zalo.';

/** Stable identity of a finding's place, the second half of its fingerprint. */
function targetKey(target: CheckTarget): string {
  switch (target.kind) {
    case 'section':
      return target.fieldPath === null
        ? `section:${target.sectionId}`
        : `section:${target.sectionId}:${target.fieldPath}`;
    case 'seo':
      return `seo:${target.field}`;
    case 'slug':
      return 'slug';
    case 'page':
      return 'page';
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('vi') + text.slice(1);
}

function lower(text: string): string {
  return text.toLocaleLowerCase('vi');
}

/** Where a field sits, for titles: "section “Hero”" or "Câu hỏi 2 trong section “Câu hỏi thường gặp”". */
function placeOf(definition: AnySectionDefinition, path: string): string {
  const section = `section “${definition.label}”`;
  const [listKey, index] = path.split('.');
  const list = definition.fields.find((field) => field.key === listKey);
  if (list?.kind !== 'list' || index === undefined || !/^\d+$/.test(index)) {
    return section;
  }
  return `${list.itemLabel} ${Number(index) + 1} trong ${section}`;
}

function isTopLevel(path: string): boolean {
  return !path.includes('.');
}

class Findings {
  readonly blocking: CheckItem[] = [];
  readonly warnings: CheckItem[] = [];

  add(
    severity: CheckItem['severity'],
    code: CheckCode,
    target: CheckTarget,
    title: string,
    description: string,
    key: string = targetKey(target),
  ): void {
    const item: CheckItem = {
      code,
      severity,
      fingerprint: `${code}:${key}`,
      title,
      description,
      target,
    };
    (severity === 'blocking' ? this.blocking : this.warnings).push(item);
  }

  has(code: CheckCode): boolean {
    return [...this.blocking, ...this.warnings].some((item) => item.code === code);
  }
}

interface SectionContext {
  section: SectionInstance;
  definition: AnySectionDefinition;
  sectionIds: ReadonlySet<string>;
  input: ChecksInput;
  livePageIds: ReadonlySet<string>;
}

function sectionTarget(section: SectionInstance, fieldPath: string | null): CheckTarget {
  return { kind: 'section', sectionId: section.id, fieldPath };
}

function checkTextLeaf(findings: Findings, context: SectionContext, leaf: LeafOccurrence): void {
  if (!leaf.field.required) {
    return;
  }
  if (typeof leaf.value === 'string' && leaf.value.trim() !== '') {
    return;
  }
  const place = placeOf(context.definition, leaf.path);
  findings.add(
    'blocking',
    'required_field_empty',
    sectionTarget(context.section, leaf.path),
    capitalize(`${place} chưa có ${lower(leaf.field.label)}`),
    REQUIRED_DESCRIPTION,
  );
}

function checkCtaLeaf(findings: Findings, context: SectionContext, leaf: LeafOccurrence): void {
  const parsed = ctaSchema.safeParse(leaf.value);
  if (!parsed.success) {
    return;
  }
  const cta = parsed.data;
  const { section, definition } = context;
  const place = placeOf(definition, leaf.path);
  const used = isCtaUsed(cta);
  const required = leaf.field.required === true;
  const linkTarget = sectionTarget(section, `${leaf.path}.link`);
  const name = used ? `Nút “${cta.label.trim()}”` : leaf.field.label;

  if (required && !used) {
    findings.add(
      'blocking',
      'required_field_empty',
      sectionTarget(section, `${leaf.path}.label`),
      capitalize(`${leaf.field.label} ở ${place} chưa có chữ trên nút`),
      REQUIRED_DESCRIPTION,
    );
  }
  if ((required || used) && !isLinkComplete(cta.link)) {
    findings.add(
      'blocking',
      'required_field_empty',
      linkTarget,
      `${name} ở ${place} chưa có nơi đưa tới`,
      LINK_DESCRIPTION,
    );
    return;
  }
  if (!used) {
    return;
  }
  if (cta.link.kind === 'section' && !context.sectionIds.has(cta.link.sectionId)) {
    findings.add(
      'blocking',
      'section_link_broken',
      linkTarget,
      `${name} ở ${place} trỏ tới section đã bị xóa`,
      'Chọn lại section đích, nếu không khách bấm nút sẽ không đi đâu cả.',
    );
  }
  if (
    cta.link.kind === 'page' &&
    cta.link.pageId !== context.input.pageId &&
    !context.livePageIds.has(cta.link.pageId)
  ) {
    findings.add(
      'warning',
      'page_link_not_live',
      linkTarget,
      `${name} ở ${place} trỏ tới trang chưa live`,
      'Nút sẽ không hoạt động cho tới khi trang đó được xuất bản.',
    );
  }
}

function checkImageLeaf(findings: Findings, context: SectionContext, leaf: LeafOccurrence): void {
  const parsed = imageRefSchema.safeParse(leaf.value);
  if (!parsed.success) {
    return;
  }
  const image = parsed.data;
  const { section, definition } = context;
  const place = placeOf(definition, leaf.path);
  const target = sectionTarget(section, leaf.path);
  if (image.assetId === null) {
    if (leaf.field.required) {
      findings.add(
        'blocking',
        'required_field_empty',
        target,
        capitalize(`${place} chưa có ${lower(leaf.field.label)}`),
        REQUIRED_DESCRIPTION,
      );
    }
    return;
  }
  if (!context.input.existingAssetIds.has(image.assetId)) {
    findings.add(
      'blocking',
      'asset_missing',
      target,
      capitalize(`${lower(leaf.field.label)} ở ${place} không còn trong thư viện`),
      'Ảnh này không thuộc thư viện của site. Chọn lại ảnh trước khi xuất bản.',
    );
    return;
  }
  if (!image.decorative && image.alt.trim() === '') {
    const subject =
      isTopLevel(leaf.path) && leaf.field.label === 'Ảnh'
        ? `Ảnh ${definition.label}`
        : `${leaf.field.label} của ${place}`;
    findings.add(
      'warning',
      'image_alt_missing',
      target,
      `${subject} chưa có mô tả`,
      'Người dùng trình đọc màn hình và công cụ tìm kiếm không biết ảnh nói gì.',
    );
  }
}

/** Sample paths that belong to a field this variant shows. */
function visibleSamplePaths(section: SectionInstance, leaves: readonly LeafOccurrence[]): string[] {
  const visible = new Set<string>();
  for (const leaf of leaves) {
    if (leaf.field.kind === 'text') {
      visible.add(leaf.path);
    } else if (leaf.field.kind === 'cta') {
      visible.add(`${leaf.path}.label`);
    }
  }
  return section.samplePaths.filter((path) => visible.has(path));
}

function checkSection(findings: Findings, context: SectionContext): void {
  const { section, definition } = context;
  const leaves = collectLeaves(section);
  for (const leaf of leaves) {
    switch (leaf.field.kind) {
      case 'text':
        checkTextLeaf(findings, context, leaf);
        break;
      case 'cta':
        checkCtaLeaf(findings, context, leaf);
        break;
      case 'image':
        checkImageLeaf(findings, context, leaf);
        break;
      case 'select':
      case 'boolean':
        break;
    }
  }
  const samples = visibleSamplePaths(section, leaves);
  const firstSample = samples[0];
  if (firstSample !== undefined) {
    findings.add(
      'warning',
      'sample_content',
      sectionTarget(section, firstSample),
      `Section “${definition.label}” còn nội dung mẫu`,
      `Còn ${samples.length} đoạn chữ mẫu chưa được thay bằng nội dung thật.`,
      `section:${section.id}`,
    );
  }
  if (!section.visibility.desktop && !section.visibility.mobile) {
    findings.add(
      'warning',
      'section_hidden_everywhere',
      sectionTarget(section, null),
      `Section “${definition.label}” đang ẩn trên mọi thiết bị`,
      'Khách truy cập sẽ không thấy section này. Bật lại hiển thị hoặc xóa section.',
    );
  }
}

/** Issues of a composition, from the contract frame first, then from each section definition. */
function compositionIssues(composition: unknown): ProblemIssue[] {
  const parsed = compositionSchema.safeParse(composition);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      path: issue.path.map((part) => (typeof part === 'symbol' ? String(part) : part)),
      code: issue.code,
      message: issue.message,
    }));
  }
  return validateComposition(parsed.data);
}

/** Reports invalid sections (defensive: drafts are validated on save) and returns their indexes. */
function checkCompositionValid(findings: Findings, input: ChecksInput): Set<number> | null {
  const issues = compositionIssues(input.snapshot.composition);
  const invalid = new Set<number>();
  for (const issue of issues) {
    const [root, position] = issue.path;
    const index = root === 'sections' && typeof position === 'number' ? position : -1;
    // A frame-level issue (not an object, too many sections…) leaves no section to point at.
    const section = index === -1 ? undefined : input.snapshot.composition.sections[index];
    if (!section || !sectionInstanceSchema.safeParse(section).success) {
      findings.add(
        'blocking',
        'composition_invalid',
        { kind: 'page' },
        'Cấu trúc trang không hợp lệ',
        issue.message,
      );
      return null;
    }
    if (invalid.has(index)) {
      continue;
    }
    invalid.add(index);
    const fieldPath =
      issue.path[2] === 'content' && issue.path.length > 3 ? issue.path.slice(3).join('.') : null;
    findings.add(
      'blocking',
      'composition_invalid',
      sectionTarget(section, fieldPath),
      `Section “${getSectionDefinition(section.type).label}” có dữ liệu không hợp lệ`,
      issue.message,
      `section:${section.id}`,
    );
  }
  return invalid;
}

function checkVisibility(findings: Findings, sections: readonly SectionInstance[]): void {
  const description = 'Bật hiển thị cho ít nhất một section, hoặc thêm section mới.';
  if (!sections.some((section) => section.visibility.desktop)) {
    findings.add(
      'blocking',
      'no_visible_section_desktop',
      { kind: 'page' },
      'Không có section nào hiển thị trên máy tính',
      description,
    );
  }
  if (!sections.some((section) => section.visibility.mobile)) {
    findings.add(
      'blocking',
      'no_visible_section_mobile',
      { kind: 'page' },
      'Không có section nào hiển thị trên điện thoại',
      description,
    );
  }
}

function checkSlug(findings: Findings, input: ChecksInput): void {
  const { slug } = input.snapshot;
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) {
    findings.add(
      'blocking',
      'slug_invalid',
      { kind: 'slug' },
      'Đường dẫn trang không hợp lệ',
      parsed.error.issues[0]?.message ?? 'Đường dẫn không đúng định dạng.',
    );
    return;
  }
  const owner = input.otherLivePages.find((page) => page.slug === slug);
  if (owner) {
    findings.add(
      'blocking',
      'slug_taken',
      { kind: 'slug' },
      `Đường dẫn /${slug} đang được trang “${owner.title}” dùng`,
      'Đổi đường dẫn của trang này, hoặc gỡ trang kia trước khi xuất bản.',
    );
  }
}

function checkSeo(findings: Findings, input: ChecksInput): void {
  const { seo } = input.snapshot;
  const title = seo.title.trim();
  const description = seo.description.trim();
  if (title === '') {
    findings.add(
      'warning',
      'seo_title_missing',
      { kind: 'seo', field: 'title' },
      'Chưa có tiêu đề SEO',
      'Kết quả tìm kiếm sẽ dùng tiêu đề của Hero (hoặc tên site) thay cho tiêu đề riêng.',
    );
  } else if (title.length > SEO_TITLE_RECOMMENDED_MAX) {
    findings.add(
      'warning',
      'seo_title_too_long',
      { kind: 'seo', field: 'title' },
      `Tiêu đề SEO dài hơn ${SEO_TITLE_RECOMMENDED_MAX} ký tự`,
      `Công cụ tìm kiếm có thể cắt bớt tiêu đề. Nên giữ trong khoảng ${SEO_TITLE_RECOMMENDED_MAX} ký tự.`,
    );
  }
  if (description === '') {
    findings.add(
      'warning',
      'seo_description_missing',
      { kind: 'seo', field: 'description' },
      'Chưa có mô tả SEO',
      'Công cụ tìm kiếm sẽ tự lấy một đoạn chữ trên trang, có thể không đúng ý bạn.',
    );
  } else if (description.length > SEO_DESCRIPTION_RECOMMENDED_MAX) {
    findings.add(
      'warning',
      'seo_description_too_long',
      { kind: 'seo', field: 'description' },
      `Mô tả SEO dài hơn ${SEO_DESCRIPTION_RECOMMENDED_MAX} ký tự`,
      `Công cụ tìm kiếm có thể cắt bớt mô tả. Nên giữ trong khoảng ${SEO_DESCRIPTION_RECOMMENDED_MAX} ký tự.`,
    );
  }
  if (seo.shareImageAssetId !== null && !input.existingAssetIds.has(seo.shareImageAssetId)) {
    findings.add(
      'blocking',
      'asset_missing',
      { kind: 'seo', field: 'shareImage' },
      'Ảnh chia sẻ không còn trong thư viện',
      'Ảnh này không thuộc thư viện của site. Chọn lại ảnh chia sẻ trước khi xuất bản.',
    );
  }
}

function passedGroups(findings: Findings): PassedCheck[] {
  return (Object.keys(PASSED_GROUPS) as PassedCode[])
    .filter((code) => !PASSED_GROUPS[code].some((failing) => findings.has(failing)))
    .map((code) => ({ code, title: PASSED_CHECK_TITLES[code] }));
}

/**
 * Pre-publish checks (ADR-006) of a draft. Pure: the caller loads the assets of the site and the
 * live pages. Only fields shown by each section's variant are checked; every finding points to the
 * field to fix and has a stable fingerprint, so a warning can be acknowledged.
 */
export function evaluateChecks(input: ChecksInput): ChecksResult {
  const findings = new Findings();
  const invalidSections = checkCompositionValid(findings, input);
  if (invalidSections !== null) {
    const { sections } = input.snapshot.composition;
    const sectionIds = new Set(sections.map((section) => section.id));
    const livePageIds = new Set(input.otherLivePages.map((page) => page.id));
    sections.forEach((section, index) => {
      if (invalidSections.has(index)) {
        return;
      }
      checkSection(findings, {
        section,
        definition: getSectionDefinition(section.type),
        sectionIds,
        input,
        livePageIds,
      });
    });
    checkVisibility(findings, sections);
  }
  checkSlug(findings, input);
  checkSeo(findings, input);
  return {
    revision: input.revision,
    blocking: findings.blocking,
    warnings: findings.warnings,
    passed: passedGroups(findings),
  };
}
