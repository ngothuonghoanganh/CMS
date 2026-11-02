const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/**
 * The mailbox an address reaches, for the limits on emails sent to it: "an+moi1@x" and "An@x" are
 * one mailbox, and Gmail ignores dots in the local part, so variants of one address share a limit
 * (invitations, ADR-021; account emails, ADR-026).
 */
export function mailboxOf(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf('@');
  const domain = lower.slice(at + 1);
  const local = lower.slice(0, at).split('+')[0] ?? '';
  return GMAIL_DOMAINS.has(domain)
    ? `${local.replaceAll('.', '')}@gmail.com`
    : `${local}@${domain}`;
}
