import sharp, { type Sharp } from 'sharp';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../shared/errors.js';
import { inspectImage, withoutMetadata } from './image-inspection.js';

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

describe('withoutMetadata', () => {
  /** A phone photo: GPS position, camera and author, stored sideways with an orientation tag. */
  function phonePhoto() {
    return blank(40, 24)
      .jpeg()
      .withExif({
        IFD0: { Make: 'QA-Phone', Model: 'QA Model X', Artist: 'Nguyen Van QA' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '10/1 46/1 30/1' },
      })
      .withMetadata({ orientation: 6 })
      .toBuffer();
  }

  it('drops where, when and by whom a photo was taken, and turns it upright', async () => {
    const photo = await phonePhoto();
    expect((await sharp(photo).metadata()).exif?.toString('latin1')).toContain('Nguyen Van QA');

    const published = await withoutMetadata(photo, 'image/jpeg');
    const metadata = await sharp(published).metadata();
    expect(metadata).toMatchObject({ format: 'jpeg', width: 24, height: 40 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.iptc).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    expect(published.toString('latin1')).not.toContain('QA-Phone');
  });

  it.each([
    ['image/png', (image: Sharp) => image.png()],
    ['image/webp', (image: Sharp) => image.webp()],
    ['image/avif', (image: Sharp) => image.avif()],
    ['image/gif', (image: Sharp) => image.gif()],
  ] as const)('keeps a %s in its format and size, without metadata', async (mimeType, encode) => {
    const input = await encode(
      blank(40, 24).withExif({ IFD0: { Artist: 'Nguyen Van QA' } }),
    ).toBuffer();
    const published = await withoutMetadata(input, mimeType);
    const metadata = await sharp(published).metadata();
    expect(`image/${metadata.format === 'heif' ? 'avif' : metadata.format}`).toBe(mimeType);
    expect(metadata).toMatchObject({ width: 40, height: 24 });
    expect(metadata.exif).toBeUndefined();
  });

  it('keeps every frame of an animation', async () => {
    const frames = await Promise.all(
      ['#0F5E55', '#F2A33A'].map((background) =>
        sharp({ create: { width: 40, height: 24, channels: 4, background } })
          .png()
          .toBuffer(),
      ),
    );
    const animation = await sharp(frames, { join: { animated: true } })
      .gif()
      .toBuffer();
    const published = await withoutMetadata(animation, 'image/gif');
    expect(await sharp(published, { animated: true }).metadata()).toMatchObject({
      pages: 2,
      width: 40,
      pageHeight: 24,
    });
  });
});
