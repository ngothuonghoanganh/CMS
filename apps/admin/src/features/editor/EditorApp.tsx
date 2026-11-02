'use client';

import {
  type Asset,
  can,
  type CheckTarget,
  type ChecksResult,
  endpoints,
  type PageDetailResponse,
  type PageSummary,
  type PublicLeadCapture,
  type SaveDraftResponse,
  type Site,
  type Access,
} from '@plp/contracts';
import { useToast } from '@plp/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { leadRecipientsHref, privacyHref } from '../shell/navigation';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { SaveTemplateDialog } from '../templates/SaveTemplateDialog';
import { ThemePickerDialog } from '../theme';
import { AddSectionDialog } from './AddSectionDialog';
import { ApplyTemplateInEditorDialog } from './ApplyTemplateInEditorDialog';
import { Canvas } from './Canvas';
import { ConflictDialog } from './ConflictDialog';
import { DraftNotice } from './DraftNotice';
import {
  EditorServicesProvider,
  EditorStoreProvider,
  type EditorServices,
  useEditor,
} from './editor-context';
import styles from './EditorApp.module.css';
import { focusTarget } from './focus-target';
import { LIST_LIMIT, loadAllPages } from './load-editor-data';
import { PropertiesPanel } from './PropertiesPanel';
import { refreshPageSummary, useLatestServerDraft } from './server-draft';
import { markSiteScreensStale } from './stale-screens';
import { createEditorStore, type EditorStore } from './store';
import { StructurePanel } from './StructurePanel';
import { TopBar } from './TopBar';
import { useAnnouncer } from './use-announcer';
import { DraftConflictError, useDraftSaver } from './use-draft-saver';
import { useEditorShortcuts } from './use-editor-shortcuts';
import { useBeforeUnloadGuard, useLeaveGuard } from './use-leave-guard';

/** Everything the editor route loads on the server. */
export interface EditorInitialData {
  detail: PageDetailResponse;
  site: Site;
  /** Assets the draft uses (and the newest of the library) for the canvas. */
  assets: Asset[];
  /** Pages of the site, for page-link pickers. */
  pages: PageSummary[];
  /** The user's role in the site's workspace. */
  role: Access;
  /** The signed-in user, to tell their own request to publish from someone else's (ADR-023). */
  userId: string;
  /** Consent texts of the site's current settings, for a lead form on the canvas (ADR-017). */
  leadCapture: PublicLeadCapture | null;
}

/** Props handed to the publish dialog mounted into the editor. */
export interface PublishDialogRenderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  /** Saves pending changes first and returns the saved revision, page summary and checks. */
  ensureSaved: () => Promise<SaveDraftResponse>;
  /** "Sửa ngay": closes the dialog, selects the section and focuses the field. */
  onFixTarget: (target: CheckTarget) => void;
  /** After publishing: the new page summary (status, live release) and, if fetched, checks. */
  onPageUpdated: (page: PageSummary, checks?: ChecksResult) => void;
  /** The user's role: an Editor is told which fixes only the Owner can make. */
  role: Access;
  userId: string;
}

export interface EditorAppProps {
  initial: EditorInitialData;
  /** The publish dialog (screen 05), mounted by the publish feature. */
  renderPublishDialog: (props: PublishDialogRenderProps) => ReactNode;
}

function previewErrorMessage(error: unknown): string {
  if (error instanceof DraftConflictError) {
    return 'Trang vừa được cập nhật ở nơi khác. Tải lại bản mới nhất rồi thử lại.';
  }
  return problemMessage(error);
}

interface ShellProps {
  store: EditorStore;
  userId: string;
  initialPages: PageSummary[];
  renderPublishDialog: EditorAppProps['renderPublishDialog'];
}

