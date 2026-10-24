'use client';

import type { Asset } from '@plp/contracts';
import { Button } from '@plp/ui';
import Image from 'next/image';
import { useState } from 'react';
import { AssetField, AssetPickerDialog } from '../assets';
import styles from './SeoScreen.module.css';

export const SHARE_IMAGE_SIZE = '1200 × 630 px';
export const SHARE_IMAGE_FIELD_ID = 'seo-share-image';

export interface ShareImageFieldProps {
  siteId: string;
  siteName: string;
  /** Background of the placeholder tile when the site has no default image (theme brand). */
  tileColor: string;
  tileTextColor: string;
  /** True when the page has its own share image (`seo.shareImageAssetId`). */
  custom: boolean;
  /** The page's own image, when it is loaded. */
  customAsset: Asset | null;
  /** The site's default share image, if any. */
  defaultAsset: Asset | null;
  onChange: (asset: Asset | null) => void;
  disabled?: boolean | undefined;
}

/** The share image tile: the image itself, or the site name on the brand color. */
export function ShareImageTile({
  asset,
  siteName,
  tileColor,
  tileTextColor,
  className,
}: {
  asset: Asset | null;
  siteName: string;
  tileColor: string;
  tileTextColor: string;
  className: string | undefined;
}) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={asset === null ? { background: tileColor, color: tileTextColor } : undefined}
    >
      {asset === null ? (
        siteName
      ) : (
        <Image src={asset.url} alt="" fill sizes="320px" unoptimized className={styles.cover} />
      )}
    </span>
  );
}

/**
 * "Ảnh khi chia sẻ": the site's default image until the page picks its own (ADR-005). The page
 * image is an `AssetField`; removing it goes back to the default.
 */
export function ShareImageField({
  siteId,
  siteName,
  tileColor,
  tileTextColor,
  custom,
  customAsset,
  defaultAsset,
  onChange,
  disabled = false,
}: ShareImageFieldProps) {
  const [picking, setPicking] = useState(false);

  if (custom) {
    return (
      <div id={SHARE_IMAGE_FIELD_ID} className={styles.shareField}>
        <AssetField
          label="Ảnh khi chia sẻ"
          siteId={siteId}
          value={customAsset}
          recommendedSize={SHARE_IMAGE_SIZE}
          disabled={disabled}
          help={`Khuyên dùng ${SHARE_IMAGE_SIZE}. Gỡ ảnh để dùng lại ảnh mặc định của site.`}
          onChange={(asset) => {
            onChange(asset);
          }}
        />
        {customAsset === null ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            className={styles.useDefault}
            onClick={() => {
              onChange(null);
            }}
          >
            Dùng ảnh mặc định của site
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <fieldset id={SHARE_IMAGE_FIELD_ID} className={styles.shareFieldset}>
      <legend className={styles.label}>Ảnh khi chia sẻ</legend>
      <div className={styles.shareRow}>
        <ShareImageTile
          asset={defaultAsset}
          siteName={siteName}
          tileColor={tileColor}
          tileTextColor={tileTextColor}
          className={styles.shareTile}
        />
        <div className={styles.shareText}>
          <span className={styles.shareStatus}>
            {defaultAsset === null
              ? 'Site chưa có ảnh chia sẻ mặc định'
              : 'Đang dùng ảnh mặc định của site'}
          </span>
          <span className={styles.hint}>Khuyên dùng {SHARE_IMAGE_SIZE}</span>
          <Button
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
      <AssetPickerDialog
        open={picking}
        onOpenChange={setPicking}
        siteId={siteId}
        title="Ảnh khi chia sẻ"
        recommendedSize={SHARE_IMAGE_SIZE}
        onSelect={(_selection, asset) => {
          onChange(asset);
        }}
      />
    </fieldset>
  );
}
