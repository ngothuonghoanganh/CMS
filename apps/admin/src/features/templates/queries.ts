import {
  endpoints,
  type PageDetailResponse,
  type PageSummary,
  type TemplateSiteReadiness,
  type TemplateVersionListResponse,
} from '@plp/contracts';
import { api } from '../../lib/api';
import { LIST_LIMIT, loadAllPages } from '../editor/load-editor-data';

/** TanStack Query keys of the template library (ADR-030). */
export const templateQueryKeys = {
  all: (workspaceId: string) => ['workspaces', workspaceId, 'templates'] as const,
  /** What a site still needs for a template's form; it changes with the site's settings only. */
  readiness: (workspaceId: string, templateId: string, siteId: string) =>
    ['workspaces', workspaceId, 'templates', templateId, 'site', siteId] as const,
  /** "Lịch sử phiên bản" of a workspace template (board 19). */
  versions: (workspaceId: string, templateId: string) =>
    ['workspaces', workspaceId, 'templates', templateId, 'versions'] as const,
};

/** "Cần có trước khi xuất bản" of one site, read with the template (`?siteId=`). */
export function readinessQuery(workspaceId: string, templateId: string, siteId: string) {
  return {
    queryKey: templateQueryKeys.readiness(workspaceId, templateId, siteId),
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<TemplateSiteReadiness> => {
      const detail = await api(endpoints.getTemplate, [workspaceId, templateId], {
        query: { siteId },
        signal,
      });
      if (detail.site === null) {
        throw new Error(`The template answered without the site ${siteId} it was asked about`);
      }
      return detail.site;
    },
  };
}

export function versionsQuery(workspaceId: string, templateId: string) {
  return {
    queryKey: templateQueryKeys.versions(workspaceId, templateId),
    queryFn: ({ signal }: { signal: AbortSignal }): Promise<TemplateVersionListResponse> =>
      api(endpoints.listTemplateVersions, [workspaceId, templateId], { signal }),
  };
}

/**
 * Every page of a site with its status, for the page pickers of "Lưu trang thành template" and
 * "Áp dụng vào trang đang sửa…". The same key as the editor's link targets: one cache.
 */
export function sitePagesQuery(siteId: string) {
  return {
    queryKey: ['sites', siteId, 'pages', 'link-targets'] as const,
    queryFn: (): Promise<PageSummary[]> =>
      loadAllPages((cursor) =>
        api(endpoints.listPages, [siteId], {
          query: { limit: LIST_LIMIT, ...(cursor === null ? {} : { cursor }) },
        }),
      ),
    staleTime: 30_000,
  };
}

/**
 * The page picked in a dialog with its draft now: the revision a write is based on, its sections
 * and its live version. Read again whenever the dialog opens, never served from an older read.
 */
export function pageDetailQuery(siteId: string, pageId: string) {
  return {
    queryKey: ['sites', siteId, 'pages', pageId, 'template-dialog'] as const,
    queryFn: ({ signal }: { signal: AbortSignal }): Promise<PageDetailResponse> =>
      api(endpoints.getPage, [siteId, pageId], { signal }),
    staleTime: 0,
    gcTime: 0,
  };
}
