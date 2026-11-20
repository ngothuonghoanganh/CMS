'use client';

import { Badge } from '@plp/ui';
import Link from 'next/link';
import { useUpgradeHref } from './plan-context';
import { planProblemOf } from './plan-problem';
import styles from './PlanProblemAction.module.css';

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
  const href = useUpgradeHref(workspaceId);
  const problem = planProblemOf(error);
  if (problem === null) {
    return null;
  }
  return (
    <span className={styles.action}>
      <Badge tone="primary" size="sm">
        Theo gói
      </Badge>
      {href === null ? (
        <span className={styles.hint}>Chủ sở hữu workspace nâng cấp được.</span>
      ) : (
        <Link href={href} className={styles.link}>
          {problem.kind === 'read_only' ? 'Xem gói & thanh toán' : 'Nâng cấp'}
        </Link>
      )}
    </span>
  );
}
