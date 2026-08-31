import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AnalyticsTracker } from '../analytics-client';
import { renderPage } from '../renderer';
import { getPublicPageByPath, getPublicPageForHostnamePath } from '../lib/page-api';
import { getRequestHostname, isPlatformHostname } from '../lib/host';
import { publicPageMetadata } from '../lib/seo';

type PublicRouteProps = { params: Promise<{ segments?: string[] }> };

function routePath(segments: string[]): string {
  return segments.length ? `/${segments.join('/')}` : '/';
}

async function resolveRoute(segments: string[]) {
  const hostname = await getRequestHostname();
  if (hostname && !isPlatformHostname(hostname)) {
    return {
      page: await getPublicPageForHostnamePath(hostname, routePath(segments)),
      pagePath: routePath(segments),
      siteSlug: undefined,
      customDomain: true,
    };
  }

  const siteSlug = segments[0];
  if (!siteSlug)
    return { page: null, pagePath: '/', siteSlug: undefined, customDomain: false };
  const pagePath = routePath(segments.slice(1));
  return {
    page: await getPublicPageByPath(siteSlug, pagePath),
    pagePath,
    siteSlug,
    customDomain: false,
  };
}

export async function generateMetadata({ params }: PublicRouteProps): Promise<Metadata> {
  const { segments = [] } = await params;
  const resolved = await resolveRoute(segments);
  if (!resolved.page) {
    return { robots: { index: false, follow: false }, title: 'Page not found' };
  }
  const fallbackPath = resolved.customDomain
    ? resolved.pagePath
    : `/${resolved.siteSlug}${resolved.pagePath === '/' ? '' : resolved.pagePath}`;
  return publicPageMetadata(resolved.page, { fallbackPath });
}

export default async function PublicRoute({ params }: PublicRouteProps) {
  const { segments = [] } = await params;
  const resolved = await resolveRoute(segments);
  if (!resolved.page) {
    if (segments.length) notFound();
    return (
      <main className="shell">
        <div className="eyebrow">renderer foundation</div>
        <h1>Public renderer shell</h1>
        <p>Published sites resolve their homepage at the site root.</p>
        <div className="status" role="status">
          Contract version: v1
        </div>
      </main>
    );
  }

  const siteSlug = resolved.page.site.slug;
  return (
    <div
      className="public-page"
      data-page-path={resolved.pagePath}
      data-site-slug={siteSlug}
    >
      <AnalyticsTracker
        pagePath={resolved.pagePath}
        siteSlug={siteSlug}
        {...(resolved.page.tenantSlug ? { tenantSlug: resolved.page.tenantSlug } : {})}
      />
      {renderPage(resolved.page.payload, {
        pagePath: resolved.pagePath,
        siteSlug,
        siteName: resolved.page.site.name,
        ...(resolved.page.site.logo ? { siteLogo: resolved.page.site.logo } : {}),
        customDomain: resolved.customDomain,
        navigation: resolved.page.navigation,
        globals: resolved.page.globals,
        reusables: resolved.page.reusables,
        designSystem: resolved.page.designSystem,
        ...(resolved.page.tenantSlug ? { tenantSlug: resolved.page.tenantSlug } : {}),
        ...(resolved.page.extensions
          ? {
              runtimeIds: resolved.page.extensions.flatMap(
                (extension) => extension.runtimeIds,
              ),
              extensions: resolved.page.extensions,
            }
          : {}),
      })}
    </div>
  );
}
