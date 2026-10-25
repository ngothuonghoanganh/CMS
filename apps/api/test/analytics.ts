import { endpoints, type PageView } from '@plp/contracts';
import type { TestApp } from './app.js';
import { rendererPost, type VisitorOptions } from './leads.js';

/** A view of `path` with no campaign and no referrer, unless given. */
export function pageView(path: string, source: Partial<PageView['source']> = {}): PageView {
  return {
    path,
    source: { utmSource: null, utmMedium: null, utmCampaign: null, referrer: null, ...source },
  };
}

/** `POST /public/sites/:subdomain/events` as the renderer relays a page's view (ADR-019). */
export function sendPageView(
  t: TestApp,
  subdomain: string,
  view: PageView,
  options: VisitorOptions = {},
) {
  return rendererPost(t, endpoints.publicRecordPageView.path(subdomain), view, options);
}
