'use client';

import type { MotionLevel } from '@plp/contracts';
import { type ReactNode, useEffect, useRef } from 'react';
import type { ResolvedSectionMotion } from '../../schema/motion.js';
import { motionLevelStyle, motionStyle } from '../theme-style.js';
import motionStyles from './motion.module.css';
import { playSample } from './runtime.js';

export interface MotionSampleProps {
  /** How the sample's parts enter; null keeps it still ("Không hiệu ứng"). */
  motion: ResolvedSectionMotion | null;
  level: MotionLevel;
  /** A new value plays the sample again; 0 shows it still. */
  play: number;
  className?: string | undefined;
  /** The sample's parts, marked like a section's (`MOTION_TEXT`, `MOTION_MEDIA`, `data-m-count`). */
  children: ReactNode;
}

/**
 * A small sample of how a style or an entrance moves, for the editor (ADR-032): the admin draws it,
 * and it moves with the keyframes and runtime of the published page, so it shows what visitors
 * will see. It is decoration, hidden from screen readers.
 */
export function MotionSample({ motion, level, play, className, children }: MotionSampleProps) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (play === 0 || root.current === null) {
      return undefined;
    }
    return playSample(root.current);
  }, [play]);
  return (
    <div
      ref={root}
      aria-hidden="true"
      className={[motionStyles.root, className].filter(Boolean).join(' ')}
      style={motionLevelStyle({ level })}
      data-motion-root=""
    >
      <div
        style={motionStyle(motion)}
        {...(motion && {
          'data-motion-enter': motion.enter,
          'data-motion-order': motion.order,
          'data-motion-accents': motion.accents.join(' '),
        })}
      >
        {children}
      </div>
    </div>
  );
}
