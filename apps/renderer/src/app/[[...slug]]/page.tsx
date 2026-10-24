import type { PublicPageData } from '@plp/contracts';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { SitePage } from '../../components/SitePage';
import { pageMetadata } from '../../lib/metadata';
import { getResolved } from '../../lib/public-api';
import { currentSubdomain } from '../../lib/request-host';
import { sameSiteLocation, slugFromSegments } from '../../lib/routing';

/**
 * The response must wait for the release lookup: only then can it answer with a real 404 or 308
 * status instead of streaming a 200 shell first.
 */
export const instant = false;

interface PublicPageProps {
  params: Promise<{ slug?: string[] }>;
}

type Resolution =
  | { kind: 'page'; data: PublicPageData }
  | { kind: 'redirect'; location: string }
  | { kind: 'not_found' };

/** host → site → slug → release (ADR-009). There is never a fallback to a draft. */
async function resolveRequest(params: PublicPageProps['params']): Promise<Resolution> {
  const slug = slugFromSegments((await params).slug);
  const subdomain = await currentSubdomain();
  if (slug === null || subdomain === null) {
    return { kind: 'not_found' };
  }
  const resolved = await getResolved(subdomain, slug);
  if (resolved === null) {
    return { kind: 'not_found' };
  }
  return resolved.kind === 'redirect'
    ? { kind: 'redirect', location: sameSiteLocation(resolved.location) }
    : resolved;
}

export async function generateMetadata({ params }: PublicPageProps): Promise<Metadata> {
  const resolution = await resolveRequest(params);
  // The page itself answers 404 or 308 for the other outcomes.
  return resolution.kind === 'page' ? pageMetadata(resolution.data) : {};
}

export default async function PublicPage({ params }: PublicPageProps) {
  const resolution = await resolveRequest(params);
  if (resolution.kind === 'redirect') {
    permanentRedirect(resolution.location);
  }
  if (resolution.kind === 'not_found') {
    notFound();
  }
  return <SitePage data={resolution.data} />;
}
