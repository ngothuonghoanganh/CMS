import { type AssetMimeType, assetMimeTypeSchema } from '@plp/contracts';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { AppError } from '../../shared/errors.js';

export const UNSUPPORTED_IMAGE_MESSAGE = 'Chỉ hỗ trợ ảnh JPG, PNG, WebP, AVIF hoặc GIF';

const extensionByMimeType: Record<AssetMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

export interface InspectedImage {
  mimeType: AssetMimeType;
  extension: string;
  /** Display size, after the EXIF orientation is applied. */
  width: number;
  height: number;
}

function unsupported(cause?: unknown): AppError {
  return new AppError(415, 'unsupported_media_type', UNSUPPORTED_IMAGE_MESSAGE, {
    issues: [
      { path: ['file'], code: 'unsupported_media_type', message: UNSUPPORTED_IMAGE_MESSAGE },
    ],
    ...(cause === undefined ? {} : { cause }),
  });
}

/**
 * Identifies an uploaded image from its bytes (ADR-012). The file name and the declared content
 * type are ignored: a text file named `.png` or an SVG is 415, and so is an image sharp cannot read.
 */
export async function inspectImage(buffer: Buffer): Promise<InspectedImage> {
  const detected = await fileTypeFromBuffer(buffer);
  const mimeType = assetMimeTypeSchema.safeParse(detected?.mime);
  if (!mimeType.success) {
    throw unsupported();
  }
  let size: { width: number; height: number };
  try {
    size = (await sharp(buffer).metadata()).autoOrient;
  } catch (error) {
    throw unsupported(error);
  }
  if (!(size.width > 0 && size.height > 0)) {
    throw unsupported();
  }
  return {
    mimeType: mimeType.data,
    extension: extensionByMimeType[mimeType.data],
    width: size.width,
    height: size.height,
  };
}
