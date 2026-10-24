'use client';

import {
  type Asset,
  type CheckTarget,
  type ChecksResult,
  endpoints,
  type PageDetailResponse,
  type PageSummary,
  type Role,
  type SaveDraftResponse,
  type Site,
} from '@plp/contracts';
import { useToast } from '@plp/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { ThemePickerDialog } from '../theme';
import { AddSectionDialog } from './AddSectionDialog';
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
  role: Role;
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
}

export interface EditorAppProps {
  initial: EditorInitialData;
  /** The publish dialog (screen 05). Without it, publishing buttons say "Sắp có". */
  renderPublishDialog?: ((props: PublishDialogRenderProps) => ReactNode) | undefined;
}

function previewErrorMessage(error: unknown): string {
  if (error instanceof DraftConflictError) {
    return 'Trang vừa được cập nhật ở nơi khác. Tải lại bản mới nhất rồi thử lại.';
  }
  if (error instanceof ApiError) {
    return error.problem.detail ?? error.problem.title;
  }
  return 'Kiểm tra kết nối rồi thử lại.';
}

interface ShellProps {
  store: EditorStore;
  initialPages: PageSummary[];
  renderPublishDialog: EditorAppProps['renderPublishDialog'];
}

function EditorShell({ store, initialPages, renderPublishDialog }: ShellProps) {
  const router = useRouter();
  const { toast } = useToast();
  const siteId = useEditor((state) => state.site.id);
  const pageId = useEditor((state) => state.page.id);
  const site = useEditor((state) => state.site);
  const role = useEditor((state) => state.role);
  const { ensureSaved, retry } = useDraftSaver(store);
  const { announce, region } = useAnnouncer();
  const push = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router],
  );
  const guard = useLeaveGuard(store, ensureSaved, push);
  useBeforeUnloadGuard(store);
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
  const [publishOpen, setPublishOpen] = useState(false);
  const [previewPending, setPreviewPending] = useState(false);
  const seoHref = `/sites/${siteId}/pages/${pageId}/seo`;
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
        focusTarget(store, target, { navigate, seoHref });
      },
      navigate,
    }),
    [siteId, pageId, pagesQuery.data, announce, store, navigate, seoHref],
  );

  async function preview() {
    setPreviewPending(true);
    try {
      await ensureSaved();
      const link = await api(endpoints.createPreviewLink, [pageId], { body: { kind: 'draft' } });
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
          onOpenPublish={
            renderPublishDialog
              ? () => {
                  setPublishOpen(true);
                }
              : null
          }
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
        canEdit={role === 'owner'}
        onSiteUpdated={(updated) => {
          store.getState().setSite(updated);
        }}
      />
      {renderPublishDialog?.({
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
      })}
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
    }),
  );
  return (
    <EditorStoreProvider store={store}>
      <EditorShell
        store={store}
        initialPages={initial.pages}
        renderPublishDialog={renderPublishDialog}
      />
    </EditorStoreProvider>
  );
}
