import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getPreviewPage } from '../../lib/page-api';
import { publicPageMetadata } from '../../lib/seo';
import { PreviewBridge } from './preview-bridge';

type PreviewPageProps = {
  params: Promise<{ pageId: string }>;
  searchParams?: Promise<{ entryId?: string }>;
};

async function resolvePage(
  params: PreviewPageProps['params'],
  searchParams?: PreviewPageProps['searchParams'],
) {
  const { pageId } = await params;
  const entryId = searchParams ? (await searchParams).entryId : undefined;
  const page = await getPreviewPage(pageId, entryId);
  if (!page) {
    notFound();
  }
  return page;
}

export async function generateMetadata({
  params,
  searchParams,
}: PreviewPageProps): Promise<Metadata> {
  const { pageId } = await params;
  const entryId = searchParams ? (await searchParams).entryId : undefined;
  const page = await getPreviewPage(pageId, entryId);
  if (!page) {
    return { robots: { index: false, follow: false }, title: 'Preview unavailable' };
  }
  return {
    ...publicPageMetadata(page, { preview: true }),
    title: `Preview — ${page.payload.metadata.documentTitle}`,
  };
}

export default async function PreviewPage({ params, searchParams }: PreviewPageProps) {
  const page = await resolvePage(params, searchParams);
  return (
    <div className="preview-page" data-page-slug={page.page.slug}>
      <div className="preview-banner">Draft preview</div>
      <PreviewBridge
        initialPayload={page.payload}
        extensions={page.extensions}
        siteSlug={page.site.slug}
        siteName={page.site.name}
        siteLogo={page.site.logo}
        pageSlug={page.page.slug}
        tenantSlug={page.tenantSlug}
        reusables={page.reusables}
        designSystem={page.designSystem}
        globals={page.globals}
        layout={page.layout}
        navigation={page.navigation}
        bindings={page.bindings}
        dataContext={page.dataContext}
      />
    </div>
  );
}
