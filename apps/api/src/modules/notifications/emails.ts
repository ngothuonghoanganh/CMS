import { formatLeadPhone, leadSourceLabel, vnDateTimeOf } from '@plp/contracts';

/*
 * The emails the API sends, as the templates of plp-mailer (`templates/emails/<template>`) with the
 * data their `schema.json` describes (ADR-029). Every value is ready to show: SMTP renders the data
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

export interface SignupConfirmationData {
  workspaceName: string;
  confirmUrl: string;
  validHours: number;
}

export interface AccountExistsData {
  loginUrl: string;
  forgotUrl: string;
}

export interface PasswordResetData {
  resetUrl: string;
  validMinutes: number;
}

/** The data of the three emails about a custom domain (ADR-022). */
export interface DomainEmailData {
  hostname: string;
  siteName: string;
  /** "Tên miền" of the site in the admin. */
  domainsUrl: string;
}

export interface ApprovalRequestData {
  requesterName: string;
  pageTitle: string;
  siteName: string;
  /** null when the sender left no note. */
  note: string | null;
  /** True when the sender asks again for a newer draft. */
  resent: boolean;
  /** The page in the editor; publishing still checks the approver's role. */
  pageUrl: string;
}

export interface ApprovalPublishedData {
  pageTitle: string;
  publisherName: string;
  /** The publisher decides requests: they approved it. A Biên tập only published it. */
  approved: boolean;
  version: number;
  liveUrl: string;
}

export interface ApprovalRejectedData {
  pageTitle: string;
  rejecterName: string;
  reason: string;
  pageUrl: string;
}

export type Email =
  | { template: 'lead-notification'; data: LeadNotificationData }
  | { template: 'recipient-confirmation'; data: RecipientConfirmationData }
  | { template: 'member-invitation'; data: MemberInvitationData }
  | { template: 'access-request'; data: AccessRequestData }
  | { template: 'access-decision'; data: AccessDecisionData }
  | { template: 'signup-confirmation'; data: SignupConfirmationData }
  | { template: 'account-exists'; data: AccountExistsData }
  | { template: 'password-reset'; data: PasswordResetData }
  | { template: 'domain-active'; data: DomainEmailData }
  | { template: 'domain-lost'; data: DomainEmailData }
  | { template: 'domain-moved'; data: DomainEmailData }
  | { template: 'approval-request'; data: ApprovalRequestData }
  | { template: 'approval-published'; data: ApprovalPublishedData }
  | { template: 'approval-rejected'; data: ApprovalRejectedData };

export type EmailTemplate = Email['template'];

/**
 * An email with the key plp-mailer sends it once by. The key stays the same across the API's
 * retries of that email and never holds personal data, a token or a token's hash: a record id, and
 * the time of the link or event when one record sends more than one email.
 */
export type KeyedEmail = Email & { idempotencyKey: string };

/** A time in a key: milliseconds, so two links of one record never share a key. */
function keyTime(at: Date): number {
  return at.getTime();
}

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
    idempotencyKey: `recipient-confirmation:${recipientId}:${keyTime(linkExpiresAt)}`,
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
    idempotencyKey: `member-invitation:${invitationId}:${keyTime(linkExpiresAt)}`,
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

export interface SignupConfirmationEmailInput extends SignupConfirmationData {
  /** The waiting sign-up; signing up again replaces its link. */
  signupId: string;
  linkExpiresAt: Date;
}

/**
 * The link that confirms a sign-up's email (ADR-026); its page sets the password, and the account
 * and its workspace exist once it is used. The address may be someone else's, so the email says
 * how to ignore it.
 */
export function signupConfirmationEmail(input: SignupConfirmationEmailInput): KeyedEmail {
  const { signupId, linkExpiresAt, ...data } = input;
  return {
    template: 'signup-confirmation',
    idempotencyKey: `signup-confirmation:${signupId}:${keyTime(linkExpiresAt)}`,
    data,
  };
}

