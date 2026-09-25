import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getPreviewPage } from '../../lib/page-api';
import { publicPageMetadata } from '../../lib/seo';
import { PreviewBridge } from './preview-bridge';
import { PreviewUnavailable } from './preview-unavailable';

type PreviewPageProps = {
  params: Promise<{ pageId: string }>;
  searchParams?: Promise<{ entryId?: string; versionNumber?: string }>;
};

async function resolvePage(
  params: PreviewPageProps['params'],
  searchParams?: PreviewPageProps['searchParams'],
) {
  const { pageId } = await params;
  const query = searchParams ? await searchParams : {};
  const entryId = query.entryId;
  const versionNumber = query.versionNumber ? Number(query.versionNumber) : undefined;
  const page = await getPreviewPage(
    pageId,
    entryId,
    versionNumber && Number.isInteger(versionNumber) ? versionNumber : undefined,
  );
  if (!page.page && page.reason === 'not-found') {
    notFound();
  }
  return page;
}

export async function generateMetadata({
  params,
  searchParams,
}: PreviewPageProps): Promise<Metadata> {
  const { pageId } = await params;
  const query = searchParams ? await searchParams : {};
  const entryId = query.entryId;
  const versionNumber = query.versionNumber ? Number(query.versionNumber) : undefined;
  const page = await getPreviewPage(
    pageId,
    entryId,
    versionNumber && Number.isInteger(versionNumber) ? versionNumber : undefined,
  );
  if (!page.page) {
    return { robots: { index: false, follow: false }, title: 'Preview unavailable' };
  }
  return {
    ...publicPageMetadata(page.page, { preview: true }),
    title: `Preview — ${page.page.payload.metadata.documentTitle}`,
  };
}

export default async function PreviewPage({ params, searchParams }: PreviewPageProps) {
  const resolved = await resolvePage(params, searchParams);
  if (!resolved.page) {
    return <PreviewUnavailable reason={resolved.reason} />;
  }
  const page = resolved.page;
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
