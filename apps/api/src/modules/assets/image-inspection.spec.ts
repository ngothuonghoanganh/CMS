import sharp, { type Sharp } from 'sharp';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../shared/errors.js';
import { inspectImage } from './image-inspection.js';

function blank(width: number, height: number) {
  return sharp({ create: { width, height, channels: 4, background: '#0F5E55' } });
}

async function expectUnsupported(buffer: Buffer): Promise<void> {
  const error: unknown = await inspectImage(buffer).then(
    () => null,
    (rejection: unknown) => rejection,
  );
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({
    status: 415,
    code: 'unsupported_media_type',
    title: 'Chỉ hỗ trợ ảnh JPG, PNG, WebP, AVIF hoặc GIF',
  });
}

describe('inspectImage', () => {
  it.each([
    ['png', 'image/png', (image: Sharp) => image.png()],
    ['jpg', 'image/jpeg', (image: Sharp) => image.jpeg()],
    ['webp', 'image/webp', (image: Sharp) => image.webp()],
    ['gif', 'image/gif', (image: Sharp) => image.gif()],
    ['avif', 'image/avif', (image: Sharp) => image.avif()],
  ] as const)('identifies %s from its bytes with its size', async (extension, mimeType, encode) => {
    const buffer = await encode(blank(40, 24)).toBuffer();
    expect(await inspectImage(buffer)).toEqual({ mimeType, extension, width: 40, height: 24 });
  });

  it('reports the display size of a JPEG rotated by its EXIF orientation', async () => {
    const buffer = await blank(40, 24).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect(await inspectImage(buffer)).toMatchObject({ width: 24, height: 40 });
  });

  it('rejects text, whatever the file is called', async () => {
    await expectUnsupported(Buffer.from('<html>not an image</html>'));
  });

  it('rejects SVG, which could carry scripts', async () => {
    await expectUnsupported(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'),
    );
  });

  it('rejects other image formats such as TIFF', async () => {
    await expectUnsupported(await blank(4, 4).tiff().toBuffer());
  });

  it('rejects a file with an image signature that cannot be read', async () => {
    const png = await blank(4, 4).png().toBuffer();
    await expectUnsupported(Buffer.concat([png.subarray(0, 8), Buffer.from('garbage')]));
  });
});
