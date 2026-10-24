'use client';

import {
  type SeoField,
  SEO_DESCRIPTION_RECOMMENDED_MAX,
  SEO_TITLE_RECOMMENDED_MAX,
} from '@plp/contracts';
import { themePresets } from '@plp/sections/schema';
import { Field, Input, Switch, Textarea, WarningTriangleIcon } from '@plp/ui';
import { useEffect, useId } from 'react';
import { slugPath } from '../../lib/site-url';
import { saveStatusView, useEditor, useEditorStoreApi } from '../editor';
import { finalizeSlug, redirectedLiveSlug, seoTitleHint, SLUG_MAX } from './seo-presentation';
import { SHARE_IMAGE_FIELD_ID, ShareImageField } from './ShareImageField';
import { useSlugField } from './use-slug-field';
import styles from './SeoScreen.module.css';

/** Same bounds as `seoSchema`. */
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 400;

/** A field the publish checks point at (`?focus=`): an SEO field or the slug. */
export type SeoFocus = SeoField | 'slug';

export const seoFieldIds: Record<SeoFocus, string> = {
  slug: 'seo-slug',
  title: 'seo-title',
  description: 'seo-description',
  shareImage: SHARE_IMAGE_FIELD_ID,
  noindex: 'seo-noindex',
};

function focusField(target: SeoFocus) {
  const element = document.getElementById(seoFieldIds[target]);
  if (element === null) {
    return;
  }
  // The share image is a group: focus its first button.
  const control =
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLButtonElement
      ? element
      : element.querySelector<HTMLElement>('button:not([disabled])');
  if (typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ block: 'center' });
  }
  control?.focus();
}

function SaveIndicator({ onRetry }: { onRetry: () => void }) {
  const saveState = useEditor((state) => state.saveState);
  const lastSavedAt = useEditor((state) => state.lastSavedAt);
  const saveError = useEditor((state) => state.saveError);
  const view = saveStatusView(saveState, lastSavedAt, saveError, null);
  return (
    <p role="status" className={styles.saveStatus} data-tone={view.tone}>
      {view.text}
      {saveState === 'error' && saveError !== null && saveError.kind !== 'retryable'
        ? ` · ${saveError.message}`
        : null}
      {view.canRetry ? (
        <>
          {' · '}
          <button type="button" className={styles.retry} onClick={onRetry}>
            Thử lại
          </button>
        </>
      ) : null}
    </p>
  );
}

export interface SeoFormProps {
  /** "smilecare.payload.site", shown before the slug. */
  host: string;
  /** Field to focus when the page opens (`?focus=` from a publish check). */
  initialFocus: SeoFocus | null;
  onRetrySave: () => void;
}

/**
 * The SEO settings of the draft (board 07). Every change goes through the editor store's
 * commands, so autosave, undo steps and conflicts behave exactly as in the editor.
 */
