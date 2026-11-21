import {
  automationListItemSchema,
  type BillingSummary,
  billingSummarySchema,
  endpoints,
  type PlanChangeQuote,
  planChangeQuoteSchema,
  problemSchema,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { addCard, CARD_OK, invoicesOf } from '../../../test/payments.js';
import { addMember, createSite } from '../../../test/resources.js';
import { BUNDLED_PLAN_CATALOG_FILE } from '../../config/env.js';
import { BillingClock } from './billing-clock.js';
import { BillingScheduler } from './billing-scheduler.service.js';

const DAY_MS = 86_400_000;
const START = new Date('2026-11-01T03:00:00.000Z');
const after = (from: Date, days: number, ms = 0) => new Date(from.getTime() + days * DAY_MS + ms);

describe('changes for the end of the period, cancel and keep (ADR-035, T3)', () => {
  let t: TestApp;
  let clock: BillingClock;

  beforeAll(async () => {
    t = await createTestApp('plp_test_billing_plan_changes', {
      env: { BILLING_TEST_CLOCK: 'on', PLAN_CATALOG_FILE: BUNDLED_PLAN_CATALOG_FILE },
    });
    clock = t.app.get(BillingClock);
  });

  afterEach(async () => {
    clock.set(null);
    await t.connection.collection('subscriptions').updateMany({}, { $set: { nextActionAt: null } });
  });

  afterAll(async () => {
    await t.close();
  });

  const logOf = async (workspaceId: string) =>
    (
      await t.connection
        .collection('billing_log')
        .find({ workspaceId: new Types.ObjectId(workspaceId) })
        .sort({ _id: 1 })
        .toArray()
    ).map((entry): unknown[] => [entry['action'], entry['from'], entry['to']]);

  async function summaryOf(owner: TestClient, workspaceId: string): Promise<BillingSummary> {
    return billingSummarySchema.parse(
      (await owner.get(endpoints.getBillingSummary.path(workspaceId)).expect(200)).body,
    );
  }

  async function quote(
    owner: TestClient,
    workspaceId: string,
    query: { planId: string; cycle: 'monthly' | 'yearly' },
  ): Promise<PlanChangeQuote> {
    return planChangeQuoteSchema.parse(
      (
        await owner
          .get(endpoints.getPlanChangeQuote.path(workspaceId))
          .query({ ...query, payNow: 'false' })
          .expect(200)
      ).body,
    );
  }

  /** A paid month of Gói Agency, charged when the trial ended, ten days in. */
  async function paying(): Promise<{
    owner: TestClient;
    workspaceId: string;
    periodEnd: Date;
  }> {
    clock.set(START);
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    await addCard(t, owner, workspaceId, CARD_OK);
    const trial = await summaryOf(owner, workspaceId);
    clock.set(new Date(trial.trialEndsAt ?? ''));
    await t.app.get(BillingScheduler).runDue();
    const paid = await summaryOf(owner, workspaceId);
    expect(paid.state).toBe('active');
    clock.set(after(new Date(paid.periodStart), 10));
    return { owner, workspaceId, periodEnd: new Date(paid.periodEnd) };
  }

  it('quotes a lower plan for the end of the period, with what it does to the workspace', async () => {
    const { owner, workspaceId, periodEnd } = await paying();
    const site = await createSite(owner, workspaceId, { name: 'Nha khoa Smile Care' });
    await createSite(owner, workspaceId, { name: 'Bếp Nhà Mây' });
    const automation = automationListItemSchema.parse(
      (await owner.post(`/sites/${site.id}/automations`, { recipe: 'notify_won' }).expect(201))
        .body,
    );
    await owner
      .post(`/sites/${site.id}/automations/${automation.id}/state`, { state: 'on' })
      .expect(200);

    expect(await quote(owner, workspaceId, { planId: 'basic', cycle: 'monthly' })).toEqual({
      mode: 'scheduled',
      planId: 'basic',
      cycle: 'monthly',
      amount: 0,
      periodStart: null,
      periodEnd: null,
      remainingDays: null,
      periodDays: null,
      paymentMethod: expect.objectContaining({ last4: '4242' }) as unknown,
      paymentMethodRequired: false,
      unavailableReason: null,
      effectiveAt: periodEnd.toISOString(),
      nextAmount: 199_000,
      impacts: {
        overLimits: [{ limit: 'sites', used: 2, max: 1 }],
        automationsToPause: 1,
        aiUses: { from: 100, to: 20 },
        members: 1,
      },
      renewalInvoiceVoided: null,
    });
    // Another cycle of the same plan: scheduled, with nothing lost.
    expect(await quote(owner, workspaceId, { planId: 'agency', cycle: 'yearly' })).toMatchObject({
      mode: 'scheduled',
      nextAmount: 5_990_000,
      impacts: null,
    });
    expect(await quote(owner, workspaceId, { planId: 'business', cycle: 'yearly' })).toMatchObject({
      mode: 'scheduled',
      nextAmount: 14_900_000,
      impacts: { overLimits: [], automationsToPause: 0, aiUses: { from: 100, to: 300 } },
    });
  });

  it('schedules the change without a charge, replaces it, and drops it', async () => {
    const { owner, workspaceId, periodEnd } = await paying();
    const before = (await invoicesOf(owner, workspaceId)).items.length;
    const scheduled = billingSummarySchema.parse(
      (
        await owner
          .post(endpoints.changePlan.path(workspaceId), { planId: 'basic', cycle: 'monthly' })
          .expect(200)
      ).body,
    );
    expect(scheduled).toMatchObject({
      plan: { id: 'agency' },
      state: 'active',
      scheduledChange: { planId: 'basic', cycle: 'monthly' },
      renewal: {
        at: periodEnd.toISOString(),
        planId: 'basic',
        planName: 'Cơ bản',
        cycle: 'monthly',
        amount: 199_000,
        autoRenews: true,
        blocker: null,
      },
    });
    // Asked twice: once.
    await owner
      .post(endpoints.changePlan.path(workspaceId), { planId: 'basic', cycle: 'monthly' })
      .expect(200);
    await owner
      .post(endpoints.changePlan.path(workspaceId), { planId: 'agency', cycle: 'yearly' })
      .expect(200);
    expect((await summaryOf(owner, workspaceId)).scheduledChange).toEqual({
      planId: 'agency',
      cycle: 'yearly',
    });
    expect((await invoicesOf(owner, workspaceId)).items).toHaveLength(before);

    const dropped = billingSummarySchema.parse(
      (await owner.delete(endpoints.cancelScheduledChange.path(workspaceId)).expect(200)).body,
    );
    expect(dropped).toMatchObject({
      scheduledChange: null,
      renewal: { planId: 'agency', cycle: 'monthly', amount: 599_000 },
    });
    await owner.delete(endpoints.cancelScheduledChange.path(workspaceId)).expect(200);
    const agency = { planId: 'agency', cycle: 'monthly' };
    expect((await logOf(workspaceId)).slice(-3)).toEqual([
      ['change_scheduled', agency, { planId: 'basic', cycle: 'monthly' }],
      ['change_scheduled', agency, { planId: 'agency', cycle: 'yearly' }],
      ['scheduled_change_canceled', agency, { planId: 'agency', cycle: 'yearly' }],
    ]);
  });

  it('drops a scheduled downgrade when the owner upgrades instead', async () => {
    const { owner, workspaceId } = await paying();
    await owner
      .post(endpoints.changePlan.path(workspaceId), { planId: 'basic', cycle: 'monthly' })
      .expect(200);
    const upgrade = await quote(owner, workspaceId, { planId: 'business', cycle: 'monthly' });
    expect(upgrade.mode).toBe('upgrade');
    const upgraded = billingSummarySchema.parse(
      (
        await owner
          .post(endpoints.changePlan.path(workspaceId), {
            planId: 'business',
            cycle: 'monthly',
            expectedAmount: upgrade.amount,
          })
          .expect(200)
      ).body,
    );
    expect(upgraded).toMatchObject({ plan: { id: 'business' }, scheduledChange: null });
  });

  it('keeps every change, cancel and keep to the owner; another workspace is not found', async () => {
    const { owner, workspaceId } = await paying();
    const admin = await addMember(t, workspaceId, 'admin');
    // Quản trị sees the plan and its banners (billing.view), without the card.
    const seen = await summaryOf(admin.client, workspaceId);
    expect(seen.renewal).toMatchObject({ autoRenews: true });
    for (const attempt of [
      () => admin.client.post(endpoints.cancelPlan.path(workspaceId)),
      () => admin.client.post(endpoints.keepPlan.path(workspaceId)),
      () => admin.client.delete(endpoints.cancelScheduledChange.path(workspaceId)),
      () =>
        admin.client.post(endpoints.changePlan.path(workspaceId), {
          planId: 'basic',
          cycle: 'monthly',
        }),
    ]) {
      expect(problemSchema.parse((await attempt().expect(403)).body).code).toBe('forbidden');
    }
    const stranger = await signedUpClient(t.app);
    await stranger.client.post(endpoints.cancelPlan.path(workspaceId)).expect(404);
    await stranger.client.post(endpoints.keepPlan.path(workspaceId)).expect(404);
    await stranger.client.delete(endpoints.cancelScheduledChange.path(workspaceId)).expect(404);
    await stranger.client.get(endpoints.getBillingSummary.path(workspaceId)).expect(404);
    expect((await summaryOf(owner, workspaceId)).cancelAt).toBeNull();
  });

  it('lets a read-only workspace keep paying, never cancel what already stopped', async () => {
    clock.set(START);
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    const trial = await summaryOf(owner, workspaceId);
    clock.set(after(new Date(trial.trialEndsAt ?? ''), 1));
    expect(await summaryOf(owner, workspaceId)).toMatchObject({
      state: 'trial_expired',
      access: 'read_only',
    });
    const cancel = await owner.post(endpoints.cancelPlan.path(workspaceId)).expect(409);
    expect(problemSchema.parse(cancel.body)).toMatchObject({
      code: 'plan_change_unavailable',
      context: { reason: 'payment_required' },
    });
    // Nothing to keep: a no-op, not a refusal of a read-only workspace.
    await owner.post(endpoints.keepPlan.path(workspaceId)).expect(200);
    await owner.delete(endpoints.cancelScheduledChange.path(workspaceId)).expect(200);
    await addCard(t, owner, workspaceId, CARD_OK);
    await owner
      .post(endpoints.changePlan.path(workspaceId), {
        planId: 'basic',
        cycle: 'monthly',
        payNow: true,
        expectedAmount: 199_000,
      })
      .expect(200);
    expect(await summaryOf(owner, workspaceId)).toMatchObject({
      state: 'active',
      access: 'full',
    });
  });
});
