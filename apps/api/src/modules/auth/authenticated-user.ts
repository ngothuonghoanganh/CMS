import type { ObjectId } from '../../shared/persistence/object-id.js';

/** The signed-in user of a request, attached to it by the session guard. */
export interface AuthenticatedUser {
  id: ObjectId;
  name: string;
  email: string;
  /**
   * Whether the request may change data: every method but GET, HEAD and OPTIONS. A read-only
   * workspace refuses write permissions to such requests only, so its lists stay open (ADR-035).
   */
  writes: boolean;
}
