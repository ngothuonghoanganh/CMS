import type { SectionInstance } from '@plp/contracts';
import type { ComponentType, ReactNode } from 'react';
import type { z } from 'zod';
import { heroContentSchema } from '../schema/sections/hero.js';
import type { RenderContext } from './context.js';
import frame from './frame.module.css';
import { HeroSection } from './sections/Hero.js';
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
    case 'hero':
      return renderWith(heroContentSchema, HeroSection, section, ctx);
    case 'navbar':
    case 'benefits':
    case 'testimonials':
    case 'faq':
    case 'cta_band':
    case 'footer':
      throw new Error(`Section component for "${section.type}" is not implemented yet`);
  }
}
