import { createHash, randomBytes } from 'node:crypto';
import { RESET_LINK_VALID_MINUTES, SIGNUP_LINK_VALID_HOURS } from '@plp/contracts';

/**
 * The secret of a sign-up or password reset link (ADR-026), and what the database keeps of it:
 * 32 random bytes, stored as sha256 only, like invitation links (ADR-021).
 */
export function newLinkToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashLinkToken(token) };
}

export function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** When a sign-up link sent at `now` stops working. */
export function signupLinkExpiry(now: Date): Date {
  return new Date(now.getTime() + SIGNUP_LINK_VALID_HOURS * 3_600_000);
}

/** When a password reset link sent at `now` stops working. */
export function resetLinkExpiry(now: Date): Date {
  return new Date(now.getTime() + RESET_LINK_VALID_MINUTES * 60_000);
}

/** `{origin}{path}#token=…`: the secret stays in the fragment, which no server or log receives. */
export function accountLink(origin: string, path: string, token: string): string {
  return `${origin}${path}#token=${token}`;
}
