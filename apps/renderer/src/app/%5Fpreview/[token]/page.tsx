import type { PublicPreviewResponse } from '@plp/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { cache } from 'react';
import { PreviewBanner } from '../../../components/PreviewBanner';
import { SitePage } from '../../../components/SitePage';
import { previewMetadata } from '../../../lib/metadata';
import { previewForHost } from '../../../lib/preview-gate';
import { getPreview } from '../../../lib/public-api';
import { currentSubdomain } from '../../../lib/request-host';

// `/_preview/{token}`: the folder is "%5Fpreview" because "_preview" would be a private folder.
// Response headers (no-store, noindex, no-referrer) come from next.config.ts. The proxy has
// already answered an invalid, expired or foreign token with the server-rendered 404, and an API
// it could not reach with a 503 (see `proxy.ts`); it only checked the token, so this page makes
// the one full load of the preview. When that load fails the answer is a 500, still noindex: a
// page cannot answer 503 (ADR-010).

/** Wait for the preview before answering, so a failure is a real error status. */
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
  return previewForHost({ subdomain: await currentSubdomain(), token }, getPreview);
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
