import {
  type Brief,
  type ColorSchemeId,
  type Composition,
  EMPTY_IMAGE,
  type PageGoal,
  type PageStyle,
  type SectionInstance,
  type SectionType,
} from '@plp/contracts';
import { setAtPath } from './paths.js';
import { createSectionInstance, getSectionDefinition, samplePathsOf } from './registry.js';
import type { BenefitsContent, benefitIcons } from './sections/benefits.js';
import type { CtaBandContent } from './sections/cta-band.js';
import type { FaqContent } from './sections/faq.js';
import type { FooterContent } from './sections/footer.js';
import type { HeroContent } from './sections/hero.js';
import type { NavbarContent } from './sections/navbar.js';
import type { TestimonialsContent } from './sections/testimonials.js';

/* -------------------------------------------------------------------------------------------- */
/* Goals and styles shown by "Tạo trang theo mục tiêu"                                           */
/* -------------------------------------------------------------------------------------------- */

export interface GoalDefinition {
  title: string;
  description: string;
  /** SVG path data for a 24 × 24 stroke icon. */
  icon: string;
}

export const goalDefinitions: Record<PageGoal, GoalDefinition> = {
  lead: {
    title: 'Thu lead tư vấn',
    description: 'Khách để lại tên và số điện thoại để được gọi lại.',
    icon: 'M4 13l2.5-7h11L20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 13h4l1.5 2.5h5L16 13h4',
  },
  promo: {
    title: 'Ưu đãi có thời hạn',
    description: 'Khuyến mãi theo chiến dịch, có điều kiện và hạn dùng.',
    icon: 'M3 12V4h8l10 10-8 8zM7.5 7.5h.01',
  },
  event: {
    title: 'Sự kiện / webinar',
    description: 'Giới thiệu chương trình và nhận đăng ký tham dự.',
    icon: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4',
  },
  product: {
    title: 'Giới thiệu dịch vụ',
    description: 'Trình bày lợi ích, cách làm và bảng giá.',
    icon: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  },
  waitlist: {
    title: 'Danh sách chờ',
    description: 'Thu email trước khi ra mắt dịch vụ mới.',
    icon: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  },
  about: {
    title: 'Giới thiệu doanh nghiệp',
    description: 'Trang thông tin, đội ngũ và cách liên hệ.',
    icon: 'M4 21V5l8-2v18M12 8h8v13M8 8h.01M8 12h.01M8 16h.01M16 12h.01M16 16h.01M3 21h18',
  },
};

export interface PageStyleDefinition {
  label: string;
  description: string;
  /** Sections of these types always take this color scheme. */
  fixed: Partial<Record<SectionType, ColorSchemeId>>;
  /** Every other section takes the next scheme of this cycle, in page order. */
  cycle: readonly [ColorSchemeId, ...ColorSchemeId[]];
}

/**
 * The color rhythm of a generated page (ADR-014). Every scheme of every theme passes the AA test,
 * so any combination is valid; the site theme itself is not changed.
 */
export const pageStyles: Record<PageStyle, PageStyleDefinition> = {
  calm: {
    label: 'Nhẹ nhàng',
    description: 'Nền sáng và nền nhạt xen kẽ, dải kêu gọi dùng màu thương hiệu.',
    fixed: { navbar: 'light', hero: 'soft', cta_band: 'brand', footer: 'dark' },
    cycle: ['light', 'soft'],
  },
  bold: {
    label: 'Nổi bật',
    description: 'Hero và dải kêu gọi dùng màu thương hiệu, nhận xét đặt trên nền tối.',
    fixed: {
      navbar: 'light',
      hero: 'brand',
      testimonials: 'dark',
      cta_band: 'brand',
      footer: 'dark',
    },
    cycle: ['light', 'soft'],
  },
  minimal: {
    label: 'Tối giản',
    description: 'Gần như toàn nền sáng, chỉ nhấn nhẹ ở dải kêu gọi.',
    fixed: { navbar: 'light', hero: 'light', cta_band: 'soft', footer: 'light' },
    cycle: ['light'],
  },
};

