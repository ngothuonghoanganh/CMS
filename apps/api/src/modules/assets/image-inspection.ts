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

/**
 * The image as it is published: encoded again without the metadata a photo carries (EXIF, XMP and
 * IPTC: GPS position, camera, author, capture time), turned upright since its orientation tag
 * goes too, with its colour profile and every animation frame kept. Anyone can download a public
 * image, so nothing in it may tell where, when or by whom it was taken (ADR-012).
 */
export async function withoutMetadata(buffer: Buffer, mimeType: AssetMimeType): Promise<Buffer> {
  const image = sharp(buffer, { animated: true }).autoOrient().keepIccProfile();
  try {
    switch (mimeType) {
      case 'image/jpeg':
        return await image.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
      case 'image/png':
        return await image.png().toBuffer();
      case 'image/webp':
        return await image.webp({ quality: 90 }).toBuffer();
      case 'image/avif':
        return await image.avif({ quality: 70 }).toBuffer();
      case 'image/gif':
        return await image.gif().toBuffer();
    }
  } catch (error) {
    throw unsupported(error);
  }
}
