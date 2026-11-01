import { type Domain, domainKind } from '@plp/contracts';
import { type DomainTargets, domainStatus, expectedRecords } from './domain/domain-rules.js';
import type { DomainRecord } from './domain.schema.js';

export const DOMAIN_NOT_FOUND = 'Không tìm thấy tên miền';

export function toDomainDto(
  domain: DomainRecord,
  context: {
    ownedElsewhere: boolean;
    primary: boolean;
    targets: DomainTargets;
    addedByName: string;
    now: Date;
  },
): Domain {
  return {
    id: domain._id.toHexString(),
    hostname: domain.hostname,
    kind: domainKind(domain.hostname),
    status: domainStatus(domain, context.ownedElsewhere, context.now),
    primary: context.primary,
    records: expectedRecords(domain, context.targets),
    found: domain.check.found,
    checkedAt: domain.check.at?.toISOString() ?? null,
    nextCheckAt: domain.nextCheckAt?.toISOString() ?? null,
    activeSince: domain.activeSince?.toISOString() ?? null,
    lostSince: domain.lostSince?.toISOString() ?? null,
    httpsValidUntil: domain.check.httpsValidUntil?.toISOString() ?? null,
    addedBy: { id: domain.addedBy.toHexString(), name: context.addedByName },
    createdAt: domain.createdAt.toISOString(),
  };
}
