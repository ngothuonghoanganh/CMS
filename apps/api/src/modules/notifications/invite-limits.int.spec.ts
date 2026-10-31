import { Logger } from '@nestjs/common';
import { type LeadRecipient, leadRecipientSchema, problemSchema, type Site } from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { createSite } from '../../../test/resources.js';
import { LeadLimitsRepository } from '../leads/lead-limits.repository.js';
import { inviteLimitKeys, loggableLimitKey } from './domain/notification-rules.js';

/**
 * The daily caps on confirmation emails (ADR-018), counted for real: 5 per site and address, 30
 * per address from every site, 50 per workspace. Only emails that went out count.
 */
describe('confirmation email caps', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_invite_limits');
  });

  afterAll(async () => {
    await t.close();
  });

  function add(client: TestClient, site: Site, email: string) {
    return client.post(`/sites/${site.id}/lead-recipients`, { email });
  }

  async function added(client: TestClient, site: Site, email: string): Promise<LeadRecipient> {
    return leadRecipientSchema.parse((await add(client, site, email).expect(201)).body);
  }

  function resend(client: TestClient, site: Site, recipient: LeadRecipient) {
    return client.post(`/sites/${site.id}/lead-recipients/${recipient.id}/resend`);
  }

  /** Adds `email` to a new site of the workspace and sends it the link `times` times in all. */
  async function inviteOnNewSite(
    owner: { client: TestClient; workspaceId: string },
    email: string,
    times: number,
  ): Promise<{ site: Site; recipient: LeadRecipient }> {
    const site = await createSite(owner.client, owner.workspaceId);
    const recipient = await added(owner.client, site, email);
    for (let sent = 1; sent < times; sent += 1) {
      await resend(owner.client, site, recipient).expect(200);
    }
    return { site, recipient };
  }

  async function expectCapped(response: Promise<{ body: unknown }>): Promise<void> {
    expect(problemSchema.parse((await response).body)).toMatchObject({
      status: 429,
      code: 'rate_limited',
      title: 'Đã gửi quá nhiều thư xác nhận',
    });
  }

  it('sends one address at most 30 links a day, from every site of every workspace', async () => {
    const agency = await signedUpClient(t.app);
    const other = await signedUpClient(t.app);
    const email = 'chung@smilecare.vn';
    // 25 from five sites of one workspace (5 each, the most per site), 5 from another workspace.
    for (let site = 0; site < 5; site += 1) {
      await inviteOnNewSite(agency, email, 5);
    }
    await inviteOnNewSite(other, email, 5);
    expect(t.emails.to(email)).toHaveLength(30);

    const third = await signedUpClient(t.app);
    const site = await createSite(third.client, third.workspaceId);
    await expectCapped(add(third.client, site, email).expect(429));
    await expectCapped(
      add(agency.client, await createSite(agency.client, agency.workspaceId), email).expect(429),
    );
    expect(t.emails.to(email)).toHaveLength(30);
    // Other addresses are not held back.
    await added(third.client, site, 'rieng@smilecare.vn');
  });

  it('sends at most 50 links a day from one workspace, whatever the addresses', async () => {
    const owner = await signedUpClient(t.app);
    const sites: Site[] = [];
    for (let index = 0; index < 10; index += 1) {
      sites.push(await createSite(owner.client, owner.workspaceId));
    }
    for (const [index, site] of sites.entries()) {
      for (let address = 0; address < 5; address += 1) {
        await added(owner.client, site, `nv${index}-${address}@workspace-cap.vn`);
      }
    }
    const extra = await createSite(owner.client, owner.workspaceId);
    await expectCapped(add(owner.client, extra, 'moi@workspace-cap.vn').expect(429));
    expect(
      t.emails.sent.filter((email) => email.to[0]?.endsWith('@workspace-cap.vn')),
    ).toHaveLength(50);
    // Another workspace still sends.
    const neighbour = await signedUpClient(t.app);
    await added(
      neighbour.client,
      await createSite(neighbour.client, neighbour.workspaceId),
      'moi@workspace-cap.vn',
    );
  });

  it('counts no email for a request it refused or an email that could not be sent', async () => {
    const owner = await signedUpClient(t.app);
    const { site, recipient } = await inviteOnNewSite(owner, 'kien-nhan@smilecare.vn', 5);
    // Clicking "Gửi lại" again and again past the cap of this address sends nothing, and leaves
    // the workspace's other 45 emails alone.
    for (let index = 0; index < 20; index += 1) {
      await expectCapped(resend(owner.client, site, recipient).expect(429));
    }
    // Adding an address twice, or a sixth one, is refused too, and sends nothing.
    for (let index = 1; index < 5; index += 1) {
      await added(owner.client, site, `them-${index}@smilecare.vn`);
    }
    for (let index = 0; index < 5; index += 1) {
      await add(owner.client, site, 'them-1@smilecare.vn').expect(409);
      await add(owner.client, site, 'thu-sau@smilecare.vn').expect(409);
    }
    // An email that failed is not one sent.
    t.emails.failNext('smtp_unavailable');
    const unsent = await added(
      owner.client,
      await createSite(owner.client, owner.workspaceId),
      'loi-gui@smilecare.vn',
    );
    expect(unsent.status).toBe('unsent');
    // 5 + 4 emails went out: 41 are left.
    for (let index = 0; index < 8; index += 1) {
      const more = await createSite(owner.client, owner.workspaceId);
      for (let address = 0; address < 5; address += 1) {
        await added(owner.client, more, `con-lai-${index}-${address}@smilecare.vn`);
      }
    }
    const last = await createSite(owner.client, owner.workspaceId);
    await added(owner.client, last, 'thu-50@smilecare.vn');
    await expectCapped(add(owner.client, last, 'thu-51@smilecare.vn').expect(429));
  });

  it('takes an email back only in the window that counted it, never below zero', async () => {
    const limits = t.app.get(LeadLimitsRepository);
    const key = (name: string) => `${name}-${new Types.ObjectId().toHexString()}`;
    const count = async (limitKey: string) =>
      (await t.connection.collection<{ count: number }>('lead_limits').findOne({ key: limitKey }))
        ?.count ?? null;
    // Windows end an hour ahead, so the TTL monitor leaves the records alone.
    const now = new Date();
    const end = new Date(now.getTime() + 3_600_000);

    const once = key('once');
    const window = await limits.hit(once, now, end);
    await limits.release([{ key: once, expiresAt: window.expiresAt }], now);
    expect(await count(once)).toBe(0);
    await limits.release([{ key: once, expiresAt: window.expiresAt }], now);
    expect(await count(once)).toBe(0);

    const ended = key('ended');
    const endedWindow = await limits.hit(ended, now, end);
    await limits.release(
      [{ key: ended, expiresAt: endedWindow.expiresAt }],
      new Date(end.getTime() + 1),
    );
    expect(await count(ended)).toBe(1);

    // The window that counted ended and a new one began before the email was taken back.
    const later = key('later');
    const first = await limits.hit(later, now, end);
    const afterEnd = new Date(end.getTime() + 1);
    const second = await limits.hit(later, afterEnd, new Date(afterEnd.getTime() + 3_600_000));
    expect(second.count).toBe(1);
    const other = key('other');
    const otherWindow = await limits.hit(other, now, end);
    await limits.release(
      [
        { key: later, expiresAt: first.expiresAt },
        { key: other, expiresAt: otherWindow.expiresAt },
      ],
      now,
    );
    expect(await count(later)).toBe(1);
    expect(await count(other)).toBe(0);
  });

  describe('when an email cannot be taken back', () => {
    const takeBackFailed =
      'Confirmation email still counted: taking it back from the daily limits failed';

    /** The three counters of `email` on `site`, as `countInvite` names them. */
    function keysOf(owner: { workspaceId: string }, site: Site, email: string): string[] {
      return Object.values(
        inviteLimitKeys(email, {
          workspaceId: new Types.ObjectId(owner.workspaceId),
          siteId: new Types.ObjectId(site.id),
        }),
      );
    }

    async function counts(keys: readonly string[]): Promise<(number | null)[]> {
      const records = await t.connection
        .collection<{ key: string; count: number }>('lead_limits')
        .find({ key: { $in: [...keys] } })
        .toArray();
      return keys.map((key) => records.find((record) => record.key === key)?.count ?? null);
    }

    /** Runs `body` while taking back fails once; returns what was logged as an error meanwhile. */
    async function whileReleaseFails(body: () => Promise<void>): Promise<unknown[][]> {
      const release = vi
        .spyOn(t.app.get(LeadLimitsRepository), 'release')
        .mockRejectedValueOnce(new Error('not primary'));
      const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      try {
        await body();
        expect(release).toHaveBeenCalledTimes(1);
        return logged.mock.calls;
      } finally {
        logged.mockRestore();
        release.mockRestore();
      }
    }

    /** One error logged: the failed take-back, with the counters it left. */
    function expectTakeBackLogged(logged: unknown[][], keys: readonly string[]): void {
      expect(logged).toHaveLength(1);
      const [entry, message] = logged[0] ?? [];
      expect(entry).toMatchObject({
        err: { message: 'not primary' },
        limits: keys.map((key) => loggableLimitKey(key)),
      });
      // The counters are named without the hash of the address: logs carry no personal data.
      for (const key of keys) {
        const hash = /[0-9a-f]{64}$/.exec(key)?.[0];
        if (hash !== undefined) {
          expect(JSON.stringify(entry)).not.toContain(hash);
        }
      }
      expect(message).toBe(takeBackFailed);
    }

    it('still answers 429 past a cap, and leaves the email counted', async () => {
      const owner = await signedUpClient(t.app);
      const email = 'van-dem@smilecare.vn';
      const { site, recipient } = await inviteOnNewSite(owner, email, 5);
      const keys = keysOf(owner, site, email);
      expect(await counts(keys)).toEqual([5, 5, 5]);

      const logged = await whileReleaseFails(async () => {
        await expectCapped(resend(owner.client, site, recipient).expect(429));
      });
      expectTakeBackLogged(logged, keys);
      expect(await counts(keys)).toEqual([6, 6, 6]);
      expect(t.emails.to(email)).toHaveLength(5);
    });

    it('still answers 409 for an address already there', async () => {
      const owner = await signedUpClient(t.app);
      const site = await createSite(owner.client, owner.workspaceId);
      const email = 'hai-lan@smilecare.vn';
      await added(owner.client, site, email);
      const keys = keysOf(owner, site, email);

      const logged = await whileReleaseFails(async () => {
        const response = await add(owner.client, site, email).expect(409);
        expect(problemSchema.parse(response.body).code).toBe('recipient_exists');
      });
      expectTakeBackLogged(logged, keys);
      expect(await counts(keys)).toEqual([2, 2, 2]);
    });

    it('still adds an address whose email was not sent, as unsent', async () => {
      const owner = await signedUpClient(t.app);
      const site = await createSite(owner.client, owner.workspaceId);
      const email = 'khong-tra@smilecare.vn';
      t.emails.failNext('smtp_unavailable');

      const logged = await whileReleaseFails(async () => {
        expect((await added(owner.client, site, email)).status).toBe('unsent');
      });
      expectTakeBackLogged(logged, keysOf(owner, site, email));
      expect(await counts(keysOf(owner, site, email))).toEqual([1, 1, 1]);
    });
  });

  it('takes the email back from the other counters when one counter fails', async () => {
    const owner = await signedUpClient(t.app);
    const site = await createSite(owner.client, owner.workspaceId);
    const email = 'mot-phan@smilecare.vn';
    const keys = inviteLimitKeys(email, {
      workspaceId: new Types.ObjectId(owner.workspaceId),
      siteId: new Types.ObjectId(site.id),
    });
    const limits = t.app.get(LeadLimitsRepository);
    const hit = limits.hit.bind(limits);
    const failing = vi
      .spyOn(limits, 'hit')
      .mockImplementation((key, now, windowEnd) =>
        key === keys.workspace
          ? Promise.reject(new Error('not primary'))
          : hit(key, now, windowEnd),
      );
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const response = await add(owner.client, site, email).expect(500);
      expect(problemSchema.parse(response.body).code).toBe('internal');
      expect(logged.mock.calls[0]?.[0]).toMatchObject({
        err: {
          message: 'Confirmation email could not be counted against the daily limits',
          cause: { message: 'not primary' },
        },
      });
    } finally {
      logged.mockRestore();
      failing.mockRestore();
    }
    const records = await t.connection
      .collection<{ key: string; count: number }>('lead_limits')
      .find({ key: { $in: [keys.siteAddress, keys.address] } })
      .toArray();
    expect(records.map(({ count }) => count)).toEqual([0, 0]);
    expect(t.emails.to(email)).toEqual([]);
    // Nothing was stored: the same address can be added now.
    await added(owner.client, site, email);
  });
});
