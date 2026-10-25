'use client';

import type { PublicImage, SectionInstance } from '@plp/contracts';
import { PageView, type RenderContext } from '@plp/sections/react';
import { Button, EmptyState, PlusIcon } from '@plp/ui';
import {
  type MouseEvent,
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styles from './Canvas.module.css';
import { useEditor, useEditorServices, useEditorStoreApi } from './editor-context';
import { canvasLabels, frameLayout, frameStyle, livePathOf } from './presentation';
import { SectionChrome } from './SectionChrome';

/** Links inside the preview never navigate away from the editor. */
function preventNavigation(event: MouseEvent<HTMLDivElement>) {
  if (event.target instanceof Element && event.target.closest('a[href]')) {
    event.preventDefault();
  }
}

/** Content width of an element, kept up to date; null where ResizeObserver is unavailable. */
function useContentWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setWidth(Math.floor(entry.contentRect.width));
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return width;
}

/**
 * The middle column: the draft rendered by the same `PageView` as the public site, in a frame of
 * the previewed device's width. Sections respond to the frame through container queries.
 */
export function Canvas() {
  const store = useEditorStoreApi();
  const { sitePages, openAddSection } = useEditorServices();
  const composition = useEditor((state) => state.draft.composition);
  const device = useEditor((state) => state.device);
  const site = useEditor((state) => state.site);
  const assetsById = useEditor((state) => state.assetsById);
  const page = useEditor((state) => state.page);
  const selectedId = useEditor((state) => state.selection.sectionId);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLElement>(null);
  const layout = frameLayout(device, useContentWidth(canvasRef));

  const images = useMemo(() => {
    const result: Record<string, PublicImage> = {};
    for (const asset of Object.values(assetsById)) {
      result[asset.id] = { url: asset.url, width: asset.width, height: asset.height };
    }
    return result;
  }, [assetsById]);

  const pagePaths = useMemo(() => {
    const result: Record<string, string | null> = {};
    for (const sitePage of sitePages) {
      result[sitePage.id] = livePathOf(sitePage);
    }
    result[page.id] = livePathOf(page);
    return result;
  }, [sitePages, page]);

  const onTextChange = useCallback(
    (sectionId: string, path: string, value: string) => {
      store.getState().updateContent(sectionId, path, value);
    },
    [store],
  );

  const ctx = useMemo<RenderContext>(
    () => ({
      mode: 'edit',
      site: {
        name: site.name,
        logo: site.logoAssetId === null ? null : (images[site.logoAssetId] ?? null),
      },
      images,
      pagePaths,
      onTextChange,
    }),
    [site.name, site.logoAssetId, images, pagePaths, onTextChange],
  );

  const wrapSection = useCallback(
    (section: SectionInstance, rendered: ReactElement, index: number) => (
      <SectionChrome section={section} index={index} rendered={rendered} />
    ),
    [],
  );

  // Bring a newly selected section into view (after "Thêm section", "Sửa ngay" or the outline).
  useEffect(() => {
    if (selectedId === null) {
      return;
    }
    const element = frameRef.current?.querySelector(`[data-section-id="${selectedId}"]`);
    if (element && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedId]);

  return (
    <section ref={canvasRef} aria-label="Khung xem trước bản nháp" className={styles.canvas}>
      <div className={styles.meta}>
        <span>{canvasLabels[device]}</span>
        <span>{Math.round(layout.zoom * 100)}%</span>
      </div>
      <div
        ref={frameRef}
        className={styles.frame}
        style={frameStyle(layout)}
        data-device={device}
        onClickCapture={preventNavigation}
      >
        {composition.sections.length === 0 ? (
          <EmptyState
            className={styles.empty}
            title="Trang chưa có section nào"
            description="Thêm section đầu tiên, ví dụ Thanh điều hướng hoặc Hero, rồi sửa nội dung ngay trên trang."
            action={
              <Button
                leadingIcon={<PlusIcon size={18} />}
                onClick={() => {
                  openAddSection(0);
                }}
              >
                Thêm section
              </Button>
            }
          />
        ) : (
          <PageView
            composition={composition}
            themePresetId={site.themePresetId}
            ctx={ctx}
            wrapSection={wrapSection}
          />
        )}
      </div>
    </section>
  );
}
