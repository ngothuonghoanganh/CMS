import {
  type ConsentVersion,
  consentVersionSchema,
  type CreateConsentVersionRequest,
  type PrivacySettings,
  privacySettingsSchema,
  type UpdatePrivacyRequest,
} from '@plp/contracts';
import type { TestClient } from './client.js';

export const PRIVACY_SETTINGS: UpdatePrivacyRequest = {
  controllerName: 'Công ty TNHH Nha khoa Smile Care',
  requestEmail: 'dulieu@smilecare.vn',
  policyUrl: 'https://smilecare.vn/chinh-sach-quyen-rieng-tu',
  retentionMonths: 12,
};

export const CONSENT_TEXTS: Omit<CreateConsentVersionRequest, 'baseVersion'> = {
  requiredText:
    'Tôi đồng ý để {Tên doanh nghiệp} xử lý họ tên và số điện thoại của tôi nhằm liên hệ tư vấn dịch vụ.',
  marketingText: 'Nhận thông tin ưu đãi qua Zalo hoặc SMS (không bắt buộc)',
};

/** Saves the site's personal data settings as its owner. */
export async function savePrivacy(
  client: TestClient,
  siteId: string,
  overrides: Partial<UpdatePrivacyRequest> = {},
): Promise<PrivacySettings> {
  const response = await client
    .put(`/sites/${siteId}/privacy`, { ...PRIVACY_SETTINGS, ...overrides })
    .expect(200);
  return privacySettingsSchema.parse(response.body);
}

/** Saves the next consent version over `baseVersion` as the site's owner. */
export async function saveConsentVersion(
  client: TestClient,
  siteId: string,
  baseVersion: number,
  texts: Partial<Omit<CreateConsentVersionRequest, 'baseVersion'>> = {},
): Promise<ConsentVersion> {
  const response = await client
    .post(`/sites/${siteId}/consent-versions`, { baseVersion, ...CONSENT_TEXTS, ...texts })
    .expect(201);
  return consentVersionSchema.parse(response.body);
}

/** Complete consent settings: what a page with a form needs before it can be published. */
export async function configurePrivacy(
  client: TestClient,
  siteId: string,
): Promise<{ settings: PrivacySettings; consent: ConsentVersion }> {
  const settings = await savePrivacy(client, siteId);
  const consent = await saveConsentVersion(client, siteId, 0);
  return { settings, consent };
}
