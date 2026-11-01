import type { Access } from '@plp/contracts';
import type { ObjectId } from '../../shared/persistence/object-id.js';

declare const scopeBrand: unique symbol;

/**
 * Proof that a user is a member of a workspace. Only AccessService creates it; repositories of
 * tenant data require it and add `workspaceId` to every query (ADR-003).
 */
export interface WorkspaceScope {
  readonly [scopeBrand]: true;
  readonly workspaceId: ObjectId;
  readonly userId: ObjectId;
  /** The member's system role, or their custom role with its permissions now (ADR-024). */
  readonly access: Access;
  /** Sites the member may open; null is the whole workspace (ADR-020). */
  readonly siteIds: readonly ObjectId[] | null;
}
