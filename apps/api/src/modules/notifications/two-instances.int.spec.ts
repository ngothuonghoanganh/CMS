import { type Site } from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { createSecondInstance } from '../../../test/instances.js';
import {
  createLiveFormPage,
  insertLeads,
  leadBody,
  storedLead,
  submitLead,
} from '../../../test/leads.js';
import {
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { configurePrivacy } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { createSite } from '../../../test/resources.js';
import { LeadNotifier } from './lead-notifier.service.js';

const MINUTE = 60_000;
/** A's waits between attempts: long enough that a test sees which instance acted first. */
const RETRY_DELAYS = [1500, 3000];

/**
 * Two API processes on one database (ADR-018): each lead is emailed once, whichever instance
 * tries it, and the startup sweep of one instance takes on what another left.
 */
describe('two API instances on one database', () => {
  let a: TestApp;
  let b: TestApp;
  let owner: TestClient;
  let workspaceId: string;

  beforeAll(async () => {
    a = await createTestApp('plp_test_two_instances', {
      ...withRevalidationRecorder(new RecordingRevalidationClient()),
      notificationRetryDelaysMs: RETRY_DELAYS,
    });
    // B keeps the production waits; it never needs one here.
    b = await createSecondInstance(a);
    const signedUp = await signedUpClient(a.app);
    owner = signedUp.client;
    workspaceId = signedUp.workspaceId;
  });

  afterAll(async () => {
    await b.close();
    await a.close();
  });

  async function formSite(): Promise<{
    site: Site;
    ids: { workspaceId: string; siteId: string; pageId: string; releaseId: string };
  }> {
    const site = await createSite(owner, workspaceId);
    await configurePrivacy(owner, site.id);
    await addConfirmedRecipient(a, owner, site.id);
    const { pageId, published } = await createLiveFormPage(owner, site.id, uniqueSlug('hai'));
    return { site, ids: { workspaceId, siteId: site.id, pageId, releaseId: published.release.id } };
  }

  /** Lead emails both instances sent, by the lead's name. */
  function emailsTo(name: string) {
    return [...a.emails.sent, ...b.emails.sent].filter((email) =>
      email.subject.endsWith(`Lead mới: ${name}`),
    );
  }

  function idOf(record: Record<string, unknown>): Types.ObjectId {
    const id = record['_id'];
    if (!(id instanceof Types.ObjectId)) {
      throw new Error('insertMany did not set an id');
    }
    return id;
  }

  async function notificationsOf(names: string[]) {
    const leads = await a.connection
      .collection('leads')
      .find({ 'fields.name': { $in: names } })
      .toArray();
    return leads.map((lead) => lead['notification'] as { status: string; attempts: number });
  }

  it('emails each lead once when both instances try all of them at the same time', async () => {
    const { ids } = await formSite();
    const leads = Array.from({ length: 40 }, (_, index) =>
      storedLead({ ...ids, name: `Cùng lúc ${index}`, notification: { status: 'pending' } }),
    );
    await insertLeads(a, leads);
    for (const lead of leads) {
      a.app.get(LeadNotifier).enqueue(idOf(lead));
      b.app.get(LeadNotifier).enqueue(idOf(lead));
    }
    const names = leads.map((_, index) => `Cùng lúc ${index}`);
    await vi.waitFor(
      async () => {
        expect((await notificationsOf(names)).every((item) => item.status === 'sent')).toBe(true);
      },
      { timeout: 10_000, interval: 25 },
    );
    expect((await notificationsOf(names)).map((item) => item.attempts)).toEqual(Array(40).fill(1));
    for (const name of names) {
      expect(emailsTo(name)).toHaveLength(1);
    }
  });

  it('lets the startup sweeps of two instances take on a backlog once', async () => {
    const { ids } = await formSite();
    const now = Date.now();
    const pending = Array.from({ length: 20 }, (_, index) =>
      storedLead({
        ...ids,
        name: `Chờ gửi ${index}`,
        notification: { status: 'pending', updatedAt: new Date(now - 30 * MINUTE) },
      }),
    );
    // Stopped mid-send by an instance that went away: taken on again, as a second attempt.
    const stale = Array.from({ length: 10 }, (_, index) =>
      storedLead({
        ...ids,
        name: `Gửi dở ${index}`,
        notification: { status: 'sending', attempts: 1, updatedAt: new Date(now - 11 * MINUTE) },
      }),
    );
    // Still being sent by a live instance: left to it.
    const sending = Array.from({ length: 5 }, (_, index) =>
      storedLead({
        ...ids,
        name: `Đang gửi ${index}`,
        notification: { status: 'sending', attempts: 1, updatedAt: new Date(now - MINUTE) },
      }),
    );
    await insertLeads(a, [...pending, ...stale, ...sending]);

    await Promise.all([
      a.app.get(LeadNotifier).onApplicationBootstrap(),
      b.app.get(LeadNotifier).onApplicationBootstrap(),
    ]);

    const taken = [
      ...pending.map((_, index) => `Chờ gửi ${index}`),
      ...stale.map((_, index) => `Gửi dở ${index}`),
    ];
    await vi.waitFor(
      async () => {
        expect((await notificationsOf(taken)).every((item) => item.status === 'sent')).toBe(true);
      },
      { timeout: 10_000, interval: 25 },
    );
    for (const name of taken) {
      expect(emailsTo(name)).toHaveLength(1);
    }
    expect(
      (await notificationsOf(stale.map((_, index) => `Gửi dở ${index}`))).map(
        (item) => item.attempts,
      ),
    ).toEqual(Array(10).fill(2));
    const left = sending.map((_, index) => `Đang gửi ${index}`);
    expect(await notificationsOf(left)).toEqual(
      Array(5).fill(expect.objectContaining({ status: 'sending', attempts: 1 })),
    );
    expect(left.flatMap((name) => emailsTo(name))).toEqual([]);
  });

  it('lets a restarting instance send at once a lead another instance waits to try again', async () => {
    const { site, ids } = await formSite();
    a.emails.failNext('smtp_unavailable');
    await submitLead(a, site.subdomain, leadBody(ids.releaseId, { name: 'Chờ lần hai' })).expect(
      201,
    );
    await vi.waitFor(
      async () => {
        expect(await notificationsOf(['Chờ lần hai'])).toEqual([
          expect.objectContaining({ status: 'pending', attempts: 1 }),
        ]);
      },
      { timeout: 5000, interval: 10 },
    );

    // Instance B restarts while A waits 1.5 s (1 minute in production) before its second try.
    const restarted = Date.now();
    await b.app.get(LeadNotifier).onApplicationBootstrap();
    await vi.waitFor(
      async () => {
        expect(await notificationsOf(['Chờ lần hai'])).toEqual([
          expect.objectContaining({ status: 'sent', attempts: 2 }),
        ]);
      },
      { timeout: 5000, interval: 10 },
    );
    // The second attempt did not wait: B's sweep took the lead as soon as it started.
    expect(Date.now() - restarted).toBeLessThan(RETRY_DELAYS[0] ?? 0);
    expect(b.emails.sent.filter((email) => email.subject.endsWith('Chờ lần hai'))).toHaveLength(1);

    // A's own retry comes later, finds the lead sent and sends nothing.
    await new Promise((resolve) => setTimeout(resolve, (RETRY_DELAYS[0] ?? 0) + 300));
    expect(emailsTo('Chờ lần hai')).toHaveLength(1);
    expect(await notificationsOf(['Chờ lần hai'])).toEqual([
      expect.objectContaining({ status: 'sent', attempts: 2 }),
    ]);
  });
});
