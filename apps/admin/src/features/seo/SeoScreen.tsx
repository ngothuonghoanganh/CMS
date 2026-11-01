'use client';

import type { Asset, PageDetailResponse, Role, Site } from '@plp/contracts';
import { seoTitleOf } from '@plp/sections/schema';
import { Callout, type LinkComponentProps, useToast } from '@plp/ui';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { hostOf } from '../../lib/site-url';
import {
  ConflictDialog,
  createEditorStore,
  DraftConflictError,
  type EditorStore,
  EditorStoreProvider,
  isUnsaved,
  refreshPageSummary,
  useBeforeUnloadGuard,
  useDraftSaver,
  useEditor,
  useHistoryLeaveGuard,
  useLatestServerDraft,
} from '../editor';
import { PageDetailHeader } from '../page-header/PageDetailHeader';
import { PageContainer } from '../shell/PageHeader';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { useNow } from '../shell/use-now';
import { type SeoFocus, SeoForm } from './SeoForm';
import { SeoPreviews } from './SeoPreviews';
import styles from './SeoScreen.module.css';

export interface SeoInitialData {
  detail: PageDetailResponse;
  site: Site;
  /** The page's share image and the site's default share image, when they exist. */
  assets: Asset[];
  role: Role;
}

export interface SeoScreenProps {
  initial: SeoInitialData;
  /** When the server loaded the data (epoch ms). */
  loadedAt: number;
  /** `?focus=` from a publish check: the field to focus. */
  focus: SeoFocus | null;
}

const NavigateContext = createContext<((href: string) => void) | null>(null);

/**
 * A header link of the SEO page: pending changes are saved before leaving. Modified clicks (new
 * tab, new window) work as usual.
 */
function SaveFirstLink({ href, className, children, ref, ...aria }: LinkComponentProps) {
  const navigate = useContext(NavigateContext);
  return (
    <a
      ref={ref}
      href={href}
      className={className}
      aria-current={aria['aria-current']}
      onClick={(event) => {
        const modified =
          event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
        if (navigate === null || event.defaultPrevented || modified) {
          return;
        }
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

/**
 * Every link on the page leaves through `navigate`, which saves first: the sidebar lives outside
 * this screen and uses plain links. The click is taken before any link's own handler sees it; only
 * its default is prevented, so those handlers still run (the phone drawer closes) while Next's
 * Link and `SaveFirstLink` see `defaultPrevented` and do not navigate themselves.
 */
function useSaveFirstLinks(store: EditorStore, navigate: (href: string) => void): void {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const modified =
        event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
      if (modified || !isUnsaved(store.getState().saveState)) {
        return;
      }
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        (link.target !== '' && link.target !== '_self') ||
        link.hasAttribute('download')
      ) {
        return;
      }
      const url = new URL(link.href);
      const here = window.location;
      if (
        url.origin !== here.origin ||
        (url.pathname === here.pathname && url.search === here.search)
      ) {
        return;
      }
      event.preventDefault();
      navigate(`${url.pathname}${url.search}${url.hash}`);
    }
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
    };
  }, [store, navigate]);
}

