import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';

/**
 * Collections whose documents MongoDB deletes at their own `expiresAt`: sessions and login attempts
 * (ADR-004), lead rate-limit windows (ADR-016), leads past the site's retention (rule 10), and the
 * day salts, "seen today" hashes and daily totals of page views (ADR-019). Invitations and access
 * requests go at their `purgeAt` (ADR-021), since their `expiresAt` is when a link stops working,
 * and closed requests to publish at theirs (ADR-023).
 * The app only computes the date, so without the index nothing is ever deleted.
 */
const EXPIRING_COLLECTIONS: Record<string, string> = {
  sessions: 'expiresAt',
  login_attempts: 'expiresAt',
  lead_limits: 'expiresAt',
  leads: 'expiresAt',
  analytics_salts: 'expiresAt',
  analytics_seen: 'expiresAt',
  analytics_daily: 'expiresAt',
  invitations: 'purgeAt',
  access_requests: 'purgeAt',
  publish_approvals: 'purgeAt',
};

interface TtlIndex {
  collection: string;
  key: unknown;
  expireAfterSeconds: number;
}

function byCollection(a: TtlIndex, b: TtlIndex): number {
  return a.collection.localeCompare(b.collection);
}

describe('TTL indexes', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_ttl_indexes');
  });

  afterAll(async () => {
    await t.close();
  });

  it('delete documents at their date in exactly the collections that promise it', async () => {
    const found: TtlIndex[] = [];
    for (const { name } of await t.connection.listCollections()) {
      for (const index of await t.connection.collection(name).indexes()) {
        if (index.expireAfterSeconds !== undefined) {
          found.push({
            collection: name,
            key: index.key,
            expireAfterSeconds: index.expireAfterSeconds,
          });
        }
      }
    }
    expect(found.sort(byCollection)).toEqual(
      Object.entries(EXPIRING_COLLECTIONS)
        .map(([collection, field]) => ({
          collection,
          key: { [field]: 1 },
          expireAfterSeconds: 0,
        }))
        .sort(byCollection),
    );
  });
});
