import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getPreviewPage } from '../../lib/page-api';
import { publicPageMetadata } from '../../lib/seo';
import { PreviewBridge } from './preview-bridge';

type PreviewPageProps = {
  params: Promise<{ pageId: string }>;
};

async function resolvePage(params: PreviewPageProps['params']) {
  const { pageId } = await params;
  const page = await getPreviewPage(pageId);
  if (!page) {
    notFound();
  }
  return page;
}

export async function generateMetadata({ params }: PreviewPageProps): Promise<Metadata> {
  const { pageId } = await params;
  const page = await getPreviewPage(pageId);
  if (!page) {
    return { robots: { index: false, follow: false }, title: 'Preview unavailable' };
  }
  return {
    ...publicPageMetadata(page, { preview: true }),
    title: `Preview — ${page.payload.metadata.documentTitle}`,
  };
}

export default async function PreviewPage({ params }: PreviewPageProps) {
  const page = await resolvePage(params);
  return (
    <div className="preview-page" data-page-slug={page.page.slug}>
      <div className="preview-banner">Draft preview</div>
      <PreviewBridge
        initialPayload={page.payload}
        extensions={page.extensions}
        siteSlug={page.site.slug}
        pageSlug={page.page.slug}
        tenantSlug={page.tenantSlug}
        reusables={page.reusables}
        designSystem={page.designSystem}
      />
    </div>
  );
}
