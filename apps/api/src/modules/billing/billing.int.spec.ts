import {
  type BillingSummary,
  billingSummarySchema,
  planCatalogResponseSchema,
  problemSchema,
  siteListResponseSchema,
  testClockSchema,
  vnMonthOf,
  workspacePlanSchema,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BUNDLED_PLAN_CATALOG_FILE } from '../../config/env.js';
import { createTestApp, type TestApp } from '../../../test/app.js';
import {
  requestSignup,
  signedUpClient,
  signupInput,
  signupVerifyBody,
  TestClient,
} from '../../../test/client.js';
import { createLiveFormPage, leadBody, submitLead } from '../../../test/leads.js';
import { invite, newEmail } from '../../../test/members.js';
import { uniqueSlug } from '../../../test/pages.js';
import { configurePrivacy } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { addMember, createSite } from '../../../test/resources.js';
import { BillingClock } from './billing-clock.js';
import { type PlanChange, PlanChangeHooks } from './plan-change-hooks.js';
import { SubscriptionBackfill } from './subscription-backfill.service.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';

const DAY_MS = 86_400_000;

describe('plans and billing (ADR-035)', () => {
  let t: TestApp;
  let clock: BillingClock;
  /** What `PlanChangeHooks` received; `failHook` makes the next call throw. */
  const changes: Array<{ workspaceId: string; change: PlanChange }> = [];
  let failHook = false;

  beforeAll(async () => {
    t = await createTestApp('plp_test_billing', {
      env: { BILLING_TEST_CLOCK: 'on', PLAN_CATALOG_FILE: BUNDLED_PLAN_CATALOG_FILE },
    });
    clock = t.app.get(BillingClock);
    t.app.get(PlanChangeHooks).register((ref, change) => {
      if (failHook) {
        failHook = false;
        return Promise.reject(new Error('Pausing the automations failed'));
      }
      changes.push({ workspaceId: ref.workspaceId.toHexString(), change });
      return Promise.resolve();
    });
  });

  afterEach(() => {
    clock.set(null);
  });

  afterAll(async () => {
    await t.close();
  });

  const subscriptionOf = (workspaceId: string) =>
    t.connection.collection('subscriptions').findOne({ _id: new Types.ObjectId(workspaceId) });
  const logOf = (workspaceId: string) =>
    t.connection
      .collection('billing_log')
      .find({ workspaceId: new Types.ObjectId(workspaceId) })
      .toArray();

  async function summaryOf(client: TestClient, workspaceId: string): Promise<BillingSummary> {
    return billingSummarySchema.parse(
      (await client.get(`/workspaces/${workspaceId}/billing`).expect(200)).body,
    );
  }

  /** Moves the billing clock past the end of the workspace's trial. */
  async function endTrial(workspaceId: string): Promise<void> {
    const stored = await subscriptionOf(workspaceId);
    const end = stored?.['trialEndsAt'] as Date;
    clock.set(new Date(end.getTime() + 60_000));
  }

  describe('a new workspace', () => {
    it('starts a 14-day trial of Gói Agency in the transaction that creates it', async () => {
      const { client, workspaceId } = await signedUpClient(t.app);
      const stored = await subscriptionOf(workspaceId);
      expect(stored).toMatchObject({
        planId: 'agency',
        cycle: 'monthly',
        cancelAtPeriodEnd: false,
        scheduledChange: null,
        openInvoiceId: null,
        failedSince: null,
        paymentMethod: null,
        billingInfo: null,
        version: 0,
      });
      const start = stored?.['periodStart'] as Date;
      expect((stored?.['trialEndsAt'] as Date).getTime() - start.getTime()).toBe(14 * DAY_MS);
      expect(stored?.['periodEnd']).toEqual(stored?.['trialEndsAt']);

      const summary = await summaryOf(client, workspaceId);
      expect(summary).toMatchObject({
        plan: { id: 'agency', name: 'Agency', features: { automation: true, customRoles: false } },
        cycle: 'monthly',
        state: 'trialing',
        access: 'full',
        trialDaysLeft: 14,
        cancelAtPeriodEnd: false,
        scheduledChange: null,
        graceEndsAt: null,
        usage: { sites: 0, members: 1, aiUses: 0, automationRuns: 0, customDomains: 0 },
      });
      expect(summary.plan.limits).toEqual({
        sites: 5,
        members: 10,
        aiUses: 100,
        automationRuns: 2000,
        customDomains: 10,
      });
    });

    it('has neither workspace nor trial when the sign-up’s transaction fails', async () => {
      const input = signupInput();
      const token = await requestSignup(t.app, input);
      const create = vi
        .spyOn(SubscriptionsRepository.prototype, 'create')
        .mockRejectedValueOnce(new Error('Storing the trial failed'));
      try {
        await new TestClient(t.app)
          .post('/auth/signup/verify', signupVerifyBody(token, input))
          .expect(500);
      } finally {
        create.mockRestore();
      }
      expect(await t.connection.collection('users').findOne({ email: input.email })).toBeNull();
      expect(
        await t.connection.collection('workspaces').countDocuments({ name: input.workspaceName }),
      ).toBe(0);
    });
  });

  describe('the plans', () => {
    it('are the catalog’s, for any signed-in user, in the order board 28 compares them', async () => {
      const { client } = await signedUpClient(t.app);
      const catalog = planCatalogResponseSchema.parse(
        (await client.get('/billing/plans').expect(200)).body,
      );
      expect(catalog.plans.map((plan) => [plan.id, plan.name, plan.prices.monthly])).toEqual([
        ['basic', 'Cơ bản', 199_000],
        ['agency', 'Agency', 599_000],
        ['business', 'Doanh nghiệp', 1_490_000],
      ]);
      expect(catalog.trial).toEqual({ planId: 'agency', days: 14 });
      await new TestClient(t.app).get('/billing/plans').expect(401);
    });
  });

  describe('usage', () => {
    it('counts sites, members with pending invitations, this month’s AI and automation, domains', async () => {
      const { client, workspaceId } = await signedUpClient(t.app);
      const site = await createSite(client, workspaceId);
      await createSite(client, workspaceId, { name: 'Bếp Nhà Mây' });
      await addMember(t, workspaceId, 'editor');
      await invite(t, client, workspaceId, newEmail('dung-thu'));
      await client
        .post(`/sites/${site.id}/domains`, { hostname: `go.${site.subdomain}.vn` })
        .expect(201);
      const db = t.workspaceDb(workspaceId);
      const id = new Types.ObjectId(workspaceId);
      const month = vnMonthOf(new Date());
      const now = new Date();
      await db.collection('ai_usage').insertMany([
        { workspaceId: id, month, used: 4, createdAt: now, updatedAt: now },
        { workspaceId: id, month: '2020-01', used: 90, createdAt: now, updatedAt: now },
      ]);
      await db
        .collection('automation_usage')
        .insertOne({ workspaceId: id, month, used: 7, createdAt: now, updatedAt: now });

      const summary = await summaryOf(client, workspaceId);
      expect(summary.usage).toEqual({
        sites: 2,
        members: 3,
        aiUses: 4,
        automationRuns: 7,
        customDomains: 1,
      });
      expect(summary.usageMonth).toBe(month);
    });
  });

  describe('who sees what', () => {
    it('shows the plan to every member, and usage to Chủ sở hữu and Quản trị only', async () => {
      const { workspaceId } = await signedUpClient(t.app);
      const { client: viewer } = await addMember(t, workspaceId, 'viewer');
      const { client: admin } = await addMember(t, workspaceId, 'admin');

      const plan = workspacePlanSchema.parse(
        (await viewer.get(`/workspaces/${workspaceId}/plan`).expect(200)).body,
      );
      expect(plan).toEqual({
        plan: {
          id: 'agency',
          name: 'Agency',
          limits: { sites: 5, members: 10, aiUses: 100, automationRuns: 2000, customDomains: 10 },
          features: { automation: true, customRoles: false },
        },
        state: 'trialing',
        access: 'full',
        trialDaysLeft: 14,
      });
      const refused = await viewer.get(`/workspaces/${workspaceId}/billing`).expect(403);
      expect(problemSchema.parse(refused.body).title).toBe(
        'Chỉ Chủ sở hữu và Quản trị được thực hiện thao tác này',
      );
      await summaryOf(admin, workspaceId);
      const change = await admin
        .post(`/workspaces/${workspaceId}/billing/plan`, { planId: 'basic', cycle: 'monthly' })
        .expect(403);
      expect(problemSchema.parse(change.body).title).toBe(
        'Chỉ Chủ sở hữu được thực hiện thao tác này',
      );
    });

    it('answers 404 to another workspace’s members, whatever they send', async () => {
      const { client: owner, workspaceId } = await signedUpClient(t.app);
      const { client: stranger } = await signedUpClient(t.app);
      const before = await subscriptionOf(workspaceId);
      await stranger.get(`/workspaces/${workspaceId}/billing`).expect(404);
      await stranger.get(`/workspaces/${workspaceId}/plan`).expect(404);
      await stranger
        .post(`/workspaces/${workspaceId}/billing/plan`, { planId: 'basic', cycle: 'yearly' })
        .expect(404);
      await stranger.get('/workspaces/64b0000000000000000000ff/billing').expect(404);
      expect(await subscriptionOf(workspaceId)).toEqual(before);
      expect(await logOf(workspaceId)).toEqual([]);
      await summaryOf(owner, workspaceId);
    });
  });

  describe('changing the plan during the trial', () => {
    it('applies at once, at no charge, logs who did it and tells the other modules', async () => {
      const { client, workspaceId, me } = await signedUpClient(t.app);
      const summary = billingSummarySchema.parse(
        (
          await client
            .post(`/workspaces/${workspaceId}/billing/plan`, { planId: 'basic', cycle: 'yearly' })
            .expect(200)
        ).body,
      );
      expect(summary).toMatchObject({
        plan: { id: 'basic', limits: { sites: 1, automationRuns: 0 } },
        cycle: 'yearly',
        state: 'trialing',
        trialDaysLeft: 14,
      });
      expect(await subscriptionOf(workspaceId)).toMatchObject({
        planId: 'basic',
        cycle: 'yearly',
        version: 1,
        openInvoiceId: null,
      });
      expect(await logOf(workspaceId)).toEqual([
        expect.objectContaining({
          action: 'plan_changed',
          actorId: new Types.ObjectId(me.user.id),
          from: { planId: 'agency', cycle: 'monthly' },
          to: { planId: 'basic', cycle: 'yearly' },
        }),
      ]);
      const told = changes.filter((item) => item.workspaceId === workspaceId);
      expect(told.map(({ change }) => [change.from.id, change.to.id])).toEqual([
        ['agency', 'basic'],
      ]);
      expect(told[0]?.change.to.features.automation).toBe(false);
      expect(told[0]?.change.by?.toHexString()).toBe(me.user.id);

      // Choosing it again changes nothing.
      await client
        .post(`/workspaces/${workspaceId}/billing/plan`, { planId: 'basic', cycle: 'yearly' })
        .expect(200);
      expect(await logOf(workspaceId)).toHaveLength(1);
    });

    it('changes nothing when a module cannot follow the change', async () => {
      const { client, workspaceId } = await signedUpClient(t.app);
      const before = await subscriptionOf(workspaceId);
      failHook = true;
      await client
        .post(`/workspaces/${workspaceId}/billing/plan`, { planId: 'business', cycle: 'monthly' })
        .expect(500);
      expect(await subscriptionOf(workspaceId)).toEqual(before);
      expect(await logOf(workspaceId)).toEqual([]);
    });

    it('refuses a plan the catalog does not have', async () => {
      const { client, workspaceId } = await signedUpClient(t.app);
      const refused = await client
        .post(`/workspaces/${workspaceId}/billing/plan`, { planId: 'gold', cycle: 'monthly' })
        .expect(422);
      expect(problemSchema.parse(refused.body).issues).toEqual([
        { path: ['planId'], code: 'unknown_plan', message: 'Không có gói này' },
      ]);
      await client
        .post(`/workspaces/${workspaceId}/billing/plan`, { planId: 'basic', cycle: 'weekly' })
        .expect(422);
    });

    it('waits for payments (T2) once the trial is over', async () => {
      const { client, workspaceId } = await signedUpClient(t.app);
      await endTrial(workspaceId);
      const refused = await client
        .post(`/workspaces/${workspaceId}/billing/plan`, { planId: 'basic', cycle: 'monthly' })
        .expect(409);
      expect(problemSchema.parse(refused.body)).toMatchObject({
        code: 'plan_change_unavailable',
        title: 'Chưa đổi được gói lúc này',
      });
      expect(await subscriptionOf(workspaceId)).toMatchObject({ planId: 'agency', version: 0 });
    });
  });

  describe('a workspace whose trial ended (read-only)', () => {
    it('refuses changes, keeps reads, removals and the ownership, and its forms take leads', async () => {
      const { client: owner, workspaceId } = await signedUpClient(t.app);
      const site = await createSite(owner, workspaceId);
      await configurePrivacy(owner, site.id);
      await addConfirmedRecipient(t, owner, site.id, `nhan-${site.subdomain}@smilecare.vn`);
      const form = await createLiveFormPage(owner, site.id, uniqueSlug('chi-doc'));
      const { me: editor } = await addMember(t, workspaceId, 'editor');
      const { me: admin } = await addMember(t, workspaceId, 'admin');
      const { client: viewer } = await addMember(t, workspaceId, 'viewer');
      await invite(t, owner, workspaceId, newEmail('chi-doc'));
      const pending = (
        (await owner.get(`/workspaces/${workspaceId}/invitations`).expect(200)).body as {
          items: Array<{ id: string }>;
        }
      ).items;

      await endTrial(workspaceId);
      const summary = await summaryOf(owner, workspaceId);
      expect(summary).toMatchObject({ state: 'trial_expired', access: 'read_only' });

      const refused = await owner
        .post(`/workspaces/${workspaceId}/sites`, { name: 'Spa Lá Xanh', subdomain: 'spa-la-xanh' })
        .expect(402);
      expect(problemSchema.parse(refused.body)).toMatchObject({
        code: 'workspace_read_only',
        title: 'Workspace đang ở chế độ chỉ đọc',
        context: { state: 'trial_expired' },
      });
      await owner.patch(`/sites/${site.id}`, { name: 'Đổi tên' }).expect(402);
      await owner
        .post(`/workspaces/${workspaceId}/invitations`, {
          emails: [newEmail('khong-moi-duoc')],
          role: 'viewer',
          siteIds: null,
        })
        .expect(402);
      // A role without the permission is told so, not about the plan.
      await viewer.patch(`/sites/${site.id}`, { name: 'Đổi tên' }).expect(403);

      // Every read stays open, lists behind a write permission too.
      const sites = siteListResponseSchema.parse(
        (await owner.get(`/workspaces/${workspaceId}/sites`).expect(200)).body,
      );
      expect(sites.items).toHaveLength(1);
      await owner.get(`/workspaces/${workspaceId}/members`).expect(200);
      await owner.get(`/sites/${site.id}/domains`).expect(200);
      await viewer.get(`/workspaces/${workspaceId}/plan`).expect(200);

      // Kept: removing members and pending invitations, handing the workspace over.
      await owner.delete(`/workspaces/${workspaceId}/members/${editor.user.id}`).expect(204);
      await owner
        .delete(`/workspaces/${workspaceId}/invitations/${pending[0]?.id ?? ''}`)
        .expect(204);
      const workspaceName = (
        await t.connection
          .collection('workspaces')
          .findOne({ _id: new Types.ObjectId(workspaceId) })
      )?.['name'] as string;
      await owner
        .post(`/workspaces/${workspaceId}/ownership`, {
          toUserId: admin.user.id,
          confirmName: workspaceName,
        })
        .expect(200);

      // The live page's form still takes leads (ADR-035).
      await submitLead(t, site.subdomain, leadBody(form.published.release.id)).expect(201);
    });

    it('becomes writable again when its trial runs again', async () => {
      const { client: owner, workspaceId } = await signedUpClient(t.app);
      await endTrial(workspaceId);
      await owner
        .post(`/workspaces/${workspaceId}/sites`, { name: 'Bếp Nhà Mây', subdomain: 'bep-mo-lai' })
        .expect(402);
      clock.set(null);
      await createSite(owner, workspaceId, { name: 'Bếp Nhà Mây' });
    });
  });

  describe('the test clock', () => {
    it('moves the billing time of the whole API, and goes back to real time', async () => {
      const { client, workspaceId } = await signedUpClient(t.app);
      const later = new Date(Date.now() + 10 * DAY_MS + 60_000);
      const moved = testClockSchema.parse(
        (await client.put('/testing/clock', { now: later.toISOString() }).expect(200)).body,
      );
      expect(Date.parse(moved.now)).toBeGreaterThanOrEqual(later.getTime());
      expect(moved.offsetMs).toBeGreaterThan(10 * DAY_MS - 1000);
      expect((await summaryOf(client, workspaceId)).trialDaysLeft).toBe(4);

      await client.put('/testing/clock', { now: null }).expect(200);
      const real = testClockSchema.parse((await client.get('/testing/clock').expect(200)).body);
      expect(real.offsetMs).toBe(0);
      expect((await summaryOf(client, workspaceId)).trialDaysLeft).toBe(14);
      await client.put('/testing/clock', { now: 'ngày mai' }).expect(422);
    });
  });

  describe('workspaces made before plans', () => {
    it('each get a fresh trial at startup; the others keep theirs', async () => {
      const { client: old, workspaceId: oldId } = await signedUpClient(t.app);
      const { client: kept, workspaceId: keptId } = await signedUpClient(t.app);
      await kept
        .post(`/workspaces/${keptId}/billing/plan`, { planId: 'business', cycle: 'monthly' })
        .expect(200);
      await t.connection.collection('subscriptions').deleteOne({ _id: new Types.ObjectId(oldId) });
      const keptBefore = await subscriptionOf(keptId);

      const backfill = t.app.get(SubscriptionBackfill);
      await backfill.onApplicationBootstrap();
      expect(await backfill.run()).toBe(0);

      expect(await subscriptionOf(oldId)).toMatchObject({
        planId: 'agency',
        version: 0,
        failedSince: null,
      });
      expect((await summaryOf(old, oldId)).trialDaysLeft).toBe(14);
      expect(await subscriptionOf(keptId)).toEqual(keptBefore);
    });

    it('do not start when a subscription is on a plan the catalog no longer has', async () => {
      const { workspaceId } = await signedUpClient(t.app);
      const id = new Types.ObjectId(workspaceId);
      await t.connection
        .collection('subscriptions')
        .updateOne({ _id: id }, { $set: { planId: 'gold' } });
      try {
        await expect(t.app.get(SubscriptionBackfill).onApplicationBootstrap()).rejects.toThrow(
          'The plan catalog lacks plans that subscriptions use: gold',
        );
      } finally {
        await t.connection
          .collection('subscriptions')
          .updateOne({ _id: id }, { $set: { planId: 'agency' } });
      }
    });
  });
});

describe('the billing clock outside lifecycle tests', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_billing_clock_off');
  });

  afterAll(async () => {
    await t.close();
  });

  it('does not exist', async () => {
    const { client } = await signedUpClient(t.app);
    await client.get('/testing/clock').expect(404);
    await client.put('/testing/clock', { now: new Date().toISOString() }).expect(404);
    expect(() => {
      t.app.get(BillingClock).set(new Date());
    }).toThrow('BILLING_TEST_CLOCK=on');
  });
});
