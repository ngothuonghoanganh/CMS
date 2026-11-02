import type { SectionInstance } from '@plp/contracts';
import type { ComponentType, ReactElement } from 'react';
import type { z } from 'zod';
import { beforeAfterContentSchema } from '../schema/sections/before-after.js';
import { benefitsContentSchema } from '../schema/sections/benefits.js';
import { ctaBandContentSchema } from '../schema/sections/cta-band.js';
import { faqContentSchema } from '../schema/sections/faq.js';
import { footerContentSchema } from '../schema/sections/footer.js';
import { heroContentSchema } from '../schema/sections/hero.js';
import { leadFormContentSchema } from '../schema/sections/lead-form.js';
import { logosContentSchema } from '../schema/sections/logos.js';
import { navbarContentSchema } from '../schema/sections/navbar.js';
import { quickContactContentSchema } from '../schema/sections/quick-contact.js';
import { testimonialsContentSchema } from '../schema/sections/testimonials.js';
import type { RenderContext } from './context.js';
import frame from './frame.module.css';
import { BeforeAfterSection } from './sections/BeforeAfter.js';
import { BenefitsSection } from './sections/Benefits.js';
import { CtaBandSection } from './sections/CtaBand.js';
import { FaqSection } from './sections/Faq.js';
import { FooterSection } from './sections/Footer.js';
import { HeroSection } from './sections/Hero.js';
import { LeadFormSection } from './sections/LeadForm.js';
import { LogosSection } from './sections/Logos.js';
import { NavbarSection } from './sections/Navbar.js';
import { QuickContactSection } from './sections/QuickContact.js';
import { TestimonialsSection } from './sections/Testimonials.js';
import type { SectionProps } from './types.js';

function renderWith<C>(
  schema: z.ZodType<C>,
  Component: ComponentType<SectionProps<C>>,
  section: SectionInstance,
  ctx: RenderContext,
  leading: boolean,
): ReactElement | null {
  const parsed = schema.safeParse(section.content);
  if (!parsed.success) {
    // Content is validated on every save and publish, so this only happens with corrupted data.
    return ctx.mode === 'edit' ? (
      <p className={frame.imagePlaceholder}>
        Nội dung section không hợp lệ: {parsed.error.issues[0]?.message}
      </p>
    ) : null;
  }
  return <Component section={section} content={parsed.data} ctx={ctx} leading={leading} />;
}

/**
 * Renders the component of one section; exhaustive over every section type. `leading`: the section
 * opens the page body (see `SectionProps`). The result cannot be `undefined`, so a section type
 * without a case below falls off the end of the switch and fails to compile.
 */
export function renderSectionContent(
  section: SectionInstance,
  ctx: RenderContext,
  leading = false,
): ReactElement | null {
  switch (section.type) {
    case 'navbar':
      return renderWith(navbarContentSchema, NavbarSection, section, ctx, leading);
    case 'hero':
      return renderWith(heroContentSchema, HeroSection, section, ctx, leading);
    case 'benefits':
      return renderWith(benefitsContentSchema, BenefitsSection, section, ctx, leading);
    case 'testimonials':
      return renderWith(testimonialsContentSchema, TestimonialsSection, section, ctx, leading);
    case 'logos':
      return renderWith(logosContentSchema, LogosSection, section, ctx, leading);
    case 'before_after':
      return renderWith(beforeAfterContentSchema, BeforeAfterSection, section, ctx, leading);
    case 'faq':
      return renderWith(faqContentSchema, FaqSection, section, ctx, leading);
    case 'lead_form':
      return renderWith(leadFormContentSchema, LeadFormSection, section, ctx, leading);
    case 'quick_contact':
      return renderWith(quickContactContentSchema, QuickContactSection, section, ctx, leading);
    case 'cta_band':
      return renderWith(ctaBandContentSchema, CtaBandSection, section, ctx, leading);
    case 'footer':
      return renderWith(footerContentSchema, FooterSection, section, ctx, leading);
  }
}