/** The color scheme of each section, in order, for a page with these section types. */
export function pageStyleSchemes(style: PageStyle, types: readonly SectionType[]): ColorSchemeId[] {
  const definition = pageStyles[style];
  let step = 0;
  return types.map((type) => {
    const fixed = definition.fixed[type];
    if (fixed) {
      return fixed;
    }
    const scheme = definition.cycle[step % definition.cycle.length] ?? definition.cycle[0];
    step += 1;
    return scheme;
  });
}

/* -------------------------------------------------------------------------------------------- */
/* Blueprints: the sections of each goal and their goal-specific sample copy                     */
/* -------------------------------------------------------------------------------------------- */

interface ContentByType {
  navbar: NavbarContent;
  hero: HeroContent;
  benefits: BenefitsContent;
  testimonials: TestimonialsContent;
  faq: FaqContent;
  cta_band: CtaBandContent;
  footer: FooterContent;
}

type BlueprintSection = {
  [T in SectionType]: {
    type: T;
    variant: string;
    /** What the section does on this page, shown under "Trang sẽ gồm". */
    label: string;
    /** Goal-specific sample copy replacing the section's generic sample content. */
    sample?: Partial<ContentByType[T]>;
  };
}[SectionType];

export interface GoalOutlineItem {
  type: SectionType;
  variant: string;
  label: string;
}

type BenefitItem = BenefitsContent['items'][number];
type FaqItem = FaqContent['items'][number];

function benefit(
  icon: (typeof benefitIcons)[number],
  title: string,
  description: string,
): BenefitItem {
  return { icon, title, description, image: { ...EMPTY_IMAGE } };
}

function faq(question: string, answer: string): FaqItem {
  return { question, answer };
}

function navbar(label: string): BlueprintSection {
  return {
    type: 'navbar',
    variant: 'logo-cta',
    label: 'Thanh điều hướng + nút liên hệ',
    sample: { cta: { label, link: { kind: 'none' } } },
  };
}

const footer: BlueprintSection = {
  type: 'footer',
  variant: 'basic',
  label: 'Chân trang & liên hệ',
};

/**
 * Forms, pricing tables, speakers and maps do not exist in MVP A. Each goal keeps the board's
 * outline where a section fits and drops the rest; a form becomes a call-to-action band whose
 * button calls the phone number from the brief.
 */
