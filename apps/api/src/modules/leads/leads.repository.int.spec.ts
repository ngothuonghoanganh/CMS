import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient } from '../../../test/client.js';
import { insertLeads, storedLead } from '../../../test/leads.js';
import { scopeOf } from '../../../test/resources.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import type { LeadCriteria } from './domain/lead-filters.js';
import { LeadsRepository } from './leads.repository.js';

const EVERY_INBOX_LEAD: LeadCriteria = {
  spam: false,
  pageId: null,
  status: null,
  createdIn: null,
  search: null,
};

/** The export stream (ADR-018): it never leaves a server cursor behind. */
describe('LeadsRepository.streamMatching', () => {
  let t: TestApp;
  let scope: WorkspaceScope;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_leads_stream');
    const owner = await signedUpClient(t.app);
    workspaceId = owner.workspaceId;
    scope = await scopeOf(t, owner.me, workspaceId);
  });

  afterAll(async () => {
    await t.close();
  });

  /** Server cursors of this site's lead reads that wait for their next batch. */
  async function idleCursors(siteId: Types.ObjectId): Promise<number> {
    const operations = await t.connection
      .getClient()
      .db('admin')
      .aggregate([
        { $currentOp: { idleCursors: true, allUsers: true } },
        { $match: { type: 'idleCursor', 'cursor.originatingCommand.filter.siteId': siteId } },
      ])
      .toArray();
    return operations.length;
  }

  it('streams newest first and closes the server cursor when the reader stops early', async () => {
    const siteId = new Types.ObjectId();
    const ids = {
      workspaceId,
      siteId: siteId.toHexString(),
      pageId: new Types.ObjectId().toHexString(),
      releaseId: new Types.ObjectId().toHexString(),
    };
    const now = Date.now();
    // More than the first batch (101), so the server keeps a cursor for the rest.
    await insertLeads(
      t,
      Array.from({ length: 300 }, (_, index) =>
        storedLead({ ...ids, name: `Lead ${index}`, createdAt: new Date(now - index * 1000) }),
      ),
    );
    const leads = t.app.get(LeadsRepository);

    let read = 0;
    for await (const lead of leads.streamMatching(
      scope,
      siteId,
      EVERY_INBOX_LEAD,
      new Date(),
      10_000,
    )) {
      expect(lead.fields.name).toBe('Lead 0');
      expect(await idleCursors(siteId)).toBe(1);
      read += 1;
      // A download the visitor left: the export stops reading.
      break;
    }
    expect(read).toBe(1);
    expect(await idleCursors(siteId)).toBe(0);

    let all = 0;
    for await (const lead of leads.streamMatching(
      scope,
      siteId,
      EVERY_INBOX_LEAD,
      new Date(),
      10_000,
    )) {
      expect(lead.fields.name).toBe(`Lead ${all}`);
      all += 1;
    }
    expect(all).toBe(300);
    expect(await idleCursors(siteId)).toBe(0);
  });
});
