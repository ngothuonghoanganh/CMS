'use client';

import { Tooltip as RadixTooltip } from 'radix-ui';
import type { ReactElement, ReactNode } from 'react';
import styles from './Tooltip.module.css';

export interface TooltipProps {
  content: ReactNode;
  /** One focusable element that accepts a ref and spreads props (a button or link). */
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left' | undefined;
  /** Hover delay in milliseconds. Keyboard focus opens the tooltip immediately. */
  delayDuration?: number | undefined;
}

/**
 * A short hint shown on hover and keyboard focus, e.g. "Hoàn tác (Ctrl+Z)". It supplements an
 * accessible name; it never replaces one. A disabled button cannot receive focus, so wrap it in a
 * focusable element when it needs a tooltip.
 */
export function Tooltip({ content, children, side = 'bottom', delayDuration = 300 }: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={delayDuration}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={6}
            collisionPadding={8}
            className={styles.content}
          >
            {content}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
