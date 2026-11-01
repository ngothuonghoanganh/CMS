/** The admin's common address in the workspace-address run (ADR-025). */
export const COMMON_ORIGIN = 'http://app.e2e.test:3100';

/** Where each workspace opens in that run. */
export const WORKSPACE_ORIGIN_TEMPLATE = 'http://{slug}.app.e2e.test:3100';

export function workspaceAt(slug: string): string {
  return WORKSPACE_ORIGIN_TEMPLATE.replace('{slug}', slug);
}

/** The slug of the workspace address a page is at. */
export function slugOf(url: string): string {
  const host = new URL(url).hostname;
  const slug = host.endsWith('.app.e2e.test') ? host.slice(0, -'.app.e2e.test'.length) : '';
  if (slug === '') {
    throw new Error(`${url} is not a workspace address`);
  }
  return slug;
}