export interface AccountExistsEmailInput extends AccountExistsData {
  userId: string;
  /** When the sign-up asked: each sign-up of the email gets its own email. */
  requestedAt: Date;
}

/**
 * Sent instead of a confirmation when the email signing up has an account already (ADR-026): the
 * sign-up answers the same either way, so only the mailbox learns the account exists.
 */
export function accountExistsEmail(input: AccountExistsEmailInput): KeyedEmail {
  const { userId, requestedAt, ...data } = input;
  return {
    template: 'account-exists',
    idempotencyKey: `account-exists:${userId}:${keyTime(requestedAt)}`,
    data,
  };
}

export interface PasswordResetEmailInput extends PasswordResetData {
  userId: string;
  /** Each request replaces the user's link: a new link is a new email. */
  linkExpiresAt: Date;
}

/** The link that sets a new password (ADR-026); using it signs out every device. */
export function passwordResetEmail(input: PasswordResetEmailInput): KeyedEmail {
  const { userId, linkExpiresAt, ...data } = input;
  return {
    template: 'password-reset',
    idempotencyKey: `password-reset:${userId}:${keyTime(linkExpiresAt)}`,
    data,
  };
}

export interface DomainEmailInput extends DomainEmailData {
  domainId: string;
}

/**
 * The domain serves the site's pages (ADR-022). Once per domain: `activeSince` is set once and
 * never cleared.
 */
export function domainActiveEmail(input: DomainEmailInput): KeyedEmail {
  const { domainId, ...data } = input;
  return { template: 'domain-active', idempotencyKey: `domain-active:${domainId}`, data };
}

/**
 * The domain no longer points here; visitors following it get an error (ADR-022). A domain can be
 * lost again after it came back: each `lostSince` is its own email.
 */
export function domainLostEmail(input: DomainEmailInput & { lostSince: Date }): KeyedEmail {
  const { domainId, lostSince, ...data } = input;
  return {
    template: 'domain-lost',
    idempotencyKey: `domain-lost:${domainId}:${keyTime(lostSince)}`,
    data,
  };
}

/**
 * Its owner proved the domain is theirs from another site, which now has it (ADR-022). The record
 * that lost it is removed, so this happens once per record.
 */
export function domainMovedEmail(input: DomainEmailInput): KeyedEmail {
  const { domainId, ...data } = input;
  return { template: 'domain-moved', idempotencyKey: `domain-moved:${domainId}`, data };
}

export interface ApprovalRequestEmailInput extends Omit<ApprovalRequestData, 'note'> {
  approvalId: string;
  /** When it was sent: "Gửi lại yêu cầu" moves it, and is a new email. */
  sentAt: Date;
  /** Empty when the sender left none. */
  note: string;
}

/** Tells Chủ sở hữu and Quản trị a page waits for their approval (ADR-023). */
export function approvalRequestEmail(input: ApprovalRequestEmailInput): KeyedEmail {
  const { approvalId, sentAt, note, ...data } = input;
  return {
    template: 'approval-request',
    idempotencyKey: `approval-request:${approvalId}:${keyTime(sentAt)}`,
    data: { ...data, note: note === '' ? null : note },
  };
}

/** Tells the sender their page went live (ADR-023); a request is published once. */
export function approvalPublishedEmail(
  input: ApprovalPublishedData & { approvalId: string },
): KeyedEmail {
  const { approvalId, ...data } = input;
  return {
    template: 'approval-published',
    idempotencyKey: `approval-published:${approvalId}`,
    data,
  };
}

/** Tells the sender why their page was not published (ADR-023); a request is refused once. */
export function approvalRejectedEmail(
  input: ApprovalRejectedData & { approvalId: string },
): KeyedEmail {
  const { approvalId, ...data } = input;
  return {
    template: 'approval-rejected',
    idempotencyKey: `approval-rejected:${approvalId}`,
    data,
  };
}
