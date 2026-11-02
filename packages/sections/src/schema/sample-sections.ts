import { EMPTY_IMAGE, type SectionType } from '@plp/contracts';
import type { BeforeAfterContent } from './sections/before-after.js';
import type { BenefitsContent, benefitIcons } from './sections/benefits.js';
import type { CtaBandContent } from './sections/cta-band.js';
import type { FaqContent } from './sections/faq.js';
import type { FooterContent } from './sections/footer.js';
import type { HeroContent } from './sections/hero.js';
import type { LeadFormContent } from './sections/lead-form.js';
import type { LogosContent } from './sections/logos.js';
import type { NavbarContent } from './sections/navbar.js';
import type { QuickContactContent } from './sections/quick-contact.js';
import type { TestimonialsContent } from './sections/testimonials.js';

/*
 * The pieces goal blueprints and system templates write their pages with: a section, its role on
 * the page, and the sample copy that replaces the section's generic one. Not exported from the
 * package: both build compositions through the registry, which parses what they write.
 */

interface ContentByType {
  navbar: NavbarContent;
  hero: HeroContent;
  benefits: BenefitsContent;
  testimonials: TestimonialsContent;
  logos: LogosContent;
  before_after: BeforeAfterContent;
  faq: FaqContent;
  lead_form: LeadFormContent;
  quick_contact: QuickContactContent;
  cta_band: CtaBandContent;
  footer: FooterContent;
}

export type SampleSection = {
  [T in SectionType]: {
    type: T;
    variant: string;
    /** What the section does on this page, e.g. under "Trang sẽ gồm" or "Gồm 8 section". */
    label: string;
    /** Page-specific sample copy replacing the section's generic sample content. */
    sample?: Partial<ContentByType[T]>;
  };
}[SectionType];

type BenefitItem = BenefitsContent['items'][number];
type FaqItem = FaqContent['items'][number];
type TestimonialItem = TestimonialsContent['items'][number];

export function benefit(
  icon: (typeof benefitIcons)[number],
  title: string,
  description: string,
): BenefitItem {
  return { icon, title, description, image: { ...EMPTY_IMAGE } };
}

export function faq(question: string, answer: string): FaqItem {
  return { question, answer };
}

export function testimonial(quote: string, name: string, detail: string): TestimonialItem {
  return { quote, name, detail, avatar: { ...EMPTY_IMAGE } };
}
