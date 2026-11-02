import {
  type CheckItem,
  type CheckTarget,
  type ChecksResult,
  compositionSchema,
  ctaSchema,
  imageRefSchema,
  type LinkKind,
  type PassedCheck,
  passedCheckCodes,
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
  leadFormSectionOf,
  listLabelsOf,
  validateComposition,
} from '@plp/sections/schema';
import type { LeadCaptureGap } from './lead-capture.js';
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
  /** Site settings a lead form needs and the site does not have yet (ADR-016, ADR-017). */
  leadCaptureGaps: readonly LeadCaptureGap[];
  /** The site has at least one confirmed address its leads are emailed to (ADR-018). */
  leadDestinationReady: boolean;
  /** The site's primary address, read once for every page of a request (ADR-006, ADR-022). */
  address: SiteAddressCheck;
}

/**
 * The default address, which the wildcard certificate covers, or the primary custom domain and
 * whether it is active (verified, pointing here, with HTTPS).
 */
export type SiteAddressCheck =
  { kind: 'default' } | { kind: 'custom'; hostname: string; active: boolean };

/** Passed groups that come from the draft's findings; the address ones come from the site. */
type FindingsPassedCode = Exclude<PassedCode, 'domain_verified' | 'https_active'>;

export const PASSED_CHECK_TITLES: Record<FindingsPassedCode | 'https_active', string> = {
  seo_title: 'Tiêu đề SEO',
  seo_description: 'Mô tả SEO',
  slug_valid: 'Đường dẫn hợp lệ, không trùng',
  https_active: 'HTTPS hoạt động',
  contrast_aa: 'Tương phản màu đạt AA',
  internal_links: 'Liên kết nội bộ hoạt động',
  mobile_visible: 'Hiển thị tốt trên điện thoại',
  images_described: 'Ảnh có mô tả',
  no_sample_content: 'Không còn nội dung mẫu',
  privacy_policy: 'Có liên kết chính sách quyền riêng tư',
  lead_destination: 'Có nơi nhận lead',
};

/** Which findings make a passed group fail. `contrast_aa` holds by construction (ADR-007). */
const PASSED_GROUPS: Record<FindingsPassedCode, readonly CheckCode[]> = {
  seo_title: ['seo_title_missing', 'seo_title_too_long'],
  seo_description: ['seo_description_missing', 'seo_description_too_long'],
  slug_valid: ['slug_invalid', 'slug_taken'],
  contrast_aa: [],
  internal_links: ['section_link_broken', 'page_link_not_live'],
  mobile_visible: ['no_visible_section_mobile'],
  images_described: ['image_alt_missing'],
  no_sample_content: ['sample_content'],
  privacy_policy: ['consent_not_configured'],
  lead_destination: ['lead_destination_missing'],
};

/** Passed groups that only mean something on a page with a lead form. */
const FORM_PASSED_GROUPS: ReadonlySet<PassedCode> = new Set(['privacy_policy', 'lead_destination']);

/**
 * "Tên miền {host} đã xác minh" and "HTTPS hoạt động" (board 05) from the primary address: the
 * default one always has HTTPS; a custom one has both while it is active. Otherwise neither, and
 * no finding either: pages still open at the default address, and board 13 reports the domain.
 */
function addressPassed(address: SiteAddressCheck): PassedCheck[] {
  const https: PassedCheck = { code: 'https_active', title: PASSED_CHECK_TITLES.https_active };
  if (address.kind === 'default') {
    return [https];
  }
  return address.active
    ? [{ code: 'domain_verified', title: `Tên miền ${address.hostname} đã xác minh` }, https]
    : [];
}

const REQUIRED_DESCRIPTION = 'Đây là nội dung bắt buộc. Điền vào trước khi xuất bản.';
const LINK_DESCRIPTION =
  'Chọn nơi khách được đưa tới khi bấm: một section, một trang khác, đường dẫn, số điện thoại hoặc Zalo.';

/** What a button that can only call or only open Zalo is missing: its number, nothing to choose. */
const NUMBER_ONLY: Partial<Record<LinkKind, { missing: string; description: string }>> = {
  phone: {
    missing: 'chưa có số điện thoại',
    description: 'Nhập số điện thoại mà khách gọi tới khi bấm nút.',
  },
  zalo: {
    missing: 'chưa có số Zalo',
    description: 'Nhập số điện thoại Zalo mà khách nhắn tới khi bấm nút.',
  },
};

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
    case 'privacy':
      return `privacy:${target.sectionId}`;
    case 'lead_recipients':
      return `lead_recipients:${target.sectionId}`;
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('vi') + text.slice(1);
}

function lower(text: string): string {
  return text.toLocaleLowerCase('vi');
}

/** "Nút Zalo" → "nút Zalo": a name inside a sentence keeps its own capitals. */
function lowerFirst(text: string): string {
  return text.charAt(0).toLocaleLowerCase('vi') + text.slice(1);
}

/**
 * Where a field sits, for titles: "section “Hero”" or "Câu hỏi 2 trong section “Câu hỏi thường
 * gặp”". An item is named as the panel names it in the section's variant: "Bước 2" in a process.
 */
