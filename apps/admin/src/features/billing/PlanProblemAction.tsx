'use client';

import { Badge } from '@plp/ui';
import Link from 'next/link';
import { useUpgradeHref } from './plan-context';
import { type PlanProblem, planProblemOf } from './plan-problem';
import styles from './PlanProblemAction.module.css';

/**
 * The words of the way to board 28 for a plan problem: a read-only workspace is opened by paying,
 * not by upgrading, so it says what to open (ADR-035).
 */
export function planActionLabel(kind: PlanProblem['kind']): string {
  return kind === 'read_only' ? 'Xem gói & thanh toán' : 'Nâng cấp';
}

export interface PlanMarkProps {
  /** The link's words; the plan problem's own by default. */
  label: string;
  /** For a screen outside the shell, which has no plan frame. */
  workspaceId?: string | undefined;
}

/**
 * "Theo gói" beside a limit of the plan, not a missing permission, and the link to board 28 for
 * who may open it; the others are told who can.
 */
export function PlanMark({ label, workspaceId }: PlanMarkProps) {
  const href = useUpgradeHref(workspaceId);
  return (
    <span className={styles.action}>
      <Badge tone="primary" size="sm">
        Theo gói
      </Badge>
      {href === null ? (
        <span className={styles.hint}>Chủ sở hữu workspace nâng cấp được.</span>
      ) : (
        <Link href={href} className={styles.link}>
          {label}
        </Link>
      )}
    </span>
  );
}

export interface PlanProblemActionProps {
  error: unknown;
  /** For a screen outside the shell, which has no plan frame. */
  workspaceId?: string | undefined;
}

/**
 * What follows a 402 message of ADR-035: "Theo gói" marks it as the plan's limit, not a missing
 * permission, and "Nâng cấp" opens board 28 for who may. Nothing for any other error.
 */
export function PlanProblemAction({ error, workspaceId }: PlanProblemActionProps) {
  const problem = planProblemOf(error);
  if (problem === null) {
    return null;
  }
  return <PlanMark label={planActionLabel(problem.kind)} workspaceId={workspaceId} />;
}
