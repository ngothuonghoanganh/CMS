import type { Tx } from './transaction.js';

/**
 * The comment every deletion of a page or a site carries (ADR-027). Releases and consent versions
 * are immutable (ADR-005, ADR-017): their schemas refuse any update, and any delete without this
 * comment, so nothing but those deletions removes one.
 */
export const ERASURE_COMMENT = 'erasure (ADR-027)';

/** Options of a delete that is part of a page or site deletion, in its transaction when given. */
export function erasureOptions(tx?: Tx): { comment: string; session?: Tx } {
  return tx === undefined
    ? { comment: ERASURE_COMMENT }
    : { comment: ERASURE_COMMENT, session: tx };
}

/** Whether a query is one of those deletions; the guards of immutable collections check it. */
export function isErasure(query: { getOptions(): { comment?: unknown } }): boolean {
  return query.getOptions().comment === ERASURE_COMMENT;
}
