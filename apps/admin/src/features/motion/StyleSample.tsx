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
   * `thumb`: a heading and two blocks, on the style cards and entrance tiles (boards 37, 38).
   * `page`: a heading, cards, a picture beside text and figures (board 39).
   */
  layout: 'thumb' | 'page';
}

/** A wireframe that moves as the published page would (ADR-032); decoration only. */
export function StyleSample({ motion, level, play, layout }: StyleSampleProps) {
  if (layout === 'thumb') {
    return (
      <MotionSample motion={motion} level={level} play={play} className={styles.thumb}>
        <span className={styles.thumbHeading} {...MOTION_TEXT} />
        <span className={styles.thumbRow}>
          <span className={styles.thumbBlock} {...MOTION_TEXT} />
          <span className={`${styles.thumbBlock} ${styles.thumbMedia}`} {...MOTION_MEDIA} />
        </span>
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
