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
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
import { UsersRepository } from '../auth/users.repository.js';
import { DomainChecker } from './domain-checker.service.js';
import { DOMAINS_PER_ROUND, DomainMonitor, ROUND_BUDGET_MS } from './domain-monitor.service.js';
import { DomainsRepository } from './domains.repository.js';

const DAY_MS = 86_400_000;

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

    it('keeps the limit when domains are added at the same moment', async () => {
      const { client, site } = await siteOf();
      for (let index = 1; index < CUSTOM_DOMAINS_MAX; index += 1) {
        await add(client, site.id, newDomain());
      }
      const answers = await Promise.all(
        [newDomain(), newDomain(), newDomain()].map((hostname) =>
          client.post(`/sites/${site.id}/domains`, { hostname }),
        ),
      );
      expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409, 409]);
      const list = domainListResponseSchema.parse(
        (await client.get(`/sites/${site.id}/domains`).expect(200)).body,
      );
      expect(list.items).toHaveLength(CUSTOM_DOMAINS_MAX);
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

    it('tells Chủ sở hữu instead of who added it once they no longer manage it', async () => {
      const { client: owner, me, site, workspaceId } = await siteOf();
      const admin = await addMember(t, workspaceId, 'admin');
      const hostname = newDomain();
      const added = await add(admin.client, site.id, hostname);
      await owner
        .patch(`/workspaces/${workspaceId}/members/${admin.me.user.id}`, {
          role: 'editor',
          siteIds: null,
        })
        .expect(200);

      pointHere(t.dns, hostname, tokenOf(added));
      expect((await check(owner, site.id, added.id)).status).toBe('active');
      expect(t.emails.to(admin.me.user.email)).toEqual([]);
      expect(t.emails.to(me.user.email).at(-1)?.subject).toBe(`${hostname} đã hoạt động`);
    });

    it('stays active when who to tell cannot be read for the email', async () => {
      const { client, me, site } = await siteOf();
      const hostname = newDomain();
      const added = await add(client, site.id, hostname);
      pointHere(t.dns, hostname, tokenOf(added));
      const contacts = vi
        .spyOn(t.app.get(UsersRepository), 'findContacts')
        .mockRejectedValueOnce(new Error('database unavailable'));
      try {
        expect((await check(client, site.id, added.id)).status).toBe('active');
      } finally {
        contacts.mockRestore();
      }
      expect(t.emails.to(me.user.email)).toEqual([]);
    });

    it('waits for HTTPS for an hour, then needs attention', async () => {
      const { client, site } = await siteOf();
      const hostname = newDomain();
      const added = await add(client, site.id, hostname);
      pointHere(t.dns, hostname, tokenOf(added));
      t.tls.result = { ok: false };
      try {
        expect((await check(client, site.id, added.id)).status).toBe('issuing');
        // The edge is getting the certificate: checked again in a minute, not ten.
        const stored = await t.connection.collection('domains').findOne({ hostname });
        const next = stored?.['nextCheckAt'] as unknown;
        expect(next instanceof Date && next.getTime() - Date.now() <= 60_000).toBe(true);
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
      expect((await getPage(client, site.id, pageId)).page.liveUrl).toBe(`${publicOrigin}/${slug}`);
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
    it('lets Caddy get certificates only for serving custom domains', async () => {
      const { client, site } = await siteOf();
      // Default addresses use the wildcard certificate: asking for one per site would let anyone
      // creating sites use up the CA's limits for the base domain.
      const defaultHost = new URL(site.defaultOrigin).hostname;
      await anyone().get(`/public/tls/allowed?domain=${defaultHost}`).expect(404);
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

  describe('checks at the same moment (test round of Phase 1)', () => {
    const stored = (id: string) => t.app.get(DomainsRepository).findById(new Types.ObjectId(id));

    it('lets the edge get the certificate during the first HTTPS check of a domain', async () => {
      const { client, site } = await siteOf();
      const hostname = newDomain();
      const added = await add(client, site.id, hostname);
      pointHere(t.dns, hostname, tokenOf(added));
      const asked: number[] = [];
      t.tls.during = async (host) => {
        asked.push((await anyone().get(`/public/tls/allowed?domain=${host}`)).status);
      };
      try {
        expect((await check(client, site.id, added.id)).status).toBe('active');
      } finally {
        t.tls.during = null;
      }
      expect(asked).toEqual([200]);
    });

    it('announces a domain once when two checks see it go active together', async () => {
      const { client, site, me } = await siteOf();
      const hostname = newDomain();
      const added = await add(client, site.id, hostname);
      pointHere(t.dns, hostname, tokenOf(added));
      const record = await stored(added.id);
      if (record === null) {
        throw new Error('The domain was not stored');
      }
      const checker = t.app.get(DomainChecker);
      await Promise.all([checker.check(record), checker.check(record)]);
      expect(
        t.emails.to(me.user.email).filter((email) => email.subject === `${hostname} đã hoạt động`),
      ).toHaveLength(1);
      expect((await stored(added.id))?.activeSince).toBeInstanceOf(Date);
    });

    it('leaves the owner its domain when the proof it saw was taken back meanwhile', async () => {
      const first = await siteOf();
      const active = await activeDomain(first.client, first.site.id);
      const second = await siteOf();
      const claim = await add(second.client, second.site.id, active.hostname);
      const stale = await stored(claim.id);
      if (stale === null) {
        throw new Error('The claim was not stored');
      }
      await second.client.delete(`/sites/${second.site.id}/domains/${claim.id}`).expect(204);
      pointHere(t.dns, active.hostname, tokenOf(claim));
      // The check started before the claim was disconnected: nothing moves.
      await t.app.get(DomainChecker).check(stale);
      expect(await stored(active.id)).toMatchObject({ verifiedAt: expect.any(Date) as Date });
    });

    it('stops asking a DNS that never answers about a domain never verified, after 7 days', async () => {
      const { client, site } = await siteOf();
      const added = await add(client, site.id, newDomain());
      await t.connection
        .collection('domains')
        .updateOne(
          { _id: new Types.ObjectId(added.id) },
          { $set: { watchSince: new Date(Date.now() - 8 * DAY_MS) } },
        );
      const record = await stored(added.id);
      if (record === null) {
        throw new Error('The domain was not stored');
      }
      t.dns.fail();
      try {
        await t.app.get(DomainChecker).check(record);
      } finally {
        t.dns.recover();
      }
      expect((await stored(added.id))?.nextCheckAt).toBeNull();
    });

    it('never leaves the primary address on a domain disconnected at the same moment', async () => {
      const { client, site } = await siteOf();
      for (let round = 0; round < 3; round += 1) {
        const active = await activeDomain(client, site.id);
        const [primary, removed] = await Promise.all([
          client.put(`/sites/${site.id}/primary-domain`, { domainId: active.id }),
          client.delete(`/sites/${site.id}/domains/${active.id}`),
        ]);
        const siteNow = siteSchema.parse((await client.get(`/sites/${site.id}`).expect(200)).body);
        if ((await stored(active.id)) === null) {
          expect(removed.status).toBe(204);
          expect(primary.status).toBe(409);
          expect(siteNow.publicOrigin).toBe(siteNow.defaultOrigin);
        } else {
          expect(primary.status).toBe(200);
          expect(removed.status).toBe(409);
          expect(siteNow.publicOrigin).toContain(active.hostname);
          await client.put(`/sites/${site.id}/primary-domain`, { domainId: null }).expect(200);
          await client.delete(`/sites/${site.id}/domains/${active.id}`).expect(204);
        }
      }
    });

    it('takes at most its size of domains in a round, however many workers ask', async () => {
      const due = new Date('1999-01-01T00:00:00.000Z');
      const ids = Array.from({ length: DOMAINS_PER_ROUND + 10 }, () => new Types.ObjectId());
      await t.connection.collection('domains').insertMany(
        ids.map((_id, index) => ({
          _id,
          workspaceId: new Types.ObjectId(),
          siteId: new Types.ObjectId(),
          hostname: `vong-${index}.${newDomain()}`,
          nextCheckAt: due,
        })),
      );
      const fast = vi
        .spyOn(t.app.get(DomainChecker), 'check')
        .mockImplementation((domain) => Promise.resolve(domain));
      try {
        expect(await t.app.get(DomainMonitor).runDue()).toBe(DOMAINS_PER_ROUND);
      } finally {
        fast.mockRestore();
      }
      expect(
        await t.connection
          .collection('domains')
          .countDocuments({ _id: { $in: ids }, nextCheckAt: due }),
      ).toBe(10);
      await t.connection.collection('domains').deleteMany({ _id: { $in: ids } });
    });

    it('takes no new domain once a round ran out of time', async () => {
      const ids: string[] = [];
      for (const owner of [await siteOf(), await siteOf()]) {
        for (let index = 0; index < 4; index += 1) {
          ids.push((await add(owner.client, owner.site.id, newDomain())).id);
        }
      }
      // Due long ago, so this round takes them before any other test's domain.
      await t.connection
        .collection('domains')
        .updateMany(
          { _id: { $in: ids.map((id) => new Types.ObjectId(id)) } },
          { $set: { nextCheckAt: new Date('2000-01-01T00:00:00.000Z') } },
        );
      let elapsed = 0;
      const realNow = Date.now.bind(Date);
      const clock = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + elapsed);
      const slow = vi.spyOn(t.app.get(DomainChecker), 'check').mockImplementation((domain) => {
        elapsed += ROUND_BUDGET_MS;
        return Promise.resolve(domain);
      });
      try {
        expect(await t.app.get(DomainMonitor).runDue()).toBe(5);
      } finally {
        clock.mockRestore();
        slow.mockRestore();
      }
      const left = await t.connection.collection('domains').countDocuments({
        _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
        nextCheckAt: new Date('2000-01-01T00:00:00.000Z'),
      });
      expect(left).toBe(3);
    });
  });
});
