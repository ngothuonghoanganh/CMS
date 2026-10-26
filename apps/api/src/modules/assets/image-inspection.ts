import { type AssetMimeType, assetMimeTypeSchema } from '@plp/contracts';
import { fileTypeFromBuffer } from 'file-type';
import sharp, { type Sharp } from 'sharp';
import { AppError } from '../../shared/errors.js';
import { TaskLimiter, TooManyWaitingError } from '../../shared/task-limiter.js';

export const UNSUPPORTED_IMAGE_MESSAGE = 'Chỉ hỗ trợ ảnh JPG, PNG, WebP, AVIF hoặc GIF';

/**
 * Decoding costs memory in proportion to the pixels, whatever the file size: a 1 KB AVIF can
 * describe 64 million of them. Every frame of an animation counts (ADR-012).
 */
export const MAX_ASSET_PIXELS = 25_000_000;
export const IMAGE_TOO_LARGE_MESSAGE = 'Ảnh tối đa 25 megapixel (khoảng 6000 × 4000 điểm ảnh)';

/** Published images fit in this square: enough for a full-width image on a large screen. */
export const MAX_ASSET_EDGE = 2560;

export const IMAGES_BUSY_MESSAGE = 'Đang xử lý nhiều ảnh cùng lúc. Thử lại sau ít phút.';

/**
 * One image is decoded and encoded at a time: an AVIF of 25 megapixels alone takes about 0.5 GB
 * while it is decoded. Uploads waiting their turn still hold their bytes, so few may wait.
 */
const encoding = new TaskLimiter({ running: 1, waiting: 8 });

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
}

/** The image as it is stored and served. */
export interface PublishedImage {
  body: Buffer;
  /** Display size, after the orientation is applied and the image is scaled down. */
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

function tooLarge(): AppError {
  return new AppError(413, 'payload_too_large', IMAGE_TOO_LARGE_MESSAGE, {
    issues: [{ path: ['file'], code: 'payload_too_large', message: IMAGE_TOO_LARGE_MESSAGE }],
  });
}

/**
 * Identifies an uploaded image from its bytes (ADR-012). The file name and the declared content
 * type are ignored: a text file named `.png` or an SVG is 415, and so is an image sharp cannot read.
 * Only the header is read here, so an image over `MAX_ASSET_PIXELS` is refused before any decoding.
 */
export async function inspectImage(buffer: Buffer): Promise<InspectedImage> {
  const detected = await fileTypeFromBuffer(buffer);
  const mimeType = assetMimeTypeSchema.safeParse(detected?.mime);
  if (!mimeType.success) {
    throw unsupported();
  }
  let pixels: number;
  try {
    // Reading the header decodes nothing, so sharp's own pixel limit is not needed yet.
    const { width, height, pages } = await sharp(buffer, { limitInputPixels: false }).metadata();
    pixels = width * height * (pages ?? 1);
  } catch (error) {
    throw unsupported(error);
  }
  if (!(pixels > 0)) {
    throw unsupported();
  }
  if (pixels > MAX_ASSET_PIXELS) {
    throw tooLarge();
  }
  return { mimeType: mimeType.data, extension: extensionByMimeType[mimeType.data] };
}

function encoded(image: Sharp, mimeType: AssetMimeType): Sharp {
  switch (mimeType) {
    case 'image/jpeg':
      return image.jpeg({ quality: 90, mozjpeg: true });
    case 'image/png':
      return image.png();
    case 'image/webp':
      return image.webp({ quality: 90 });
    case 'image/avif':
      return image.avif({ quality: 70 });
    case 'image/gif':
      return image.gif();
  }
}

async function publish(buffer: Buffer, mimeType: AssetMimeType): Promise<PublishedImage> {
  // `failOn: 'none'`: a JPEG cut short still shows in a browser, so it is still accepted.
  const image = sharp(buffer, {
    animated: true,
    failOn: 'none',
    limitInputPixels: MAX_ASSET_PIXELS,
  })
    .autoOrient()
    .keepIccProfile()
    .resize({
      width: MAX_ASSET_EDGE,
      height: MAX_ASSET_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    });
  try {
    const { data, info } = await encoded(image, mimeType).toBuffer({ resolveWithObject: true });
    return { body: data, width: info.width, height: info.pageHeight ?? info.height };
  } catch (error) {
    throw unsupported(error);
  }
}

/**
 * The image as it is published: encoded again without the metadata a photo carries (EXIF, XMP and
 * IPTC: GPS position, camera, author, capture time), turned upright since its orientation tag
 * goes too, scaled down to fit `MAX_ASSET_EDGE`, with its colour profile and every animation frame
 * kept. Anyone can download a public image, so nothing in it may tell where, when or by whom it
 * was taken (ADR-012).
 */
export async function publishedImage(
  buffer: Buffer,
  mimeType: AssetMimeType,
): Promise<PublishedImage> {
  try {
    return await encoding.run(() => publish(buffer, mimeType));
  } catch (error) {
    if (error instanceof TooManyWaitingError) {
      throw new AppError(429, 'rate_limited', IMAGES_BUSY_MESSAGE, { cause: error });
    }
    throw error;
  }
}