function blueprint(goal: PageGoal, siteName: string): readonly BlueprintSection[] {
  const name = siteName.trim();
  switch (goal) {
    case 'lead':
      return [
        navbar('Đặt lịch'),
        {
          type: 'hero',
          variant: 'split',
          label: 'Hero + nút đặt lịch',
          sample: {
            eyebrow: 'Tư vấn miễn phí',
            subheading:
              'Một hai câu nói rõ bạn giúp khách hàng điều gì. Buổi tư vấn đầu tiên không mất phí.',
            primaryCta: { label: 'Đặt lịch tư vấn', link: { kind: 'none' } },
          },
        },
        {
          type: 'benefits',
          variant: 'grid',
          label: 'Lợi ích chính',
          sample: {
            heading: name === '' ? 'Vì sao khách hàng chọn chúng tôi' : `Vì sao chọn ${name}`,
            items: [
              benefit(
                'sparkles',
                'Tư vấn tận tình',
                'Chuyên gia lắng nghe và đề xuất giải pháp phù hợp.',
              ),
              benefit('shield', 'Chi phí minh bạch', 'Báo giá rõ ràng trước khi bắt đầu.'),
              benefit('clock', 'Lịch hẹn linh hoạt', 'Chọn thời gian phù hợp với bạn.'),
            ],
          },
        },
        { type: 'testimonials', variant: 'cards', label: 'Cảm nhận khách hàng' },
        {
          type: 'faq',
          variant: 'accordion',
          label: 'Câu hỏi thường gặp',
          sample: {
            items: [
              faq(
                'Buổi tư vấn có mất phí không?',
                'Nêu rõ buổi tư vấn đầu tiên miễn phí hay có phí, và chi phí tính khi nào.',
              ),
              faq('Tư vấn mất bao lâu?', 'Cho biết thời gian dự kiến của một buổi tư vấn.'),
              faq(
                'Tôi cần chuẩn bị gì trước khi đến?',
                'Liệt kê giấy tờ hoặc thông tin khách nên mang theo.',
              ),
            ],
          },
        },
        {
          type: 'cta_band',
          variant: 'band',
          label: 'Dải kêu gọi đặt lịch tư vấn',
          sample: {
            heading: 'Đặt lịch tư vấn miễn phí',
            text: 'Liên hệ để được tư vấn và chọn lịch hẹn phù hợp với bạn.',
            cta: { label: 'Đặt lịch tư vấn', link: { kind: 'none' } },
          },
        },
        footer,
      ];
    case 'promo':
      return [
        navbar('Nhận ưu đãi'),
        {
          type: 'hero',
          variant: 'centered',
          label: 'Hero + thời hạn ưu đãi',
          sample: {
            eyebrow: 'Ưu đãi có hạn đến ngày …',
            heading: 'Tên ưu đãi và mức giảm, ví dụ: giảm 30% trong tháng này',
            subheading: 'Nói rõ ai được nhận ưu đãi, nhận như thế nào và hạn cuối là khi nào.',
            primaryCta: { label: 'Nhận ưu đãi', link: { kind: 'none' } },
          },
        },
        {
          type: 'benefits',
          variant: 'grid',
          label: 'Chi tiết ưu đãi',
          sample: {
            heading: 'Bạn nhận được gì',
            items: [
              benefit('star', 'Mức ưu đãi', 'Ghi rõ mức giảm hoặc quà tặng kèm theo.'),
              benefit('clock', 'Thời hạn', 'Ngày kết thúc ưu đãi hoặc số suất còn lại.'),
              benefit('check', 'Cách nhận', 'Các bước để khách nhận được ưu đãi.'),
            ],
          },
        },
        {
          type: 'faq',
          variant: 'accordion',
          label: 'Điều kiện áp dụng',
          sample: {
            heading: 'Điều kiện áp dụng',
            items: [
              faq('Ưu đãi áp dụng đến khi nào?', 'Ghi rõ ngày bắt đầu và ngày kết thúc ưu đãi.'),
              faq('Ai được nhận ưu đãi?', 'Nêu đối tượng được áp dụng, ví dụ khách hàng mới.'),
              faq(
                'Có dùng chung với ưu đãi khác được không?',
                'Nói rõ ưu đãi có được cộng dồn với chương trình khác hay không.',
              ),
            ],
          },
        },
        {
          type: 'testimonials',
          variant: 'quote',
          label: 'Cảm nhận khách hàng',
          sample: {
            items: [
              {
                quote: 'Nhận xét của một khách hàng đã dùng ưu đãi: điều họ hài lòng nhất.',
                name: 'Tên khách hàng',
                detail: 'Thông tin thêm',
                avatar: { ...EMPTY_IMAGE },
              },
            ],
          },
        },
        {
          type: 'cta_band',
          variant: 'band',
          label: 'Dải kêu gọi nhận ưu đãi',
          sample: {
            heading: 'Nhận ưu đãi trước khi hết hạn',
            text: 'Số suất có hạn. Liên hệ ngay để giữ ưu đãi cho bạn.',
            cta: { label: 'Nhận ưu đãi', link: { kind: 'none' } },
          },
        },
        footer,
      ];
    case 'event':
      return [
        navbar('Đăng ký'),
        {
          type: 'hero',
          variant: 'split',
          label: 'Hero + thời gian, địa điểm',
          sample: {
            eyebrow: 'Thời gian · Địa điểm',
            heading: 'Tên sự kiện và điều người tham dự nhận được',
            subheading: 'Giới thiệu ngắn về chương trình, ngày giờ và hình thức tham dự.',
            primaryCta: { label: 'Đăng ký tham dự', link: { kind: 'none' } },
          },
        },
        {
          type: 'benefits',
          variant: 'grid',
          label: 'Nội dung chương trình',
          sample: {
            heading: 'Nội dung chương trình',
            items: [
              benefit('clock', 'Phần 1: Khai mạc', 'Giới thiệu chương trình và diễn giả.'),
              benefit('sparkles', 'Phần 2: Chia sẻ chuyên đề', 'Nội dung chính và ví dụ thực tế.'),
              benefit('smile', 'Phần 3: Hỏi đáp', 'Giải đáp trực tiếp câu hỏi của người tham dự.'),
            ],
          },
        },
        {
          type: 'benefits',
          variant: 'alternate',
          label: 'Diễn giả',
          sample: {
            heading: 'Diễn giả',
            items: [
              benefit('star', 'Tên diễn giả', 'Chức danh và kinh nghiệm nổi bật của diễn giả.'),
              benefit('star', 'Tên diễn giả', 'Chức danh và kinh nghiệm nổi bật của diễn giả.'),
            ],
          },
        },
        {
          type: 'cta_band',
          variant: 'band',
          label: 'Dải kêu gọi đăng ký tham dự',
          sample: {
            heading: 'Đăng ký tham dự',
            text: 'Số chỗ có hạn. Đăng ký sớm để giữ chỗ cho bạn.',
            cta: { label: 'Đăng ký ngay', link: { kind: 'none' } },
          },
        },
        {
          type: 'faq',
          variant: 'accordion',
          label: 'Câu hỏi thường gặp',
          sample: {
            items: [
              faq('Sự kiện diễn ra ở đâu?', 'Ghi địa chỉ hoặc cách tham dự trực tuyến.'),
              faq(
                'Tham dự có mất phí không?',
                'Nêu rõ phí tham dự hoặc ghi chương trình miễn phí.',
              ),
              faq(
                'Tôi có nhận được tài liệu sau sự kiện không?',
                'Cho biết người tham dự nhận tài liệu và bản ghi bằng cách nào.',
              ),
            ],
          },
        },
        footer,
      ];
    case 'product':
      return [
        navbar('Liên hệ'),
        {
          type: 'hero',
          variant: 'split',
          label: 'Hero + hình dịch vụ',
          sample: {
            eyebrow: 'Dịch vụ nổi bật',
            primaryCta: { label: 'Nhận tư vấn', link: { kind: 'none' } },
          },
        },
        {
          type: 'benefits',
          variant: 'alternate',
          label: 'Tính năng nổi bật',
          sample: {
            heading: 'Tính năng nổi bật',
            items: [
              benefit(
                'sparkles',
                'Điểm mạnh thứ nhất',
                'Giải thích điểm mạnh và lợi ích cụ thể cho khách hàng.',
              ),
              benefit(
                'sparkles',
                'Điểm mạnh thứ hai',
                'Giải thích điểm mạnh và lợi ích cụ thể cho khách hàng.',
              ),
            ],
          },
        },
        {
          type: 'benefits',
          variant: 'grid',
          label: 'Quy trình 3 bước',
          sample: {
            heading: 'Quy trình 3 bước',
            items: [
              benefit('check', 'Bước 1: Liên hệ', 'Gọi hoặc nhắn tin để được tư vấn.'),
              benefit('clock', 'Bước 2: Lên kế hoạch', 'Đề xuất giải pháp và thời gian thực hiện.'),
              benefit(
                'star',
                'Bước 3: Thực hiện',
                'Triển khai và theo dõi kết quả cùng khách hàng.',
              ),
            ],
          },
        },
        { type: 'testimonials', variant: 'cards', label: 'Cảm nhận khách hàng' },
        {
          type: 'cta_band',
          variant: 'band',
          label: 'Dải kêu gọi hành động',
          sample: {
            text: 'Liên hệ để được tư vấn giải pháp phù hợp với bạn.',
            cta: { label: 'Nhận tư vấn', link: { kind: 'none' } },
          },
        },
        footer,
      ];
    case 'waitlist':
      return [
        navbar('Đăng ký'),
        {
          type: 'hero',
          variant: 'centered',
          label: 'Hero + nút đăng ký',
          sample: {
            eyebrow: 'Sắp ra mắt',
            heading: 'Tên dịch vụ mới và lợi ích lớn nhất của nó',
            subheading: 'Một câu cho biết dịch vụ giúp gì và khi nào ra mắt.',
            primaryCta: { label: 'Đăng ký giữ chỗ', link: { kind: 'none' } },
          },
        },
        {
          type: 'benefits',
          variant: 'grid',
          label: 'Lợi ích',
          sample: {
            heading: 'Vì sao nên đăng ký sớm',
            items: [
              benefit('star', 'Trải nghiệm trước', 'Người đăng ký sớm được dùng thử đầu tiên.'),
              benefit('heart', 'Ưu đãi riêng', 'Ưu đãi chỉ dành cho danh sách chờ.'),
              benefit('clock', 'Tin sớm nhất', 'Nhận tin ngay khi dịch vụ ra mắt.'),
            ],
          },
        },
        {
          type: 'faq',
          variant: 'accordion',
          label: 'Câu hỏi thường gặp',
          sample: {
            items: [
              faq('Khi nào dịch vụ ra mắt?', 'Cho biết thời gian dự kiến ra mắt.'),
              faq(
                'Đăng ký danh sách chờ có mất phí không?',
                'Nói rõ việc đăng ký có miễn phí và có ràng buộc gì không.',
              ),
              faq('Đăng ký sớm được gì?', 'Nêu quyền lợi dành cho người đăng ký sớm.'),
            ],
          },
        },
        {
          type: 'cta_band',
          variant: 'band',
          label: 'Dải kêu gọi đăng ký',
          sample: {
            heading: 'Đừng bỏ lỡ ngày ra mắt',
            text: 'Liên hệ để có tên trong danh sách chờ.',
            cta: { label: 'Đăng ký giữ chỗ', link: { kind: 'none' } },
          },
        },
        footer,
      ];
    case 'about':
      return [
        navbar('Liên hệ'),
        {
          type: 'hero',
          variant: 'split',
          label: 'Hero + lời giới thiệu',
          sample: {
            eyebrow: 'Về chúng tôi',
            heading: 'Bạn là ai và giúp khách hàng điều gì',
            subheading:
              'Một hai câu giới thiệu doanh nghiệp, kinh nghiệm và điều làm bạn khác biệt.',
            primaryCta: { label: 'Liên hệ với chúng tôi', link: { kind: 'none' } },
          },
        },
        {
          type: 'benefits',
          variant: 'alternate',
          label: 'Giới thiệu',
          sample: {
            heading: 'Câu chuyện của chúng tôi',
            items: [
              benefit('heart', 'Chúng tôi là ai', 'Năm thành lập, đội ngũ và điều bạn tin tưởng.'),
              benefit(
                'heart',
                'Cam kết với khách hàng',
                'Điều khách hàng luôn nhận được khi làm việc với bạn.',
              ),
            ],
          },
        },
        {
          type: 'benefits',
          variant: 'grid',
          label: 'Dịch vụ',
          sample: {
            heading: 'Dịch vụ của chúng tôi',
            items: [
              benefit('sparkles', 'Dịch vụ thứ nhất', 'Mô tả ngắn về dịch vụ.'),
              benefit('shield', 'Dịch vụ thứ hai', 'Mô tả ngắn về dịch vụ.'),
              benefit('leaf', 'Dịch vụ thứ ba', 'Mô tả ngắn về dịch vụ.'),
            ],
          },
        },
        {
          type: 'cta_band',
          variant: 'band',
          label: 'Dải liên hệ',
          sample: {
            heading: 'Liên hệ với chúng tôi',
            text: 'Gọi điện hoặc ghé thăm, chúng tôi luôn sẵn sàng hỗ trợ.',
            cta: { label: 'Liên hệ ngay', link: { kind: 'none' } },
          },
        },
        footer,
      ];
  }
}

