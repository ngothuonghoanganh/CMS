'use client';

import type { Asset } from '@plp/contracts';
import { Button, ImageIcon } from '@plp/ui';
import { type ReactNode, useState } from 'react';
import { type AssetSelection, AssetPickerDialog } from './AssetPickerDialog';
import styles from './assets.module.css';

/** A small preview of an asset, or an empty tile when none is chosen (decorative). */
export function AssetThumb({ asset }: { asset: Pick<Asset, 'url'> | null }) {
  if (!asset) {
    return (
      <span className={`${styles.thumb} ${styles.thumbEmpty}`} aria-hidden="true">
        <ImageIcon size={18} />
      </span>
    );
  }
  return <img src={asset.url} alt="" className={styles.thumb} />;
}

export interface AssetFieldProps {
  label: ReactNode;
  siteId: string;
  /** The chosen asset, or null. */
  value: Asset | null;
  onChange: (asset: Asset | null, selection: AssetSelection | null) => void;
  /** Guidance under the buttons, e.g. "Khuyên dùng 1200 × 630 px". */
  help?: ReactNode;
  /** Passed to the picker's subtitle, e.g. "1200 × 630 px". */
  recommendedSize?: string | undefined;
  /** Hides "Gỡ ảnh" when an image is required. */
  removable?: boolean | undefined;
  disabled?: boolean | undefined;
}

/**
 * Thumbnail with "Chọn ảnh" / "Thay ảnh" / "Gỡ ảnh" for settings that store only an asset id: site
 * logo, default share image, page share image.
 */
export function AssetField({
  label,
  siteId,
  value,
  onChange,
  help,
  recommendedSize,
  removable = true,
  disabled = false,
}: AssetFieldProps) {
  const [open, setOpen] = useState(false);
  return (
    <fieldset className={styles.field}>
      <legend className={styles.fieldLabel}>{label}</legend>
      <div className={styles.fieldRow}>
        <AssetThumb asset={value} />
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setOpen(true);
          }}
        >
          {value ? 'Thay ảnh' : 'Chọn ảnh'}
        </Button>
        {value && removable ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => {
              onChange(null, null);
            }}
          >
            Gỡ ảnh
          </Button>
        ) : null}
      </div>
      {help ? <p className={styles.help}>{help}</p> : null}
      <AssetPickerDialog
        open={open}
        onOpenChange={setOpen}
        siteId={siteId}
        recommendedSize={recommendedSize}
        onSelect={(selection, asset) => {
          onChange(asset, selection);
        }}
      />
    </fieldset>
  );
}
