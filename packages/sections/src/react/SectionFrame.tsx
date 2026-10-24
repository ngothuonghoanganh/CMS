import type { SectionInstance } from '@plp/contracts';
import type { ReactNode } from 'react';
import type { ThemePreset } from '../schema/themes.js';
import frame from './frame.module.css';
import { schemeStyle } from './theme-style.js';

const landmarkTags = { navbar: 'header', footer: 'footer' } as const;

export interface SectionFrameProps {
  section: SectionInstance;
  theme: ThemePreset;
  children: ReactNode;
}

/** Applies the section's color scheme, spacing preset and per-device visibility. */
export function SectionFrame({ section, theme, children }: SectionFrameProps) {
  const Tag =
    section.type === 'navbar' || section.type === 'footer' ? landmarkTags[section.type] : 'section';
  const classes = [
    frame.section,
    frame[section.spacing],
    section.visibility.desktop ? undefined : frame.hideDesktop,
    section.visibility.mobile ? undefined : frame.hideMobile,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Tag
      id={`section-${section.id}`}
      className={classes}
      style={schemeStyle(theme.schemes[section.colorScheme])}
      data-section-type={section.type}
      data-variant={section.variant}
    >
      <div className={frame.inner}>{children}</div>
    </Tag>
  );
}
