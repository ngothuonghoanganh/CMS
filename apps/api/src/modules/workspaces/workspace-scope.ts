import type { Role } from '@plp/contracts';
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
  readonly role: Role;
}
