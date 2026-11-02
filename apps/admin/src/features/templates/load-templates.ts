import { endpoints, type Site, type TemplateDetail } from '@plp/contracts';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ApiError } from '../../lib/api-core';
import { serverApi } from '../../lib/server-api';

/** `?site=` as given; a list of them or none is no choice. */
export function requestedSite(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * `?version=` of "Xem trước vN" (board 19): an earlier version of a workspace template. Anything
 * but a version number shows the current version, as without one.
 */
export function requestedVersion(value: string | string[] | undefined): number | null {
  return typeof value === 'string' && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : null;
}

/**
 * The site a template would be made for: the one asked for in the URL when the user may open it,
 * otherwise the site the sidebar shows (the one opened last), otherwise none.
 */
export function chosenSite(
  sites: readonly Site[],
  requested: string | null,
  sidebarSite: Site | null,
): Site | null {
  return sites.find((site) => site.id === requested) ?? sidebarSite ?? sites[0] ?? null;
}

/**
 * One template, at `version` or its current one, with what the chosen site needs, loaded once per
 * request and shared with `generateMetadata`. Call `loadWorkspaceContext(workspaceId)` first: it
 * checks the session and the membership. An unknown template or version is a 404.
 */
export const loadTemplateDetail = cache(
  async (
    workspaceId: string,
    templateId: string,
    siteId: string | null,
    version: number | null,
  ): Promise<TemplateDetail> => {
    try {
      return await serverApi(endpoints.getTemplate, [workspaceId, templateId], {
        query: {
          ...(siteId === null ? {} : { siteId }),
          ...(version === null ? {} : { version }),
        },
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        notFound();
      }
      throw error;
    }
  },
);
