import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { problemSchema, type Site } from '@plp/contracts';
import { type Connection, Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, signupInput, TestClient } from '../../../test/client.js';
import { RecordingEmailSender } from '../../../test/email.js';
import { createSecondInstance } from '../../../test/instances.js';
import { insertLeads, storedLead } from '../../../test/leads.js';
import { createPage } from '../../../test/pages.js';
import { confirmationLink, confirmRecipient } from '../../../test/recipients.js';
import { createSite, uploadImage } from '../../../test/resources.js';
import { AppModule } from '../../app.module.js';
import { NEST_APP_OPTIONS } from '../../configure-app.js';
import { LEAD_MODEL, LEADS_SUBMISSION_INDEX } from '../../modules/leads/lead.schema.js';
import { LeadNotifier } from '../../modules/notifications/lead-notifier.service.js';
import { EmailSender } from '../../modules/notifications/email-sender.js';
import { LeadsRepository } from '../../modules/leads/leads.repository.js';
import { WorkspacesRepository } from '../../modules/workspaces/workspaces.repository.js';
import { WorkspaceDatabases } from './workspace-databases.js';

/** Every collection a workspace's database holds; the master holds none of them (ADR-025). */
const WORKSPACE_COLLECTIONS = [
  'activity',
  'analytics_daily',
  'analytics_seen',
  'assets',
  'consent_versions',
  'data_requests',
  'leads',
  'pages',
  'publish_approvals',
  'redirects',
  'releases',
  'sites',
];