function EditorShell({ store, userId, initialPages, renderPublishDialog }: ShellProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const siteId = useEditor((state) => state.site.id);
  const pageId = useEditor((state) => state.page.id);
  const site = useEditor((state) => state.site);
  const role = useEditor((state) => state.role);
  const saver = useDraftSaver(store);
  const { ensureSaved, retry } = saver;
  const { announce, region } = useAnnouncer();
  const push = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router],
  );
  const guard = useLeaveGuard(store, saver, push);
  useBeforeUnloadGuard(store);
  useLatestServerDraft(store);
  useEditorShortcuts(store, announce);

  const pagesQuery = useQuery({
    queryKey: ['sites', siteId, 'pages', 'link-targets'],
    queryFn: () =>
      loadAllPages((cursor) =>
        api(endpoints.listPages, [siteId], {
          query: { limit: LIST_LIMIT, ...(cursor === null ? {} : { cursor }) },
        }),
      ),
    initialData: initialPages,
    staleTime: 60_000,
  });

  const [addSection, setAddSection] = useState({ open: false, index: 0, key: 0 });
  const [theme, setTheme] = useState({ open: false, key: 0 });
  // "Lưu thành template" and "Áp dụng mẫu…" (ADR-030); a new form for every opening.
  const [template, setTemplate] = useState<{
    kind: 'save' | 'apply';
    open: boolean;
    key: number;
  } | null>(null);
  const sitesQuery = useQuery({
    queryKey: ['workspaces', site.workspaceId, 'sites'],
    queryFn: () => api(endpoints.listSites, [site.workspaceId]),
    enabled: template?.kind === 'save',
  });
  const [publishOpen, setPublishOpen] = useState(false);
  const [previewPending, setPreviewPending] = useState(false);
  const seoHref = `/sites/${siteId}/pages/${pageId}/seo`;
  const privacy = privacyHref(siteId);
  const recipients = leadRecipientsHref(siteId);
  const navigate = guard.navigate;

  const services = useMemo<EditorServices>(
    () => ({
      siteId,
      pageId,
      sitePages: pagesQuery.data,
      openAddSection: (index) => {
        setAddSection((current) => ({ open: true, index, key: current.key + 1 }));
      },
      announce,
      focusTarget: (target) => {
        focusTarget(store, target, {
          navigate,
          seoHref,
          privacyHref: privacy,
          recipientsHref: recipients,
        });
      },
      navigate,
    }),
    [siteId, pageId, pagesQuery.data, announce, store, navigate, seoHref, privacy, recipients],
  );

  /**
   * After the site settings change, the live page's `siteChanges` (ADR-015) differ; the server
   * derives them, so the summary is read again. A save that lands meanwhile brings its own.
   */
  async function refreshSummary() {
    try {
      await refreshPageSummary(store);
    } catch (error) {
      console.error('Refreshing the page summary after a site change failed', error);
    }
  }

  function openTemplate(kind: 'save' | 'apply') {
    setTemplate((current) => ({ kind, open: true, key: (current?.key ?? 0) + 1 }));
  }

  /** The draft saved as it is on the screen is what a template is saved from. */
  async function saveAsTemplate() {
    try {
      await ensureSaved();
      openTemplate('save');
    } catch (error) {
      if (!(error instanceof DraftConflictError)) {
        reportUnexpected('Saving the draft before saving it as a template failed', error);
      }
      toast({
        tone: 'danger',
        title: 'Chưa lưu được bản nháp',
        description: previewErrorMessage(error),
      });
    }
  }

  async function preview() {
    setPreviewPending(true);
    try {
      await ensureSaved();
      const link = await api(endpoints.createPreviewLink, [siteId, pageId], {
        body: { kind: 'draft' },
      });
      const opened = window.open(link.url, '_blank');
      if (opened) {
        opened.opener = null;
        return;
      }
      toast({
        title: 'Trình duyệt đã chặn cửa sổ xem trước',
        description: (
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            {link.url}
          </a>
        ),
        action: {
          label: 'Mở bản xem trước',
          onClick: () => {
            window.open(link.url, '_blank', 'noopener,noreferrer');
          },
        },
        duration: 15_000,
      });
    } catch (error) {
      if (!(error instanceof DraftConflictError)) {
        reportUnexpected('Opening the draft preview failed', error);
      }
      toast({
        tone: 'danger',
        title: 'Chưa mở được bản xem trước',
        description: previewErrorMessage(error),
      });
    } finally {
      setPreviewPending(false);
    }
  }

  return (
    <EditorServicesProvider services={services}>
      <div className={styles.app}>
        <TopBar
          siteId={siteId}
          pageId={pageId}
          onRetrySave={retry}
          onPreview={() => {
            void preview();
          }}
          previewPending={previewPending}
          onOpenPublish={() => {
            setPublishOpen(true);
          }}
          onTemplate={(action) => {
            if (action === 'save') {
              void saveAsTemplate();
            } else {
              openTemplate('apply');
            }
          }}
        />
        <DraftNotice ensureSaved={ensureSaved} />
        <main className={styles.workspace}>
          <StructurePanel
            onOpenTheme={() => {
              setTheme((current) => ({ open: true, key: current.key + 1 }));
            }}
          />
          <Canvas />
          <PropertiesPanel />
        </main>
      </div>
      <AddSectionDialog
        key={`add-${addSection.key}`}
        open={addSection.open}
        requestedIndex={addSection.index}
        onOpenChange={(open) => {
          setAddSection((current) => ({ ...current, open }));
        }}
      />
      <ThemePickerDialog
        key={`theme-${theme.key}`}
        open={theme.open}
        onOpenChange={(open) => {
          setTheme((current) => ({ ...current, open }));
        }}
        site={site}
        canEdit={can(role, 'sites.manage')}
        onSiteUpdated={(updated) => {
          store.getState().setSite(updated);
          markSiteScreensStale(queryClient, updated.id);
          void refreshSummary();
        }}
      />
      {renderPublishDialog({
        open: publishOpen,
        onOpenChange: setPublishOpen,
        pageId,
        ensureSaved,
        onFixTarget: (target) => {
          setPublishOpen(false);
          services.focusTarget(target);
        },
        onPageUpdated: (page, checks) => {
          store.getState().setServerState(checks ? { page, checks } : { page });
        },
        role,
        userId,
      })}
      {template?.kind === 'apply' ? (
        <ApplyTemplateInEditorDialog
          key={`apply-template-${template.key}`}
          open={template.open}
          onOpenChange={(open) => {
            setTemplate((current) => (current === null ? null : { ...current, open }));
          }}
        />
      ) : null}
      {template?.kind === 'save' ? (
        <SaveTemplateDialog
          key={`save-template-${template.key}`}
          workspaceId={site.workspaceId}
          // The other sites join "Ai được dùng" once they are read.
          sites={sitesQuery.data?.items ?? [site]}
          source={{ kind: 'page', siteId, pageId }}
          open={template.open}
          onOpenChange={(open) => {
            setTemplate((current) => (current === null ? null : { ...current, open }));
          }}
          onSaved={(saved) => {
            toast({
              tone: 'success',
              title: `Đã lưu template “${saved.name}”, phiên bản ${saved.currentVersion}`,
            });
          }}
        />
      ) : null}
      <ConflictDialog />
      {guard.dialog}
      {region}
    </EditorServicesProvider>
  );
}

/**
 * The guided section editor (screens 03 and 04): one store for the draft, autosave, and the
 * three columns (structure, canvas, properties) reading from it.
 */
export function EditorApp({ initial, renderPublishDialog }: EditorAppProps) {
  const [store] = useState(() =>
    createEditorStore({
      detail: initial.detail,
      site: initial.site,
      assets: initial.assets,
      role: initial.role,
      leadCapture: initial.leadCapture,
    }),
  );
  return (
    <EditorStoreProvider store={store}>
      <EditorShell
        store={store}
        userId={initial.userId}
        initialPages={initial.pages}
        renderPublishDialog={renderPublishDialog}
      />
    </EditorStoreProvider>
  );
}
