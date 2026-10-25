import {
  activityListResponseSchema,
  assetListResponseSchema,
  assetSchema,
  MAX_ASSET_BYTES,
  problemSchema,
} from '@plp/contracts';
import { Types } from 'mongoose';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import {
  addEditor,
  createSite,
  pngImage,
  uploadImage,
  uploadRequest,
} from '../../../test/resources.js';
import { ASSET_MODEL, type AssetRecord } from './asset.schema.js';

describe('assets', () => {
  let t: TestApp;
  let owner: TestClient;
  let ownerName: string;
  let workspaceId: string;
  let siteId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_assets');
    const signedUp = await signedUpClient(t.app, { name: 'Người tải ảnh' });
    owner = signedUp.client;
    ownerName = signedUp.me.user.name;
    workspaceId = signedUp.workspaceId;
    siteId = (await createSite(owner, workspaceId)).id;
  });

  afterAll(async () => {
    await t.close();
  });

  describe('upload', () => {
    it('stores a PNG with its real size and type, readable by anyone at its url', async () => {
      const png = await pngImage(32, 20);
      const response = await uploadRequest(
        owner,
        siteId,
        png,
        { alt: '  Ghế nha khoa  ' },
        'x.jpg',
      ).expect(201);
      const asset = assetSchema.parse(response.body);
      expect(asset).toMatchObject({
        siteId,
        mimeType: 'image/png',
        bytes: png.length,
        width: 32,
        height: 20,
        alt: 'Ghế nha khoa',
        decorative: false,
        uploadedBy: { name: ownerName },
      });
      expect(asset.url).toBe(
        `${t.env.S3_PUBLIC_BASE_URL}/public/${workspaceId}/${siteId}/${asset.id}.png`,
      );

      const object = await fetch(asset.url);
      expect(object.status).toBe(200);
      expect(object.headers.get('content-type')).toBe('image/png');
      const served = Buffer.from(await object.arrayBuffer());
      expect(served).toHaveLength(asset.bytes);
      expect(await sharp(served).metadata()).toMatchObject({
        format: 'png',
        width: 32,
        height: 20,
      });
    });

    it('publishes a photo without its GPS position, camera or author', async () => {
      const photo = await sharp({
        create: { width: 30, height: 12, channels: 3, background: '#f2a33a' },
      })
        .jpeg()
        .withExif({
          IFD0: { Make: 'QA-Phone', Artist: 'Nguyen Van QA' },
          IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '10/1 46/1 30/1' },
        })
        .withMetadata({ orientation: 6 })
        .toBuffer();
      const response = await uploadRequest(
        owner,
        siteId,
        photo,
        { alt: 'Khách hàng tại nhà' },
        'IMG_0042.jpg',
      ).expect(201);
      const asset = assetSchema.parse(response.body);
      expect(asset).toMatchObject({ mimeType: 'image/jpeg', width: 12, height: 30 });

      const served = Buffer.from(await (await fetch(asset.url)).arrayBuffer());
      const metadata = await sharp(served).metadata();
      expect(metadata).toMatchObject({ width: 12, height: 30 });
      expect(metadata.exif).toBeUndefined();
      expect(served.toString('latin1')).not.toContain('Nguyen Van QA');
    });

    it('reads the size of other supported formats', async () => {
      const jpeg = await sharp({
        create: { width: 12, height: 30, channels: 3, background: '#f2a33a' },
      })
        .jpeg()
        .toBuffer();
      const response = await uploadRequest(
        owner,
        siteId,
        jpeg,
        { alt: 'Ảnh JPG' },
        'photo.jpg',
      ).expect(201);
      expect(assetSchema.parse(response.body)).toMatchObject({
        mimeType: 'image/jpeg',
        width: 12,
        height: 30,
      });
    });

    it('records asset.uploaded', async () => {
      const { client, workspaceId: ownWorkspace } = await signedUpClient(t.app);
      const site = await createSite(client, ownWorkspace);
      await uploadImage(client, site.id);
      const response = await client.get(`/sites/${site.id}/activity`).expect(200);
      expect(
        activityListResponseSchema.parse(response.body).items.map((item) => item.type),
      ).toEqual(['asset.uploaded', 'site.created']);
    });

    it('stores alt as null for a decorative image, even when a description was sent', async () => {
      const asset = await uploadImage(owner, siteId, { alt: 'Bị bỏ qua', decorative: 'true' });
      expect(asset).toMatchObject({ alt: null, decorative: true });
    });

    it('requires a description unless the image is decorative (422 on alt)', async () => {
      const response = await uploadRequest(owner, siteId, await pngImage(), {}).expect(422);
      const problem = problemSchema.parse(response.body);
      expect(problem.code).toBe('validation_failed');
      expect(problem.issues).toEqual([
        {
          path: ['alt'],
          code: 'custom',
          message: 'Nhập mô tả ảnh hoặc đánh dấu "Ảnh chỉ để trang trí"',
        },
      ]);
    });

    it('requires a file', async () => {
      const response = await uploadRequest(owner, siteId, null).expect(422);
      expect(problemSchema.parse(response.body).issues?.[0]).toMatchObject({
        path: ['file'],
        message: 'Chọn một ảnh để tải lên',
      });
    });

    it('detects the type from the bytes: a text file named .png is 415', async () => {
      const response = await uploadRequest(
        owner,
        siteId,
        Buffer.from('Đây không phải là ảnh'),
        { alt: 'Giả mạo' },
        'fake.png',
      ).expect(415);
      const problem = problemSchema.parse(response.body);
      expect(problem.code).toBe('unsupported_media_type');
      expect(problem.title).toBe('Chỉ hỗ trợ ảnh JPG, PNG, WebP, AVIF hoặc GIF');
    });

    it('rejects SVG and images that cannot be read with 415', async () => {
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
      );
      await uploadRequest(owner, siteId, svg, { alt: 'SVG' }, 'logo.svg').expect(415);

      const png = await pngImage();
      const truncated = Buffer.concat([png.subarray(0, 8), Buffer.from('broken header')]);
      await uploadRequest(owner, siteId, truncated, { alt: 'Hỏng' }, 'broken.png').expect(415);
    });

    it('rejects a file over 10 MB with 413', async () => {
      const tooLarge = Buffer.alloc(MAX_ASSET_BYTES + 1);
      (await pngImage()).copy(tooLarge);
      const response = await uploadRequest(owner, siteId, tooLarge, { alt: 'Quá lớn' }).expect(413);
      const problem = problemSchema.parse(response.body);
      expect(problem.code).toBe('payload_too_large');
      expect(problem.title).toBe('Ảnh tối đa 10 MB');
    });

    it('lets an editor upload', async () => {
      const editor = await addEditor(t, workspaceId);
      const asset = await uploadImage(editor.client, siteId);
      expect(asset.uploadedBy.name).toBe(editor.me.user.name);
    });
  });

  describe('list', () => {
    it('lists assets of the site newest first with cursor pagination', async () => {
      const { client, workspaceId: ownWorkspace } = await signedUpClient(t.app);
      const site = await createSite(client, ownWorkspace);
      const uploaded = [];
      for (let index = 0; index < 3; index += 1) {
        uploaded.push(await uploadImage(client, site.id, { alt: `Ảnh ${index}` }));
      }
      const newestFirst = uploaded.reverse().map((asset) => asset.id);

      const first = assetListResponseSchema.parse(
        (await client.get(`/sites/${site.id}/assets?limit=2`).expect(200)).body,
      );
      expect(first.items.map((asset) => asset.id)).toEqual(newestFirst.slice(0, 2));
      expect(first.nextCursor).not.toBeNull();

      const second = assetListResponseSchema.parse(
        (
          await client
            .get(`/sites/${site.id}/assets`)
            .query({ limit: 2, cursor: first.nextCursor })
            .expect(200)
        ).body,
      );
      expect(second.items.map((asset) => asset.id)).toEqual(newestFirst.slice(2));
      expect(second.nextCursor).toBeNull();
    });

    it('only lists assets of the requested site', async () => {
      const other = await createSite(owner, workspaceId);
      const asset = await uploadImage(owner, other.id);
      const response = await owner.get(`/sites/${siteId}/assets?limit=50`).expect(200);
      const ids = assetListResponseSchema.parse(response.body).items.map((item) => item.id);
      expect(ids).not.toContain(asset.id);
    });

    it('rejects a forged cursor', async () => {
      await owner.get(`/sites/${siteId}/assets?cursor=forged`).expect(422);
    });

    it('looks up assets by ids in the requested order, only within the site', async () => {
      const { client, workspaceId: ownWorkspace } = await signedUpClient(t.app);
      const site = await createSite(client, ownWorkspace);
      const otherSite = await createSite(client, ownWorkspace);
      const first = await uploadImage(client, site.id, { alt: 'Một' });
      const second = await uploadImage(client, site.id, { alt: 'Hai' });
      await uploadImage(client, site.id, { alt: 'Không hỏi tới' });
      const ofOtherSite = await uploadImage(client, otherSite.id);
      const ofOtherWorkspace = await uploadImage(owner, siteId);
      const unknown = new Types.ObjectId().toHexString();

      const ids = [first.id, unknown, ofOtherSite.id, second.id, ofOtherWorkspace.id, first.id];
      const response = await client
        .get(`/sites/${site.id}/assets`)
        .query({ ids: ids.join(','), limit: 1, cursor: 'ignored-with-ids' })
        .expect(200);
      const list = assetListResponseSchema.parse(response.body);
      expect(list.items.map((asset) => asset.id)).toEqual([first.id, second.id]);
      expect(list.items[1]).toMatchObject({ alt: 'Hai', url: second.url });
      expect(list.nextCursor).toBeNull();
    });

    it('validates the ids lookup: valid ids only, at most 50', async () => {
      const invalid = await owner.get(`/sites/${siteId}/assets?ids=abc`).expect(422);
      expect(problemSchema.parse(invalid.body).issues?.[0]?.path).toEqual(['ids', 0]);
      await owner.get(`/sites/${siteId}/assets?ids=`).expect(422);
      const tooMany = Array.from({ length: 51 }, () => new Types.ObjectId().toHexString());
      const response = await owner
        .get(`/sites/${siteId}/assets`)
        .query({ ids: tooMany.join(',') })
        .expect(422);
      expect(problemSchema.parse(response.body).issues?.[0]).toMatchObject({
        path: ['ids'],
        message: 'Tra cứu tối đa 50 ảnh mỗi lần',
      });
      const fifty = tooMany.slice(0, 50).join(',');
      await owner.get(`/sites/${siteId}/assets`).query({ ids: fifty }).expect(200);
    });

    it('answers 404 for the ids lookup on a site of another workspace', async () => {
      const asset = await uploadImage(owner, siteId);
      const { client } = await signedUpClient(t.app);
      const response = await client
        .get(`/sites/${siteId}/assets`)
        .query({ ids: asset.id })
        .expect(404);
      expect(problemSchema.parse(response.body).code).toBe('not_found');
    });
  });

  describe('update', () => {
    it('switches between described and decorative', async () => {
      const asset = await uploadImage(owner, siteId);

      const decorative = await owner
        .patch(`/assets/${asset.id}`, { alt: 'Bị bỏ qua', decorative: true })
        .expect(200);
      expect(assetSchema.parse(decorative.body)).toMatchObject({
        id: asset.id,
        alt: null,
        decorative: true,
        url: asset.url,
      });

      const described = await owner
        .patch(`/assets/${asset.id}`, { alt: ' Mô tả mới ', decorative: false })
        .expect(200);
      expect(assetSchema.parse(described.body)).toMatchObject({
        alt: 'Mô tả mới',
        decorative: false,
        uploadedBy: { name: ownerName },
      });
    });

    it('rejects an empty description without the decorative flag', async () => {
      const asset = await uploadImage(owner, siteId);
      const response = await owner
        .patch(`/assets/${asset.id}`, { alt: '   ', decorative: false })
        .expect(422);
      expect(problemSchema.parse(response.body).issues?.[0]?.path).toEqual(['alt']);
    });

    it('answers 404 for an unknown asset', async () => {
      const response = await owner
        .patch('/assets/0123456789abcdef01234567', { alt: 'x', decorative: false })
        .expect(404);
      expect(problemSchema.parse(response.body).title).toBe('Không tìm thấy ảnh');
    });

    it('lets an editor change descriptions', async () => {
      const asset = await uploadImage(owner, siteId);
      const editor = await addEditor(t, workspaceId);
      await editor.client
        .patch(`/assets/${asset.id}`, { alt: 'Editor sửa', decorative: false })
        .expect(200);
    });
  });

  describe('model', () => {
    it('stores either a non-empty alt or the decorative flag, never both or neither', async () => {
      const model = t.connection.model<AssetRecord>(ASSET_MODEL);
      const base = {
        workspaceId: new Types.ObjectId(),
        siteId: new Types.ObjectId(),
        storageKey: 'public/model-test.png',
        mimeType: 'image/png',
        bytes: 1,
        width: 1,
        height: 1,
        uploadedBy: new Types.ObjectId(),
        createdAt: new Date(),
      };
      await expect(
        new model({ ...base, alt: 'Mô tả', decorative: false }).validate(),
      ).resolves.toBe(undefined);
      await expect(new model({ ...base, alt: null, decorative: true }).validate()).resolves.toBe(
        undefined,
      );
      for (const invalid of [
        { alt: null, decorative: false },
        { alt: '   ', decorative: false },
        { alt: 'Mô tả', decorative: true },
      ]) {
        await expect(new model({ ...base, ...invalid }).validate()).rejects.toThrow(/alt/);
      }
    });
  });
});
