import {
  type LeadDetail,
  leadDetailSchema,
  leadListResponseSchema,
  problemSchema,
  type PublicLeadRequest,
  type Site,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
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
import { addConfirmedRecipient, RECIPIENT_EMAIL } from '../../../test/recipients.js';
import { addEditor, createSite } from '../../../test/resources.js';
import { LeadsRepository } from '../leads/leads.repository.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { LeadNotifier } from './lead-notifier.service.js';

const MINUTE = 60_000;

/** Lead emails (ADR-018): background sending, three attempts, claims, the startup sweep. */
describe('lead notifications', () => {
  let t: TestApp;
  let owner: TestClient;
  let editor: TestClient;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_notifications', {
      ...withRevalidationRecorder(new RecordingRevalidationClient()),
      env: { LEAD_LIMIT_PER_CLIENT: 1000, LEAD_LIMIT_PER_SITE_PER_HOUR: 1000 },
      // Retries 20 ms and 1 s apart instead of 1 and 5 minutes: far enough apart to tell them apart.
      notificationRetryDelaysMs: [20, 1000],
    });
    const signedUp = await signedUpClient(t.app);
    owner = signedUp.client;
    workspaceId = signedUp.workspaceId;
    editor = (await addEditor(t, workspaceId)).client;
  });

  afterAll(async () => {
    await t.close();
  });

  interface FormSite {
    site: Site;
    pageId: string;
    releaseId: string;
  }

  async function formSite(): Promise<FormSite> {
    const site = await createSite(owner, workspaceId);
    await configurePrivacy(owner, site.id);
    await addConfirmedRecipient(t, owner, site.id);
    const { pageId, published } = await createLiveFormPage(owner, site.id, uniqueSlug('form'));
    return { site, pageId, releaseId: published.release.id };
  }

  /** Sends a lead as a visitor and returns its id, read from the inbox. */
  async function send(
    { site, releaseId }: FormSite,
    overrides: Partial<PublicLeadRequest> = {},
  ): Promise<string> {
    const name = overrides.name ?? 'Nguyễn Thu Hà';
    await submitLead(t, site.subdomain, leadBody(releaseId, { ...overrides, name })).expect(201);
    const folder = overrides.honeypot ? 'spam' : 'inbox';
    const list = leadListResponseSchema.parse(
      (await owner.get(`/sites/${site.id}/leads?folder=${folder}`).expect(200)).body,
    );
    const lead = list.items.find((item) => item.name === name);
    if (!lead) {
      throw new Error(`No lead named ${name}`);
    }
    return lead.id;
  }

  async function detail(leadId: string): Promise<LeadDetail> {
    return leadDetailSchema.parse((await owner.get(`/leads/${leadId}`).expect(200)).body);
  }

  async function settled(leadId: string, status: 'sent' | 'failed'): Promise<LeadDetail> {
    let lead: LeadDetail | undefined;
    await vi.waitFor(
      async () => {
        lead = await detail(leadId);
        expect(lead.notification?.status).toBe(status);
      },
      { timeout: 5000, interval: 20 },
    );
    if (lead === undefined) {
      throw new Error('unreachable');
    }
    return lead;
  }

  function leadEmails(name: string) {
    return t.emails.sent.filter((message) => message.subject.endsWith(`Lead mới: ${name}`));
  }

  it('emails a new lead to every confirmed address, with a link to it, and records the send', async () => {
    const form = await formSite();
    await addConfirmedRecipient(t, owner, form.site.id, 'hong@smilecare.vn');
    // Added but never confirmed: receives nothing.
    await owner
      .post(`/sites/${form.site.id}/lead-recipients`, { email: 'cho@smilecare.vn' })
      .expect(201);
    const leadId = await send(form, {
      name: 'Trần Quốc Bảo',
      phone: '0938 512 840',
      message: 'Gọi sau 18h',
    });

    const lead = await settled(leadId, 'sent');
    expect(lead.notification).toMatchObject({
      status: 'sent',
      attempts: 1,
      lastErrorCode: null,
      recipients: 2,
      rejectedRecipients: 0,
    });
    const [email] = leadEmails('Trần Quốc Bảo');
    expect(email?.to).toEqual([RECIPIENT_EMAIL, 'hong@smilecare.vn']);
    expect(email?.subject).toBe('[Nha khoa Smile Care] Lead mới: Trần Quốc Bảo');
    expect(email?.text).toContain('Số điện thoại: 0938 512 840');
    expect(email?.text).toContain(
      `http://localhost:3100/sites/${form.site.id}/leads?lead=${leadId}&range=all`,
    );
    expect(
      t.emails.to('cho@smilecare.vn').every((item) => item.subject.startsWith('Xác nhận')),
    ).toBe(true);
  });

  it('never emails a lead suspected of spam', async () => {
    const form = await formSite();
    const leadId = await send(form, { name: 'Bot quảng cáo', honeypot: 'https://spam.example' });
    expect((await detail(leadId)).notification).toMatchObject({ status: 'skipped', attempts: 0 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(leadEmails('Bot quảng cáo')).toEqual([]);
  });

  it('tries again after a failure, then records the send', async () => {
    const form = await formSite();
    t.emails.failNext('smtp_unavailable');
    const leadId = await send(form, { name: 'Lê Mai Anh' });
    const lead = await settled(leadId, 'sent');
    expect(lead.notification).toMatchObject({ attempts: 2, lastErrorCode: null });
    expect(leadEmails('Lê Mai Anh')).toHaveLength(1);
  });

  it('gives up after three attempts, shows the failure, and "Gửi lại" starts over', async () => {
    const form = await formSite();
    t.emails.failNext('smtp_rejected', 'smtp_rejected', 'smtp_rejected');
    const leadId = await send(form, { name: 'Phạm Gia Huy' });
    const failed = await settled(leadId, 'failed');
    expect(failed.notification).toMatchObject({ attempts: 3, lastErrorCode: 'smtp_rejected' });
    const list = leadListResponseSchema.parse(
      (await owner.get(`/sites/${form.site.id}/leads`).expect(200)).body,
    );
    expect(list.items.find((item) => item.id === leadId)?.notificationFailed).toBe(true);

    // Editors triage leads, "Gửi lại" included.
    const retried = await editor.post(`/leads/${leadId}/notification/retry`).expect(200);
    expect(leadDetailSchema.parse(retried.body).notification).toMatchObject({
      attempts: 0,
      lastErrorCode: null,
    });
    const sent = await settled(leadId, 'sent');
    expect(sent.notification).toMatchObject({ attempts: 1 });
    expect(leadEmails('Phạm Gia Huy')).toHaveLength(1);

    const notFailed = await owner.post(`/leads/${leadId}/notification/retry`).expect(409);
    expect(problemSchema.parse(notFailed.body).title).toBe(
      'Email thông báo của lead này không ở trạng thái lỗi',
    );
  });

  it('fails at once, without retrying, when no address is confirmed any more', async () => {
    const form = await formSite();
    const recipients = await owner.get(`/sites/${form.site.id}/lead-recipients`).expect(200);
    const [only] = (recipients.body as { items: Array<{ id: string }> }).items;
    await owner.delete(`/sites/${form.site.id}/lead-recipients/${only?.id ?? ''}`).expect(204);
    const leadId = await send(form, { name: 'Võ Ngọc Trâm' });
    const failed = await settled(leadId, 'failed');
    expect(failed.notification).toMatchObject({ attempts: 1, lastErrorCode: 'no_recipients' });
  });

  it('never emails a lead a member moved to spam before its email went out', async () => {
    const form = await formSite();
    // The first attempt is on its way when the lead moves to spam, and fails; the next one skips it.
    const first = t.emails.holdNext();
    t.emails.failNext('smtp_unavailable');
    const leadId = await send(form, { name: 'Spam trễ' });
    await first.started;
    await owner.patch(`/leads/${leadId}`, { spam: true }).expect(200);
    first.release();
    await vi.waitFor(
      async () => {
        expect((await detail(leadId)).notification).toMatchObject({
          status: 'skipped',
          attempts: 2,
        });
      },
      { timeout: 5000, interval: 20 },
    );
    expect(leadEmails('Spam trễ')).toEqual([]);
    // "Gửi lại" never applies to spam.
    await owner.post(`/leads/${leadId}/notification/retry`).expect(409);
  });

  it('refuses "Gửi lại" for a failed lead that was moved to spam', async () => {
    const form = await formSite();
    t.emails.failNext('smtp_rejected', 'smtp_rejected', 'smtp_rejected');
    const leadId = await send(form, { name: 'Lỗi rồi spam' });
    await settled(leadId, 'failed');
    await owner.patch(`/leads/${leadId}`, { spam: true }).expect(200);
    const list = leadListResponseSchema.parse(
      (await owner.get(`/sites/${form.site.id}/leads?folder=spam`).expect(200)).body,
    );
    expect(list.items.find((item) => item.id === leadId)?.notificationFailed).toBe(false);
    await owner.post(`/leads/${leadId}/notification/retry`).expect(409);
    expect(leadEmails('Lỗi rồi spam')).toEqual([]);
  });

  it('records a send as sent, with the addresses the server refused while it took the others', async () => {
    const form = await formSite();
    await addConfirmedRecipient(t, owner, form.site.id, 'da-nghi@smilecare.vn');
    t.emails.refuse('da-nghi@smilecare.vn');
    const leadId = await send(form, { name: 'Đỗ Hải Yến' });
    const lead = await settled(leadId, 'sent');
    expect(lead.notification).toMatchObject({
      attempts: 1,
      recipients: 1,
      rejectedRecipients: 1,
      lastErrorCode: 'smtp_rejected',
    });
    expect(leadEmails('Đỗ Hải Yến').map((email) => email.to)).toEqual([[RECIPIENT_EMAIL]]);
  });

  it('records an attempt the database interrupted and tries again', async () => {
    const form = await formSite();
    vi.spyOn(t.app.get(SitesRepository), 'findNotificationSite').mockRejectedValueOnce(
      new Error('database unreachable'),
    );
    const leadId = await send(form, { name: 'Mất kết nối' });
    const lead = await settled(leadId, 'sent');
    expect(lead.notification).toMatchObject({ attempts: 2, lastErrorCode: null });
    expect(leadEmails('Mất kết nối')).toHaveLength(1);
  });

  it('claims the lead again later when the database fails at the claim', async () => {
    const form = await formSite();
    const claim = vi
      .spyOn(t.app.get(LeadsRepository), 'claimNotification')
      .mockRejectedValueOnce(new Error('database unreachable'));
    try {
      const leadId = await send(form, { name: 'Chưa giành được' });
      const lead = await settled(leadId, 'sent');
      // The claim that failed counted no attempt.
      expect(lead.notification).toMatchObject({ attempts: 1, lastErrorCode: null });
      expect(leadEmails('Chưa giành được')).toHaveLength(1);
    } finally {
      claim.mockRestore();
    }
  });

  it('emails a lead that was stored although its request then failed', async () => {
    const form = await formSite();
    const privacy = vi
      .spyOn(t.app.get(SitesRepository), 'findPublicPrivacy')
      .mockRejectedValueOnce(new Error('database unreachable'));
    try {
      const body = leadBody(form.releaseId, { name: 'Lưu rồi mới lỗi' });
      await submitLead(t, form.site.subdomain, body).expect(500);
      // The page script sends it again: the lead is there, so this is answered as a replay.
      await submitLead(t, form.site.subdomain, body).expect(200);
      const list = leadListResponseSchema.parse(
        (await owner.get(`/sites/${form.site.id}/leads`).expect(200)).body,
      );
      const stored = list.items.filter((item) => item.name === 'Lưu rồi mới lỗi');
      expect(stored).toHaveLength(1);
      expect((await settled(stored[0]?.id ?? '', 'sent')).notification).toMatchObject({
        attempts: 1,
      });
      expect(leadEmails('Lưu rồi mới lỗi')).toHaveLength(1);
    } finally {
      privacy.mockRestore();
    }
  });

  it('tries the claim once more only, then leaves the lead to the startup sweep', async () => {
    const form = await formSite();
    const claimedAt: number[] = [];
    const unreachable = (): Promise<never> => {
      claimedAt.push(Date.now());
      return Promise.reject(new Error('database unreachable'));
    };
    const claim = vi
      .spyOn(t.app.get(LeadsRepository), 'claimNotification')
      .mockImplementationOnce(unreachable)
      .mockImplementationOnce(unreachable);
    try {
      const leadId = await send(form, { name: 'Chờ khởi động' });
      await vi.waitFor(
        () => {
          expect(claim).toHaveBeenCalledTimes(2);
        },
        { timeout: 5000, interval: 20 },
      );
      // The second claim waits like a first retry (20 ms here, 1 minute in production): one at
      // once would meet the same outage, and the longest wait would only delay the email.
      const [first = 0, second = 0] = claimedAt;
      expect(second - first).toBeGreaterThanOrEqual(15);
      expect(second - first).toBeLessThan(500);
      // Well past the wait before a third claim, which never comes.
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(claim).toHaveBeenCalledTimes(2);
      expect((await detail(leadId)).notification).toMatchObject({
        status: 'pending',
        attempts: 0,
      });
      expect(leadEmails('Chờ khởi động')).toEqual([]);

      await t.app.get(LeadNotifier).onApplicationBootstrap();
      expect((await settled(leadId, 'sent')).notification).toMatchObject({ attempts: 1 });
      expect(leadEmails('Chờ khởi động')).toHaveLength(1);
    } finally {
      claim.mockRestore();
    }
  });

  it('lets one instance only take a notification for an attempt', async () => {
    const form = await formSite();
    const lead = storedLead({
      workspaceId,
      siteId: form.site.id,
      pageId: form.pageId,
      releaseId: form.releaseId,
      notification: { status: 'pending' },
    });
    await insertLeads(t, [lead]);
    const leads = t.app.get(LeadsRepository);
    const id = lead['_id'];
    const leadId = id instanceof Types.ObjectId ? id : new Types.ObjectId();
    const claims = await Promise.all([
      leads.claimNotification(leadId, new Date()),
      leads.claimNotification(leadId, new Date()),
    ]);
    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
  });

  it('takes on pending notifications and sends that stopped midway, at startup', async () => {
    const form = await formSite();
    const now = Date.now();
    const ids = {
      workspaceId,
      siteId: form.site.id,
      pageId: form.pageId,
      releaseId: form.releaseId,
    };
    await insertLeads(t, [
      storedLead({ ...ids, name: 'Đang chờ', notification: { status: 'pending' } }),
      storedLead({
        ...ids,
        name: 'Gửi dở',
        notification: { status: 'sending', attempts: 1, updatedAt: new Date(now - 11 * MINUTE) },
      }),
      storedLead({
        ...ids,
        name: 'Đang gửi',
        notification: { status: 'sending', attempts: 1, updatedAt: new Date(now - MINUTE) },
      }),
      storedLead({ ...ids, name: 'Đã gửi', notification: { status: 'sent', attempts: 1 } }),
    ]);

    await t.app.get(LeadNotifier).onApplicationBootstrap();

    const notificationOf = async (name: string): Promise<unknown> =>
      (await t.connection.collection('leads').findOne({ 'fields.name': name }))?.['notification'];
    // An email is recorded before its outcome is written: wait for the outcome.
    await vi.waitFor(
      async () => {
        expect(await notificationOf('Đang chờ')).toMatchObject({ status: 'sent', attempts: 1 });
        expect(await notificationOf('Gửi dở')).toMatchObject({ status: 'sent', attempts: 2 });
      },
      { timeout: 5000, interval: 20 },
    );
    expect(leadEmails('Đang chờ')).toHaveLength(1);
    expect(leadEmails('Gửi dở')).toHaveLength(1);
    // Another instance may still be sending this one; it is not taken.
    expect(leadEmails('Đang gửi')).toEqual([]);
    expect(await notificationOf('Đang gửi')).toMatchObject({ status: 'sending', attempts: 1 });
    expect(leadEmails('Đã gửi')).toEqual([]);
  });

  it('does not email the addresses of another site', async () => {
    const form = await formSite();
    const other = await createSite(owner, workspaceId);
    await addConfirmedRecipient(t, owner, other.id, 'khac@smilecare.vn');
    const leadId = await send(form, { name: 'Hoàng Thảo Vy' });
    await settled(leadId, 'sent');
    expect(leadEmails('Hoàng Thảo Vy')[0]?.to).toEqual([RECIPIENT_EMAIL]);
  });
});
