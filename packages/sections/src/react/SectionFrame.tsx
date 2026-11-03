import type { SectionInstance } from '@plp/contracts';
import type { ReactNode } from 'react';
import type { ResolvedSectionMotion } from '../schema/motion.js';
import type { ThemePreset } from '../schema/themes.js';
import frame from './frame.module.css';
import { motionStyle, schemeStyle } from './theme-style.js';

const landmarkTags = { navbar: 'header', footer: 'footer' } as const;

export interface SectionFrameProps {
  section: SectionInstance;
  theme: ThemePreset;
  /** How the section enters (ADR-032); null shows it at once. */
  motion: ResolvedSectionMotion | null;
  children: ReactNode;
}

/** Applies the section's color scheme, spacing preset, per-device visibility and motion. */
export function SectionFrame({ section, theme, motion, children }: SectionFrameProps) {
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
      style={{ ...schemeStyle(theme.schemes[section.colorScheme]), ...motionStyle(motion) }}
      data-section-type={section.type}
      data-variant={section.variant}
      {...(motion && {
        'data-motion-enter': motion.enter,
        'data-motion-order': motion.order,
        'data-motion-accents': motion.accents.join(' '),
      })}
    >
      <div className={frame.inner}>{children}</div>
    </Tag>
  );
}
