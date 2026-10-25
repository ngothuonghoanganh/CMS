import type { PublicPreviewResponse } from '@plp/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { cache } from 'react';
import { PreviewBanner } from '../../../components/PreviewBanner';
import { SitePage } from '../../../components/SitePage';
import { previewMetadata } from '../../../lib/metadata';
import { getPreview } from '../../../lib/public-api';
import { currentSubdomain } from '../../../lib/request-host';
import { isPlausiblePreviewToken } from '../../../lib/routing';

// `/_preview/{token}`: the folder is "%5Fpreview" because "_preview" would be a private folder.
// Response headers (no-store, noindex, no-referrer) come from next.config.ts.

/** Wait for the token check so an invalid or expired token answers with a real 404. */
export const instant = false;

interface PreviewPageProps {
  params: Promise<{ token: string }>;
}

/**
 * The preview behind a signed token, shown only on the host of the site it belongs to. Memoized
 * per request so the metadata and the page share one uncached API call.
 */
const loadPreview = cache(async (token: string): Promise<PublicPreviewResponse | null> => {
  // A preview is always the latest draft for this request; nothing of it can be prerendered.
  await connection();
  if (!isPlausiblePreviewToken(token)) {
    return null;
  }
  const subdomain = await currentSubdomain();
  if (subdomain === null) {
    return null;
  }
  const preview = await getPreview(token);
  return preview !== null && preview.data.site.subdomain === subdomain ? preview : null;
});

export async function generateMetadata({ params }: PreviewPageProps): Promise<Metadata> {
  const preview = await loadPreview((await params).token);
  return previewMetadata(preview?.data ?? null);
}

export default async function PreviewPage({ params }: PreviewPageProps) {
  const preview = await loadPreview((await params).token);
  if (preview === null) {
    notFound();
  }
  return (
    <>
      <PreviewBanner preview={preview.preview} />
      {/* A preview never sends a lead. */}
      <SitePage data={preview.data} submission="off" />
    </>
  );
}
