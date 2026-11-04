'use client';

import { ChevronDownIcon, ChevronRightIcon } from '@plp/ui';
import type { ReactNode } from 'react';
import styles from './PanelGroup.module.css';

export type PanelGroupId = 'content' | 'layout' | 'motion' | 'visibility';

export interface PanelGroupProps {
  /** Id of the toggle button; the group is named by it. */
  toggleId: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * A group of the section's properties that folds away (board 38): the heading is the toggle, as in
 * the APG accordion, so heading navigation still lists every group, open or not.
 */
export function PanelGroup({ toggleId, title, open, onToggle, children }: PanelGroupProps) {
  const bodyId = `${toggleId}-body`;
  return (
    <section aria-labelledby={toggleId} className={open ? styles.groupOpen : styles.group}>
      <h3 className={styles.heading}>
        <button
          id={toggleId}
          type="button"
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          className={styles.toggle}
          onClick={onToggle}
        >
          {title}
          {open ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
        </button>
      </h3>
      {open ? (
        <div id={bodyId} className={styles.body}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
