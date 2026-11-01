import type { ApprovalRecord } from '../approval.schema.js';

/** Requests one member may send in a workspace in 24 hours, resending included (ADR-023). */
export const APPROVALS_PER_DAY = 20;

const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/** A closed request is deleted 30 days after it closed. */
export function approvalPurgeAt(closedAt: Date): Date {
  return new Date(closedAt.getTime() + PURGE_AFTER_MS);
}

/**
 * What `PageSummary.approval` shows from the page's latest request: a pending one, or a refusal
 * until a draft at least as new as the refused one goes live. Published and withdrawn requests,
 * and refusals a later publish answered, show nothing.
 */
export function visibleApproval(
  latest: Pick<ApprovalRecord, 'status' | 'revision'> | null,
  liveSourceRevision: number | null,
): boolean {
  if (latest === null) {
    return false;
  }
  switch (latest.status) {
    case 'pending':
      return true;
    case 'rejected':
      return liveSourceRevision === null || liveSourceRevision < latest.revision;
    case 'published':
    case 'withdrawn':
      return false;
  }
}
