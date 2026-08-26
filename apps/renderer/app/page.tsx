import type { HealthResponse } from '@payload/contracts';

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AnalyticsTracker } from './analytics-client';
import { getPublicPageForHostname } from './lib/page-api';
import { getRequestHostname, isPlatformHostname } from './lib/host';
import { publicPageMetadata } from './lib/seo';
import { renderPage } from './renderer';

const foundation: Pick<HealthResponse, 'service' | 'version'> = {
  service: 'renderer',
  version: 'v1',
};

export const dynamic = 'force-dynamic';

async function resolveCustomDomainPage() {
  const hostname = await getRequestHostname();
  if (!hostname || isPlatformHostname(hostname)) return null;
  const page = await getPublicPageForHostname(hostname);
  if (!page) notFound();
  return page;
}

export async function generateMetadata(): Promise<Metadata> {
  const hostname = await getRequestHostname();
  if (!hostname || isPlatformHostname(hostname)) {
    return {
      description: 'Public delivery shell for the Payload Landing Page Platform',
      robots: { index: false, follow: false },
      title: 'Payload Landing Page Platform — Renderer',
    };
  }
  const page = await getPublicPageForHostname(hostname);
  if (!page) {
    return { robots: { index: false, follow: false }, title: 'Page not found' };
  }
  return publicPageMetadata(page, { fallbackPath: '/' });
}

export default async function RendererHomePage() {
  const page = await resolveCustomDomainPage();
  if (page) {
    const siteSlug = page.site.slug;
    const pageSlug = page.page.slug ?? '';
    return (
      <div className="public-page" data-page-slug={pageSlug} data-site-slug={siteSlug}>
        <AnalyticsTracker
          pageSlug={pageSlug}
          siteSlug={siteSlug}
          {...(page.tenantSlug ? { tenantSlug: page.tenantSlug } : {})}
        />
        {renderPage(page.payload, {
          pageSlug,
          siteSlug,
          ...(page.tenantSlug ? { tenantSlug: page.tenantSlug } : {}),
          ...(page.extensions
            ? {
                runtimeIds: page.extensions.flatMap((extension) => extension.runtimeIds),
                extensions: page.extensions,
              }
            : {}),
        })}
      </div>
    );
  }

  return (
    <main className="shell">
      <div className="eyebrow">{foundation.service} foundation</div>
      <h1>Public renderer shell</h1>
      <p>
        This independent application renders published PagePayloadV1 snapshots. Public
        pages use the /site-slug/page-slug route, while draft preview stays authenticated.
      </p>
      <div className="status" role="status">
        Contract version: {foundation.version}
      </div>
    </main>
  );
}
