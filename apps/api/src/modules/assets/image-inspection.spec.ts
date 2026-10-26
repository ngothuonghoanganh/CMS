import sharp, { type Sharp } from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../shared/errors.js';
import { TaskLimiter, TooManyWaitingError } from '../../shared/task-limiter.js';
import {
  IMAGE_TOO_LARGE_MESSAGE,
  IMAGES_BUSY_MESSAGE,
  inspectImage,
  MAX_ASSET_EDGE,
  MAX_ASSET_PIXELS,
  publishedImage,
} from './image-inspection.js';

function blank(width: number, height: number) {
  return sharp({ create: { width, height, channels: 4, background: '#0F5E55' } });
}

/**
 * A GIF of `count` frames; they alternate, since the encoder merges identical frames. Two colours
 * at the lowest effort keep encoding tens of megapixels quick.
 */
async function animation(width: number, height: number, count: number): Promise<Buffer> {
  const frames = await Promise.all(
    ['#0F5E55', '#F2A33A'].map((background) =>
      sharp({ create: { width, height, channels: 4, background } })
        .png()
        .toBuffer(),
    ),
  );
  const sequence = Array.from({ length: count }, (_, index) => frames[index % 2]).filter(
    (frame) => frame !== undefined,
  );
  return sharp(sequence, { join: { animated: true } })
    .gif({ effort: 1, colours: 2, dither: 0 })
    .toBuffer();
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
  ] as const)('identifies %s from its bytes', async (extension, mimeType, encode) => {
    const buffer = await encode(blank(40, 24)).toBuffer();
    expect(await inspectImage(buffer)).toEqual({ mimeType, extension });
  });

  it('refuses an image of more pixels than allowed from its header, before decoding it', async () => {
    // Just over the limit, and a few kilobytes: the file size says nothing about the pixels.
    const buffer = await blank(5001, 5000).jpeg({ quality: 20 }).toBuffer();
    expect(5001 * 5000).toBeGreaterThan(MAX_ASSET_PIXELS);
    const decode = vi.spyOn(sharp.prototype, 'toBuffer');
    const error: unknown = await inspectImage(buffer).then(
      () => null,
      (rejection: unknown) => rejection,
    );
    expect(error).toMatchObject({
      status: 413,
      code: 'payload_too_large',
      title: IMAGE_TOO_LARGE_MESSAGE,
    });
    expect(decode).not.toHaveBeenCalled();
    decode.mockRestore();
  });

  it('counts every frame of an animation', async () => {
    // Each frame is far below the limit, the ten together are over it.
    await expect(inspectImage(await animation(1600, 1600, 10))).rejects.toMatchObject({
      status: 413,
    });
    expect(await inspectImage(await animation(1600, 1600, 9))).toEqual({
      mimeType: 'image/gif',
      extension: 'gif',
    });
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

describe('publishedImage', () => {
  /** XMP as photo editors and phones write it: GPS position and the author. */
  const XMP = [
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:exif="http://ns.adobe.com/exif/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"',
    ' exif:GPSLatitude="10,46.5N" exif:GPSLongitude="106,42.1E">',
    '<dc:creator><rdf:Seq><rdf:li>Tran Thi XMP</rdf:li></rdf:Seq></dc:creator>',
    '</rdf:Description></rdf:RDF></x:xmpmeta>',
  ].join('');

  /** A phone photo: GPS position, camera and author, stored sideways with an orientation tag. */
  function phonePhoto() {
    return blank(40, 24)
      .jpeg()
      .withExif({
        IFD0: { Make: 'QA-Phone', Model: 'QA Model X', Artist: 'Nguyen Van QA' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '10/1 46/1 30/1' },
      })
      .withXmp(XMP)
      .withMetadata({ orientation: 6 })
      .toBuffer();
  }

  it('drops where, when and by whom a photo was taken, and turns it upright', async () => {
    const photo = await phonePhoto();
    const before = await sharp(photo).metadata();
    expect(before.exif?.toString('latin1')).toContain('Nguyen Van QA');
    expect(before.xmp?.toString('utf8')).toContain('Tran Thi XMP');

    const published = await publishedImage(photo, 'image/jpeg');
    expect(published).toMatchObject({ width: 24, height: 40 });
    const metadata = await sharp(published.body).metadata();
    expect(metadata).toMatchObject({ format: 'jpeg', width: 24, height: 40 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.iptc).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    for (const trace of ['QA-Phone', 'Tran Thi XMP', '10,46.5N']) {
      expect(published.body.toString('latin1')).not.toContain(trace);
    }
  });

  it('scales a large image down to fit, keeping its shape', async () => {
    const photo = await blank(4000, 3000).jpeg().toBuffer();
    const published = await publishedImage(photo, 'image/jpeg');
    expect(published).toMatchObject({ width: MAX_ASSET_EDGE, height: 1920 });
    expect(await sharp(published.body).metadata()).toMatchObject({ width: 2560, height: 1920 });
  });

  it('still takes a JPEG cut short, as a browser still shows it', async () => {
    const photo = await blank(400, 300).jpeg().toBuffer();
    // Without its end-of-image marker.
    const cut = photo.subarray(0, photo.length - 2);
    expect(await inspectImage(cut)).toEqual({ mimeType: 'image/jpeg', extension: 'jpg' });
    expect(await publishedImage(cut, 'image/jpeg')).toMatchObject({ width: 400, height: 300 });
  });

  it('answers 429 when too many uploads wait for their turn', async () => {
    const run = vi
      .spyOn(TaskLimiter.prototype, 'run')
      .mockRejectedValueOnce(new TooManyWaitingError());
    try {
      const photo = await blank(40, 24).jpeg().toBuffer();
      await expect(publishedImage(photo, 'image/jpeg')).rejects.toMatchObject({
        status: 429,
        code: 'rate_limited',
        title: IMAGES_BUSY_MESSAGE,
      });
    } finally {
      run.mockRestore();
    }
  });

  it.each([
    ['image/png', (image: Sharp) => image.png()],
    ['image/webp', (image: Sharp) => image.webp()],
    ['image/avif', (image: Sharp) => image.avif()],
    ['image/gif', (image: Sharp) => image.gif()],
  ] as const)('keeps a %s in its format and size, without metadata', async (mimeType, encode) => {
    const input = await encode(
      blank(40, 24)
        .withExif({ IFD0: { Artist: 'Nguyen Van QA' } })
        .withXmp(XMP),
    ).toBuffer();
    const published = await publishedImage(input, mimeType);
    expect(published).toMatchObject({ width: 40, height: 24 });
    const metadata = await sharp(published.body).metadata();
    expect(`image/${metadata.format === 'heif' ? 'avif' : metadata.format}`).toBe(mimeType);
    expect(metadata).toMatchObject({ width: 40, height: 24 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(published.body.toString('latin1')).not.toContain('Tran Thi XMP');
  });

  it('keeps every frame of an animation', async () => {
    const published = await publishedImage(await animation(40, 24, 2), 'image/gif');
    expect(published).toMatchObject({ width: 40, height: 24 });
    expect(await sharp(published.body, { animated: true }).metadata()).toMatchObject({
      pages: 2,
      width: 40,
      pageHeight: 24,
    });
  });

  it('scales every frame of a large animation down alike', async () => {
    const published = await publishedImage(await animation(3000, 1000, 2), 'image/gif');
    expect(published).toMatchObject({ width: 2560, height: 853 });
    expect(await sharp(published.body, { animated: true }).metadata()).toMatchObject({
      pages: 2,
      width: 2560,
      pageHeight: 853,
    });
  });
});
