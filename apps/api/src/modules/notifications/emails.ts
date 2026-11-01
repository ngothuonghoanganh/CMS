import { formatLeadPhone, leadSourceLabel, vnDateTimeOf } from '@plp/contracts';

/*
 * The emails the API sends, as the templates of plp-mailer (`templates/emails/<template>`) with the
 * data their `schema.json` describes (ADR-023). Every value is ready to show: SMTP renders the data
 * here (`email-templates.ts`), plp-mailer renders the same data with its own templates.
 */

export interface LeadNotificationData {
  siteName: string;
  pageTitle: string;
  releaseVersion: number;
  lead: {
    name: string;
    /** As written in Vietnam, e.g. "0901 234 567". */
    phone: string;
    email: string | null;
    message: string | null;
    /** The source label with its campaign, e.g. "facebook / cpc / uu-dai-t11". */
    source: string;
    /** Vietnam time, e.g. "2026-10-24 16:42:07". */
    createdAt: string;
  };
  leadUrl: string;
}

export interface RecipientConfirmationData {
  siteName: string;
  /** Who added the address, as the admin shows their name. */
  invitedBy: string;
  confirmUrl: string;
  validDays: number;
}

export interface MemberInvitationData {
  workspaceName: string;
  invitedBy: string;
  roleLabel: string;
  /** "toàn workspace" or the sites, e.g. "site Nha khoa Smile Care". */
  scope: string;
  acceptUrl: string;
  validDays: number;
}

export interface AccessRequestData {
  workspaceName: string;
  requesterName: string;
  requesterEmail: string;
  currentRole: string;
  requestedRole: string;
  /** "toàn workspace" or "các site hiện tại". */
  scope: string;
  /** null when the requester left no note. */
  note: string | null;
  reviewUrl: string;
}

/** How Chủ sở hữu decided; the role and sites decided come only with an accepted request. */
export type AccessDecision =
  { accepted: true; roleLabel: string; scope: string } | { accepted: false };

export type AccessDecisionData = { workspaceName: string; openUrl: string } & AccessDecision;

export type Email =
  | { template: 'lead-notification'; data: LeadNotificationData }
  | { template: 'recipient-confirmation'; data: RecipientConfirmationData }
  | { template: 'member-invitation'; data: MemberInvitationData }
  | { template: 'access-request'; data: AccessRequestData }
  | { template: 'access-decision'; data: AccessDecisionData };

export type EmailTemplate = Email['template'];

/**
 * An email with the key plp-mailer sends it once by. The key stays the same across the API's
 * retries of that email and never holds personal data or a token's hash.
 */
export type KeyedEmail = Email & { idempotencyKey: string };

export interface LeadEmailInput {
  leadId: string;
  siteName: string;
  pageTitle: string;
  releaseVersion: number;
  lead: {
    name: string;
    phone: string;
    email: string | null;
    message: string | null;
    source: { source: string; medium: string; campaign: string | null };
    createdAt: Date;
  };
  /** The lead in the admin inbox. */
  leadUrl: string;
}

/**
 * The email confirmed addresses get for a new lead (ADR-018). One key per lead, "Gửi lại"
 * included: an attempt that timed out after the queue took it must not become a second email.
 */
export function leadNotificationEmail(input: LeadEmailInput): KeyedEmail {
  const { lead } = input;
  const source = leadSourceLabel(lead.source);
  return {
    template: 'lead-notification',
    idempotencyKey: `lead-notification:${input.leadId}`,
    data: {
      siteName: input.siteName,
      pageTitle: input.pageTitle,
      releaseVersion: input.releaseVersion,
      lead: {
        name: lead.name,
        phone: formatLeadPhone(lead.phone),
        email: lead.email,
        message: lead.message,
        source: lead.source.campaign === null ? source : `${source} / ${lead.source.campaign}`,
        createdAt: vnDateTimeOf(lead.createdAt),
      },
      leadUrl: input.leadUrl,
    },
  };
}

export interface ConfirmationEmailInput extends RecipientConfirmationData {
  recipientId: string;
  /** When the link in this email stops working: a new link is a new email. */
  linkExpiresAt: Date;
}

/** The email that asks an address to confirm before it receives any lead (ADR-018). */
export function recipientConfirmationEmail(input: ConfirmationEmailInput): KeyedEmail {
  const { recipientId, linkExpiresAt, ...data } = input;
  return {
    template: 'recipient-confirmation',
    idempotencyKey: `recipient-confirmation:${recipientId}:${linkExpiresAt.getTime()}`,
    data,
  };
}

export interface MemberInvitationEmailInput extends MemberInvitationData {
  invitationId: string;
  /** When the link in this email stops working: "Gửi lại" gives a new link, so a new email. */
  linkExpiresAt: Date;
}

/** The invitation to join a workspace (board 15b, ADR-021). */
export function memberInvitationEmail(input: MemberInvitationEmailInput): KeyedEmail {
  const { invitationId, linkExpiresAt, ...data } = input;
  return {
    template: 'member-invitation',
    idempotencyKey: `member-invitation:${invitationId}:${linkExpiresAt.getTime()}`,
    data,
  };
}

export interface AccessRequestEmailInput extends Omit<AccessRequestData, 'note'> {
  requestId: string;
  /** Empty when the requester left none. */
  note: string;
}

/** Tells Chủ sở hữu a member asks for another role; the link only opens the request (ADR-021). */
export function accessRequestEmail(input: AccessRequestEmailInput): KeyedEmail {
  const { requestId, note, ...data } = input;
  return {
    template: 'access-request',
    idempotencyKey: `access-request:${requestId}`,
    data: { ...data, note: note === '' ? null : note },
  };
}

export type AccessDecisionEmailInput = AccessDecisionData & { requestId: string };

/** Tells the member how Chủ sở hữu decided their request (ADR-021). */
export function accessDecisionEmail(input: AccessDecisionEmailInput): KeyedEmail {
  const { requestId, ...data } = input;
  return { template: 'access-decision', idempotencyKey: `access-decision:${requestId}`, data };
}
