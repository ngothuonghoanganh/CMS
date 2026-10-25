import type { LeadRecipient } from '@plp/contracts';
import type { LeadRecipientRecord } from '../sites/site.schema.js';
import { recipientStatus } from './domain/notification-rules.js';

export function toLeadRecipientDto(recipient: LeadRecipientRecord, now: Date): LeadRecipient {
  return {
    id: recipient._id.toHexString(),
    email: recipient.email,
    status: recipientStatus(recipient, now),
    invitedAt: recipient.invitedAt?.toISOString() ?? null,
    confirmedAt: recipient.confirmedAt?.toISOString() ?? null,
  };
}
