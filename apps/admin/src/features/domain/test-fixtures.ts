import type { Domain, DomainListResponse } from '@plp/contracts';

export function domainFixture(overrides: Partial<Domain> = {}): Domain {
  return {
    id: '64b0000000000000000000f1',
    hostname: 'go.smilecare.vn',
    kind: 'subdomain',
    status: 'active',
    primary: false,
    records: [
      { type: 'CNAME', name: 'go.smilecare.vn', value: 'cname.payload.site', state: 'ok' },
      {
        type: 'TXT',
        name: '_payload.go.smilecare.vn',
        value: 'payload-verify=8f3a2c91e07b4d5aa1b2c3d4e5f60718',
        state: 'ok',
      },
    ],
    found: [{ type: 'CNAME', value: 'cname.payload.site' }],
    checkedAt: '2026-11-01T02:55:00.000Z',
    nextCheckAt: '2026-11-01T03:05:00.000Z',
    activeSince: '2026-10-14T03:00:00.000Z',
    lostSince: null,
    httpsValidUntil: '2027-01-12T00:00:00.000Z',
    addedBy: { id: '64b0000000000000000000c1', name: 'Ngọc Anh' },
    createdAt: '2026-10-14T02:00:00.000Z',
    ...overrides,
  };
}

export function domainList(
  items: Domain[],
  primaryDomainId: string | null = null,
  livePages: DomainListResponse['livePages'] = { count: 6, exampleSlug: 'uu-dai-nieng-rang' },
): DomainListResponse {
  return { items, defaultHost: 'smilecare.payload.site', primaryDomainId, livePages };
}