/** Sections the page will have, in order, as listed under "Trang sẽ gồm". */
export function goalOutline(goal: PageGoal): GoalOutlineItem[] {
  return blueprint(goal, '').map(({ type, variant, label }) => ({ type, variant, label }));
}

/** Drives the "Hợp mục tiêu" badge in the "Thêm section" dialog. */
export function isRecommendedFor(goal: PageGoal, type: SectionType, variant: string): boolean {
  return goalOutline(goal).some((item) => item.type === type && item.variant === variant);
}

/* -------------------------------------------------------------------------------------------- */
/* Building the composition                                                                      */
/* -------------------------------------------------------------------------------------------- */

/** The tail of the Hero subheading after "Dành cho {audience}.". */
const audienceTails: Record<PageGoal, string> = {
  lead: 'Liên hệ để được tư vấn miễn phí và đặt lịch phù hợp.',
  promo: 'Số suất có hạn, liên hệ ngay để giữ ưu đãi.',
  event: 'Đăng ký sớm để giữ chỗ tham dự.',
  product: 'Tìm hiểu lợi ích, cách làm và liên hệ để được tư vấn.',
  waitlist: 'Đăng ký để là người đầu tiên nhận tin khi ra mắt.',
  about: 'Tìm hiểu về chúng tôi và cách liên hệ.',
};

