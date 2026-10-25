import { assetSchema } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { newObjectId } from '../../shared/persistence/object-id.js';
import { toAssetDto } from './asset-dto.js';
import type { AssetRecord } from './asset.schema.js';

describe('toAssetDto', () => {
  it('maps a stored asset to the contract and keeps the storage key internal', () => {
    const record: AssetRecord = {
      _id: newObjectId(),
      workspaceId: newObjectId(),
      siteId: newObjectId(),
      storageKey: 'public/w/s/a.webp',
      mimeType: 'image/webp',
      bytes: 2048,
      width: 1200,
      height: 630,
      alt: 'Phòng khám',
      decorative: false,
      uploadedBy: newObjectId(),
      createdAt: new Date('2026-10-24T07:00:00.000Z'),
    };
    const uploadedBy = { id: record.uploadedBy.toHexString(), name: 'Minh' };
    const dto = toAssetDto(record, 'https://cdn.example.com/plp/public/w/s/a.webp', uploadedBy);
    expect(assetSchema.parse(dto)).toEqual({
      id: record._id.toHexString(),
      siteId: record.siteId.toHexString(),
      url: 'https://cdn.example.com/plp/public/w/s/a.webp',
      mimeType: 'image/webp',
      bytes: 2048,
      width: 1200,
      height: 630,
      alt: 'Phòng khám',
      decorative: false,
      uploadedBy,
      createdAt: '2026-10-24T07:00:00.000Z',
    });
    expect(dto).not.toHaveProperty('storageKey');
    expect(dto).not.toHaveProperty('workspaceId');
  });
});
