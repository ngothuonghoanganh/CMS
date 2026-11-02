import {
  activityListResponseSchema,
  type ActivityItem,
  type Domain,
  domainAvailabilitySchema,
  domainListResponseSchema,
  domainSchema,
  siteAddressStatusSchema,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { pointHere } from '../../../test/domains.js';
import {
  createLivePage,
  getPage,
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { addMember, createSite } from '../../../test/resources.js';
import { DomainChecker } from './domain-checker.service.js';
import { DomainsRepository } from './domains.repository.js';

/*
 * E1 (ADR-022, ADR-006, amended 2026-11-02): domain events in the site's activity, the check
 * before adding a domain, the status of the live address on board 01, and the passed checks of
 * the primary address on board 05.
 */

let counter = 0;

/** A domain nobody uses yet in this test process. */
function newDomain(prefix = 'go'): string {
  counter += 1;
  return `${prefix}.board${process.pid.toString(36)}x${counter.toString(36)}.vn`;
}

function tokenOf(domain: Domain): string {
  const token = domain.records
    .find((record) => record.type === 'TXT')
    ?.value.replace('payload-verify=', '');
  if (token === undefined) {
    throw new Error('The domain has no TXT record');
  }
  return token;
}

describe('custom domains on boards 01, 05, 13 and 14 (E1)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp(
      'plp_test_domain_board',
      withRevalidationRecorder(new RecordingRevalidationClient()),
    );
  });

  afterAll(async () => {
    await t.close();
  });

  async function siteOf() {
    const owner = await signedUpClient(t.app);
    const site = await createSite(owner.client, owner.workspaceId);
    return { ...owner, site };
  }

  async function add(client: TestClient, siteId: string, hostname: string): Promise<Domain> {
    const response = await client.post(`/sites/${siteId}/domains`, { hostname }).expect(201);
    return domainSchema.parse(response.body);
  }

  async function check(client: TestClient, siteId: string, domainId: string): Promise<Domain> {
    // "Kiểm tra ngay" answers with the last check within 5 seconds: let the next one run.
    await t.connection
      .collection('domains')
      .updateOne({ _id: new Types.ObjectId(domainId) }, { $set: { 'check.at': null } });
    const response = await client.post(`/sites/${siteId}/domains/${domainId}/check`).expect(200);
    return domainSchema.parse(response.body);
  }

  async function activeDomain(client: TestClient, siteId: string, hostname = newDomain()) {
    const added = await add(client, siteId, hostname);
    pointHere(t.dns, hostname, tokenOf(added));
    const active = await check(client, siteId, added.id);
    expect(active.status).toBe('active');
    return active;
  }

  async function activity(client: TestClient, siteId: string): Promise<ActivityItem[]> {
    const response = await client.get(`/sites/${siteId}/activity?limit=50`).expect(200);
    return activityListResponseSchema.parse(response.body).items;
  }

  async function domainEvents(client: TestClient, siteId: string) {
    return (await activity(client, siteId))
      .filter((item) => item.type.startsWith('domain.'))
      .map((item) => ({
        type: item.type,
        by: item.actor?.name ?? null,
        hostname: item.data.hostname,
      }))
      .reverse();
  }

  async function availability(client: TestClient, siteId: string, hostname: string) {
    const response = await client
      .get(`/sites/${siteId}/domains/availability?hostname=${encodeURIComponent(hostname)}`)
      .expect(200);
    return domainAvailabilitySchema.parse(response.body);
  }

  async function addressStatus(client: TestClient, siteId: string) {
    const response = await client.get(`/sites/${siteId}/address-status`).expect(200);
    return siteAddressStatusSchema.parse(response.body);
  }

  describe('the check before adding a domain (board 14)', () => {
    it('says whether a domain can be added, never which site has it', async () => {
      const first = await siteOf();
      const owned = await activeDomain(first.client, first.site.id);
      const second = await siteOf();
      const mine = newDomain('uudai');
      await add(second.client, second.site.id, mine);

      expect(
        await availability(second.client, second.site.id, 'https://uudai.smilecare.vn/'),
      ).toEqual({
        hostname: 'https://uudai.smilecare.vn/',
        state: 'invalid',
        reason: 'Chỉ nhập tên miền, không kèm https://, cổng và dấu / ở cuối.',
      });
      expect((await availability(second.client, second.site.id, 'cname.payload.site')).reason).toBe(
        'Đây là địa chỉ của hệ thống',
      );
      expect(await availability(second.client, second.site.id, ` ${mine.toUpperCase()} `)).toEqual({
        hostname: mine,
        state: 'already_added',
        reason: null,
      });
      const taken = await second.client
        .get(`/sites/${second.site.id}/domains/availability?hostname=${owned.hostname}`)
        .expect(200);
      expect(domainAvailabilitySchema.parse(taken.body)).toEqual({
        hostname: owned.hostname,
        state: 'taken',
        reason: null,
      });
      // Only the three fields: nothing about the owner.
      expect(Object.keys(taken.body as object).sort()).toEqual(['hostname', 'reason', 'state']);
      expect(JSON.stringify(taken.body)).not.toContain(first.site.id);
      expect(JSON.stringify(taken.body)).not.toContain(first.site.subdomain);

      const fresh = newDomain('moi');
      expect(await availability(second.client, second.site.id, fresh)).toEqual({
        hostname: fresh,
        state: 'available',
        reason: null,
      });
      // The owner's own site sees its domain as added, not taken.
      expect((await availability(first.client, first.site.id, owned.hostname)).state).toBe(
        'already_added',
      );
    });

    it('is for Chủ sở hữu and Quản trị only; another workspace gets 404', async () => {
      const { workspaceId, site } = await siteOf();
      const path = `/sites/${site.id}/domains/availability?hostname=${newDomain()}`;
      const admin = await addMember(t, workspaceId, 'admin');
      await admin.client.get(path).expect(200);
      const editor = await addMember(t, workspaceId, 'editor');
      await editor.client.get(path).expect(403);
      const stranger = (await signedUpClient(t.app)).client;
      await stranger.get(path).expect(404);
      await admin.client.get(`/sites/${site.id}/domains/availability`).expect(422);
    });
  });

  describe('domain events in the activity of the site (ADR-022)', () => {
    it('logs who added, made primary and removed a domain, and the system that found it active', async () => {
      const { client, me, site, workspaceId } = await siteOf();
      const hostname = newDomain();
      const domain = await activeDomain(client, site.id, hostname);
      await client.put(`/sites/${site.id}/primary-domain`, { domainId: domain.id }).expect(200);
      // Choosing the address it already has changes nothing, and logs nothing.
      await client.put(`/sites/${site.id}/primary-domain`, { domainId: domain.id }).expect(200);
      await client.put(`/sites/${site.id}/primary-domain`, { domainId: null }).expect(200);
      await client.delete(`/sites/${site.id}/domains/${domain.id}`).expect(204);

      const defaultHost = new URL(site.defaultOrigin).host;
      const name = me.user.name;
      expect(await domainEvents(client, site.id)).toEqual([
        { type: 'domain.added', by: name, hostname },
        { type: 'domain.activated', by: null, hostname },
        { type: 'domain.primary_changed', by: name, hostname },
        { type: 'domain.primary_changed', by: name, hostname: defaultHost },
        { type: 'domain.removed', by: name, hostname },
      ]);
      const stored = await t.connection
        .useDb(`${t.connection.name}_ws_${workspaceId}`)
        .collection('activity')
        .findOne({ type: 'domain.activated', 'data.hostname': hostname });
      expect(stored).toMatchObject({ actorId: null, pageId: null, data: { count: null } });

      // Every role that sees the site sees them: they hold no personal data.
      const viewer = await addMember(t, workspaceId, 'viewer');
      expect(await domainEvents(viewer.client, site.id)).toHaveLength(5);
    });

    it('logs a lost domain once, as the system, and nothing for a check that changes nothing', async () => {
      const { client, site } = await siteOf();
      const domain = await activeDomain(client, site.id);
      await check(client, site.id, domain.id);
      t.dns.set(domain.hostname, { CNAME: ['old-host.example.vn'] });
      expect((await check(client, site.id, domain.id)).status).toBe('lost');
      expect((await check(client, site.id, domain.id)).status).toBe('lost');
      expect((await domainEvents(client, site.id)).map((event) => [event.type, event.by])).toEqual([
        ['domain.added', expect.any(String) as string],
        ['domain.activated', null],
        ['domain.lost', null],
      ]);
    });

    it('logs the activation once when two checks see it at the same moment', async () => {
      const { client, site } = await siteOf();
      const hostname = newDomain();
      const added = await add(client, site.id, hostname);
      pointHere(t.dns, hostname, tokenOf(added));
      const record = await t.app.get(DomainsRepository).findById(new Types.ObjectId(added.id));
      if (record === null) {
        throw new Error('The domain was not stored');
      }
      const checker = t.app.get(DomainChecker);
      await Promise.all([checker.check(record), checker.check(record), checker.check(record)]);
      expect(
        (await domainEvents(client, site.id)).filter((event) => event.type === 'domain.activated'),
      ).toEqual([{ type: 'domain.activated', by: null, hostname }]);
    });

    it('logs nothing when adding fails', async () => {
      const { client, site } = await siteOf();
      const hostname = newDomain();
      await add(client, site.id, hostname);
      await client.post(`/sites/${site.id}/domains`, { hostname }).expect(409);
      await client.post(`/sites/${site.id}/domains`, { hostname: 'localhost' }).expect(422);
      expect((await domainEvents(client, site.id)).map((event) => event.type)).toEqual([
        'domain.added',
      ]);
    });
  });

  describe('the live address on board 01', () => {
    it('follows the primary address and whether a domain is connected, for every role', async () => {
      const { client, site, workspaceId } = await siteOf();
      const viewer = await addMember(t, workspaceId, 'viewer');
      expect(await addressStatus(viewer.client, site.id)).toEqual({
        primaryStatus: null,
        customDomainActive: false,
      });

      await add(client, site.id, newDomain('cho'));
      expect((await addressStatus(client, site.id)).customDomainActive).toBe(false);
      const domain = await activeDomain(client, site.id);
      expect(await addressStatus(viewer.client, site.id)).toEqual({
        primaryStatus: null,
        customDomainActive: true,
      });

      await client.put(`/sites/${site.id}/primary-domain`, { domainId: domain.id }).expect(200);
      expect(await addressStatus(viewer.client, site.id)).toEqual({
        primaryStatus: 'active',
        customDomainActive: true,
      });

      t.dns.clear(domain.hostname);
      await check(client, site.id, domain.id);
      expect(await addressStatus(viewer.client, site.id)).toEqual({
        primaryStatus: 'lost',
        customDomainActive: false,
      });

      const stranger = (await signedUpClient(t.app)).client;
      await stranger.get(`/sites/${site.id}/address-status`).expect(404);
    });
  });

  describe('"Đặt làm chính" (boards 13, 14)', () => {
    it('tells how many live pages the new address moves, with one of them as an example', async () => {
      const { client, site } = await siteOf();
      const none = domainListResponseSchema.parse(
        (await client.get(`/sites/${site.id}/domains`).expect(200)).body,
      );
      expect(none.livePages).toEqual({ count: 0, exampleSlug: null });

      const slug = uniqueSlug('uu-dai');
      await createLivePage(client, site.id, slug);
      await createLivePage(client, site.id, '');
      const list = domainListResponseSchema.parse(
        (await client.get(`/sites/${site.id}/domains`).expect(200)).body,
      );
      expect(list.livePages).toEqual({ count: 2, exampleSlug: slug });
    });
  });

  describe('passed checks of the primary address (board 05, ADR-006)', () => {
    async function addressPassed(client: TestClient, siteId: string, pageId: string) {
      return (await getPage(client, siteId, pageId)).checks.passed
        .filter((item) => item.code === 'domain_verified' || item.code === 'https_active')
        .map((item) => item.title);
    }

    it('passes HTTPS on the default address, and the verified domain once it is primary', async () => {
      const { client, site } = await siteOf();
      const { pageId } = await createLivePage(client, site.id, uniqueSlug('kiem-tra'));
      expect(await addressPassed(client, site.id, pageId)).toEqual(['HTTPS hoạt động']);
      const findings = async () => {
        const { checks } = await getPage(client, site.id, pageId);
        return [...checks.blocking, ...checks.warnings].map((item) => item.fingerprint);
      };
      const before = await findings();

      const domain = await activeDomain(client, site.id);
      // A domain that is not the primary address changes nothing.
      expect(await addressPassed(client, site.id, pageId)).toEqual(['HTTPS hoạt động']);
      await client.put(`/sites/${site.id}/primary-domain`, { domainId: domain.id }).expect(200);
      expect(await addressPassed(client, site.id, pageId)).toEqual([
        `Tên miền ${domain.hostname} đã xác minh`,
        'HTTPS hoạt động',
      ]);

      // Lost, neither passes, and nothing blocks or warns: pages still open at the default address.
      t.dns.clear(domain.hostname);
      await check(client, site.id, domain.id);
      expect(await addressPassed(client, site.id, pageId)).toEqual([]);
      expect(await findings()).toEqual(before);
    });
  });
});
