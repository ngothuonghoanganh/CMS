export const urls = {
  admin: 'http://localhost:3100',
  api: 'http://localhost:4100',
  renderer: 'http://localhost:3101',
  /** A second renderer whose API never answers (playwright.config.ts): its 503 (ADR-009). */
  rendererWithoutApi: 'http://localhost:3102',
} as const;

/**
 * Public origin of a site's default domain on a local renderer (`BASE_DOMAIN=localhost:3101`).
 * Chromium, WebKit, Firefox and Node resolve every `*.localhost` name to the loopback address.
 */
export function siteOrigin(subdomain: string, renderer: string = urls.renderer): string {
  const { port } = new URL(renderer);
  return `http://${subdomain}.localhost:${port}`;
}