function placeOf(context: SectionContext, path: string): string {
  const { definition } = context;
  const section = `section “${definition.label}”`;
  const [listKey, index] = path.split('.');
  const list = definition.fields.find((field) => field.key === listKey);
  if (list?.kind !== 'list' || index === undefined || !/^\d+$/.test(index)) {
    return section;
  }
  const { itemLabel } = listLabelsOf(definition.type, context.section.variant, list);
  return `${itemLabel} ${Number(index) + 1} trong ${section}`;
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
  const place = placeOf(context, leaf.path);
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
  const place = placeOf(context, leaf.path);
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
    const [onlyKind, ...otherKinds] = leaf.field.kind === 'cta' ? (leaf.field.linkKinds ?? []) : [];
    const numberOnly =
      onlyKind !== undefined && otherKinds.length === 0 ? NUMBER_ONLY[onlyKind] : undefined;
    findings.add(
      'blocking',
      'required_field_empty',
      linkTarget,
      `${name} ở ${place} ${numberOnly?.missing ?? 'chưa có nơi đưa tới'}`,
      numberOnly?.description ?? LINK_DESCRIPTION,
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
  const place = placeOf(context, leaf.path);
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
    // Named as the panel names the description: a logo's is the partner's name.
    const altLabel = leaf.field.kind === 'image' ? leaf.field.altLabel : undefined;
    findings.add(
      'warning',
      'image_alt_missing',
      target,
      `${subject} chưa có ${altLabel === undefined ? 'mô tả' : lower(altLabel)}`,
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

/**
 * A section whose buttons are its point (the quick contact) needs at least one of them in use;
 * which one is up to the owner, so the finding points at the first.
 */
function checkOneButton(
  findings: Findings,
  context: SectionContext,
  leaves: readonly LeafOccurrence[],
): void {
  const { section, definition } = context;
  const group = definition.oneButtonRequired ?? [];
  const buttons = leaves.filter((leaf) => leaf.field.kind === 'cta' && group.includes(leaf.path));
  const first = buttons[0];
  if (first === undefined) {
    return;
  }
  const used = buttons.some((leaf) => {
    const parsed = ctaSchema.safeParse(leaf.value);
    return parsed.success && isCtaUsed(parsed.data);
  });
  if (used) {
    return;
  }
  const names = buttons.map((leaf) => lowerFirst(leaf.field.label)).join(' hoặc ');
  findings.add(
    'blocking',
    'required_field_empty',
    sectionTarget(section, `${first.path}.label`),
    `Section “${definition.label}” chưa có nút nào`,
    `Điền chữ trên nút cho ${names} trước khi xuất bản.`,
  );
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
  checkOneButton(findings, context, leaves);
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

function leadCaptureGapDescription(gaps: readonly LeadCaptureGap[]): string {
  const settings = gaps.includes('privacy');
  const consent = gaps.includes('consent');
  if (settings && consent) {
    return 'Chủ sở hữu hoặc Quản trị của workspace cần nhập đơn vị thu thập dữ liệu và link chính sách quyền riêng tư, rồi lưu nội dung đồng ý ở mục “Dữ liệu & đồng ý”.';
  }
  return settings
    ? 'Chủ sở hữu hoặc Quản trị của workspace cần nhập đơn vị thu thập dữ liệu và link chính sách quyền riêng tư ở mục “Dữ liệu & đồng ý”.'
    : 'Chủ sở hữu hoặc Quản trị của workspace cần lưu nội dung đồng ý ở mục “Dữ liệu & đồng ý”.';
}

/** A form collects personal data only with the site's consent settings (rule 10, ADR-017). */
function checkLeadCapture(findings: Findings, input: ChecksInput): void {
  const form = leadFormSectionOf(input.snapshot.composition);
  if (form === null || input.leadCaptureGaps.length === 0) {
    return;
  }
  findings.add(
    'blocking',
    'consent_not_configured',
    { kind: 'privacy', sectionId: form.id },
    'Form đăng ký chưa có nội dung đồng ý',
    leadCaptureGapDescription(input.leadCaptureGaps),
  );
}

function checkLeadDestination(findings: Findings, input: ChecksInput): void {
  const form = leadFormSectionOf(input.snapshot.composition);
  if (form === null || input.leadDestinationReady) {
    return;
  }
  findings.add(
    'blocking',
    'lead_destination_missing',
    { kind: 'lead_recipients', sectionId: form.id },
    'Form đăng ký chưa có nơi nhận lead',
    'Khách gửi form sẽ không đến được ai. Thêm ít nhất một email nhận lead và bấm xác nhận trong thư gửi tới email đó.',
  );
}

/** The passed items in the order of `passedCheckCodes`: the address ones after the slug. */
function passedGroups(
  findings: Findings,
  hasForm: boolean,
  address: SiteAddressCheck,
): PassedCheck[] {
  const fromFindings = (Object.keys(PASSED_GROUPS) as FindingsPassedCode[])
    .filter((code) => hasForm || !FORM_PASSED_GROUPS.has(code))
    .filter((code) => !PASSED_GROUPS[code].some((failing) => findings.has(failing)))
    .map((code): PassedCheck => ({ code, title: PASSED_CHECK_TITLES[code] }));
  const passed = [...fromFindings, ...addressPassed(address)];
  return passed.sort((a, b) => passedCheckCodes.indexOf(a.code) - passedCheckCodes.indexOf(b.code));
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
  checkLeadCapture(findings, input);
  checkLeadDestination(findings, input);
  checkSlug(findings, input);
  checkSeo(findings, input);
  return {
    revision: input.revision,
    blocking: findings.blocking,
    warnings: findings.warnings,
    passed: passedGroups(
      findings,
      leadFormSectionOf(input.snapshot.composition) !== null,
      input.address,
    ),
  };
}
