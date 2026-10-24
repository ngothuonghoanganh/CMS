import type { ObjectId } from '../../shared/persistence/object-id.js';

/** The signed-in user, attached to the request by the session guard. */
export interface AuthenticatedUser {
  id: ObjectId;
  name: string;
  email: string;
}
