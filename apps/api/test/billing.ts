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
