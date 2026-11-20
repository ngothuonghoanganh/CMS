import { Types } from 'mongoose';
import type { TestApp } from './app.js';

const DAY_MS = 86_400_000;

/**
 * Ends the workspace's trial a day ago, so it is `trial_expired` and read-only (ADR-035), or
 * gives it 14 days again. Real time: for an app without the movable billing clock.
 */
export async function setReadOnly(
  t: TestApp,
  workspaceId: string,
  readOnly: boolean,
): Promise<void> {
  const end = new Date(Date.now() + (readOnly ? -1 : 14) * DAY_MS);
  const result = await t.connection
    .collection('subscriptions')
    .updateOne(
      { _id: new Types.ObjectId(workspaceId) },
      { $set: { trialEndsAt: end, periodEnd: end } },
    );
  if (result.matchedCount !== 1) {
    throw new Error(`Workspace ${workspaceId} has no subscription`);
  }
}

/**
 * Puts the workspace on another plan of the catalog, as a payment would (T2): for tests of what a
 * plan allows. No hooks run; use the billing endpoint to test those.
 */
export async function setPlan(t: TestApp, workspaceId: string, planId: string): Promise<void> {
  const result = await t.connection
    .collection('subscriptions')
    .updateOne({ _id: new Types.ObjectId(workspaceId) }, { $set: { planId } });
  if (result.matchedCount !== 1) {
    throw new Error(`Workspace ${workspaceId} has no subscription`);
  }
}
