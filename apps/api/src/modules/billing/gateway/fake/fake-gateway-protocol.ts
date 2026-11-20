import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { GatewayEvent } from '@plp/contracts';

/*
 * The wire protocol of the fake payment gateway (`PAYMENT_PROVIDER=fake`, ADR-035): its test
 * cards and their tokens, how its webhooks are signed, and the signed session its card page
 * reads. Signed like a real gateway, so the webhook is tested as it will run. A card number only
 * passes through `fakeCardTokenFor`: it is never stored, logged or sent anywhere.
 */

/** Where the API serves the fake gateway's pages (through the admin's `/api` proxy). */
export const FAKE_GATEWAY_PATH = '/public/billing/fake-gateway';

/** `t={unix seconds},v1={hex HMAC-SHA256 of "{t}.{raw body}"}`. */
export const FAKE_SIGNATURE_HEADER = 'x-plp-fake-signature';

/** A webhook signed longer ago (or later) than this is refused, so a captured one cannot replay. */
export const FAKE_SIGNATURE_TOLERANCE_SECONDS = 300;

/** How long the card page of one setup stays open. */
export const FAKE_SETUP_SESSION_SECONDS = 30 * 60;

/** What a test card does when it is charged: the card number decides (ADR-035). */
export type FakeCardBehaviour = 'succeeds' | 'card_declined' | 'insufficient_funds';

export const FAKE_TEST_CARDS: Readonly<
  Record<string, { brand: string; behaviour: FakeCardBehaviour }>
> = {
  '4242424242424242': { brand: 'visa', behaviour: 'succeeds' },
  '4000000000000002': { brand: 'visa', behaviour: 'card_declined' },
  '4000000000009995': { brand: 'visa', behaviour: 'insufficient_funds' },
};

const TOKEN = /^tok_fake_(succeeds|card_declined|insufficient_funds)_[a-f0-9]{16}$/;

/**
 * The token the fake gateway keeps for a test card: its behaviour and a random part, never the
 * number. Null for any other number ("Dùng một thẻ thử").
 */
export function fakeCardTokenFor(
  cardNumber: string,
): { token: string; brand: string; last4: string } | null {
  const digits = cardNumber.replace(/[\s-]/g, '');
  const card = FAKE_TEST_CARDS[digits];
  if (card === undefined) {
    return null;
  }
  return {
    token: `tok_fake_${card.behaviour}_${randomBytes(8).toString('hex')}`,
    brand: card.brand,
    last4: digits.slice(-4),
  };
}

/** What charging a token does; null for a token the fake gateway never gave. */
export function behaviourOfFakeToken(token: string): FakeCardBehaviour | null {
  const behaviour = TOKEN.exec(token)?.[1];
  return behaviour === undefined ? null : (behaviour as FakeCardBehaviour);
}

function hmacHex(secret: string, purpose: string, payload: string): string {
  return createHmac('sha256', secret).update(`${purpose}:${payload}`).digest('hex');
}

function sameHex(expected: string, actual: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(actual)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
}

/** The signature header of a webhook body sent at `nowSeconds`. */
export function signFakeWebhook(secret: string, rawBody: string, nowSeconds: number): string {
  return `t=${nowSeconds},v1=${hmacHex(secret, 'webhook', `${nowSeconds}.${rawBody}`)}`;
}

export type FakeSignatureCheck =
  { ok: true } | { ok: false; reason: 'missing' | 'malformed' | 'stale' | 'mismatch' };

/**
 * Accepts a body signed with `secret` within `FAKE_SIGNATURE_TOLERANCE_SECONDS` of `nowSeconds`.
 * The comparison takes the same time whatever the signature.
 */
export function verifyFakeWebhook(
  secret: string,
  rawBody: Buffer,
  header: string | undefined,
  nowSeconds: number,
): FakeSignatureCheck {
  if (header === undefined) {
    return { ok: false, reason: 'missing' };
  }
  const match = /^t=(\d{1,12}),v1=([0-9a-f]+)$/.exec(header);
  if (!match?.[1] || !match[2]) {
    return { ok: false, reason: 'malformed' };
  }
  const timestamp = Number(match[1]);
  if (Math.abs(nowSeconds - timestamp) > FAKE_SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'stale' };
  }
  const expected = hmacHex(secret, 'webhook', `${match[1]}.${rawBody.toString('utf8')}`);
  return sameHex(expected, match[2]) ? { ok: true } : { ok: false, reason: 'mismatch' };
}

/** The request the fake gateway posts to `POST /public/billing/webhooks/fake` for an event. */
export function fakeWebhookRequest(
  secret: string,
  event: GatewayEvent,
  nowMs: number = Date.now(),
): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify(event);
  return {
    body,
    headers: {
      'content-type': 'application/json',
      [FAKE_SIGNATURE_HEADER]: signFakeWebhook(secret, body, Math.floor(nowMs / 1000)),
    },
  };
}

/** What the card page of one setup needs; signed, so the browser cannot change it. */
export interface FakeSetupSession {
  /** Echoed back in `method_saved`. */
  reference: string;
  returnUrl: string;
  cancelUrl: string;
  /** Unix seconds. */
  expiresAt: number;
}

function isSetupSession(value: unknown): value is FakeSetupSession {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const fields = value as Record<string, unknown>;
  return (
    typeof fields['reference'] === 'string' &&
    typeof fields['returnUrl'] === 'string' &&
    typeof fields['cancelUrl'] === 'string' &&
    typeof fields['expiresAt'] === 'number'
  );
}

/** `{base64url JSON}.{hex HMAC}`: the `session` query parameter of the card page. */
export function mintFakeSetupSession(secret: string, session: FakeSetupSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${payload}.${hmacHex(secret, 'setup', payload)}`;
}

/** The session a card page was opened with; null when it was changed or has expired. */
export function readFakeSetupSession(
  secret: string,
  token: string,
  nowSeconds: number,
): FakeSetupSession | null {
  const [payload, signature, ...rest] = token.split('.');
  if (payload === undefined || signature === undefined || rest.length > 0) {
    return null;
  }
  if (!sameHex(hmacHex(secret, 'setup', payload), signature)) {
    return null;
  }
  let session: unknown;
  try {
    session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (error) {
    // Signed by this secret, so only a bug writes a payload that is not JSON.
    throw new Error('A fake setup session signed by this gateway is not JSON', { cause: error });
  }
  if (!isSetupSession(session) || session.expiresAt <= nowSeconds) {
    return null;
  }
  return session;
}