export function SeoForm({ host, initialFocus, onRetrySave }: SeoFormProps) {
  const store = useEditorStoreApi();
  const page = useEditor((state) => state.page);
  const site = useEditor((state) => state.site);
  const seo = useEditor((state) => state.draft.seo);
  const slug = useEditor((state) => state.draft.slug);
  const assetsById = useEditor((state) => state.assetsById);
  const redirectNoticeId = useId();
  const brand = themePresets[site.themePresetId].schemes.brand;

  const slugField = useSlugField({
    siteId: site.id,
    pageId: page.id,
    committed: slug,
    onCommit: (value) => {
      store.getState().setSlug(value, { merge: true });
    },
    onDone: () => {
      store.getState().closeHistoryStep();
    },
  });

  useEffect(() => {
    if (initialFocus !== null) {
      focusField(initialFocus);
    }
  }, [initialFocus]);

  const redirected = redirectedLiveSlug(page, finalizeSlug(slugField.text));
  const { check } = slugField;
  const slugError =
    check.state === 'rejected' || check.state === 'failed' ? check.message : undefined;
  let slugHelp: string | undefined;
  if (check.state === 'checking') {
    slugHelp = 'Đang kiểm tra đường dẫn…';
  } else if (check.state === 'available') {
    slugHelp = 'Đường dẫn này dùng được.';
  } else if (redirected === null) {
    slugHelp = 'Chỉ dùng chữ thường không dấu, số và dấu gạch ngang.';
  }
  const titleHint = seoTitleHint(seo.title);
  const customShare = seo.shareImageAssetId;
  const defaultShare = site.defaultShareImageAssetId;

  return (
    <section aria-label="Thiết lập SEO" className={styles.form}>
      <SaveIndicator onRetry={onRetrySave} />

      <div className={styles.slugGroup}>
        <Field label="Đường dẫn trang" id={seoFieldIds.slug} help={slugHelp} error={slugError}>
          <Input
            prefix={`${host}/`}
            mono
            value={slugField.text}
            maxLength={SLUG_MAX}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={redirected === null ? undefined : redirectNoticeId}
            onChange={(event) => {
              slugField.change(event.target.value);
            }}
            onBlur={slugField.blur}
          />
        </Field>
        {redirected === null ? null : (
          <p id={redirectNoticeId} className={styles.redirectNotice}>
            <WarningTriangleIcon size={16} strokeWidth={2} className={styles.noticeIcon} />
            <span>
              Trang này đang live. Khi xuất bản, link cũ{' '}
              <span className={styles.mono}>{slugPath(redirected)}</span> sẽ tự chuyển sang đường
              dẫn mới để quảng cáo và link đã chia sẻ không bị hỏng.
            </span>
          </p>
        )}
      </div>

      <Field
        label="Tiêu đề trên công cụ tìm kiếm"
        id={seoFieldIds.title}
        counter={{ length: seo.title.length, max: TITLE_MAX, softMax: SEO_TITLE_RECOMMENDED_MAX }}
        help={titleHint.tone === 'help' ? titleHint.text : undefined}
        warning={titleHint.tone === 'warning' ? titleHint.text : undefined}
      >
        <Input
          value={seo.title}
          maxLength={TITLE_MAX}
          onChange={(event) => {
            store.getState().updateSeo({ title: event.target.value }, { merge: true });
          }}
          onBlur={() => {
            store.getState().closeHistoryStep();
          }}
        />
      </Field>

      <Field
        label="Mô tả ngắn"
        id={seoFieldIds.description}
        counter={{
          length: seo.description.length,
          max: DESCRIPTION_MAX,
          softMax: SEO_DESCRIPTION_RECOMMENDED_MAX,
        }}
      >
        <Textarea
          rows={3}
          value={seo.description}
          maxLength={DESCRIPTION_MAX}
          onChange={(event) => {
            store.getState().updateSeo({ description: event.target.value }, { merge: true });
          }}
          onBlur={() => {
            store.getState().closeHistoryStep();
          }}
        />
      </Field>

      <ShareImageField
        siteId={site.id}
        siteName={site.name}
        tileColor={brand.background}
        tileTextColor={brand.heading}
        custom={customShare !== null}
        customAsset={customShare === null ? null : (assetsById[customShare] ?? null)}
        defaultAsset={defaultShare === null ? null : (assetsById[defaultShare] ?? null)}
        onChange={(asset) => {
          if (asset !== null) {
            store.getState().addAssets([asset]);
          }
          store.getState().updateSeo({ shareImageAssetId: asset?.id ?? null });
        }}
      />

      <Switch
        id={seoFieldIds.noindex}
        className={styles.indexSwitch}
        label="Cho phép hiện trên Google và công cụ tìm kiếm"
        description="Tắt sẽ ẩn trang khỏi kết quả tìm kiếm và sitemap. Link xem trước bản nháp luôn bị ẩn."
        checked={!seo.noindex}
        onCheckedChange={(checked) => {
          store.getState().updateSeo({ noindex: !checked });
        }}
      />
    </section>
  );
}
