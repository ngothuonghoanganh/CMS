import { Card, CheckIcon, VisuallyHidden } from '@plp/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './SetupChecklist.module.css';

export interface SetupStep {
  label: string;
  done: boolean;
  /** The next step to take while not done: a link or a button styled as a link. */
  action: { href: string } | { onClick: () => void };
}

function StepLabel({ step }: { step: SetupStep }): ReactNode {
  if (step.done) {
    return (
      <>
        <span className={styles.doneLabel}>{step.label}</span>
        <VisuallyHidden> (đã xong)</VisuallyHidden>
      </>
    );
  }
  if ('href' in step.action) {
    return (
      <Link href={step.action.href} className={styles.link}>
        {step.label}
      </Link>
    );
  }
  return (
    <button type="button" className={styles.linkButton} onClick={step.action.onClick}>
      {step.label}
    </button>
  );
}

/** "Thiết lập site": the MVP A setup steps with progress. */
export function SetupChecklist({ steps }: { steps: readonly SetupStep[] }) {
  const done = steps.filter((step) => step.done).length;
  const percent = steps.length === 0 ? 0 : Math.round((done / steps.length) * 100);
  return (
    <Card as="section" aria-labelledby="setup-heading" className={styles.card}>
      <div className={styles.header}>
        <h2 id="setup-heading" className={styles.heading}>
          Thiết lập site
        </h2>
        <span className={styles.count}>
          {done}/{steps.length}
          <VisuallyHidden> bước đã xong</VisuallyHidden>
        </span>
      </div>
      <div className={styles.track} aria-hidden="true">
        <div className={styles.bar} style={{ width: `${percent}%` }} />
      </div>
      <ul className={styles.list}>
        {steps.map((step) => (
          <li key={step.label} className={step.done ? styles.done : styles.todo}>
            {step.done ? (
              <span className={styles.check}>
                <CheckIcon size={18} strokeWidth={2.2} />
              </span>
            ) : (
              <span className={styles.circle} aria-hidden="true" />
            )}
            <StepLabel step={step} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
