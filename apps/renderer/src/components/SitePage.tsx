import type { PublicPageData } from '@plp/contracts';
import { PageView, type RenderContext } from '@plp/sections/react';
import { LeadFormClient } from './LeadFormClient';

/** Whether the page's lead form sends: on live pages only, never in previews (ADR-016). */
export type LeadSubmissionMode = 'live' | 'off';

/** Published (or previewed) page data as the shared section components expect it. */
export function liveRenderContext(
  data: PublicPageData,
  submission: LeadSubmissionMode,
): RenderContext {
  return {
    mode: 'live',
    site: { name: data.site.name, logo: data.site.logo },
    images: data.assets,
    pagePaths: data.pageLinks,
    leadCapture: data.leadCapture,
    ...(submission === 'live' && data.releaseId !== null
      ? {
          leadSubmission: {
            releaseId: data.releaseId,
            render: (view) => <LeadFormClient {...view} />,
          },
        }
      : {}),
  };
}

/** The whole public page, drawn by @plp/sections exactly like the admin canvas. */
export function SitePage({
  data,
  submission,
}: {
  data: PublicPageData;
  submission: LeadSubmissionMode;
}) {
  return (
    <PageView
      composition={data.page.composition}
      themePresetId={data.site.themePresetId}
      ctx={liveRenderContext(data, submission)}
    />
  );
}
