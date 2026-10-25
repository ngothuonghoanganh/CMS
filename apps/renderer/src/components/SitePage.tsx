import type { PublicPageData } from '@plp/contracts';
import { PageView, type RenderContext } from '@plp/sections/react';

/** Published (or previewed) page data as the shared section components expect it. */
export function liveRenderContext(data: PublicPageData): RenderContext {
  return {
    mode: 'live',
    site: { name: data.site.name, logo: data.site.logo },
    images: data.assets,
    pagePaths: data.pageLinks,
  };
}

/** The whole public page, drawn by @plp/sections exactly like the admin canvas. */
export function SitePage({ data }: { data: PublicPageData }) {
  return (
    <PageView
      composition={data.page.composition}
      themePresetId={data.site.themePresetId}
      ctx={liveRenderContext(data)}
    />
  );
}
