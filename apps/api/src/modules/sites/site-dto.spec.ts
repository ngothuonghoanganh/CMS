import { siteSchema } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { siteOrigin } from '../../config/env.js';
import { newObjectId } from '../../shared/persistence/object-id.js';
import { toSiteDto } from './site-dto.js';
import type { SiteRecord } from './site.schema.js';

function siteRecord(overrides: Partial<SiteRecord> = {}): SiteRecord {
  const createdAt = new Date('2026-10-24T08:30:00.000Z');
  return {
    _id: newObjectId(),
    workspaceId: newObjectId(),
    name: 'Nha khoa Smile Care',
    subdomain: 'smilecare',
    themePresetId: 'indigo',
    logoAssetId: null,
    defaultShareImageAssetId: null,
    pageSeq: 0,
    createdBy: newObjectId(),
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

describe('toSiteDto', () => {
  it('maps a stored site to the contract with ids as hex and dates as ISO strings', () => {
    const site = siteRecord();
    const origin = siteOrigin(
      { PUBLIC_SITE_ORIGIN_TEMPLATE: 'https://{subdomain}.payload.site' },
      site.subdomain,
    );
    const dto = toSiteDto(site, origin);
    expect(siteSchema.parse(dto)).toEqual({
      id: site._id.toHexString(),
      workspaceId: site.workspaceId.toHexString(),
      name: 'Nha khoa Smile Care',
      subdomain: 'smilecare',
      themePresetId: 'indigo',
      logoAssetId: null,
      defaultShareImageAssetId: null,
      defaultOrigin: 'https://smilecare.payload.site',
      privacyConfigured: false,
      confirmedLeadRecipients: 0,
      createdAt: '2026-10-24T08:30:00.000Z',
    });
  });

  it('says whether the privacy settings exist and how many addresses confirmed (ADR-018)', () => {
    const at = new Date('2026-10-24T08:30:00.000Z');
    const recipient = {
      email: 'sales@smilecare.vn',
      addedAt: at,
      invitedAt: at,
      tokenHash: null,
      tokenExpiresAt: null,
    };
    const dto = toSiteDto(
      siteRecord({
        privacy: {
          controllerName: 'Smile Care',
          requestEmail: null,
          policyUrl: 'https://smilecare.vn/chinh-sach',
          retentionMonths: 12,
          updatedAt: at,
          updatedBy: newObjectId(),
        },
        leadRecipients: [
          { ...recipient, _id: newObjectId(), confirmedAt: at },
          { ...recipient, _id: newObjectId(), email: 'cho@smilecare.vn', confirmedAt: null },
        ],
      }),
      'http://smilecare.localhost:3101',
    );
    expect(dto).toMatchObject({ privacyConfigured: true, confirmedLeadRecipients: 1 });
    expect(dto).not.toHaveProperty('leadRecipients');
  });

  it('keeps the image references and leaves internal fields out', () => {
    const logo = newObjectId();
    const share = newObjectId();
    const dto = toSiteDto(
      siteRecord({ logoAssetId: logo, defaultShareImageAssetId: share }),
      'http://smilecare.localhost:3101',
    );
    expect(dto.logoAssetId).toBe(logo.toHexString());
    expect(dto.defaultShareImageAssetId).toBe(share.toHexString());
    expect(dto).not.toHaveProperty('createdBy');
    expect(dto).not.toHaveProperty('updatedAt');
  });
});
