import { HeadObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import {
  dataRequestDetailSchema,
  type Domain,
  domainSchema,
  invitationListResponseSchema,
  meResponseSchema,
  problemSchema,
  type Site,
  siteDeletionSummarySchema,
  siteListResponseSchema,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { pageView, sendPageView } from '../../../test/analytics.js';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, TestClient } from '../../../test/client.js';
import { pointHere } from '../../../test/domains.js';
import { gate } from '../../../test/gate.js';
import {
  createLiveFormPage,
  insertLeads,
  leadBody,
  storedLead,
  submitLead,
} from '../../../test/leads.js';
import { invite, newEmail } from '../../../test/members.js';
import {
  createLivePage,
  createPage,
  editHeroHeading,
  getPage,
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { configurePrivacy, CONSENT_TEXTS } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import {
  addMember,
  createSite,
  pngImage,
  uploadImage,
  uploadRequest,
} from '../../../test/resources.js';
import { testEnvInput } from '../../../test/env.js';
import { parseEnv } from '../../config/env.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { WorkspaceDatabases } from '../../shared/persistence/workspace-databases.js';
import { ASSET_STORAGE, type AssetStorage, siteStoragePrefix } from '../assets/asset-storage.js';
import { DataRequestsRepository } from '../data-requests/data-requests.repository.js';
import { DomainChecker } from '../domains/domain-checker.service.js';
import type { DomainRecord } from '../domains/domain.schema.js';
import { LeadsRepository } from '../leads/leads.repository.js';
import { LeadNotifier } from '../notifications/lead-notifier.service.js';
import { SiteErasureRepository } from './site-erasure.repository.js';

const DAY_MS = 86_400_000;

/** The id `insertMany` gave a stored document. */
function idOf(record: Record<string, unknown>): Types.ObjectId {
  const id = record['_id'];
  if (!(id instanceof Types.ObjectId)) {
    throw new Error('insertMany did not set an id');
  }
  return id;
}

let domainCounter = 0;

/** A custom domain nobody uses yet in this test process. */
function newDomain(): string {
  domainCounter += 1;
  return `go.xoa${process.pid.toString(36)}x${domainCounter.toString(36)}.vn`;
}

/** "Xóa site" (ADR-027): one transaction over the master and the workspace database. */
describe('DELETE /sites/:siteId', () => {
  let t: TestApp;
  let owner: TestClient;
  let workspaceId: string;
  const revalidation = new RecordingRevalidationClient();
  // The storage the API writes to (docker compose), with its credentials: to see what it holds.
  const storage = parseEnv(testEnvInput({ MONGODB_URI: 'mongodb://localhost:1/unused' }));
  const s3 = new S3Client({
    endpoint: storage.S3_ENDPOINT,
    region: storage.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: storage.S3_ACCESS_KEY_ID,
      secretAccessKey: storage.S3_SECRET_ACCESS_KEY,
    },
  });

  beforeAll(async () => {
    t = await createTestApp('plp_test_site_deletion', withRevalidationRecorder(revalidation));
    const signedUp = await signedUpClient(t.app);
    owner = signedUp.client;
    workspaceId = signedUp.workspaceId;
  });

  afterAll(async () => {
    s3.destroy();
    await t.close();
  });

  const oid = (id: string) => new Types.ObjectId(id);

  function remove(client: TestClient, site: Pick<Site, 'id'>, confirmName: string) {
    return client.delete(`/sites/${site.id}`).send({ confirmName });
  }

  async function addDomain(client: TestClient, siteId: string, hostname: string): Promise<Domain> {
    return domainSchema.parse(
      (await client.post(`/sites/${siteId}/domains`, { hostname }).expect(201)).body,
    );
  }

  function tokenOf(domain: Domain): string {
    const txt = domain.records.find((record) => record.type === 'TXT');
    return txt?.value.replace('payload-verify=', '') ?? '';
  }

  /** A domain of the site that is verified and serves it. */
  async function activeDomain(client: TestClient, siteId: string, hostname = newDomain()) {
    const added = await addDomain(client, siteId, hostname);
    pointHere(t.dns, hostname, tokenOf(added));
    // "Kiểm tra ngay" answers with the last check within 5 seconds: let this one run.
    await t.connection
      .collection('domains')
      .updateOne({ _id: oid(added.id) }, { $set: { 'check.at': null } });
    const checked = domainSchema.parse(
      (await client.post(`/sites/${siteId}/domains/${added.id}/check`).expect(200)).body,
    );
    expect(checked.status).toBe('active');
    return checked;
  }

  /**
   * How many documents of the site each collection of the workspace database holds: every
   * collection registered there, so one added later and forgotten by the deletion fails here.
   */
  async function siteDocuments(siteId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const model of t.app.get(WorkspaceDatabases).models(oid(workspaceId))) {
      const filter = model.modelName === 'Site' ? { _id: oid(siteId) } : { siteId: oid(siteId) };
      counts[model.collection.collectionName] = await model.collection.countDocuments(filter);
    }
    return counts;
  }

  /** The collections of the workspace database that still hold documents of the site. */
  async function leftOf(siteId: string): Promise<string[]> {
    return Object.entries(await siteDocuments(siteId)).flatMap(([collection, count]) =>
      count > 0 ? [collection] : [],
    );
  }

  /** A request to delete their data, as the owner records it from an email. */
  function dataRequest() {
    return {
      name: 'Nguyễn Thu Hà',
      phone: '0901 234 567',
      email: '',
      type: 'delete',
      receivedAt: new Date(Date.now() - DAY_MS).toISOString(),
    };
  }

  /**
   * Deletes the site, the sweep after its commit included, the first time it is called. Later
   * calls, the deletion's own among them, go on at once.
   */
  function deletionOf(site: Site): () => Promise<void> {
    let started = false;
    return async () => {
      if (!started) {
        started = true;
        await remove(owner, site, site.name).expect(204);
      }
    };
  }

  /** Deletes the site just before the next transaction starts, once what it needs was read. */
  function deleteBeforeTransaction(site: Site) {
    const transactions = t.app.get(TransactionRunner);
    const run = transactions.run.bind(transactions);
    const deleteSite = deletionOf(site);
    return vi.spyOn(transactions, 'run').mockImplementation(async (work) => {
      await deleteSite();
      return run(work);
    });
  }

  async function storedKeys(siteId: string): Promise<string[]> {
    const listed = await s3.send(
      new ListObjectsV2Command({
        Bucket: storage.S3_BUCKET,
        Prefix: siteStoragePrefix({ workspaceId: oid(workspaceId), siteId: oid(siteId) }),
      }),
    );
    return (listed.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : []));
  }

  /**
   * A site with something in every collection: a live form page with a lead and a view, an
   * unpublished page, a page deleted while a lead kept its version, a request to publish, an
   * image, a data request and two custom domains.
   */
  async function fullSite(name = 'Nha khoa Smile Care') {
    const site = await createSite(owner, workspaceId, { name });
    await configurePrivacy(owner, site.id);
    await addConfirmedRecipient(t, owner, site.id, `nhan-${site.subdomain}@smilecare.vn`);
    const slug = uniqueSlug('dang-ky');
    const live = await createLiveFormPage(owner, site.id, slug);
    await sendPageView(t, site.subdomain, pageView(`/${slug}`)).expect(204);
    await submitLead(t, site.subdomain, leadBody(live.published.release.id)).expect(201);
    const gone = await createLiveFormPage(owner, site.id, uniqueSlug('cu'));
    await insertLeads(t, [
      storedLead({
        workspaceId,
        siteId: site.id,
        pageId: gone.pageId,
        releaseId: gone.published.release.id,
        spam: true,
      }),
    ]);
    const unpublish = (pageId: string, releaseId: string) =>
      owner
        .post(`/sites/${site.id}/pages/${pageId}/pointer`, {
          targetReleaseId: null,
          expectedCurrentReleaseId: releaseId,
          reason: 'Hết chương trình',
        })
        .expect(200);
    await unpublish(gone.pageId, gone.published.release.id);
    await owner.delete(`/sites/${site.id}/pages/${gone.pageId}`).expect(204);
    const resting = await createLivePage(owner, site.id, uniqueSlug('nghi'));
    await unpublish(resting.pageId, resting.published.release.id);
    const { client: contributor } = await addMember(t, workspaceId, 'contributor', [site.id]);
    await editHeroHeading(owner, site.id, live.pageId, 'Chờ duyệt');
    const detail = await getPage(owner, site.id, live.pageId);
    await contributor
      .post(`/sites/${site.id}/pages/${live.pageId}/approval`, {
        expectedRevision: detail.draft.revision,
        expectedPublishedReleaseId: live.published.release.id,
        approvalId: null,
        note: '',
      })
      .expect(200);
    const asset = await uploadImage(owner, site.id);
    await owner.post(`/sites/${site.id}/data-requests`, dataRequest()).expect(201);
    const active = await activeDomain(owner, site.id);
    const pending = await addDomain(owner, site.id, newDomain());
    return { site, slug, asset, active, pending };
  }

  it('deletes the site, every document of it and its images, and frees its addresses', async () => {
    const { site, slug, asset, active, pending } = await fullSite();
    const other = await createSite(owner, workspaceId, { name: 'Bếp Nhà Mây' });
    await createLivePage(owner, other.id, uniqueSlug('bep'));
    const otherBefore = await siteDocuments(other.id);
    const before = await siteDocuments(site.id);
    for (const collection of [
      'sites',
      'pages',
      'releases',
      'redirects',
      'assets',
      'leads',
      'activity',
      'consent_versions',
      'data_requests',
      'publish_approvals',
      'analytics_daily',
      'analytics_seen',
    ]) {
      // `redirects` is the one the fixture leaves empty: an unpublished slug change has none.
      if (collection !== 'redirects') {
        expect(before[collection], collection).toBeGreaterThan(0);
      }
    }
    const [imageKey = ''] = await storedKeys(site.id);
    expect(asset.url.endsWith(`/${imageKey}`)).toBe(true);
    const summary = siteDeletionSummarySchema.parse(
      (await owner.get(`/sites/${site.id}/deletion-summary`).expect(200)).body,
    );
    expect(summary).toEqual({
      pages: 2,
      livePages: 1,
      leads: 2,
      domains: [active.hostname, pending.hostname],
    });

    await remove(owner, site, 'Nha khoa Smile Care').expect(204);

    const left = Object.entries(await siteDocuments(site.id)).filter(([, count]) => count > 0);
    expect(left).toEqual([]);
    expect(await siteDocuments(other.id)).toEqual(otherBefore);
    const master = t.connection;
    expect(await master.collection('site_addresses').countDocuments({ _id: oid(site.id) })).toBe(0);
    expect(await master.collection('domains').countDocuments({ siteId: oid(site.id) })).toBe(0);
    expect(await storedKeys(site.id)).toEqual([]);
    await expect(
      s3.send(new HeadObjectCommand({ Bucket: storage.S3_BUCKET, Key: imageKey })),
    ).rejects.toThrow();
    expect((await fetch(asset.url)).status).toBe(404);
    expect(revalidation.calls).toContain(site.subdomain);

    // Nothing routes to it any more.
    await owner.get(`/sites/${site.id}`).expect(404);
    await owner.get(`/public/sites/${site.subdomain}/path-status?path=/${slug}`).expect(404);
    await owner.get(`/public/hosts/${active.hostname}`).expect(404);
    await owner.get(`/public/tls/allowed?domain=${active.hostname}`).expect(404);
    await submitLead(t, site.subdomain, leadBody(new Types.ObjectId().toHexString())).expect(404);
    await sendPageView(t, site.subdomain, pageView(`/${slug}`)).expect(204);
    expect(await siteDocuments(site.id)).toMatchObject({ analytics_daily: 0, analytics_seen: 0 });
    const sites = siteListResponseSchema.parse(
      (await owner.get(`/workspaces/${workspaceId}/sites`).expect(200)).body,
    );
    expect(sites.items.map((item) => item.id)).not.toContain(site.id);

    // Its subdomain and its domain are free for another site.
    const again = await createSite(owner, workspaceId, { subdomain: site.subdomain });
    expect(again.subdomain).toBe(site.subdomain);
    expect((await activeDomain(owner, other.id, active.hostname)).hostname).toBe(active.hostname);
  });

  it('takes the site out of members and invitations, revoking those left without a site', async () => {
    const site = await createSite(owner, workspaceId, { name: 'Spa Lá Xanh' });
    const other = await createSite(owner, workspaceId, { name: 'Bếp Nhà Mây' });
    const { client: only, me: onlyMe } = await addMember(t, workspaceId, 'editor', [site.id]);
    const { me: bothMe } = await addMember(t, workspaceId, 'viewer', [site.id, other.id]);
    const { me: wholeMe } = await addMember(t, workspaceId, 'support');
    const onlyInvite = newEmail('chi-site');
    const bothInvite = newEmail('hai-site');
    await invite(t, owner, workspaceId, onlyInvite, { role: 'editor', siteIds: [site.id] });
    await invite(t, owner, workspaceId, bothInvite, {
      role: 'viewer',
      siteIds: [site.id, other.id],
    });

    await remove(owner, site, 'Spa Lá Xanh').expect(204);

    const memberships = await t.connection
      .collection('memberships')
      .find({ workspaceId: oid(workspaceId) })
      .toArray();
    const siteIdsOf = (userId: string) =>
      (memberships.find((item) => String(item['userId']) === userId)?.['siteIds'] ?? null) as
        Types.ObjectId[] | null;
    expect(siteIdsOf(onlyMe.user.id)).toEqual([]);
    expect(siteIdsOf(bothMe.user.id)?.map(String)).toEqual([other.id]);
    expect(siteIdsOf(wholeMe.user.id)).toBeNull();
    // Kept to the deleted site only: still a member, with no site to open.
    const me = meResponseSchema.parse((await only.get('/auth/me').expect(200)).body);
    expect(me.memberships.find((item) => item.workspace.id === workspaceId)?.siteIds).toEqual([]);
    expect(
      siteListResponseSchema.parse(
        (await only.get(`/workspaces/${workspaceId}/sites`).expect(200)).body,
      ).items,
    ).toEqual([]);

    const pending = invitationListResponseSchema.parse(
      (await owner.get(`/workspaces/${workspaceId}/invitations`).expect(200)).body,
    ).items;
    expect(pending.map((item) => item.email)).not.toContain(onlyInvite);
    expect(pending.find((item) => item.email === bothInvite)?.siteIds).toEqual([other.id]);
    const revoked = await t.connection
      .collection('invitations')
      .findOne({ workspaceId: oid(workspaceId), email: onlyInvite });
    expect(revoked).toMatchObject({ status: 'revoked', siteIds: [] });
  });

  it('asks for the site name typed again, in any Unicode form, and keeps the site otherwise', async () => {
    const name = 'Nha khoa Quận Nhất';
    const site = await createSite(owner, workspaceId, { name });

    for (const typed of ['Nha khoa Quan Nhat', 'nha khoa quận nhất', '']) {
      const refused = await remove(owner, site, typed).expect(422);
      expect(problemSchema.parse(refused.body)).toMatchObject({
        code: 'validation_failed',
        issues: [{ path: ['confirmName'], code: 'mismatch', message: 'Tên site chưa đúng' }],
      });
    }
    await owner.delete(`/sites/${site.id}`).send({}).expect(422);
    await owner.get(`/sites/${site.id}`).expect(200);

    await remove(owner, site, ` ${name.normalize('NFD')} `).expect(204);
    await owner.get(`/sites/${site.id}`).expect(404);
  });

  it('needs Chủ sở hữu or Quản trị; others of the workspace get 403, outsiders 404', async () => {
    const site = await createSite(owner, workspaceId, { name: 'Cà phê Sáng' });
    const other = await createSite(owner, workspaceId);
    const stranger = (await signedUpClient(t.app)).client;
    const { client: elsewhere } = await addMember(t, workspaceId, 'admin');
    const { client: kept } = await addMember(t, workspaceId, 'editor', [other.id]);
    for (const role of ['editor', 'contributor', 'support', 'viewer'] as const) {
      const { client } = await addMember(t, workspaceId, role);
      const refused = await remove(client, site, 'Cà phê Sáng').expect(403);
      expect(problemSchema.parse(refused.body).code).toBe('forbidden');
      await client.get(`/sites/${site.id}/deletion-summary`).expect(403);
    }
    await remove(kept, site, 'Cà phê Sáng').expect(404);
    await remove(stranger, site, 'Cà phê Sáng').expect(404);
    await stranger.get(`/sites/${site.id}/deletion-summary`).expect(404);
    await remove(new TestClient(t.app), site, 'Cà phê Sáng').expect(401);
    await owner.get(`/sites/${site.id}`).expect(200);

    await remove(elsewhere, site, 'Cà phê Sáng').expect(204);
  });

  /**
   * A grant read or checked before the site was deleted, and stored after: the deletion took the
   * site out of what it saw, so the grant must not bring it back (ADR-027).
   */
  describe('grants that name a site deleted meanwhile', () => {
    it('makes a member of an invitation with the sites it has now, not those read before', async () => {
      const site = await createSite(owner, workspaceId, { name: 'Mời rồi xóa' });
      const other = await createSite(owner, workspaceId, { name: 'Còn lại' });
      const someone = await signedUpClient(t.app);
      const token = await invite(t, owner, workspaceId, someone.me.user.email, {
        role: 'viewer',
        siteIds: [site.id, other.id],
      });
      // The invitation was read from the link; the site goes before the membership is stored.
      const spy = deleteBeforeTransaction(site);
      try {
        await someone.client.post('/invitations/accept', { token }).expect(200);
      } finally {
        spy.mockRestore();
      }
      const me = meResponseSchema.parse((await someone.client.get('/auth/me').expect(200)).body);
      expect(me.memberships.find((item) => item.workspace.id === workspaceId)?.siteIds).toEqual([
        other.id,
      ]);
    });

    it('refuses to give a member a site deleted once the grant was checked', async () => {
      const site = await createSite(owner, workspaceId, { name: 'Giao rồi xóa' });
      const other = await createSite(owner, workspaceId, { name: 'Đang có' });
      const { me } = await addMember(t, workspaceId, 'editor', [other.id]);
      const spy = deleteBeforeTransaction(site);
      try {
        const refused = await owner
          .patch(`/workspaces/${workspaceId}/members/${me.user.id}`, {
            role: 'editor',
            siteIds: [other.id, site.id],
          })
          .expect(422);
        expect(problemSchema.parse(refused.body).issues).toEqual([
          {
            path: ['siteIds'],
            code: 'site_not_found',
            message: 'Có site không thuộc workspace này',
          },
        ]);
      } finally {
        spy.mockRestore();
      }
      const stored = await t.connection
        .collection<{ siteIds: Types.ObjectId[] | null }>('memberships')
        .findOne({ workspaceId: oid(workspaceId), userId: oid(me.user.id) });
      expect(stored?.siteIds?.map(String)).toEqual([other.id]);
    });

    it('invites nobody to a site deleted once the grant was checked', async () => {
      const site = await createSite(owner, workspaceId, { name: 'Mời muộn' });
      const email = newEmail('xoa-muon');
      const spy = deleteBeforeTransaction(site);
      try {
        const refused = await owner
          .post(`/workspaces/${workspaceId}/invitations`, {
            emails: [email],
            role: 'editor',
            siteIds: [site.id],
          })
          .expect(422);
        expect(problemSchema.parse(refused.body).issues?.map((issue) => issue.code)).toEqual([
          'site_not_found',
        ]);
      } finally {
        spy.mockRestore();
      }
      expect(
        await t.connection
          .collection('invitations')
          .countDocuments({ workspaceId: oid(workspaceId), email }),
      ).toBe(0);
      expect(t.emails.to(email)).toEqual([]);
    });
  });

  it('deletes a site once when two deletions race', async () => {
    const site = await createSite(owner, workspaceId, { name: 'Hai lần' });
    const statuses = await Promise.all([
      remove(owner, site, 'Hai lần').then((response) => response.status),
      remove(owner, site, 'Hai lần').then((response) => response.status),
    ]);
    expect(statuses.sort()).toEqual([204, 404]);
  });

  describe('work that reads a site while it is deleted', () => {
    it('removes a lead stored by a form sent while the site was being deleted', async () => {
      const site = await createSite(owner, workspaceId, { name: 'Đang xóa' });
      await configurePrivacy(owner, site.id);
      await addConfirmedRecipient(t, owner, site.id, `nhan-${site.subdomain}@smilecare.vn`);
      const { published } = await createLiveFormPage(owner, site.id, uniqueSlug('form'));
      const leads = t.app.get(LeadsRepository);
      const insert = leads.insertPublic.bind(leads);
      // Intake read the site; the deletion and its sweep after the commit are over before the
      // lead is stored, so only intake reading the settings again finds the site gone.
      const spy = vi.spyOn(leads, 'insertPublic').mockImplementation(async (...args) => {
        await remove(owner, site, 'Đang xóa').expect(204);
        return insert(...args);
      });
      try {
        await submitLead(t, site.subdomain, leadBody(published.release.id)).expect(404);
      } finally {
        spy.mockRestore();
      }
      expect(
        await t
          .workspaceDb(workspaceId)
          .collection('leads')
          .countDocuments({ siteId: oid(site.id) }),
      ).toBe(0);
    });

    it('removes, after the commit, a lead stored while the transaction ran', async () => {
      const site = await createSite(owner, workspaceId, { name: 'Trong lúc xóa' });
      const page = await createPage(owner, site.id);
      const erasure = t.app.get(SiteErasureRepository);
      const erase = erasure.erase.bind(erasure);
      const leads = () =>
        t
          .workspaceDb(workspaceId)
          .collection('leads')
          .countDocuments({ siteId: oid(site.id) });
      let strayInserted = false;
      let leftAfterCommit: number | null = null;
      const spy = vi.spyOn(erasure, 'erase').mockImplementation(async (scope, siteId, tx) => {
        if (tx !== undefined && !strayInserted) {
          // Inside the transaction, before it deletes the leads: a write it does not see.
          strayInserted = true;
          await insertLeads(t, [
            storedLead({
              workspaceId,
              siteId: site.id,
              pageId: page.page.id,
              releaseId: new Types.ObjectId().toHexString(),
            }),
          ]);
        } else if (tx === undefined) {
          leftAfterCommit = await leads();
        }
        return erase(scope, siteId, tx);
      });
      try {
        await remove(owner, site, 'Trong lúc xóa').expect(204);
      } finally {
        spy.mockRestore();
      }
      expect(strayInserted).toBe(true);
      // The transaction left it; the sweep after the commit removed it.
      expect(leftAfterCommit).toBe(1);
      expect(await leads()).toBe(0);
    });

    it('deletes a data request stored while the deletion waited, or refuses it', async () => {
      const site = await createSite(owner, workspaceId, { name: 'Chờ yêu cầu' });
      const requests = t.app.get(DataRequestsRepository);
      const erasure = t.app.get(SiteErasureRepository);
      const insert = requests.insert.bind(requests);
      const erase = erasure.erase.bind(erasure);
      const held = gate();
      const release = gate();
      const tried = gate();
      // The request has written the site in its transaction, and waits before storing itself.
      const insertSpy = vi.spyOn(requests, 'insert').mockImplementation(async (...args) => {
        held.open();
        await release.opened;
        return insert(...args);
      });
      // The deletion reached the site while the request's write on it was not committed yet.
      const eraseSpy = vi.spyOn(erasure, 'erase').mockImplementation((scope, siteId, tx) => {
        if (tx !== undefined) {
          tried.open();
        }
        return erase(scope, siteId, tx);
      });
      let outcome;
      try {
        const recorded = owner
          .post(`/sites/${site.id}/data-requests`, dataRequest())
          .then((response) => response);
        await held.opened;
        const deleted = remove(owner, site, 'Chờ yêu cầu').then((response) => response);
        await tried.opened;
        release.open();
        outcome = { recorded: await recorded, deleted: await deleted };
      } finally {
        insertSpy.mockRestore();
        eraseSpy.mockRestore();
      }
      const { recorded, deleted } = outcome;
      expect(deleted.status).toBe(204);
      // Normally the deletion waits and erases the request too. When MongoDB aborts the request's
      // transaction (a transient error) and retries it after the deletion, the request is 404.
      expect([201, 404]).toContain(recorded.status);
      console.info(`A data request stored while its site was deleted: ${String(recorded.status)}`);
      // Either way nothing of the site is left.
      expect(await leftOf(site.id)).toEqual([]);
    });

    it('lets the domain checks, the lead emails and the startup sweep go on', async () => {
      const site = await createSite(owner, workspaceId, { name: 'Nền' });
      await configurePrivacy(owner, site.id);
      const recipient = `nhan-${site.subdomain}@smilecare.vn`;
      await addConfirmedRecipient(t, owner, site.id, recipient);
      const { pageId, published } = await createLiveFormPage(owner, site.id, uniqueSlug('nen'));
      const lead = storedLead({
        workspaceId,
        siteId: site.id,
        pageId,
        releaseId: published.release.id,
        notification: { status: 'pending', updatedAt: new Date(Date.now() - DAY_MS) },
      });
      await insertLeads(t, [lead]);
      const added = await addDomain(owner, site.id, newDomain());
      const domain = await t.connection
        .collection<DomainRecord>('domains')
        .findOne({ _id: oid(added.id) });
      if (domain === null) {
        throw new Error('The domain was not stored');
      }
      pointHere(t.dns, added.hostname, tokenOf(added));

      await remove(owner, site, 'Nền').expect(204);

      // A check that took the domain before the deletion finishes without it.
      await expect(t.app.get(DomainChecker).check(domain)).resolves.toBeDefined();
      expect(await t.connection.collection('domains').countDocuments({ _id: oid(added.id) })).toBe(
        0,
      );
      // An email queued before the deletion finds no lead to send.
      const sent = t.emails.sent.length;
      t.app.get(LeadNotifier).enqueue({ workspaceId: oid(workspaceId), leadId: idOf(lead) });
      await t.app.get(LeadNotifier).onApplicationBootstrap();
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(t.emails.sent.slice(sent).filter((email) => email.to.includes(recipient))).toEqual([]);
    });
  });

  /**
   * Work that read the site before it was deleted and stores something of it once the deletion
   * and its sweep are over: nothing would ever delete it, so it is refused (ADR-027).
   */
  describe('work that stores data of a site already deleted', () => {
    function expectSiteGone(response: { body: unknown }): void {
      expect(problemSchema.parse(response.body)).toMatchObject({
        status: 404,
        title: 'Không tìm thấy site',
      });
    }

    /** A site with one lead in its inbox. */
    async function siteWithLead(name: string) {
      const site = await createSite(owner, workspaceId, { name });
      const lead = storedLead({
        workspaceId,
        siteId: site.id,
        pageId: new Types.ObjectId().toHexString(),
        releaseId: new Types.ObjectId().toHexString(),
      });
      await insertLeads(t, [lead]);
      return { site, leadId: idOf(lead).toHexString() };
    }

    it('refuses a data request, which would keep personal data of a deleted site', async () => {
      const site = await createSite(owner, workspaceId, { name: 'Yêu cầu muộn' });
      const spy = deleteBeforeTransaction(site);
      try {
        expectSiteGone(
          await owner.post(`/sites/${site.id}/data-requests`, dataRequest()).expect(404),
        );
      } finally {
        spy.mockRestore();
      }
      expect(await leftOf(site.id)).toEqual([]);
    });

    it('answers 404, not "đã hoàn tất", completing a request of a site deleted meanwhile', async () => {
      const site = await createSite(owner, workspaceId, { name: 'Hoàn tất muộn' });
      const recorded = await owner
        .post(`/sites/${site.id}/data-requests`, dataRequest())
        .expect(201);
      const requestId = dataRequestDetailSchema.parse(recorded.body).id;
      const spy = deleteBeforeTransaction(site);
      try {
        const refused = await owner
          .post(`/sites/${site.id}/data-requests/${requestId}/complete`)
          .expect(404);
        expect(problemSchema.parse(refused.body).status).toBe(404);
      } finally {
        spy.mockRestore();
      }
      expect(await leftOf(site.id)).toEqual([]);
    });

    it('refuses an image stored once its site was deleted, and deletes the public file', async () => {
      const site = await createSite(owner, workspaceId, { name: 'Ảnh muộn' });
      const storage = t.app.get<AssetStorage>(ASSET_STORAGE);
      const put = storage.put.bind(storage);
      const deleteSite = deletionOf(site);
      // The image was checked and re-encoded; the site and its images go before it is stored.
      const spy = vi.spyOn(storage, 'put').mockImplementation(async (...args) => {
        await deleteSite();
        return put(...args);
      });
      try {
        expectSiteGone(await uploadRequest(owner, site.id, await pngImage()).expect(404));
      } finally {
        spy.mockRestore();
      }
      expect(await leftOf(site.id)).toEqual([]);
      expect(await storedKeys(site.id)).toEqual([]);
    });

    it('answers a page or a custom domain added to a deleted site with 404, not 500', async () => {
      const pages = await createSite(owner, workspaceId, { name: 'Trang muộn' });
      let spy = deleteBeforeTransaction(pages);
      try {
        expectSiteGone(
          await owner
            .post(`/sites/${pages.id}/pages`, {
              title: 'Ưu đãi niềng răng',
              slug: uniqueSlug('muon'),
              start: { kind: 'blank' },
            })
            .expect(404),
        );
      } finally {
        spy.mockRestore();
      }
      expect(await leftOf(pages.id)).toEqual([]);

      const domains = await createSite(owner, workspaceId, { name: 'Tên miền muộn' });
      const hostname = newDomain();
      spy = deleteBeforeTransaction(domains);
      try {
        expectSiteGone(await owner.post(`/sites/${domains.id}/domains`, { hostname }).expect(404));
      } finally {
        spy.mockRestore();
      }
      expect(await t.connection.collection('domains').countDocuments({ hostname })).toBe(0);
    });

    it('refuses a consent version of a deleted site', async () => {
      const site = await createSite(owner, workspaceId, { name: 'Đồng ý muộn' });
      const spy = deleteBeforeTransaction(site);
      try {
        expectSiteGone(
          await owner
            .post(`/sites/${site.id}/consent-versions`, { baseVersion: 0, ...CONSENT_TEXTS })
            .expect(404),
        );
      } finally {
        spy.mockRestore();
      }
      expect(await leftOf(site.id)).toEqual([]);
    });

    it('logs no deletion of a person in the activity of a deleted site', async () => {
      const { site, leadId } = await siteWithLead('Xóa người muộn');
      const spy = deleteBeforeTransaction(site);
      try {
        expectSiteGone(await owner.delete(`/sites/${site.id}/leads/${leadId}/person`).expect(404));
      } finally {
        spy.mockRestore();
      }
      expect(await leftOf(site.id)).toEqual([]);
    });

    // Each export reads its leads, then logs itself before the file goes out.
    it('logs no export of the inbox in the activity of a deleted site', async () => {
      const { site } = await siteWithLead('Xuất muộn');
      const leads = t.app.get(LeadsRepository);
      const countMatching = leads.countMatching.bind(leads);
      const deleteSite = deletionOf(site);
      const spy = vi.spyOn(leads, 'countMatching').mockImplementation(async (...args) => {
        await deleteSite();
        return countMatching(...args);
      });
      try {
        expectSiteGone(
          await owner.post(`/sites/${site.id}/leads/export`, { range: 'all' }).expect(404),
        );
      } finally {
        spy.mockRestore();
      }
      expect(await leftOf(site.id)).toEqual([]);
    });

    it('logs no export of a person in the activity of a deleted site', async () => {
      const { site, leadId } = await siteWithLead('Xuất người muộn');
      const leads = t.app.get(LeadsRepository);
      const listPerson = leads.listPerson.bind(leads);
      const deleteSite = deletionOf(site);
      const spy = vi.spyOn(leads, 'listPerson').mockImplementation(async (...args) => {
        await deleteSite();
        return listPerson(...args);
      });
      try {
        expectSiteGone(
          await owner
            .post(`/sites/${site.id}/leads/${leadId}/person/export`, { format: 'json' })
            .expect(404),
        );
      } finally {
        spy.mockRestore();
      }
      expect(await leftOf(site.id)).toEqual([]);
    });
  });
});
