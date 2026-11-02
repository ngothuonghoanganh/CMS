import type { TemplateSection, ThemePresetId } from '@plp/contracts';
import { themePresets } from '@plp/sections/schema';
import type { CSSProperties, ReactNode } from 'react';
import styles from './TemplateThumb.module.css';

type ThumbStyle = CSSProperties & Record<`--thumb-${string}`, string>;

/** The colors of a section's scheme in the site's theme, for its band. */
function bandStyle(themePresetId: ThemePresetId, section: TemplateSection): ThumbStyle {
  const scheme = themePresets[themePresetId].schemes[section.colorScheme];
  return {
    '--thumb-bg': scheme.background,
    '--thumb-surface': scheme.surface,
    '--thumb-ink': scheme.heading,
    '--thumb-muted': scheme.muted,
    '--thumb-accent': scheme.accent,
    '--thumb-border': scheme.border,
  };
}

function Lines({ widths, center = false }: { widths: readonly string[]; center?: boolean }) {
  return (
    <span className={center ? `${styles.lines} ${styles.center}` : styles.lines}>
      {widths.map((width, index) => (
        <span key={index} className={index === 0 ? styles.title : styles.text} style={{ width }} />
      ))}
    </span>
  );
}

const pill = <span className={styles.pill} />;

function cards(count: number, child: ReactNode = null) {
  return (
    <span className={styles.cards}>
      {Array.from({ length: count }, (_value, index) => (
        <span key={index} className={styles.card}>
          {child}
          <span className={styles.title} style={{ width: '70%' }} />
          <span className={styles.text} style={{ width: '90%' }} />
        </span>
      ))}
    </span>
  );
}

/** A schematic of one section, by its type and variant. */
function bandContent({ type, variant }: TemplateSection): ReactNode {
  switch (type) {
    case 'navbar':
      return (
        <span className={styles.row}>
          <span className={styles.title} style={{ width: '24%' }} />
          <span className={styles.pillSmall} />
        </span>
      );
    case 'hero':
      return variant === 'split' ? (
        <span className={styles.split}>
          <span className={styles.stack}>
            <Lines widths={['92%', '64%', '80%']} />
            {pill}
          </span>
          <span className={styles.media} />
        </span>
      ) : (
        <span className={`${styles.stack} ${styles.center}`}>
          <Lines widths={['70%', '50%', '60%']} center />
          {pill}
        </span>
      );
    case 'benefits':
      if (variant === 'alternate') {
        return (
          <span className={styles.stack}>
            <span className={styles.split}>
              <span className={styles.media} />
              <Lines widths={['60%', '90%']} />
            </span>
          </span>
        );
      }
      return (
        <span className={styles.stack}>
          <Lines widths={['40%']} center />
          {variant === 'steps' ? (
            <span className={styles.steps}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </span>
          ) : (
            cards(3, <span className={styles.icon} />)
          )}
        </span>
      );
    case 'testimonials':
      return variant === 'quote' ? (
        <Lines widths={['76%', '56%', '24%']} center />
      ) : (
        <span className={styles.stack}>
          <Lines widths={['44%']} center />
          {cards(3)}
        </span>
      );
    case 'logos':
      return (
        <span className={styles.logos}>
          {Array.from({ length: 5 }, (_value, index) => (
            <span key={index} className={styles.logo} />
          ))}
        </span>
      );
    case 'before_after':
      return (
        <span className={styles.stack}>
          <Lines widths={['44%']} center />
          <span className={styles.split}>
            <span className={styles.media} />
            <span className={styles.media} />
          </span>
        </span>
      );
    case 'faq':
      return (
        <span className={styles.stack}>
          <Lines widths={['36%']} center />
          <span className={styles.bar} />
          <span className={styles.bar} />
          <span className={styles.bar} />
        </span>
      );
    case 'lead_form':
      return (
        <span className={`${styles.stack} ${styles.form}`}>
          <Lines widths={['60%', '80%']} center />
          <span className={styles.input} />
          <span className={styles.input} />
          {pill}
        </span>
      );
    case 'quick_contact':
      return (
        <span className={`${styles.stack} ${styles.center}`}>
          <Lines widths={['50%']} center />
          <span className={styles.row}>
            {pill}
            <span className={styles.pillOutline} />
          </span>
        </span>
      );
    case 'cta_band':
      return (
        <span className={styles.row}>
          <span className={styles.title} style={{ width: '46%' }} />
          {pill}
        </span>
      );
    case 'footer':
      return (
        <span className={styles.footer}>
          <Lines widths={['80%', '60%']} />
          <Lines widths={['70%', '50%']} />
          <Lines widths={['60%', '40%']} />
        </span>
      );
  }
}

export interface TemplateThumbProps {
  sections: readonly TemplateSection[];
  /** The theme of the site the page would be made for (ADR-004). */
  themePresetId: ThemePresetId;
  /** "Bản xem thu nhỏ: Ưu đãi dịch vụ nha khoa". */
  label: string;
  className?: string | undefined;
}

/**
 * A miniature of the page a template makes, drawn from its sections and their color schemes in a
 * site's theme (the TemplateThumb board): one band per section, top to bottom. It is a picture,
 * named by `label`; the outline in words is on the template's own screen.
 */
export function TemplateThumb({ sections, themePresetId, label, className }: TemplateThumbProps) {
  return (
    <div role="img" aria-label={label} className={className}>
      <span className={styles.page}>
        {sections.map((section, index) => (
          <span
            key={index}
            className={styles.band}
            data-type={section.type}
            style={bandStyle(themePresetId, section)}
          >
            {bandContent(section)}
          </span>
        ))}
      </span>
    </div>
  );
}
