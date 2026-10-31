import { type LeadNotification, leadDetailSchema, leadListResponseSchema } from '@plp/contracts';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { createLiveFormPage, leadBody, submitLead } from '../../../test/leads.js';
import {
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { configurePrivacy } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { createSite } from '../../../test/resources.js';

/** Captured before any test fakes the clock: the waits of this file are real. */
const realSetTimeout = globalThis.setTimeout;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    realSetTimeout(resolve, ms);
  });
}

/**
 * The production waits between attempts (ADR-018): at once, after 1 minute, after 5 minutes. The
 * app keeps its real `NOTIFICATION_RETRY_DELAYS`; only `setTimeout` is faked, so the database,
 * the HTTP requests and `Date` stay real while the test moves the clock of the waits.
 */
describe('lead email retry schedule', () => {
  let t: TestApp;
  let owner: TestClient;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_notification_schedule', {
      ...withRevalidationRecorder(new RecordingRevalidationClient()),
    });
    const signedUp = await signedUpClient(t.app);
    owner = signedUp.client;
    workspaceId = signedUp.workspaceId;
  });

  afterAll(async () => {
    await t.close();
  });

  async function notificationOf(leadId: string): Promise<LeadNotification | null> {
    const response = await owner.get(`/leads/${leadId}`).expect(200);
    return leadDetailSchema.parse(response.body).notification;
  }

  /**
   * Waits (for real) until the attempt numbered `expected.attempts` has written its outcome: the
   * attempt starts when the clock moves, then claims and records over a few database calls.
   */
  async function settles(
    leadId: string,
    expected: Partial<LeadNotification> & { attempts: number },
  ): Promise<void> {
    for (let tries = 0; tries < 200; tries += 1) {
      const notification = await notificationOf(leadId);
      if (
        notification !== null &&
        notification.status !== 'sending' &&
        notification.attempts === expected.attempts
      ) {
        expect(notification).toMatchObject(expected);
        return;
      }
      await sleep(10);
    }
    throw new Error('The attempt never finished');
  }

  /** Lets real time pass and checks that no attempt ran meanwhile. */
  async function staysAt(leadId: string, attempts: number): Promise<void> {
    await sleep(150);
    expect(await notificationOf(leadId)).toMatchObject({ status: 'pending', attempts });
  }

  it('tries at once, then 1 minute and 5 minutes later, then gives up', async () => {
    const site = await createSite(owner, workspaceId);
    await configurePrivacy(owner, site.id);
    await addConfirmedRecipient(t, owner, site.id);
    const { published } = await createLiveFormPage(owner, site.id, uniqueSlug('form'));
    t.emails.failNext('smtp_unavailable', 'smtp_unavailable', 'smtp_unavailable');

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await submitLead(t, site.subdomain, leadBody(published.release.id)).expect(201);
      const list = leadListResponseSchema.parse(
        (await owner.get(`/sites/${site.id}/leads`).expect(200)).body,
      );
      const leadId = list.items[0]?.id ?? '';
      // Queued, not yet tried: even "at once" waits for the clock to move.
      expect(await notificationOf(leadId)).toMatchObject({ status: 'pending', attempts: 0 });

      await vi.advanceTimersByTimeAsync(0);
      await settles(leadId, { status: 'pending', attempts: 1, lastErrorCode: 'smtp_unavailable' });

      await vi.advanceTimersByTimeAsync(59_999);
      await staysAt(leadId, 1);
      await vi.advanceTimersByTimeAsync(1);
      await settles(leadId, { status: 'pending', attempts: 2, lastErrorCode: 'smtp_unavailable' });

      await vi.advanceTimersByTimeAsync(299_999);
      await staysAt(leadId, 2);
      await vi.advanceTimersByTimeAsync(1);
      await settles(leadId, { status: 'failed', attempts: 3, lastErrorCode: 'smtp_unavailable' });

      // Nothing more is scheduled for this lead: an hour later it is still the same.
      await vi.advanceTimersByTimeAsync(3_600_000);
      await sleep(150);
      expect(await notificationOf(leadId)).toMatchObject({ status: 'failed', attempts: 3 });
      expect(t.emails.sent.filter((email) => email.subject.includes('Lead mới'))).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
