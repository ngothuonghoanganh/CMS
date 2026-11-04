import type { SectionType } from '@plp/contracts';
import type { CSSProperties } from 'react';
import styles from './SectionThumbnail.module.css';

type Tone = 'dark' | 'light' | 'accent' | 'white';

interface Block {
  /** Width as a CSS length: a share of the row ("44%"), or pixels at full size ("18px"). */
  w: string;
  /** Height in pixels at full size; 0 forces a line break. */
  h: number;
  tone: Tone;
  r?: number;
}

function blk(w: string, h: number, tone: Tone = 'light', r = 3): Block {
  return { w, h, tone, r };
}

/** Schematic layouts copied from the "Thêm section" board. */
const layouts = {
  navbar: [blk('30%', 10, 'dark'), blk('36%', 0), blk('22%', 14, 'accent', 99)],
  heroSplit: [
    blk('44%', 8, 'dark'),
    blk('44%', 0),
    blk('44%', 50, 'white', 6),
    blk('44%', 50, 'light', 6),
  ],
  heroCenter: [blk('70%', 9, 'dark'), blk('50%', 6), blk('24%', 12, 'accent', 6)],
  heroBg: [blk('100%', 80, 'dark', 6)],
  cards3: [
    blk('50%', 7, 'dark'),
    blk('100%', 0),
    blk('29%', 48, 'white', 6),
    blk('29%', 48, 'white', 6),
    blk('29%', 48, 'white', 6),
  ],
  alternate: [
    blk('46%', 34, 'light', 6),
    blk('46%', 34, 'white', 6),
    blk('46%', 34, 'white', 6),
    blk('46%', 34, 'light', 6),
  ],
  steps: [
    blk('50%', 7, 'dark'),
    blk('100%', 0),
    blk('18px', 18, 'accent', 99),
    blk('18%', 4),
    blk('18px', 18, 'accent', 99),
    blk('18%', 4),
    blk('18px', 18, 'accent', 99),
  ],
  quote: [blk('80%', 9, 'dark'), blk('60%', 9, 'dark'), blk('100%', 0), blk('22%', 6)],
  logos: [
    blk('40%', 6, 'dark'),
    blk('100%', 0),
    blk('15%', 16),
    blk('15%', 16),
    blk('15%', 16),
    blk('15%', 16),
    blk('15%', 16),
  ],
  beforeAfter: [blk('45%', 64, 'light', 6), blk('45%', 64, 'dark', 6)],
  stats: [
    blk('50%', 7, 'dark'),
    blk('100%', 0),
    blk('26%', 18, 'dark'),
    blk('26%', 18, 'dark'),
    blk('26%', 18, 'dark'),
    blk('100%', 0),
    blk('26%', 5),
    blk('26%', 5),
    blk('26%', 5),
  ],
  faq: [
    blk('40%', 7, 'dark'),
    blk('100%', 0),
    blk('90%', 10, 'white'),
    blk('90%', 10, 'white'),
    blk('90%', 10, 'white'),
    blk('90%', 10, 'white'),
  ],
  form: [
    blk('44%', 8, 'dark'),
    blk('44%', 14, 'white', 4),
    blk('44%', 30, 'light'),
    blk('44%', 14, 'white', 4),
    blk('44%', 0),
    blk('44%', 14, 'accent', 4),
  ],
  quick: [blk('40%', 18, 'accent', 99), blk('40%', 18, 'white', 99)],
  ctaBand: [blk('100%', 56, 'dark', 6)],
  footer: [blk('22%', 30), blk('22%', 30), blk('22%', 30), blk('100%', 4)],
} satisfies Record<string, Block[]>;

function layoutOf(type: SectionType, variant: string): Block[] {
  switch (type) {
    case 'navbar':
      return layouts.navbar;
    case 'hero':
      return variant === 'centered'
        ? layouts.heroCenter
        : variant === 'background'
          ? layouts.heroBg
          : layouts.heroSplit;
    case 'benefits':
      return variant === 'alternate'
        ? layouts.alternate
        : variant === 'steps'
          ? layouts.steps
          : layouts.cards3;
    case 'testimonials':
      return variant === 'quote' ? layouts.quote : layouts.cards3;
    case 'logos':
      return layouts.logos;
    case 'before_after':
      return layouts.beforeAfter;
    case 'stats':
      return layouts.stats;
    case 'faq':
      return layouts.faq;
    case 'lead_form':
      return layouts.form;
    case 'quick_contact':
      return layouts.quick;
    case 'cta_band':
      return layouts.ctaBand;
    case 'footer':
      return layouts.footer;
  }
}

export interface SectionThumbnailProps {
  type: SectionType;
  variant: string;
  /** `lg` for the "Thêm section" cards, `sm` for the variant buttons of the properties panel. */
  size?: 'lg' | 'sm';
}

/** A decorative wireframe of a section variant, drawn with CSS blocks. */
export function SectionThumbnail({ type, variant, size = 'lg' }: SectionThumbnailProps) {
  const scale = size === 'lg' ? 1 : 0.28;
  return (
    <span className={size === 'lg' ? styles.large : styles.small} aria-hidden="true">
      {layoutOf(type, variant).map((block, index) => {
        const style: CSSProperties = {
          // The step circles keep their shape in the small variant buttons.
          width: block.w.endsWith('px')
            ? `${Math.max(1, Math.round(parseFloat(block.w) * scale))}px`
            : block.w,
          height: block.h === 0 ? 0 : Math.max(1, Math.round(block.h * scale)),
          borderRadius: Math.max(1, Math.round((block.r ?? 3) * scale)),
        };
        return <span key={index} className={styles[block.tone]} style={style} />;
      })}
    </span>
  );
}
