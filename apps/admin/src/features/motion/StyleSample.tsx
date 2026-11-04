'use client';

import type { MotionLevel } from '@plp/contracts';
import { MOTION_MEDIA, MOTION_TEXT, MotionSample } from '@plp/sections/react';
import type { ResolvedSectionMotion } from '@plp/sections/schema';
import Image from 'next/image';
import styles from './StyleSample.module.css';

/** A landscape drawn as an SVG data URL: the picture of the sample, to show "Ảnh hé lộ". */
const PICTURE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'%3E%3Crect width='4' height='3' fill='%23c7cbff'/%3E%3Ccircle cx='2.8' cy='1' r='.5' fill='%23eef0ff'/%3E%3Cpath d='M0 3 1.6 1.6 2.6 2.4 3.2 2 4 3z' fill='%23a5abf5'/%3E%3C/svg%3E";

export interface StyleSampleProps {
  motion: ResolvedSectionMotion | null;
  level: MotionLevel;
  /** A new value plays the sample again; 0 shows it still. */
  play: number;
  /**
   * `thumb`: three small cards, on the style cards (board 37). `tile`: one small card, beside the
   * name of an entrance tile (board 38). `page`: a heading, cards, a picture beside text and
   * figures (board 39).
   */
  layout: 'thumb' | 'tile' | 'page';
  /** The card or tile is the chosen one: its small cards take the brand color. */
  selected?: boolean | undefined;
}

/** One small card: a heading bar and a shorter line, as the boards draw a section. */
function MiniCard() {
  return (
    <span className={styles.mini} {...MOTION_TEXT}>
      <span className={styles.miniHeading} />
      <span className={styles.miniLine} />
    </span>
  );
}

/**
 * A wireframe that moves as the published page would (ADR-032); decoration only. Still, the small
 * cards are drawn from the motion itself (its `data-motion-*` attributes): a trail for how they
 * enter, their offsets for the order, and marks for the accents.
 */
export function StyleSample({ motion, level, play, layout, selected = false }: StyleSampleProps) {
  if (layout === 'thumb' || layout === 'tile') {
    return (
      <MotionSample
        motion={motion}
        level={level}
        play={play}
        className={`${layout === 'thumb' ? styles.thumb : styles.tile}${
          selected ? ` ${styles.selected}` : ''
        }`}
      >
        {layout === 'thumb' ? (
          <>
            <MiniCard />
            <MiniCard />
            <MiniCard />
          </>
        ) : (
          <MiniCard />
        )}
      </MotionSample>
    );
  }
  return (
    <MotionSample motion={motion} level={level} play={play} className={styles.page}>
      <h2 className={styles.heading} {...MOTION_TEXT}>
        Vì sao khách chọn chúng tôi
      </h2>
      <span className={styles.cards}>
        {[0, 1, 2, 3].map((card) => (
          <span key={card} className={styles.card} {...MOTION_TEXT} />
        ))}
      </span>
      <span className={styles.row}>
        <span className={styles.media} {...MOTION_MEDIA}>
          <Image
            className={styles.picture}
            src={PICTURE}
            alt=""
            width={72}
            height={46}
            unoptimized
          />
        </span>
        <span className={styles.lines} {...MOTION_TEXT}>
          <span className={styles.line} />
          <span className={styles.lineShort} />
        </span>
      </span>
      <span className={styles.figures}>
        {['15', '8.000+', '4,9'].map((figure) => (
          <span key={figure} className={styles.figure} {...MOTION_TEXT}>
            <span data-m-count="">{figure}</span>
          </span>
        ))}
      </span>
    </MotionSample>
  );
}
