export const urls = {
  admin: 'http://localhost:3100',
  api: 'http://localhost:4100',
  renderer: 'http://localhost:3101',
} as const;

/**
 * Public origin of a site's default domain on the local renderer (`BASE_DOMAIN=localhost:3101`).
 * Chromium and Node resolve every `*.localhost` name to the loopback address.
 */
export function siteOrigin(subdomain: string): string {
  return `http://${subdomain}.localhost:3101`;
}
