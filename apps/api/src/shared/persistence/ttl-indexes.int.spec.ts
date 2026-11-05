import type { Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient } from '../../../test/client.js';

/**
 * Collections whose documents MongoDB deletes at their own `expiresAt`: sessions and login attempts
 * (ADR-004), sign-ups waiting for their email, password reset links and the hourly count of
 * account emails (ADR-026), lead rate-limit windows (ADR-016), leads past the site's retention (rule 10), and the
 * day salts, "seen today" hashes and daily totals of page views (ADR-019). Invitations and access
 * requests go at their `purgeAt` (ADR-021), since their `expiresAt` is when a link stops working,
 * and closed requests to publish at theirs (ADR-023). AI jobs go 30 days after they start
 * (ADR-031): the brief need not stay.
 * The app only computes the date, so without the index nothing is ever deleted. The master DB
 * holds accounts, access and shared counters; each workspace database its own data (ADR-025).
 */
const EXPIRING_IN_MASTER: Record<string, string> = {
  sessions: 'expiresAt',
  login_attempts: 'expiresAt',
  pending_signups: 'expiresAt',
  password_resets: 'expiresAt',
  auth_email_limits: 'expiresAt',
  lead_limits: 'expiresAt',
  analytics_salts: 'expiresAt',
  invitations: 'purgeAt',
  access_requests: 'purgeAt',
};

const EXPIRING_IN_WORKSPACE: Record<string, string> = {
  ai_jobs: 'expiresAt',
  leads: 'expiresAt',
  // A customer, their pairs, notes, tasks and meetings follow the site's retention (ADR-033).
  contacts: 'expiresAt',
  merge_suggestions: 'expiresAt',
  contact_events: 'expiresAt',
  tasks: 'expiresAt',
  meetings: 'expiresAt',
  analytics_seen: 'expiresAt',
  analytics_daily: 'expiresAt',
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

async function ttlIndexesOf(connection: Connection): Promise<TtlIndex[]> {
  const found: TtlIndex[] = [];
  for (const { name } of await connection.listCollections()) {
    for (const index of await connection.collection(name).indexes()) {
      if (index.expireAfterSeconds !== undefined) {
        found.push({
          collection: name,
          key: index.key,
          expireAfterSeconds: index.expireAfterSeconds,
        });
      }
    }
  }
  return found.sort(byCollection);
}

function expected(collections: Record<string, string>): TtlIndex[] {
  return Object.entries(collections)
    .map(([collection, field]) => ({ collection, key: { [field]: 1 }, expireAfterSeconds: 0 }))
    .sort(byCollection);
}

describe('TTL indexes', () => {
  let t: TestApp;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_ttl_indexes');
    // Signing up creates the workspace and its database, with every index (ADR-025).
    workspaceId = (await signedUpClient(t.app)).workspaceId;
  });

  afterAll(async () => {
    await t.close();
  });

  it('delete documents at their date in exactly the collections that promise it', async () => {
    expect(await ttlIndexesOf(t.connection)).toEqual(expected(EXPIRING_IN_MASTER));
    expect(await ttlIndexesOf(t.workspaceDb(workspaceId))).toEqual(expected(EXPIRING_IN_WORKSPACE));
  });
});
