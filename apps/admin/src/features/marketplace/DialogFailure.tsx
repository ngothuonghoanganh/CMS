'use client';

import { Callout } from '@plp/ui';
import { planProblemOf } from '../billing/plan-problem';
import { PlanProblemAction } from '../billing/PlanProblemAction';
import { problemMessage } from '../shell/problem-message';

export interface DialogFailureProps {
  /** The failed request's error; nothing shows while it is null. */
  error: unknown;
  workspaceId: string;
}

/**
 * Why "Nhận mẫu" or "Cập nhật mẫu" failed, inside its dialog. A 402 of the plan, such as a
 * read-only workspace, is a warning with "Theo gói" and the way to board 28, never read as a missing
 * permission (ADR-035); anything else is an error.
 */
export function DialogFailure({ error, workspaceId }: DialogFailureProps) {
  if (error === null) {
    return null;
  }
  return (
    <Callout tone={planProblemOf(error) === null ? 'danger' : 'warning'} role="alert">
      {problemMessage(error)}
      <PlanProblemAction error={error} workspaceId={workspaceId} />
    </Callout>
  );
}
