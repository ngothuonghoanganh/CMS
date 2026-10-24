'use client';

import type { Asset } from '@plp/contracts';
import {
  Button,
  Callout,
  Checkbox,
  Dialog,
  EmptyState,
  Field,
  ImageIcon,
  Input,
  Skeleton,
} from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { ApiError, uploadAsset } from '../../lib/api';
import styles from './assets.module.css';
import {
  ACCEPTED_IMAGE_TYPES,
  formatBytes,
  hasUploadErrors,
  type UploadErrors,
  validateImageFile,
  validateUpload,
} from './upload-validation';
import { usePrependAsset, useSiteAssets } from './use-site-assets';

/** What an image field stores when an asset is picked: the asset's description is copied. */
export interface AssetSelection {
  assetId: string;
  alt: string;
  decorative: boolean;
}

export function selectionOf(asset: Asset): AssetSelection {
  return { assetId: asset.id, alt: asset.alt ?? '', decorative: asset.decorative };
}

export interface AssetPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  /** Called with the picked (or just uploaded) asset; the dialog closes itself afterwards. */
  onSelect: (selection: AssetSelection, asset: Asset) => void;
  /** Defaults to "Chọn ảnh". */
  title?: string | undefined;
  /** Shown under the title, e.g. "Khuyên dùng 1200 × 630 px". */
  recommendedSize?: string | undefined;
}

function uploadErrorMessage(error: unknown): { alt?: string; general: string | null } {
  if (error instanceof ApiError) {
    const fields = error.fieldErrors();
    if (fields.alt) {
      return { alt: fields.alt, general: null };
    }
    return { general: error.problem.detail ?? error.problem.title };
  }
  return { general: 'Tải ảnh lên không thành công. Kiểm tra kết nối rồi thử lại.' };
}

function UploadForm({
  siteId,
  onUploaded,
}: {
  siteId: string;
  onUploaded: (asset: Asset) => void;
}) {
  const fileInputId = useId();
  const fileErrorId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState('');
  const [decorative, setDecorative] = useState(false);
  const [errors, setErrors] = useState<UploadErrors>({});
  const prepend = usePrependAsset(siteId);
  const upload = useMutation({
    mutationFn: (input: { file: File; alt: string; decorative: boolean }) =>
      uploadAsset(siteId, input.file, { alt: input.alt, decorative: input.decorative }),
    onSuccess: (asset) => {
      prepend(asset);
      setFile(null);
      setAlt('');
      setDecorative(false);
      if (fileRef.current) {
        fileRef.current.value = '';
      }
      onUploaded(asset);
    },
    onError: (error) => {
      const message = uploadErrorMessage(error);
      if (message.alt) {
        setErrors({ alt: message.alt });
      }
    },
  });
  const serverError = upload.isError ? uploadErrorMessage(upload.error).general : null;

  function submit() {
    const found = validateUpload({ file, alt, decorative });
    setErrors(found);
    if (hasUploadErrors(found) || !file) {
      return;
    }
    // A decorative image has no description (ADR-005: description XOR decorative).
    upload.mutate({ file, alt: decorative ? '' : alt.trim(), decorative });
  }

  return (
    <section aria-labelledby={`${fileInputId}-title`} className={styles.upload}>
      <h3 id={`${fileInputId}-title`} className={styles.sectionTitle}>
        Tải ảnh mới
      </h3>
      <div className={styles.fileRow}>
        <label htmlFor={fileInputId} className={styles.fileLabel}>
          Tệp ảnh
        </label>
        <input
          ref={fileRef}
          id={fileInputId}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          aria-describedby={errors.file ? fileErrorId : `${fileInputId}-help`}
          aria-invalid={errors.file ? true : undefined}
          className={styles.fileInput}
          disabled={upload.isPending}
          onChange={(event) => {
            const picked = event.target.files?.[0] ?? null;
            setFile(picked);
            const fileError = picked ? validateImageFile(picked) : null;
            setErrors((current) => ({
              ...(current.alt === undefined ? {} : { alt: current.alt }),
              ...(fileError === null ? {} : { file: fileError }),
            }));
          }}
        />
        {errors.file ? (
          <p id={fileErrorId} className={styles.error} role="alert">
            {errors.file}
          </p>
        ) : (
          <p id={`${fileInputId}-help`} className={styles.help}>
            JPG, PNG, WebP, AVIF hoặc GIF, tối đa 10 MB.
          </p>
        )}
      </div>
      <Field
        label="Mô tả ảnh cho người dùng trình đọc màn hình"
        error={errors.alt}
        counter={{ length: alt.length, max: 250 }}
      >
        <Input
          value={alt}
          maxLength={250}
          placeholder="Ví dụ: Bác sĩ tư vấn cho khách hàng"
          disabled={upload.isPending || decorative}
          onChange={(event) => {
            setAlt(event.target.value);
          }}
        />
      </Field>
      <Checkbox
        label="Ảnh chỉ để trang trí"
        description="Trình đọc màn hình sẽ bỏ qua ảnh này."
        checked={decorative}
        disabled={upload.isPending}
        onChange={(event) => {
          setDecorative(event.target.checked);
        }}
      />
      {serverError ? (
        <Callout tone="danger" role="alert">
          {serverError}
        </Callout>
      ) : null}
      <div>
        <Button variant="secondary" loading={upload.isPending} onClick={submit}>
          Tải lên và chọn
        </Button>
      </div>
    </section>
  );
}

