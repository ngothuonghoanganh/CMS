import { assetMimeTypeSchema, MAX_ASSET_BYTES, updateAssetRequestSchema } from '@plp/contracts';

export const ACCEPTED_IMAGE_TYPES = assetMimeTypeSchema.options.join(',');

export interface UploadInput {
  file: File | null;
  alt: string;
  decorative: boolean;
}

export interface UploadErrors {
  file?: string;
  alt?: string;
}

/** Client-side checks that mirror the API (ADR-012): image types and the 10 MB limit. */
export function validateImageFile(file: File): string | null {
  if (!assetMimeTypeSchema.safeParse(file.type).success) {
    return 'Chỉ nhận ảnh JPG, PNG, WebP, AVIF hoặc GIF.';
  }
  if (file.size > MAX_ASSET_BYTES) {
    return 'Ảnh lớn hơn 10 MB. Hãy chọn ảnh nhỏ hơn hoặc nén ảnh trước khi tải lên.';
  }
  if (file.size === 0) {
    return 'Tệp ảnh trống. Hãy chọn ảnh khác.';
  }
  return null;
}

/** Everything an upload needs before it is sent; an empty result means it can go. */
export function validateUpload(input: UploadInput): UploadErrors {
  const errors: UploadErrors = {};
  const fileError = input.file ? validateImageFile(input.file) : 'Chọn một ảnh để tải lên.';
  if (fileError) {
    errors.file = fileError;
  }
  const described = updateAssetRequestSchema.safeParse({
    alt: input.alt,
    decorative: input.decorative,
  });
  if (!described.success) {
    errors.alt = described.error.issues[0]?.message ?? 'Mô tả ảnh không hợp lệ';
  }
  return errors;
}

export function hasUploadErrors(errors: UploadErrors): boolean {
  return errors.file !== undefined || errors.alt !== undefined;
}

/** "1,2 MB" / "820 KB" for the asset grid. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
