import {
  CUSTOM_DOMAINS_MAX,
  type Domain,
  domainListResponseSchema,
  domainSchema,
  hostSiteResponseSchema,
  pathStatusResponseSchema,
  problemSchema,
  siteAddressResponseSchema,
  siteSchema,
  sitemapResponseSchema,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, TestClient } from '../../../test/client.js';
import { pointHere } from '../../../test/domains.js';
import { createSecondInstance } from '../../../test/instances.js';
import {
  createLivePage,
  getPage,
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { addMember, createSite } from '../../../test/resources.js';
import { DomainMonitor } from './domain-monitor.service.js';

let counter = 0;

/** A domain nobody uses yet in this test process. */
function newDomain(prefix = 'go'): string {
  counter += 1;
  return `${prefix}.smile${process.pid.toString(36)}x${counter.toString(36)}.vn`;
}

function tokenOf(domain: Domain): string {
  const txt = domain.records.find((record) => record.type === 'TXT');
  const token = txt?.value.replace('payload-verify=', '');
  if (token === undefined) {
    throw new Error('The domain has no TXT record');
  }
  return token;
}

describe('custom domains (ADR-022)', () => {
  let t: TestApp;
  const revalidation = new RecordingRevalidationClient();

  beforeAll(async () => {
    t = await createTestApp('plp_test_domains', withRevalidationRecorder(revalidation));
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

  const anyone = () => new TestClient(t.app);

  describe('adding', () => {
    it('adds a domain with the records to make, and waits for DNS', async () => {
      const { client, site } = await siteOf();
      const hostname = newDomain('uudai');
      const domain = await add(client, site.id, `  ${hostname.toUpperCase()}. `);
      expect(domain).toMatchObject({
        hostname,
        kind: 'subdomain',
        status: 'pending_dns',
        primary: false,
      });
      expect(domain.records).toEqual([
        { type: 'CNAME', name: hostname, value: 'cname.payload.site', state: 'missing' },
        {
          type: 'TXT',
          name: `_payload.${hostname}`,
          value: expect.stringMatching(/^payload-verify=[0-9a-f]{32}$/) as string,
          state: 'missing',
        },
      ]);
      expect(domain.checkedAt).not.toBeNull();
      const list = domainListResponseSchema.parse(
        (await client.get(`/sites/${site.id}/domains`).expect(200)).body,
      );
      expect(list).toMatchObject({
        defaultHost: new URL(site.defaultOrigin).host,
        primaryDomainId: null,
      });
      expect(list.items.map((item) => item.hostname)).toEqual([hostname]);
    });

    it('refuses what is not a custom domain, a second copy and a sixth domain', async () => {
      const { client, site } = await siteOf();
      const url = await client
        .post(`/sites/${site.id}/domains`, { hostname: 'https://uudai.smilecare.vn/' })
        .expect(422);
      expect(problemSchema.parse(url.body).issues?.[0]?.message).toBe(
        'Chỉ nhập tên miền, không kèm https://, cổng và dấu / ở cuối.',
      );
      for (const hostname of [
        'localhost',
        `x.${new URL(site.defaultOrigin).hostname}`,
        'cname.payload.site',
      ]) {
        await client.post(`/sites/${site.id}/domains`, { hostname }).expect(422);
      }
      const hostname = newDomain();
      await add(client, site.id, hostname);
      const twice = await client.post(`/sites/${site.id}/domains`, { hostname }).expect(409);
      expect(problemSchema.parse(twice.body).code).toBe('domain_exists');
      for (let index = 1; index < CUSTOM_DOMAINS_MAX; index += 1) {
        await add(client, site.id, newDomain());
      }
      const full = await client
        .post(`/sites/${site.id}/domains`, { hostname: newDomain() })
        .expect(409);
      expect(problemSchema.parse(full.body).code).toBe('domain_limit_reached');
    });

    it('is for Chủ sở hữu and Quản trị only', async () => {
      const { workspaceId, site } = await siteOf();
      const admin = await addMember(t, workspaceId, 'admin');
      const editor = await addMember(t, workspaceId, 'editor');
      await add(admin.client, site.id, newDomain());
      await editor.client.get(`/sites/${site.id}/domains`).expect(403);
      await editor.client.post(`/sites/${site.id}/domains`, { hostname: newDomain() }).expect(403);
      const stranger = (await signedUpClient(t.app)).client;
      await stranger.get(`/sites/${site.id}/domains`).expect(404);
    });
  });

  describe('checks', () => {
    it('becomes active once DNS points here and the TXT proves it, and tells who added it', async () => {
      const { client, me, site } = await siteOf();
      const hostname = newDomain();
      const added = await add(client, site.id, hostname);
      t.dns.set(hostname, { A: ['103.97.125.18'] });
      const wrong = await check(client, site.id, added.id);
      expect(wrong).toMatchObject({
        status: 'misconfigured',
        found: [{ type: 'A', value: '103.97.125.18' }],
      });

      const calls = revalidation.calls.length;
      pointHere(t.dns, hostname, tokenOf(added));
      const active = await check(client, site.id, added.id);
      expect(active).toMatchObject({
        status: 'active',
        httpsValidUntil: '2027-01-12T00:00:00.000Z',
      });
      expect(active.records.map((record) => record.state)).toEqual(['ok', 'ok']);
      expect(active.activeSince).not.toBeNull();
      expect(revalidation.calls.slice(calls)).toContain(site.subdomain);
      expect(t.emails.to(me.user.email).at(-1)?.subject).toBe(`${hostname} đã hoạt động`);

      // Pages are served there; Caddy may get a certificate for it.
      expect(
        hostSiteResponseSchema.parse(
          (await anyone().get(`/public/hosts/${hostname}`).expect(200)).body,
        ),
      ).toEqual({ subdomain: site.subdomain });
      await anyone().get(`/public/tls/allowed?domain=${hostname}`).expect(200);
    });

    it('waits for HTTPS for an hour, then needs attention', async () => {
      const { client, site } = await siteOf();
      const hostname = newDomain();
      const added = await add(client, site.id, hostname);
      pointHere(t.dns, hostname, tokenOf(added));
      t.tls.result = { ok: false };
      try {
        expect((await check(client, site.id, added.id)).status).toBe('issuing');
        await t.connection
          .collection('domains')
          .updateOne(
            { hostname },
            { $set: { 'check.httpsFailingSince': new Date(Date.now() - 2 * 3_600_000) } },
          );
        expect((await check(client, site.id, added.id)).status).toBe('needs_attention');
      } finally {
        t.tls.result = { ok: true, validUntil: new Date('2027-01-12T00:00:00.000Z') };
      }
    });

    it('is lost when DNS stops pointing here, and keeps its last check when DNS fails', async () => {
      const { client, me, site } = await siteOf();
      const domain = await activeDomain(client, site.id);
      t.dns.fail();
      try {
        expect((await check(client, site.id, domain.id)).status).toBe('active');
      } finally {
        t.dns.recover();
      }
      t.dns.set(domain.hostname, { CNAME: ['old-host.example.vn'] });
      const lost = await check(client, site.id, domain.id);
      expect(lost.status).toBe('lost');
      expect(lost.lostSince).not.toBeNull();
      expect(t.emails.to(me.user.email).at(-1)?.subject).toBe(
        `${domain.hostname} đang không truy cập được`,
      );
      await anyone().get(`/public/hosts/${domain.hostname}`).expect(404);

      pointHere(t.dns, domain.hostname, tokenOf(domain));
      expect(await check(client, site.id, domain.id)).toMatchObject({
        status: 'active',
        lostSince: null,
      });
    });
  });

  describe('the primary address', () => {
    it('moves live URLs, the sitemap and canonical address to an active domain', async () => {
      const { client, site } = await siteOf();
      const slug = uniqueSlug('uu-dai');
      const { pageId } = await createLivePage(client, site.id, slug);
      const pending = await add(client, site.id, newDomain());
      const notYet = await client
        .put(`/sites/${site.id}/primary-domain`, { domainId: pending.id })
        .expect(409);
      expect(problemSchema.parse(notYet.body).title).toBe(
        'Chỉ tên miền đang hoạt động mới làm địa chỉ chính được',
      );

      const domain = await activeDomain(client, site.id);
      const list = domainListResponseSchema.parse(
        (await client.put(`/sites/${site.id}/primary-domain`, { domainId: domain.id }).expect(200))
          .body,
      );
      expect(list.primaryDomainId).toBe(domain.id);
      expect(list.items.find((item) => item.id === domain.id)?.primary).toBe(true);
      const publicOrigin = `https://${domain.hostname}`;
      expect(
        siteSchema.parse((await client.get(`/sites/${site.id}`).expect(200)).body).publicOrigin,
      ).toBe(publicOrigin);
      expect((await getPage(client, pageId)).page.liveUrl).toBe(`${publicOrigin}/${slug}`);
      expect(
        sitemapResponseSchema.parse(
          (await anyone().get(`/public/sites/${site.subdomain}/sitemap`).expect(200)).body,
        ).origin,
      ).toBe(publicOrigin);
      expect(
        siteAddressResponseSchema.parse(
          (await anyone().get(`/public/sites/${site.subdomain}/address`).expect(200)).body,
        ),
      ).toEqual({ primaryHost: domain.hostname });
      // The renderer's proxy learns it with every page it checks.
      expect(
        pathStatusResponseSchema.parse(
          (
            await anyone()
              .get(`/public/sites/${site.subdomain}/path-status?path=${slug}`)
              .expect(200)
          ).body,
        ).primaryHost,
      ).toBe(domain.hostname);

      // The primary address cannot go; the default one comes back first.
      const keep = await client.delete(`/sites/${site.id}/domains/${domain.id}`).expect(409);
      expect(problemSchema.parse(keep.body).title).toBe('Không ngắt được địa chỉ chính');

      // A lost primary is never redirected to.
      t.dns.clear(domain.hostname);
      await check(client, site.id, domain.id);
      expect(
        siteAddressResponseSchema.parse(
          (await anyone().get(`/public/sites/${site.subdomain}/address`).expect(200)).body,
        ),
      ).toEqual({ primaryHost: null });

      await client.put(`/sites/${site.id}/primary-domain`, { domainId: null }).expect(200);
      expect(
        siteSchema.parse((await client.get(`/sites/${site.id}`).expect(200)).body).publicOrigin,
      ).toBe(site.defaultOrigin);
      await client.delete(`/sites/${site.id}/domains/${domain.id}`).expect(204);
    });
  });

  describe('one owner per domain', () => {
    it('shows a domain another site has as taken, and moves it once its TXT proves ownership', async () => {
      const first = await siteOf();
      const owned = await activeDomain(first.client, first.site.id);
      await first.client
        .put(`/sites/${first.site.id}/primary-domain`, { domainId: owned.id })
        .expect(200);

      const second = await siteOf();
      const claim = await add(second.client, second.site.id, owned.hostname);
      expect(claim.status).toBe('taken');
      // The other site is never named.
      expect(JSON.stringify(claim)).not.toContain(first.site.id);

      const calls = revalidation.calls.length;
      pointHere(t.dns, owned.hostname, tokenOf(claim));
      expect((await check(second.client, second.site.id, claim.id)).status).toBe('active');
      expect(revalidation.calls.slice(calls)).toEqual(
        expect.arrayContaining([first.site.subdomain, second.site.subdomain]),
      );
      const firstList = domainListResponseSchema.parse(
        (await first.client.get(`/sites/${first.site.id}/domains`).expect(200)).body,
      );
      expect(firstList).toMatchObject({ items: [], primaryDomainId: null });
      expect(t.emails.to(first.me.user.email).at(-1)?.subject).toBe(
        `${owned.hostname} đã chuyển khỏi ${first.site.name}`,
      );
      expect(
        hostSiteResponseSchema.parse(
          (await anyone().get(`/public/hosts/${owned.hostname}`).expect(200)).body,
        ).subdomain,
      ).toBe(second.site.subdomain);
    });

    it('lets only one of two sites own a domain when both prove it at once', async () => {
      const hostname = newDomain();
      const one = await siteOf();
      const two = await siteOf();
      const a = await add(one.client, one.site.id, hostname);
      const b = await add(two.client, two.site.id, hostname);
      t.dns.set(hostname, { CNAME: ['cname.payload.site'] });
      t.dns.set(`_payload.${hostname}`, {
        TXT: [`payload-verify=${tokenOf(a)}`, `payload-verify=${tokenOf(b)}`],
      });
      await t.connection
        .collection('domains')
        .updateMany({ hostname }, { $set: { 'check.at': null } });
      await Promise.all([
        one.client.post(`/sites/${one.site.id}/domains/${a.id}/check`).expect(200),
        two.client.post(`/sites/${two.site.id}/domains/${b.id}/check`).expect(200),
      ]);
      const owners = await t.connection
        .collection('domains')
        .countDocuments({ hostname, verifiedAt: { $type: 'date' } });
      expect(owners).toBe(1);
    });
  });

  describe('for the edge and the renderer', () => {
    it('lets Caddy get certificates only for the sites’ addresses and their serving domains', async () => {
      const { client, site } = await siteOf();
      const defaultHost = new URL(site.defaultOrigin).hostname;
      await anyone().get(`/public/tls/allowed?domain=${defaultHost}`).expect(200);
      const base = defaultHost.slice(defaultHost.indexOf('.') + 1);
      await anyone().get(`/public/tls/allowed?domain=khong-co-site.${base}`).expect(404);
      await anyone().get(`/public/tls/allowed?domain=${base}`).expect(404);
      const pending = await add(client, site.id, newDomain());
      await anyone().get(`/public/tls/allowed?domain=${pending.hostname}`).expect(404);
      await anyone().get(`/public/tls/allowed?domain=la.example.vn`).expect(404);
      await anyone().get('/public/tls/allowed').expect(422);
    });
  });

  describe('automatic checks', () => {
    it('checks each due domain once, across two instances', async () => {
      const { client, site } = await siteOf();
      const hostnames = [newDomain(), newDomain(), newDomain()];
      for (const hostname of hostnames) {
        await add(client, site.id, hostname);
      }
      await t.connection
        .collection('domains')
        .updateMany(
          { hostname: { $in: hostnames } },
          { $set: { nextCheckAt: new Date(Date.now() - 1000) } },
        );
      const second = await createSecondInstance(t);
      try {
        const before = t.dns.asked.length;
        const now = new Date();
        const [x, y] = await Promise.all([
          t.app.get(DomainMonitor).runDue(now),
          second.app.get(DomainMonitor).runDue(now),
        ]);
        const asked = t.dns.asked.slice(before).filter((name) => hostnames.includes(name));
        expect([...asked].sort()).toEqual([...hostnames].sort());
        expect(x + y).toBeGreaterThanOrEqual(hostnames.length);
        const next = await t.connection
          .collection<{ nextCheckAt: Date | null }>('domains')
          .find({ hostname: { $in: hostnames } })
          .toArray();
        // Waiting for DNS: checked again a minute later.
        for (const domain of next) {
          expect(domain.nextCheckAt?.getTime()).toBe(now.getTime() + 60_000);
        }
      } finally {
        await second.close();
      }
    });
  });
});
