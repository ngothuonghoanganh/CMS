import type { PageStatus } from '@plp/contracts';
import { diffSnapshots } from './diff-snapshots.js';
import type { PageSnapshot } from './snapshot.js';

export interface PageStatusInput {
  /** Releases ever created for the page (`releaseSeq`). */
  releaseCount: number;
  /** The release the live pointer designates, or null when nothing is live. */
  liveRelease: (PageSnapshot & { sourceRevision: number }) | null;
  draft: PageSnapshot & { revision: number };
}

/**
 * Business rule 2: the page status is derived, never stored.
 * - `draft`: no release yet;
 * - `unpublished`: releases exist but the pointer is null;
 * - `live`: the draft revision is the one the live release was made from;
 * - `live_with_changes`: the revisions differ; the changes are the diff from the live release.
 */
export function derivePageStatus(input: PageStatusInput): PageStatus {
  const { liveRelease, draft } = input;
  if (liveRelease === null) {
    return {
      kind: input.releaseCount === 0 ? 'draft' : 'unpublished',
      changeCount: 0,
      changes: [],
    };
  }
  if (draft.revision === liveRelease.sourceRevision) {
    return { kind: 'live', changeCount: 0, changes: [] };
  }
  const changes = diffSnapshots(liveRelease, draft);
  return { kind: 'live_with_changes', changeCount: changes.length, changes };
}