/** Content paths of each section's primary button, which the brief's phone number makes call. */
const primaryCtaPaths: Partial<Record<SectionType, string>> = {
  navbar: 'cta',
  hero: 'primaryCta',
  cta_band: 'cta',
};

function textMaxLength(type: SectionType, key: string): number {
  const field = getSectionDefinition(type).fields.find((candidate) => candidate.key === key);
  if (field?.kind !== 'text') {
    throw new Error(`Section "${type}" has no text field "${key}"`);
  }
  return field.maxLength;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/** Cuts text to `max` characters, at a word boundary when one is reasonably close. */
function capText(value: string, max: number): string {
  const text = value.trim();
  if (text.length <= max) {
    return text;
  }
  let cut = text.slice(0, max);
  // Never leave half of a surrogate pair (emoji) behind.
  if (isHighSurrogate(cut.charCodeAt(cut.length - 1))) {
    cut = cut.slice(0, -1);
  }
  const space = cut.lastIndexOf(' ');
  if (space >= max / 2 && text.charAt(max) !== ' ') {
    cut = cut.slice(0, space);
  }
  return cut.trimEnd();
}

/**
 * Writes brief values into a section's content. Returns the new content and the paths that now
 * hold real content from the brief, which must not be marked as sample text.
 */
function applyBrief(
  type: SectionType,
  goal: PageGoal,
  content: Record<string, unknown>,
  brief: Brief,
): { content: Record<string, unknown>; briefPaths: string[] } {
  let next = content;
  const briefPaths: string[] = [];
  const write = (path: string, value: unknown, isText: boolean) => {
    next = setAtPath(next, path, value);
    if (isText) {
      briefPaths.push(path);
    }
  };
  if (type === 'hero') {
    if (brief.offer !== '') {
      write('heading', capText(brief.offer, textMaxLength('hero', 'heading')), true);
    }
    if (brief.audience !== '') {
      const audience = brief.audience.replace(/[\s.!?…]+$/u, '');
      const subheading = `Dành cho ${audience}. ${audienceTails[goal]}`;
      write('subheading', capText(subheading, textMaxLength('hero', 'subheading')), true);
    }
  }
  if (type === 'footer' && brief.phone !== '') {
    write('phone', capText(brief.phone, textMaxLength('footer', 'phone')), true);
  }
  const ctaPath = primaryCtaPaths[type];
  if (ctaPath !== undefined && brief.phone !== '') {
    write(`${ctaPath}.link`, { kind: 'phone', phone: brief.phone }, false);
  }
  return { content: next, briefPaths };
}

export interface BuildFromGoalInput {
  goal: PageGoal;
  brief: Brief;
  style: PageStyle;
  /** Used in goal-specific sample copy, e.g. "Vì sao chọn {siteName}". */
  siteName: string;
  /** Returns a fresh section id for each section. */
  newId: () => string;
}

/**
 * A ready-to-edit page for a goal: navigation bar first, footer last, goal-specific sample copy
 * (still marked as sample) and the brief's values as real content.
 */
export function buildCompositionFromGoal({
  goal,
  brief,
  style,
  siteName,
  newId,
}: BuildFromGoalInput): Composition {
  const values: Brief = {
    offer: brief.offer.trim(),
    audience: brief.audience.trim(),
    phone: brief.phone.trim(),
  };
  const sections = blueprint(goal, siteName);
  const schemes = pageStyleSchemes(
    style,
    sections.map((entry) => entry.type),
  );
  return {
    version: 1,
    sections: sections.map((entry, index): SectionInstance => {
      const instance = createSectionInstance(entry.type, entry.variant, newId());
      const sampled: Record<string, unknown> = { ...instance.content, ...entry.sample };
      const { content, briefPaths } = applyBrief(entry.type, goal, sampled, values);
      const samplePaths = samplePathsOf({
        type: entry.type,
        variant: entry.variant,
        content,
      }).filter((path) => !briefPaths.includes(path));
      return {
        ...instance,
        colorScheme: schemes[index] ?? instance.colorScheme,
        content,
        samplePaths,
      };
    }),
  };
}
