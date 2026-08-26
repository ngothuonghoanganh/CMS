import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { renderPage } from '../../renderer';
import { getPreviewPage } from '../../lib/page-api';
import { publicPageMetadata } from '../../lib/seo';

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
      {renderPage(page.payload, {
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
