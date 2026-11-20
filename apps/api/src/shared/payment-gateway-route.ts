/**
 * Metadata of the route a payment gateway calls (ADR-035): no session and no Origin, but the
 * gateway's signature over the raw body, which the billing module's guard checks. `OriginGuard`
 * leaves such a route to that guard; the metadata never comes without it.
 */
export const SIGNED_BY_PAYMENT_GATEWAY = 'plp:signedByPaymentGateway';

/** Paths whose body the gateway signs: read raw, never parsed before the signature is checked. */
export const PAYMENT_GATEWAY_WEBHOOK_PREFIX = '/public/billing/webhooks/';