function SeoScreenBody({
  store,
  loadedAt,
  focus,
}: Omit<SeoScreenProps, 'initial'> & { store: EditorStore }) {
  const router = useRouter();
  const { toast } = useToast();
  const now = useNow(loadedAt);
  const { ensureSaved, retry, discard } = useDraftSaver(store);
  useLatestServerDraft(store);
  useBeforeUnloadGuard(store);
  const page = useEditor((state) => state.page);
  const site = useEditor((state) => state.site);
  const seo = useEditor((state) => state.draft.seo);
  const slug = useEditor((state) => state.draft.slug);
  const composition = useEditor((state) => state.draft.composition);
  const assetsById = useEditor((state) => state.assetsById);
  const host = hostOf(site.defaultOrigin);
  const shareImageId = seo.shareImageAssetId ?? site.defaultShareImageAssetId;

  const leaveFailed = useCallback(
    (error: unknown, leave: () => void) => {
      // A conflict opens the blocking reload dialog; anything else keeps the user here, with a way
      // out when the save cannot succeed (signed out elsewhere, role lowered).
      if (error instanceof DraftConflictError) {
        return;
      }
      toast({
        tone: 'danger',
        title: 'Chưa lưu được thiết lập SEO',
        description: `${problemMessage(error)} Thay đổi vẫn ở đây, hãy thử lại.`,
        action: {
          label: 'Rời trang, bỏ thay đổi',
          onClick: () => {
            discard();
            leave();
          },
        },
      });
    },
    [toast, discard],
  );

  // Leaving saves first, whichever way: a save sent as the screen unmounts would land after the
  // next screen read the page (it would show the state before it), and could fail unseen (ADR-008).
  // One leave waits at a time: another link, Back or Forward during the save only changes where
  // the user goes when it ends, so the user leaves once.
  const pendingLeave = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      // Something else took the user away (a menu navigating in code): never follow a stale leave.
      pendingLeave.current = null;
    },
    [],
  );
  const leaveAfterSave = useCallback(
    (leave: () => void) => {
      pendingLeave.current = leave;
      // Concurrent calls share the running save; the first to settle takes the leave.
      function takePending(): (() => void) | null {
        const next = pendingLeave.current;
        pendingLeave.current = null;
        return next;
      }
      ensureSaved().then(
        () => {
          takePending()?.();
        },
        (error: unknown) => {
          const next = takePending();
          if (next !== null) {
            leaveFailed(error, next);
          }
        },
      );
    },
    [ensureSaved, leaveFailed],
  );
  const navigate = useCallback(
    (href: string) => {
      const go = () => {
        router.push(href);
      };
      if (!isUnsaved(store.getState().saveState) && pendingLeave.current === null) {
        go();
        return;
      }
      leaveAfterSave(go);
    },
    [store, router, leaveAfterSave],
  );
  useHistoryLeaveGuard(store, leaveAfterSave);
  useSaveFirstLinks(store, navigate);

  return (
    <NavigateContext.Provider value={navigate}>
      <PageContainer width="wide">
        <PageDetailHeader
          siteId={site.id}
          page={page}
          current="seo"
          now={now}
          link={SaveFirstLink}
          onUnpublished={(result) => {
            store.getState().setServerState({ page: result.page });
          }}
          onUnpublishConflict={() => {
            // The header shows the page from the store, which the site's queries do not refresh.
            refreshPageSummary(store).catch((error: unknown) => {
              reportUnexpected('Reading the page again after an unpublish conflict failed', error);
            });
          }}
        />
        <Callout tone="info">
          Thiết lập SEO thuộc bản nháp: chỉ có hiệu lực trên trang live sau khi bạn xuất bản.
        </Callout>
        <div className={styles.columns}>
          <SeoForm host={host} initialFocus={focus} onRetrySave={retry} />
          <SeoPreviews
            siteName={site.name}
            host={host}
            slug={slug}
            title={seoTitleOf(seo.title, composition, site.name)}
            description={seo.description}
            noindex={seo.noindex}
            image={shareImageId === null ? null : (assetsById[shareImageId] ?? null)}
          />
        </div>
      </PageContainer>
      <ConflictDialog />
    </NavigateContext.Provider>
  );
}

/**
 * Screen 07 "SEO & chia sẻ". The settings belong to the draft, so the page runs the editor's store
 * and autosave against the same draft, with the same conflict handling.
 */
export function SeoScreen({ initial, loadedAt, focus }: SeoScreenProps) {
  const [store] = useState(() =>
    createEditorStore({
      detail: initial.detail,
      site: initial.site,
      assets: initial.assets,
      role: initial.role,
      // This screen draws no section, so it needs no consent texts.
      leadCapture: null,
    }),
  );
  return (
    <EditorStoreProvider store={store}>
      <SeoScreenBody store={store} loadedAt={loadedAt} focus={focus} />
    </EditorStoreProvider>
  );
}
