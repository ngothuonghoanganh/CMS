/**
 * User agents that are not a person reading the page (ADR-019): crawlers, link previews (Facebook,
 * Zalo, WhatsApp, chat apps), HTTP libraries and headless browsers. In-app browsers of Facebook or
 * Zalo are people and are counted.
 */
const NOT_A_PERSON =
  /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|zalo-?crawler|whatsapp\/|preview|embedly|headless|lighthouse|pagespeed|curl\/|wget\/|python-|httpclient|okhttp|go-http-client|java\/|node-fetch|axios\/|undici|postman|insomnia/i;

/** Phone makers whose names contain "bot" ("CUBOT X30"): left out before looking for bots. */
const DEVICE_MAKERS = /cubot/gi;

/** Whether a view from this user agent is counted; an empty one never is. */
export function isCountableUserAgent(userAgent: string): boolean {
  const text = userAgent.replace(DEVICE_MAKERS, '');
  return text.trim() !== '' && !NOT_A_PERSON.test(text);
}
