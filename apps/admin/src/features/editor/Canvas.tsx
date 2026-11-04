'use client';

import type { PublicImage, SectionInstance } from '@plp/contracts';
import { PageView, playMotion, type RenderContext } from '@plp/sections/react';
import { getSectionDefinition, pageCapturesLeads, pageMotionOf } from '@plp/sections/schema';
import { Button, EmptyState, PlusIcon } from '@plp/ui';
import {
  type CSSProperties,
  type MouseEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { playBannerOf } from '../motion/motion-view';
import { useContentWidth } from '../shell/use-content-width';
import { AiAppliedNotice } from './assistant/AiAppliedNotice';
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

/** "Xem chậm" plays four times slower (ADR-032). */
const SLOW_SPEED = 4;

/**
 * The middle column: the draft rendered by the same `PageView` as the public site, in a frame of
 * the previewed device's width. Sections respond to the frame through container queries. It stays
 * still while editing; "Chạy thử" plays the page's motion with the runtime of the published page,
 * and its text cannot be edited until "Quay lại chỉnh sửa" (ADR-032).
 */
export function Canvas() {
  const store = useEditorStoreApi();
  const { sitePages, openAddSection } = useEditorServices();
  const composition = useEditor((state) => state.draft.composition);
  const device = useEditor((state) => state.device);
  const site = useEditor((state) => state.site);
  const assetsById = useEditor((state) => state.assetsById);
  const page = useEditor((state) => state.page);
  // Current settings: the canvas shows what the next publish will freeze (ADR-017). Like a
  // release, a page without a form has none, so its footer links no privacy policy (ADR-007).
  const siteLeadCapture = useEditor((state) => state.leadCapture);
  const leadCapture = pageCapturesLeads(composition) ? siteLeadCapture : null;
  const selectedId = useEditor((state) => state.selection.sectionId);
  const play = useEditor((state) => state.motionPlay);
  const playing = play.scope !== null;
  const moving = pageMotionOf(composition).style !== 'none';
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
      // While playing, text is drawn as visitors see it, so headings can rise line by line.
      ...(playing ? {} : { onTextChange }),
      leadCapture,
    }),
    [site.name, site.logoAssetId, images, pagePaths, onTextChange, leadCapture, playing],
  );

  // "Chạy thử": plays the scope once; a new run, a stop or a draft change ends it.
  useEffect(() => {
    const scope = play.scope;
    if (scope === null) {
      return undefined;
    }
    const root = frameRef.current?.querySelector<HTMLElement>('[data-motion-root]') ?? null;
    const scroller = canvasRef.current;
    if (play.reduced || root === null || scroller === null) {
      // Like a device that asks for less motion, or a page without a style: all shows at once.
      store.getState().finishMotionPlay();
      return undefined;
    }
    return playMotion(root, {
      scrollRoot: scroller,
      sectionId: scope.kind === 'section' ? scope.sectionId : null,
      onDone: () => {
        store.getState().finishMotionPlay();
      },
    });
  }, [store, play.scope, play.run, play.reduced]);

  const playedSection =
    play.scope?.kind === 'section'
      ? composition.sections.find(
          (section) => play.scope?.kind === 'section' && section.id === play.scope.sectionId,
        )
      : undefined;
  const banner = playing
    ? playBannerOf(
        composition,
        {
          done: play.done,
          slow: play.slow,
          reduced: play.reduced,
          sectionLabel: playedSection ? getSectionDefinition(playedSection.type).label : null,
        },
        device === 'mobile',
      )
    : null;
  const frame: CSSProperties & Record<'--plp-m-speed', number> = {
    ...frameStyle(layout),
    '--plp-m-speed': play.slow ? SLOW_SPEED : 1,
  };

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
        <span>
          {canvasLabels[device]}
          {moving ? ' · Section đứng yên khi chỉnh sửa' : ''}
        </span>
        <span className={styles.metaEnd}>
          {moving && !playing ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                store.getState().playMotion({ kind: 'page' });
              }}
            >
              Chạy thử hiệu ứng
            </Button>
          ) : null}
          {Math.round(layout.zoom * 100)}%
        </span>
      </div>
      {banner === null ? null : (
        <div role="status" className={styles.playBanner}>
          <span className={styles.playText}>
            <strong>{banner.title}</strong> · {banner.detail}
          </span>
          <span className={styles.playActions}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const scope = store.getState().motionPlay.scope;
                if (scope !== null) {
                  store.getState().playMotion(scope);
                }
              }}
            >
              Chạy lại
            </Button>
            <Button
              size="sm"
              onClick={() => {
                store.getState().stopMotionPlay();
              }}
            >
              Quay lại chỉnh sửa
            </Button>
          </span>
        </div>
      )}
      <div
        ref={frameRef}
        className={styles.frame}
        style={frame}
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
      <AiAppliedNotice />
    </section>
  );
}
