import type { SectionType } from '@plp/contracts';
import type { CSSProperties } from 'react';
import styles from './SectionThumbnail.module.css';

type Tone = 'dark' | 'light' | 'accent' | 'white';

interface Block {
  /** Width as a CSS length, e.g. "44%". */
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
  quote: [blk('80%', 9, 'dark'), blk('60%', 9, 'dark'), blk('100%', 0), blk('22%', 6)],
  faq: [
    blk('40%', 7, 'dark'),
    blk('100%', 0),
    blk('90%', 10, 'white'),
    blk('90%', 10, 'white'),
    blk('90%', 10, 'white'),
    blk('90%', 10, 'white'),
  ],
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
      return variant === 'alternate' ? layouts.alternate : layouts.cards3;
    case 'testimonials':
      return variant === 'quote' ? layouts.quote : layouts.cards3;
    case 'faq':
      return layouts.faq;
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
          width: block.w,
          height: block.h === 0 ? 0 : Math.max(1, Math.round(block.h * scale)),
          borderRadius: Math.max(1, Math.round((block.r ?? 3) * scale)),
        };
        return <span key={index} className={styles[block.tone]} style={style} />;
      })}
    </span>
  );
}
