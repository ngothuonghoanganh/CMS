'use client';

import type { Composition, ThemePresetId } from '@plp/contracts';
import { PageView, type RenderContext } from '@plp/sections/react';
import { useMemo, useRef } from 'react';
import { frameLayout, frameStyle } from '../editor/presentation';
import { useContentWidth } from '../shell/use-content-width';
import styles from './TemplatePreview.module.css';

export type PreviewDevice = 'desktop' | 'mobile';

export const previewDeviceLabels: Record<PreviewDevice, string> = {
  desktop: 'Máy tính',
  mobile: 'Điện thoại',
};

export interface TemplatePreviewProps {
  name: string;
  composition: Composition;
  /** The theme of the site the page would be made for: the page is drawn as it would look. */
  themePresetId: ThemePresetId;
  /** Shown where the page uses the site's name (navigation bar, footer). */
  siteName: string;
  device: PreviewDevice;
}

/**
 * A template's page drawn by the same `PageView` as the editor and the renderer, laid out at a
 * real device width and scaled to fit, like the editor's canvas (ADR-008). Nothing in it is
 * editable or leads anywhere: texts are plain, buttons are drawn, image frames are empty.
 */
export function TemplatePreview({
  name,
  composition,
  themePresetId,
  siteName,
  device,
}: TemplatePreviewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const layout = frameLayout(device, useContentWidth(viewportRef));
  const ctx = useMemo<RenderContext>(
    () => ({
      mode: 'edit',
      site: { name: siteName, logo: null },
      images: {},
      pagePaths: {},
      // The form's consent texts belong to the site (ADR-017); the canvas says they come from it.
      leadCapture: null,
    }),
    [siteName],
  );
  return (
    // Scrolled with the keyboard too: the region takes focus (WCAG 2.1.1).
    <div
      ref={viewportRef}
      role="region"
      aria-label={`Bản xem trước trên ${previewDeviceLabels[device].toLowerCase()}: ${name}`}
      tabIndex={0}
      className={styles.viewport}
      data-device={device}
    >
      <div className={styles.frame} style={frameStyle(layout)}>
        <PageView composition={composition} themePresetId={themePresetId} ctx={ctx} />
      </div>
    </div>
  );
}
