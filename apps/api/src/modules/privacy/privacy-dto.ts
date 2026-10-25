import type { ConsentVersion, SitePrivacy, UserRef } from '@plp/contracts';
import type { SitePrivacyRecord } from '../sites/site.schema.js';
import type { ConsentVersionRecord } from './consent-version.schema.js';

export function toSitePrivacyDto(record: SitePrivacyRecord): SitePrivacy {
  return {
    controllerName: record.controllerName,
    requestEmail: record.requestEmail,
    policyUrl: record.policyUrl,
    retentionMonths: record.retentionMonths,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toConsentVersionDto(
  record: ConsentVersionRecord,
  createdBy: UserRef,
): ConsentVersion {
  return {
    id: record._id.toHexString(),
    version: record.version,
    requiredText: record.requiredText,
    marketingText: record.marketingText,
    createdBy,
    createdAt: record.createdAt.toISOString(),
  };
}