/** ADR-025: a master DB for accounts and routing, and one database per workspace for its data. */
describe('workspace databases', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_ws_databases');
  });

  afterAll(async () => {
    await t.close();
  });

  function admin() {
    const { db } = t.connection;
    if (!db) {
      throw new Error('The master connection has no database');
    }
    return db;
  }

  async function workspaceDatabases(): Promise<string[]> {
    const { databases } = await admin().admin().listDatabases({ nameOnly: true });
    return databases
      .map(({ name }) => name)
      .filter((name) => name.startsWith(`${t.connection.name}_ws_`))
      .sort();
  }

  async function collectionsOf(connection: Connection): Promise<string[]> {
    return (await connection.listCollections()).map(({ name }) => name).sort();
  }

  it('keeps a workspace’s data in its own database and only the site’s address in the master', async () => {
    const a = await signedUpClient(t.app);
    const b = await signedUpClient(t.app);
    const site = await createSite(a.client, a.workspaceId);
    const page = await createPage(a.client, site.id);
    const siteId = new Types.ObjectId(site.id);

    const own = t.workspaceDb(a.workspaceId);
    expect(await own.collection('sites').countDocuments({ _id: siteId })).toBe(1);
    expect(
      await own.collection('pages').countDocuments({ _id: new Types.ObjectId(page.page.id) }),
    ).toBe(1);
    expect(await t.workspaceDb(b.workspaceId).collection('sites').countDocuments()).toBe(0);
    expect(await t.connection.collection('site_addresses').findOne({ _id: siteId })).toEqual({
      _id: siteId,
      workspaceId: new Types.ObjectId(a.workspaceId),
      subdomain: site.subdomain,
    });
    const master = await collectionsOf(t.connection);
    expect(master.filter((name) => WORKSPACE_COLLECTIONS.includes(name))).toEqual([]);
  });

  it('creates the database of a workspace with every collection and index when it signs up', async () => {
    const { workspaceId } = await signedUpClient(t.app);

    expect(await workspaceDatabases()).toContain(
      t.app.get(WorkspaceDatabases).nameOf(new Types.ObjectId(workspaceId)),
    );
    expect(await collectionsOf(t.workspaceDb(workspaceId))).toEqual(WORKSPACE_COLLECTIONS);
    for (const model of t.app.get(WorkspaceDatabases).models(new Types.ObjectId(workspaceId))) {
      const { toCreate } = await model.diffIndexes();
      expect({ model: model.modelName, missing: toCreate }).toEqual({
        model: model.modelName,
        missing: [],
      });
    }
  });

  it('drops the database again when the sign-up does not complete', async () => {
    const before = await workspaceDatabases();
    const input = signupInput();
    let builtFirst = false;
    const create = vi
      .spyOn(WorkspacesRepository.prototype, 'createWithOwner')
      .mockImplementationOnce(async (workspace) => {
        // The database exists before the workspace does (ADR-025).
        builtFirst = (await workspaceDatabases()).includes(
          t.app.get(WorkspaceDatabases).nameOf(workspace.id),
        );
        throw new Error('MongoDB went away');
      });
    try {
      const response = await new TestClient(t.app).post('/auth/signup', input).expect(500);
      expect(problemSchema.parse(response.body).code).toBe('internal');
    } finally {
      create.mockRestore();
    }

    expect(builtFirst).toBe(true);
    expect(await workspaceDatabases()).toEqual(before);
    expect(await t.connection.collection('users').countDocuments({ email: input.email })).toBe(0);
  });

  it('never shows a document of another workspace that ended up in a workspace’s database', async () => {
    const a = await signedUpClient(t.app);
    const site = await createSite(a.client, a.workspaceId);
    const own = await createPage(a.client, site.id);
    // A copy of the page, said to belong to another workspace, in A's database: a routing slip.
    const strayId = new Types.ObjectId();
    const pages = t.workspaceDb(a.workspaceId).collection('pages');
    const original = await pages.findOne({ _id: new Types.ObjectId(own.page.id) });
    await pages.insertOne({
      ...original,
      _id: strayId,
      workspaceId: new Types.ObjectId(),
      draft: { ...(original?.['draft'] as object), slug: `lac-${strayId.toHexString()}` },
    });

    await a.client.get(`/sites/${site.id}/pages/${strayId.toHexString()}`).expect(404);
    const list = await a.client.get(`/sites/${site.id}/pages`).expect(200);
    expect(JSON.stringify(list.body)).not.toContain(strayId.toHexString());
  });

  it('answers 404 for another workspace’s page, lead and image named under a site of one’s own', async () => {
    const a = await signedUpClient(t.app);
    const b = await signedUpClient(t.app);
    const siteA = await createSite(a.client, a.workspaceId);
    const siteB = await createSite(b.client, b.workspaceId);
    const pageB = await createPage(b.client, siteB.id);
    const imageB = await uploadImage(b.client, siteB.id);
    const leadId = new Types.ObjectId();
    await insertLeads(t, [
      {
        ...storedLead({
          workspaceId: b.workspaceId,
          siteId: siteB.id,
          pageId: pageB.page.id,
          releaseId: new Types.ObjectId().toHexString(),
        }),
        _id: leadId,
      },
    ]);

    // The site is A's own, the id is B's: the id is looked up in A's database only.
    await a.client.get(`/sites/${siteA.id}/pages/${pageB.page.id}`).expect(404);
    await a.client.get(`/sites/${siteA.id}/leads/${leadId.toHexString()}`).expect(404);
    await a.client
      .patch(`/sites/${siteA.id}/assets/${imageB.id}`, { alt: 'Ảnh', decorative: false })
      .expect(404);
    // And B's site itself is as foreign as ever.
    await a.client.get(`/sites/${siteB.id}/pages/${pageB.page.id}`).expect(404);
    await a.client.get(`/sites/${siteB.id}/leads/${leadId.toHexString()}`).expect(404);
    await b.client.get(`/sites/${siteB.id}/pages/${pageB.page.id}`).expect(200);
    const inbox = await b.client.get(`/sites/${siteB.id}/leads`).expect(200);
    expect(JSON.stringify(inbox.body)).toContain(leadId.toHexString());
  });

  it('confirms a lead address only through the site its link names', async () => {
    const a = await signedUpClient(t.app);
    const b = await signedUpClient(t.app);
    const siteA = await createSite(a.client, a.workspaceId);
    const siteB: Site = await createSite(b.client, b.workspaceId);
    const email = 'nhan-lead@smilecare.vn';
    await a.client.post(`/sites/${siteA.id}/lead-recipients`, { email }).expect(201);
    const link = confirmationLink(t.emails, email);
    expect(link.siteId).toBe(siteA.id);

    await confirmRecipient(t, { siteId: siteB.id, token: link.token }).expect(404);
    await confirmRecipient(t, {
      siteId: new Types.ObjectId().toHexString(),
      token: link.token,
    }).expect(404);
    await confirmRecipient(t, link).expect(200);
  });

  it('takes on the lead emails a stopped instance left in every workspace', async () => {
    const pending = await Promise.all(
      [1, 2].map(async () => {
        const { client, workspaceId } = await signedUpClient(t.app);
        const site = await createSite(client, workspaceId);
        const lead = {
          ...storedLead({
            workspaceId,
            siteId: site.id,
            pageId: new Types.ObjectId().toHexString(),
            releaseId: new Types.ObjectId().toHexString(),
            notification: { status: 'pending' },
          }),
          _id: new Types.ObjectId(),
        };
        return { workspaceId, lead };
      }),
    );
    await insertLeads(
      t,
      pending.map(({ lead }) => lead),
    );

    await t.app.get(LeadNotifier).onApplicationBootstrap();

    // Neither site has a confirmed address: each lead is visited in its own database and fails.
    await vi.waitFor(
      async () => {
        for (const { workspaceId, lead } of pending) {
          const stored = await t
            .workspaceDb(workspaceId)
            .collection('leads')
            .findOne({ _id: lead._id });
          expect(stored?.['notification']).toMatchObject({
            status: 'failed',
            lastErrorCode: 'no_recipients',
          });
        }
      },
      { timeout: 5000, interval: 20 },
    );
  });

  it('takes on the oldest lead emails across workspaces, and skips a workspace that fails', async () => {
    const pendingIn = async (count: number, minutesAgo: number) => {
      const { client, workspaceId } = await signedUpClient(t.app);
      const site = await createSite(client, workspaceId);
      const leads = Array.from({ length: count }, () => ({
        ...storedLead({
          workspaceId,
          siteId: site.id,
          pageId: new Types.ObjectId().toHexString(),
          releaseId: new Types.ObjectId().toHexString(),
          notification: {
            status: 'pending',
            updatedAt: new Date(Date.now() - minutesAgo * 60_000),
          },
        }),
        _id: new Types.ObjectId(),
      }));
      await insertLeads(t, leads);
      return { workspaceId, leads };
    };
    const statusOf = async (workspaceId: string, id: Types.ObjectId | undefined) =>
      (
        await t
          .workspaceDb(workspaceId)
          .collection('leads')
          .findOne({ _id: id ?? new Types.ObjectId() })
      )?.['notification'] as { status: string } | undefined;
    // A crowded workspace first, then one whose only lead waits longest, then one that fails.
    const crowded = await pendingIn(501, 1);
    const older = await pendingIn(1, 60);
    const failing = await pendingIn(1, 120);
    const leadsRepository = t.app.get(LeadsRepository);
    const sweep = leadsRepository.findNotificationBacklog.bind(leadsRepository);
    const broken = vi
      .spyOn(leadsRepository, 'findNotificationBacklog')
      .mockImplementation((ref, staleBefore, limit) =>
        ref.workspaceId.equals(failing.workspaceId)
          ? Promise.reject(new Error('MongoDB went away'))
          : sweep(ref, staleBefore, limit),
      );
    try {
      await t.app.get(LeadNotifier).onApplicationBootstrap();
    } finally {
      broken.mockRestore();
    }

    // The oldest lead is taken although 501 newer ones came before it, as with one database.
    await vi.waitFor(
      async () => {
        expect(await statusOf(older.workspaceId, older.leads[0]?._id)).toMatchObject({
          status: 'failed',
        });
      },
      { timeout: 10_000, interval: 50 },
    );
    expect(await statusOf(failing.workspaceId, failing.leads[0]?._id)).toMatchObject({
      status: 'pending',
    });
    const waiting = await t
      .workspaceDb(crowded.workspaceId)
      .collection('leads')
      .countDocuments({ 'notification.status': 'pending', 'notification.attempts': 0 });
    expect(waiting).toBeGreaterThanOrEqual(2);
  });

  describe('at startup', () => {
    async function startAnother(): Promise<NestExpressApplication> {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(t.env)] })
        .overrideProvider(EmailSender)
        .useValue(new RecordingEmailSender())
        .compile();
      return moduleRef.createNestApplication<NestExpressApplication>({
        logger: false,
        ...NEST_APP_OPTIONS,
      });
    }

    it('builds every workspace database, more than it builds at once', async () => {
      const ids = [];
      for (let index = 0; index < 10; index += 1) {
        ids.push((await signedUpClient(t.app)).workspaceId);
      }
      const first = t.workspaceDb(ids[0] ?? '').collection('leads');
      const last = t.workspaceDb(ids[9] ?? '').collection('leads');
      await first.dropIndex(LEADS_SUBMISSION_INDEX);
      await last.dropIndex(LEADS_SUBMISSION_INDEX);

      const second = await createSecondInstance(t);
      await second.close();

      for (const leads of [first, last]) {
        expect((await leads.indexes()).map(({ name }) => name)).toContain(LEADS_SUBMISSION_INDEX);
      }
    });

    it('builds again an index missing from a workspace database', async () => {
      const { workspaceId } = await signedUpClient(t.app);
      const leads = t.workspaceDb(workspaceId).collection('leads');
      await leads.dropIndex(LEADS_SUBMISSION_INDEX);

      const second = await createSecondInstance(t);
      await second.close();

      expect((await leads.indexes()).map(({ name }) => name)).toContain(LEADS_SUBMISSION_INDEX);
    });

    it('does not start when an index of a workspace database cannot be built', async () => {
      const { workspaceId } = await signedUpClient(t.app);
      const leads = t.workspaceDb(workspaceId).collection('leads');
      await leads.dropIndex(LEADS_SUBMISSION_INDEX);
      const siteId = new Types.ObjectId();
      // One lead per submission while the unique index was missing: two got in.
      await leads.insertMany([
        { siteId, submissionId: 'gui-lai' },
        { siteId, submissionId: 'gui-lai' },
      ]);
      const app = await startAnother();
      try {
        await expect(app.init()).rejects.toMatchObject({
          message: `Creating the collection and indexes of ${LEAD_MODEL} in ${t.app
            .get(WorkspaceDatabases)
            .nameOf(new Types.ObjectId(workspaceId))} failed`,
          cause: { code: 11000 },
        });
      } finally {
        await app.close();
        await leads.deleteMany({ siteId });
        await leads.createIndex(
          { siteId: 1, submissionId: 1 },
          {
            unique: true,
            name: LEADS_SUBMISSION_INDEX,
            partialFilterExpression: { submissionId: { $type: 'string' } },
          },
        );
      }
    });
  });
});
