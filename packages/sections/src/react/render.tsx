import type { SectionInstance } from '@plp/contracts';
import type { ComponentType, ReactNode } from 'react';
import type { z } from 'zod';
import { benefitsContentSchema } from '../schema/sections/benefits.js';
import { ctaBandContentSchema } from '../schema/sections/cta-band.js';
import { faqContentSchema } from '../schema/sections/faq.js';
import { footerContentSchema } from '../schema/sections/footer.js';
import { heroContentSchema } from '../schema/sections/hero.js';
import { navbarContentSchema } from '../schema/sections/navbar.js';
import { testimonialsContentSchema } from '../schema/sections/testimonials.js';
import type { RenderContext } from './context.js';
import frame from './frame.module.css';
import { BenefitsSection } from './sections/Benefits.js';
import { CtaBandSection } from './sections/CtaBand.js';
import { FaqSection } from './sections/Faq.js';
import { FooterSection } from './sections/Footer.js';
import { HeroSection } from './sections/Hero.js';
import { NavbarSection } from './sections/Navbar.js';
import { TestimonialsSection } from './sections/Testimonials.js';
import type { SectionProps } from './types.js';

function renderWith<C>(
  schema: z.ZodType<C>,
  Component: ComponentType<SectionProps<C>>,
  section: SectionInstance,
  ctx: RenderContext,
): ReactNode {
  const parsed = schema.safeParse(section.content);
  if (!parsed.success) {
    // Content is validated on every save and publish, so this only happens with corrupted data.
    return ctx.mode === 'edit' ? (
      <p className={frame.imagePlaceholder}>
        Nội dung section không hợp lệ: {parsed.error.issues[0]?.message}
      </p>
    ) : null;
  }
  return <Component section={section} content={parsed.data} ctx={ctx} />;
}

/** Renders the component of one section; exhaustive over every section type. */
export function renderSectionContent(section: SectionInstance, ctx: RenderContext): ReactNode {
  switch (section.type) {
    case 'navbar':
      return renderWith(navbarContentSchema, NavbarSection, section, ctx);
    case 'hero':
      return renderWith(heroContentSchema, HeroSection, section, ctx);
    case 'benefits':
      return renderWith(benefitsContentSchema, BenefitsSection, section, ctx);
    case 'testimonials':
      return renderWith(testimonialsContentSchema, TestimonialsSection, section, ctx);
    case 'faq':
      return renderWith(faqContentSchema, FaqSection, section, ctx);
    case 'cta_band':
      return renderWith(ctaBandContentSchema, CtaBandSection, section, ctx);
    case 'footer':
      return renderWith(footerContentSchema, FooterSection, section, ctx);
  }
}
