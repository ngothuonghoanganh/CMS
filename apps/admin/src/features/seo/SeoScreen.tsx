'use client';

import type { Asset, PageDetailResponse, Role, Site } from '@plp/contracts';
import { themePresets } from '@plp/sections/schema';
import { Callout, type LinkComponentProps, useToast } from '@plp/ui';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useEffectEvent, useState } from 'react';
import { hostOf } from '../../lib/site-url';
import {
  ConflictDialog,
  createEditorStore,
  DraftConflictError,
  type EditorStore,
  EditorStoreProvider,
  hasUnsavedChanges,
  isUnsaved,
  useBeforeUnloadGuard,
  useDraftSaver,
  useEditor,
} from '../editor';
import { PageDetailHeader } from '../page-header/PageDetailHeader';
import { PageContainer } from '../shell/PageHeader';
import { problemMessage } from '../shell/problem-message';
import { useNow } from '../shell/use-now';
import { effectiveTitle } from './seo-presentation';
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

function SeoScreenBody({
  store,
  loadedAt,
  focus,
}: Omit<SeoScreenProps, 'initial'> & { store: EditorStore }) {
  const router = useRouter();
  const { toast } = useToast();
  const now = useNow(loadedAt);
  const { ensureSaved, retry } = useDraftSaver(store);
  useBeforeUnloadGuard(store);
  const page = useEditor((state) => state.page);
  const site = useEditor((state) => state.site);
  const seo = useEditor((state) => state.draft.seo);
  const slug = useEditor((state) => state.draft.slug);
  const composition = useEditor((state) => state.draft.composition);
  const assetsById = useEditor((state) => state.assetsById);
  const host = hostOf(site.defaultOrigin);
  const brand = themePresets[site.themePresetId].schemes.brand;
  const shareImageId = seo.shareImageAssetId ?? site.defaultShareImageAssetId;

  const navigate = useCallback(
    (href: string) => {
      if (!isUnsaved(store.getState().saveState)) {
        router.push(href);
        return;
      }
      ensureSaved().then(
        () => {
          router.push(href);
        },
        (error: unknown) => {
          // A conflict opens the blocking reload dialog; anything else keeps the user here.
          if (error instanceof DraftConflictError) {
            return;
          }
          toast({
            tone: 'danger',
            title: 'Chưa lưu được thiết lập SEO',
            description: `${problemMessage(error)} Thay đổi vẫn ở đây, hãy thử lại.`,
          });
        },
      );
    },
    [store, router, ensureSaved, toast],
  );

  // Leaving through the sidebar unmounts the page before the autosave delay: save right away.
  const saveOnLeave = useEffectEvent(() => {
    if (!hasUnsavedChanges(store.getState())) {
      return;
    }
    ensureSaved().catch((error: unknown) => {
      console.error('Saving the SEO settings when leaving the page failed', error);
    });
  });
  useEffect(
    () => () => {
      saveOnLeave();
    },
    [],
  );

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
            title={effectiveTitle(seo.title, composition, page.title)}
            description={seo.description}
            noindex={seo.noindex}
            image={shareImageId === null ? null : (assetsById[shareImageId] ?? null)}
            tileColor={brand.background}
            tileTextColor={brand.heading}
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
    }),
  );
  return (
    <EditorStoreProvider store={store}>
      <SeoScreenBody store={store} loadedAt={loadedAt} focus={focus} />
    </EditorStoreProvider>
  );
}
