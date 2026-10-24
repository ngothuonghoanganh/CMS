import type { Composition, SectionInstance, ThemePresetId } from '@plp/contracts';
import { Fragment, type ReactElement, type ReactNode } from 'react';
import { themePresets } from '../schema/themes.js';
import type { RenderContext } from './context.js';
import frame from './frame.module.css';
import { renderSectionContent } from './render.js';
import { SectionFrame } from './SectionFrame.js';
import { fontStyle } from './theme-style.js';

export interface PageViewProps {
  composition: Composition;
  themePresetId: ThemePresetId;
  ctx: RenderContext;
  /** Admin canvas hook: wraps each rendered section with selection and toolbar UI. */
  wrapSection?: (section: SectionInstance, rendered: ReactElement, index: number) => ReactNode;
}

/**
 * The whole page as visitors see it. The navigation bar (always first) and footer (always last)
 * stay outside <main>, so the page has proper header/main/footer landmarks.
 */
export function PageView({ composition, themePresetId, ctx, wrapSection }: PageViewProps) {
  const theme = themePresets[themePresetId];
  const rendered = composition.sections.map((section, index) => {
    const element = (
      <SectionFrame key={section.id} section={section} theme={theme}>
        {renderSectionContent(section, ctx)}
      </SectionFrame>
    );
    return {
      section,
      node: wrapSection ? (
        <Fragment key={section.id}>{wrapSection(section, element, index)}</Fragment>
      ) : (
        element
      ),
    };
  });
  const first = rendered[0];
  const last = rendered[rendered.length - 1];
  const header = first?.section.type === 'navbar' ? first : undefined;
  const footer = last && last !== header && last.section.type === 'footer' ? last : undefined;
  const body = rendered.filter((entry) => entry !== header && entry !== footer);
  return (
    <div className={frame.page} style={fontStyle(theme)}>
      {header?.node}
      <main>{body.map((entry) => entry.node)}</main>
      {footer?.node}
    </div>
  );
}
