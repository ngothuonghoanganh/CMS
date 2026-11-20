import { type ObjectId, toObjectId } from '../../../shared/persistence/object-id.js';

/*
 * What the API gives the payment gateway as `reference` and the gateway echoes back in its events
 * (ADR-035): the only input the webhook routes by. A charge's reference is its invoice's id; a
 * card's setup names the workspace and the member who started it.
 */

const METHOD_SETUP = /^ws_([a-f0-9]{24})_by_([a-f0-9]{24})$/;
const INVOICE = /^[a-f0-9]{24}$/;

/** The reference of a card setup: the workspace that gets the card, and who added it. */
export function methodSetupReference(workspaceId: ObjectId, userId: ObjectId): string {
  return `ws_${workspaceId.toHexString()}_by_${userId.toHexString()}`;
}

export function parseMethodSetupReference(
  reference: string,
): { workspaceId: ObjectId; userId: ObjectId } | null {
  const match = METHOD_SETUP.exec(reference);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  return { workspaceId: toObjectId(match[1]), userId: toObjectId(match[2]) };
}

/** The invoice a charge or transfer reference names; null when it names none. */
export function parseInvoiceReference(reference: string): ObjectId | null {
  return INVOICE.test(reference) ? toObjectId(reference) : null;
}
