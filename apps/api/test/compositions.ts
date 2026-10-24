import {
  type Composition,
  type ImageRef,
  type Link,
  type SectionInstance,
  type SectionType,
  type Seo,
} from '@plp/contracts';
import { createSectionInstance } from '@plp/sections/schema';

let counter = 0;

/** A fresh section id matching `sectionIdSchema`, e.g. "sec00000007". */
export function nextSectionId(prefix = 'sec'): string {
  counter += 1;
  return `${prefix}${counter.toString().padStart(8, '0')}`;
}

/** A section with the registry's sample content (its sample paths still marked). */
export function sampleSection(
  type: SectionType,
  variant?: string,
  id: string = nextSectionId(),
): SectionInstance {
  return createSectionInstance(type, variant, id);
}

export interface HeroOptions {
  id?: string;
  variant?: 'split' | 'centered' | 'background';
  heading?: string;
  ctaLabel?: string;
  ctaLink?: Link;
  secondaryLabel?: string;
  secondaryLink?: Link;
  image?: ImageRef;
}

/** A Hero with real (non-sample) content that passes every check by itself. */
export function heroSection(options: HeroOptions = {}): SectionInstance {
  const base = createSectionInstance(
    'hero',
    options.variant ?? 'split',
    options.id ?? nextSectionId('hero'),
  );
  return {
    ...base,
    content: {
      eyebrow: '',
      heading: options.heading ?? 'Niềng răng trong suốt cho người bận rộn',
      subheading: 'Lịch hẹn linh hoạt, bác sĩ theo dõi suốt liệu trình.',
      primaryCta: {
        label: options.ctaLabel ?? 'Đặt lịch tư vấn',
        link: options.ctaLink ?? { kind: 'url', url: 'https://example.com/dat-lich' },
      },
      secondaryCta: {
        label: options.secondaryLabel ?? '',
        link: options.secondaryLink ?? { kind: 'none' },
      },
      image: options.image ?? { assetId: null, alt: '', decorative: false },
    },
    samplePaths: [],
  };
}

/** SEO that passes every SEO check. */
export function cleanSeo(overrides: Partial<Seo> = {}): Seo {
  return {
    title: 'Niềng răng trong suốt',
    description: 'Tư vấn miễn phí, trả góp 0%, bác sĩ theo dõi suốt liệu trình.',
    shareImageAssetId: null,
    noindex: false,
    ...overrides,
  };
}

export function composition(sections: SectionInstance[]): Composition {
  return { version: 1, sections };
}

/** A draft that can be published without any blocking check or warning. */
export function publishableDraft(
  slug: string,
  heading?: string,
): { slug: string; composition: Composition; seo: Seo } {
  return {
    slug,
    composition: composition([heroSection(heading === undefined ? {} : { heading })]),
    seo: cleanSeo(),
  };
}
