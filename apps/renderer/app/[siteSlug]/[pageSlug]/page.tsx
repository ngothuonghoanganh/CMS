import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { renderPage } from '../../renderer';
import { getPublicPage } from '../../lib/page-api';
import { AnalyticsTracker } from '../../analytics-client';

type PublicPageProps = {
  params: Promise<{ siteSlug: string; pageSlug: string }>;
};

async function resolvePage(params: PublicPageProps['params']) {
  const { siteSlug, pageSlug } = await params;
  const page = await getPublicPage(siteSlug, pageSlug);
  if (!page) {
    notFound();
  }
  return page;
}

export async function generateMetadata({ params }: PublicPageProps): Promise<Metadata> {
  const { siteSlug, pageSlug } = await params;
  const page = await getPublicPage(siteSlug, pageSlug);
  if (!page) {
    return { robots: { index: false, follow: false }, title: 'Page not found' };
  }
  return {
    description: page.payload.metadata.documentDescription,
    title: page.payload.metadata.documentTitle,
  };
}

export default async function PublicPage({ params }: PublicPageProps) {
  const { siteSlug, pageSlug } = await params;
  const page = await resolvePage(params);
  return (
    <div
      className="public-page"
      data-page-slug={page.page.slug}
      data-site-slug={page.site.slug}
    >
      <AnalyticsTracker pageSlug={pageSlug} siteSlug={siteSlug} />
      {renderPage(page.payload, {
        pageSlug: pageSlug,
        siteSlug: siteSlug,
      })}
    </div>
  );
}
