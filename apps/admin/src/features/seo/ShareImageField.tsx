'use client';

import type { Asset } from '@plp/contracts';
import { Button } from '@plp/ui';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { AssetField, AssetPickerDialog } from '../assets';
import styles from './SeoScreen.module.css';

export const SHARE_IMAGE_SIZE = '1200 × 630 px';
export const SHARE_IMAGE_FIELD_ID = 'seo-share-image';

export interface ShareImageFieldProps {
  siteId: string;
  /** True when the page has its own share image (`seo.shareImageAssetId`). */
  custom: boolean;
  /** The page's own image, when it is loaded. */
  customAsset: Asset | null;
  /** The site's default share image, if any. */
  defaultAsset: Asset | null;
  onChange: (asset: Asset | null) => void;
  disabled?: boolean | undefined;
}

/**
 * The share image tile: the image itself, or an empty "Chưa có ảnh" tile. Without an image the
 * live page sends no `og:image`, so the tile never pretends there is one.
 */
export function ShareImageTile({
  asset,
  className,
}: {
  asset: Asset | null;
  className: string | undefined;
}) {
  if (asset === null) {
    return (
      <span aria-hidden="true" className={[className, styles.noImage].join(' ')}>
        Chưa có ảnh
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={className}>
      <Image src={asset.url} alt="" fill sizes="320px" unoptimized className={styles.cover} />
    </span>
  );
}

/**
 * "Ảnh khi chia sẻ": the site's default image until the page picks its own (ADR-005). The page
 * image is an `AssetField`; removing it goes back to the default.
 */
export function ShareImageField({
  siteId,
  custom,
  customAsset,
  defaultAsset,
  onChange,
  disabled = false,
}: ShareImageFieldProps) {
  const [picking, setPicking] = useState(false);
  // Choosing an image or going back to the default swaps the controls: focus follows to the
  // control that takes the place of the one used.
  const thayAnhRef = useRef<HTMLButtonElement>(null);
  const pickOwnRef = useRef<HTMLButtonElement>(null);
  const backToDefault = useRef(false);
  useEffect(() => {
    if (!custom && backToDefault.current) {
      backToDefault.current = false;
      pickOwnRef.current?.focus();
    }
  }, [custom]);

  function goBackToDefault() {
    backToDefault.current = true;
    onChange(null);
  }

  // Beside the swapped controls, so it is still mounted when it closes and can hand focus to
  // "Thay ảnh".
  const picker = (
    <AssetPickerDialog
      open={picking}
      onOpenChange={setPicking}
      siteId={siteId}
      title="Ảnh khi chia sẻ"
      recommendedSize={SHARE_IMAGE_SIZE}
      fallbackFocusRef={thayAnhRef}
      onSelect={(_selection, asset) => {
        onChange(asset);
      }}
    />
  );

  const field = custom ? (
    <div id={SHARE_IMAGE_FIELD_ID} className={styles.shareField}>
      <AssetField
        label="Ảnh khi chia sẻ"
        siteId={siteId}
        value={customAsset}
        recommendedSize={SHARE_IMAGE_SIZE}
        disabled={disabled}
        chooseRef={thayAnhRef}
        help={`Khuyên dùng ${SHARE_IMAGE_SIZE}. Gỡ ảnh để dùng lại ảnh mặc định của site.`}
        onChange={(asset) => {
          if (asset === null) {
            goBackToDefault();
            return;
          }
          onChange(asset);
        }}
      />
      {customAsset === null ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className={styles.useDefault}
          onClick={goBackToDefault}
        >
          Dùng ảnh mặc định của site
        </Button>
      ) : null}
    </div>
  ) : (
    <fieldset id={SHARE_IMAGE_FIELD_ID} className={styles.shareFieldset}>
      <legend className={styles.label}>Ảnh khi chia sẻ</legend>
      <div className={styles.shareRow}>
        <ShareImageTile asset={defaultAsset} className={styles.shareTile} />
        <div className={styles.shareText}>
          <span className={styles.shareStatus}>
            {defaultAsset === null
              ? 'Site chưa có ảnh chia sẻ mặc định'
              : 'Đang dùng ảnh mặc định của site'}
          </span>
          <span className={styles.hint}>Khuyên dùng {SHARE_IMAGE_SIZE}</span>
          <Button
            ref={pickOwnRef}
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => {
              setPicking(true);
            }}
          >
            Chọn ảnh riêng cho trang
          </Button>
        </div>
      </div>
    </fieldset>
  );

  return (
    <>
      {field}
      {picker}
    </>
  );
}
