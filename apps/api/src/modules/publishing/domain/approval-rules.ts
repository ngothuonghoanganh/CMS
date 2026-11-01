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
 * until the page is published again after it (drafts only grow, so that publish is at least as
 * new as what was refused). Published and withdrawn requests, and refusals a later publish
 * answered, show nothing, even after that release is unpublished or rolled back. A release from
 * before the refusal answers nothing, even of the same draft (a page rolled back, then asked for
 * again). Release counts, not clocks: two API instances may disagree on the time.
 */
export function visibleApproval(
  latest: Pick<ApprovalRecord, 'status' | 'releaseSeq'> | null,
  pageReleaseSeq: number,
): boolean {
  if (latest === null) {
    return false;
  }
  switch (latest.status) {
    case 'pending':
      return true;
    case 'rejected':
      return (latest.releaseSeq ?? null) === null || pageReleaseSeq <= (latest.releaseSeq ?? 0);
    case 'published':
    case 'withdrawn':
      return false;
  }
}
