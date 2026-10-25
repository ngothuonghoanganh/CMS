import { Logger } from '@nestjs/common';
import { problemSchema, publicLeadResponseSchema, type Site } from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { formDraft, leadFormSection } from '../../../test/compositions.js';
import { createLiveFormPage, leadBody, PHONE_UA, submitLead } from '../../../test/leads.js';
import {
  createLivePage,
  publish,
  RecordingRevalidationClient,
  replaceDraft,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { configurePrivacy, saveConsentVersion, savePrivacy } from '../../../test/privacy.js';
import { createSite } from '../../../test/resources.js';
import { LeadsRepository } from './leads.repository.js';

const CLIENT_LIMIT = 3;
const SITE_LIMIT = 6;

/** ADR-016: lead intake relayed by the renderer, validated against the release the visitor saw. */
describe('lead intake', () => {
  let t: TestApp;
  let client: TestClient;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_leads', {
      ...withRevalidationRecorder(new RecordingRevalidationClient()),
      env: {
        LEAD_LIMIT_PER_CLIENT: CLIENT_LIMIT,
        LEAD_LIMIT_PER_SITE_PER_HOUR: SITE_LIMIT,
      },
    });
    const owner = await signedUpClient(t.app);
    client = owner.client;
    workspaceId = owner.workspaceId;
  });

  afterAll(async () => {
    await t.close();
  });

  /** A site with consent settings and a live page with a form. */
  async function formSite(draft?: ReturnType<typeof formDraft>) {
    const site = await createSite(client, workspaceId);
    await configurePrivacy(client, site.id);
    const slug = uniqueSlug('dang-ky');
    const { pageId, published } = await createLiveFormPage(
      client,
      site.id,
      slug,
      draft ?? formDraft(slug),
    );
    return { site, slug, pageId, releaseId: published.release.id };
  }

  function storedLeads(site: Site) {
    return t.connection
      .collection('leads')
      .find({ siteId: new Types.ObjectId(site.id) })
      .sort({ createdAt: 1 })
      .toArray();
  }

  it('stores a lead with the release version, the consent time, its source and device', async () => {
    const { site, pageId, releaseId } = await formSite();
    const before = Date.now();
    const response = await submitLead(
      t,
      site.subdomain,
      leadBody(releaseId, {
        name: ' Nguyễn Thu Hà ',
        phone: '+84 901 234 567',
        source: {
          utmSource: 'Facebook',
          utmMedium: 'CPC',
          utmCampaign: 'uu-dai-t11',
          referrer: null,
        },
      }),
      { userAgent: PHONE_UA },
    ).expect(201);
    expect(publicLeadResponseSchema.parse(response.body)).toEqual({ status: 'received' });

    const [lead] = await storedLeads(site);
    expect(lead).toMatchObject({
      workspaceId: new Types.ObjectId(workspaceId),
      pageId: new Types.ObjectId(pageId),
      releaseId: new Types.ObjectId(releaseId),
      releaseVersion: 1,
      fields: { name: 'Nguyễn Thu Hà', phone: '+84901234567', email: null, message: null },
      consent: { marketing: false, marketingWithdrawnAt: null },
      source: { source: 'facebook', medium: 'cpc', campaign: 'uu-dai-t11' },
      device: 'mobile',
      status: 'new',
      spam: { suspected: false, reasons: [] },
    });
    const createdAt = (lead?.['createdAt'] as Date).getTime();
    expect(createdAt).toBeGreaterThanOrEqual(before);
    expect((lead?.['consent'] as { at: Date }).at.getTime()).toBe(createdAt);
    // Retention of 12 months (the saved settings).
    const expiresAt = lead?.['expiresAt'] as Date;
    const expected = new Date(createdAt);
    expected.setUTCMonth(expected.getUTCMonth() + 12);
    expect(Math.abs(expiresAt.getTime() - expected.getTime())).toBeLessThan(4 * 86_400_000);
  });

  it("keeps only what the visitor's form asked for", async () => {
    const site = await createSite(client, workspaceId);
    await savePrivacy(client, site.id);
    await saveConsentVersion(client, site.id, 0, { marketingText: null });
    const slug = uniqueSlug('khong-email');
    const { published } = await createLiveFormPage(client, site.id, slug);
    await submitLead(
      t,
      site.subdomain,
      leadBody(published.release.id, {
        email: 'ha@example.com',
        message: 'Gọi sau 18h',
        marketing: true,
      }),
    ).expect(201);
    const [lead] = await storedLeads(site);
    expect(lead).toMatchObject({
      fields: { email: null, message: null },
      // The form had no marketing checkbox: nothing was agreed to.
      consent: { marketing: false },
    });

    const withFields = await formSite(
      formDraft(uniqueSlug('co-email'), leadFormSection({ showEmail: true, showMessage: true })),
    );
    await submitLead(
      t,
      withFields.site.subdomain,
      leadBody(withFields.releaseId, {
        email: ' Ha@Example.com ',
        message: 'Gọi sau 18h',
        marketing: true,
      }),
    ).expect(201);
    expect((await storedLeads(withFields.site))[0]).toMatchObject({
      fields: { email: 'ha@example.com', message: 'Gọi sau 18h' },
      consent: { marketing: true },
    });
  });

  it('refuses a lead without consent or with a malformed phone, storing nothing', async () => {
    const { site, releaseId } = await formSite();
    const noConsent = await submitLead(t, site.subdomain, {
      ...leadBody(releaseId),
      consent: false,
    }).expect(422);
    expect(problemSchema.parse(noConsent.body).issues?.[0]).toMatchObject({
      path: ['consent'],
      message: 'Bạn cần đồng ý để gửi đăng ký',
    });
    const badPhone = await submitLead(
      t,
      site.subdomain,
      leadBody(releaseId, { phone: '090123456' }),
    ).expect(422);
    expect(problemSchema.parse(badPhone.body).issues?.[0]?.path).toEqual(['phone']);
    expect(await storedLeads(site)).toEqual([]);
  });

  it('accepts only requests the renderer signed for this route', async () => {
    const { site, releaseId } = await formSite();
    const body = leadBody(releaseId);
    for (const response of [
      await submitLead(t, site.subdomain, body, { unsigned: true }).expect(401),
      await submitLead(t, site.subdomain, body, {
        secret: 'another-secret-0123456789abcdef-xyz',
      }).expect(401),
      await submitLead(t, site.subdomain, body, {
        timestamp: Math.floor(Date.now() / 1000) - 600,
      }).expect(401),
      // A signature for another route cannot be replayed here.
      await submitLead(t, site.subdomain, body, {
        signedPath: `/public/sites/${site.subdomain}/events`,
      }).expect(401),
    ]) {
      expect(problemSchema.parse(response.body).code).toBe('unauthenticated');
    }
    // The admin's Origin is no substitute for the signature.
    const fromAdmin = await client.post(`/public/sites/${site.subdomain}/leads`, body).expect(401);
    expect(problemSchema.parse(fromAdmin.body).code).toBe('unauthenticated');
    expect(await storedLeads(site)).toEqual([]);
  });

  it('answers 404 for a form that is not live on that site', async () => {
    const { site, pageId, releaseId } = await formSite();
    const other = await formSite();
    const body = leadBody(releaseId);
    await submitLead(t, 'khong-co-site-nay', body).expect(404);
    // A release of another site.
    await submitLead(t, site.subdomain, leadBody(other.releaseId)).expect(404);
    // A live page without a form.
    const plain = await createLivePage(client, site.id, uniqueSlug('khong-form'));
    await submitLead(t, site.subdomain, leadBody(plain.published.release.id)).expect(404);
    // The page was unpublished.
    await client
      .post(`/pages/${pageId}/pointer`, {
        targetReleaseId: null,
        expectedCurrentReleaseId: releaseId,
        reason: 'Tạm dừng chương trình',
      })
      .expect(200);
    await submitLead(t, site.subdomain, body).expect(404);
    expect(await storedLeads(site)).toEqual([]);
  });

  it('accepts the release a visitor opened before a newer publish', async () => {
    const { site, slug, pageId, releaseId } = await formSite();
    await replaceDraft(client, pageId, formDraft(slug, leadFormSection({ showEmail: true })));
    const v2 = await publish(client, pageId);
    expect(v2.release.version).toBe(2);
    await submitLead(t, site.subdomain, leadBody(releaseId, { email: 'ha@example.com' })).expect(
      201,
    );
    // Stored against v1, whose form had no email field.
    expect((await storedLeads(site))[0]).toMatchObject({
      releaseVersion: 1,
      fields: { email: null },
    });
  });

  it('stores a submission once, even when it is sent again or twice at the same time', async () => {
    const { site, releaseId } = await formSite();
    const body = leadBody(releaseId);
    await submitLead(t, site.subdomain, body).expect(201);
    await submitLead(t, site.subdomain, body).expect(200);
    const twice = leadBody(releaseId);
    const statuses = (
      await Promise.all([
        submitLead(t, site.subdomain, twice, { ip: '198.51.100.1' }),
        submitLead(t, site.subdomain, twice, { ip: '198.51.100.2' }),
      ])
    ).map((response) => response.status);
    expect(statuses.sort()).toEqual([200, 201]);
    expect(await storedLeads(site)).toHaveLength(2);
  });

  it('keeps suspected spam, flagged, with the same answer', async () => {
    const { site, releaseId } = await formSite();
    await submitLead(t, site.subdomain, leadBody(releaseId, { honeypot: 'https://spam.example' }), {
      ip: '198.51.100.10',
    }).expect(201);
    await submitLead(t, site.subdomain, leadBody(releaseId, { elapsedMs: 800 }), {
      ip: '198.51.100.11',
    }).expect(201);
    // Without the page script the fill time is unknown and not judged.
    await submitLead(
      t,
      site.subdomain,
      leadBody(releaseId, { elapsedMs: null, submissionId: null }),
      {
        ip: '198.51.100.12',
      },
    ).expect(201);
    expect((await storedLeads(site)).map((lead) => lead['spam'] as unknown)).toEqual([
      { suspected: true, reasons: ['honeypot'] },
      { suspected: true, reasons: ['too_fast'] },
      { suspected: false, reasons: [] },
    ]);
  });

  it('limits leads per visitor address and per site, storing nothing over a limit', async () => {
    const { site, releaseId } = await formSite();
    for (let index = 0; index < CLIENT_LIMIT; index += 1) {
      await submitLead(t, site.subdomain, leadBody(releaseId)).expect(201);
    }
    const limited = await submitLead(t, site.subdomain, leadBody(releaseId)).expect(429);
    expect(problemSchema.parse(limited.body).code).toBe('rate_limited');
    // Another address has its own bucket; without a trusted address visitors share one.
    await submitLead(t, site.subdomain, leadBody(releaseId), { ip: '198.51.100.20' }).expect(201);
    await submitLead(t, site.subdomain, leadBody(releaseId), { ip: null }).expect(201);
    await submitLead(t, site.subdomain, leadBody(releaseId), { ip: '198.51.100.21' }).expect(201);
    // Six leads stored: the site's hourly limit is reached whatever the address.
    const siteLimited = await submitLead(t, site.subdomain, leadBody(releaseId), {
      ip: '198.51.100.22',
    }).expect(429);
    expect(problemSchema.parse(siteLimited.body).code).toBe('rate_limited');
    expect(await storedLeads(site)).toHaveLength(SITE_LIMIT);

    // An ended window starts over.
    await t.connection
      .collection('lead_limits')
      .updateMany(
        { key: { $regex: site.id } },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );
    await submitLead(t, site.subdomain, leadBody(releaseId)).expect(201);
  });

  it("recomputes the expiry of the site's leads when the retention period changes", async () => {
    const { site, releaseId } = await formSite();
    const other = await formSite();
    await submitLead(t, site.subdomain, leadBody(releaseId)).expect(201);
    await submitLead(t, other.site.subdomain, leadBody(other.releaseId)).expect(201);

    await savePrivacy(client, site.id, { retentionMonths: null });
    expect((await storedLeads(site))[0]?.['expiresAt']).toBeNull();
    // A lead arriving while the site keeps leads has no expiry either.
    await submitLead(t, site.subdomain, leadBody(releaseId), { ip: '198.51.100.31' }).expect(201);
    expect((await storedLeads(site)).map((lead) => lead['expiresAt'] as unknown)).toEqual([
      null,
      null,
    ]);
    await savePrivacy(client, site.id, { retentionMonths: 24 });
    const [lead] = await storedLeads(site);
    const createdAt = lead?.['createdAt'] as Date;
    const expected = new Date(createdAt);
    expected.setUTCFullYear(expected.getUTCFullYear() + 2);
    expect((lead?.['expiresAt'] as Date).getTime()).toBe(expected.getTime());
    // Another site keeps its own retention.
    expect((await storedLeads(other.site))[0]?.['expiresAt']).not.toBeNull();

    const later = await submitLead(t, site.subdomain, leadBody(releaseId), { ip: '198.51.100.30' });
    expect(later.status).toBe(201);
  });

  it("keeps the visitor's data out of the error log", async () => {
    const { site, releaseId } = await formSite();
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const insert = vi
      .spyOn(t.app.get(LeadsRepository), 'insertPublic')
      .mockRejectedValueOnce(new Error('connection reset'));
    try {
      const response = await submitLead(
        t,
        site.subdomain,
        leadBody(releaseId, {
          name: 'Trần Quốc Bảo',
          phone: '0938 512 840',
          email: 'bao@example.com',
        }),
        { ip: '198.51.100.40', userAgent: PHONE_UA },
      ).expect(500);
      expect(problemSchema.parse(response.body).code).toBe('internal');
      expect(logged).toHaveBeenCalled();
      const line = JSON.stringify(logged.mock.calls);
      for (const secret of [
        'Trần Quốc Bảo',
        '0938',
        'bao@example.com',
        '198.51.100.40',
        'iPhone',
      ]) {
        expect(line).not.toContain(secret);
      }
    } finally {
      insert.mockRestore();
      logged.mockRestore();
    }
  });
});