function AssetGrid({
  siteId,
  open,
  selectedId,
  onPick,
}: {
  siteId: string;
  open: boolean;
  selectedId: string | null;
  onPick: (asset: Asset) => void;
}) {
  const query = useSiteAssets(siteId, open);
  const assets = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (query.isPending) {
    return (
      <div className={styles.grid} aria-busy="true">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} height={120} />
        ))}
      </div>
    );
  }
  if (query.isError && assets.length === 0) {
    return (
      <Callout
        tone="danger"
        role="alert"
        action={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void query.refetch();
            }}
          >
            Thử lại
          </Button>
        }
      >
        Không tải được thư viện ảnh.
      </Callout>
    );
  }
  if (assets.length === 0) {
    return (
      <EmptyState
        headingLevel={3}
        icon={<ImageIcon />}
        title="Chưa có ảnh nào"
        description="Tải ảnh đầu tiên của site lên bằng mục “Tải ảnh mới”."
      />
    );
  }
  return (
    <>
      <ul className={styles.grid}>
        {assets.map((asset) => {
          const name = asset.alt ?? 'Ảnh trang trí';
          return (
            <li key={asset.id}>
              <button
                type="button"
                aria-pressed={asset.id === selectedId}
                className={styles.tile}
                onClick={() => {
                  onPick(asset);
                }}
              >
                <img src={asset.url} alt="" className={styles.tileImage} loading="lazy" />
                <span className={styles.tileName}>{name}</span>
                <span className={styles.tileMeta}>
                  {asset.width} × {asset.height} · {formatBytes(asset.bytes)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {query.hasNextPage ? (
        <div className={styles.more}>
          <Button
            variant="secondary"
            loading={query.isFetchingNextPage}
            onClick={() => {
              void query.fetchNextPage();
            }}
          >
            Xem thêm
          </Button>
        </div>
      ) : null}
      {query.isFetchNextPageError ? (
        <Callout tone="danger" role="alert">
          Không tải thêm được ảnh. Hãy thử lại.
        </Callout>
      ) : null}
    </>
  );
}

/** Picks an image from the site's library or uploads a new one (with its description). */
export function AssetPickerDialog({
  open,
  onOpenChange,
  siteId,
  onSelect,
  title,
  recommendedSize,
}: AssetPickerDialogProps) {
  const [selected, setSelected] = useState<Asset | null>(null);

  function choose(asset: Asset) {
    onSelect(selectionOf(asset), asset);
    setSelected(null);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSelected(null);
        }
        onOpenChange(next);
      }}
      size="lg"
      title={title ?? 'Chọn ảnh'}
      description={recommendedSize ? `Khuyên dùng ${recommendedSize}.` : undefined}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Hủy
          </Button>
          <Button
            disabled={selected === null}
            onClick={() => {
              if (selected) {
                choose(selected);
              }
            }}
          >
            Chọn ảnh
          </Button>
        </>
      }
    >
      <div className={styles.picker}>
        <UploadForm siteId={siteId} onUploaded={choose} />
        <section aria-labelledby="asset-library-title" className={styles.library}>
          <h3 id="asset-library-title" className={styles.sectionTitle}>
            Thư viện ảnh của site
          </h3>
          <AssetGrid
            siteId={siteId}
            open={open}
            selectedId={selected?.id ?? null}
            onPick={setSelected}
          />
        </section>
      </div>
    </Dialog>
  );
}
