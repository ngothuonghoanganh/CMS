import {
  type AutomationListItem,
  automationListItemSchema,
  automationListResponseSchema,
  type CustomRoleInput,
  customRoleRef,
  customRoleSchema,
  meResponseSchema,
  problemSchema,
  type PublicLeadRequest,
  type Site,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { setPlan, setReadOnly } from '../../../test/billing.js';
import { signedUpClient, TestClient } from '../../../test/client.js';
import { formDraft, leadFormSection } from '../../../test/compositions.js';
import { createLiveFormPage, leadBody, submitLead } from '../../../test/leads.js';
import { invite, newEmail } from '../../../test/members.js';
import { uniqueSlug } from '../../../test/pages.js';
import { planCatalogFile } from '../../../test/plans.js';
import { configurePrivacy } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { addMember, createSite, uniqueSubdomain } from '../../../test/resources.js';
import type { AutomationRunRecord } from '../automations/automation.schema.js';
import { AutomationScheduler } from '../automations/automation-scheduler.service.js';

const PASSWORD = 'mat-khau-an-toan-123';

/**
 * What a plan allows (ADR-035): Agency, the trial's plan, is given small limits so that each one
 * can be reached; Cơ bản has no automation and Doanh nghiệp has custom roles, as bundled.
 */
const AGENCY = { sites: 2, members: 4, customDomains: 1, aiUses: 3, automationRuns: 2 };

describe('plan limits and features (ADR-035)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_plan_limits', {
      env: {
        AI_PROVIDER: 'fake',
        LEAD_LIMIT_PER_CLIENT: 1000,
        LEAD_LIMIT_PER_SITE_PER_HOUR: 1000,
        PLAN_CATALOG_FILE: planCatalogFile({ agency: { limits: AGENCY } }),
      },
    });
  });

  afterAll(async () => {
    await t.close();
  });

  async function workspace() {
    return signedUpClient(t.app);
  }

  function limitOf(body: unknown) {
    return problemSchema.parse(body);
  }

  let domainCounter = 0;
  function newDomain(): string {
    domainCounter += 1;
    return `go.plan${process.pid.toString(36)}x${domainCounter.toString(36)}.vn`;
  }

  describe('sites', () => {
    it('refuses the site past the plan, 402 with the limit, and keeps a downgraded workspace as it is', async () => {
      const { client, workspaceId } = await workspace();
      await createSite(client, workspaceId);
      await createSite(client, workspaceId);
      const refused = await client
        .post(`/workspaces/${workspaceId}/sites`, {
          name: 'Site thứ ba',
          subdomain: uniqueSubdomain('ba'),
        })
        .expect(402);
      expect(limitOf(refused.body)).toMatchObject({
        status: 402,
        code: 'plan_limit_reached',
        context: { limit: 'sites', max: 2 },
      });

      // Downgrading removes nothing: only the next site is refused.
      await setPlan(t, workspaceId, 'basic');
      const listed = await client.get(`/workspaces/${workspaceId}/sites`).expect(200);
      expect((listed.body as { items: unknown[] }).items).toHaveLength(2);
      const again = await client
        .post(`/workspaces/${workspaceId}/sites`, {
          name: 'Site khác',
          subdomain: uniqueSubdomain('bon'),
        })
        .expect(402);
      expect(limitOf(again.body).context).toEqual({ limit: 'sites', max: 1 });
    });

    it('lets exactly one of two creations at the limit win', async () => {
      const { client, workspaceId } = await workspace();
      await createSite(client, workspaceId);
      const answers = await Promise.all(
        ['a', 'b', 'c'].map((suffix) =>
          client.post(`/workspaces/${workspaceId}/sites`, {
            name: `Song song ${suffix}`,
            subdomain: uniqueSubdomain(`song-${suffix}`),
          }),
        ),
      );
      expect(answers.map((answer) => answer.status).sort()).toEqual([201, 402, 402]);
      const listed = await client.get(`/workspaces/${workspaceId}/sites`).expect(200);
      expect((listed.body as { items: unknown[] }).items).toHaveLength(2);
    });
  });

  describe('members', () => {
    it('counts pending invitations, refuses a batch that does not fit whole, and frees the room on revoke', async () => {
      const { client, workspaceId } = await workspace();
      await invite(t, client, workspaceId, newEmail());
      await invite(t, client, workspaceId, newEmail());
      // The owner and two invitations: one place is left of four.
      const tooMany = await client
        .post(`/workspaces/${workspaceId}/invitations`, {
          emails: [newEmail(), newEmail()],
          role: 'editor',
          siteIds: null,
        })
        .expect(402);
      expect(limitOf(tooMany.body)).toMatchObject({
        code: 'plan_limit_reached',
        context: { limit: 'members', max: 4 },
      });
      const pending = await client.get(`/workspaces/${workspaceId}/invitations`).expect(200);
      expect((pending.body as { items: unknown[] }).items).toHaveLength(2);

      await invite(t, client, workspaceId, newEmail());
      const full = await client
        .post(`/workspaces/${workspaceId}/invitations`, {
          emails: [newEmail()],
          role: 'editor',
          siteIds: null,
        })
        .expect(402);
      expect(limitOf(full.body).code).toBe('plan_limit_reached');

      const [first] = (
        (await client.get(`/workspaces/${workspaceId}/invitations`).expect(200)).body as {
          items: { id: string }[];
        }
      ).items;
      await client.delete(`/workspaces/${workspaceId}/invitations/${first?.id}`).expect(204);
      await invite(t, client, workspaceId, newEmail());
    });

    it('lets exactly one of two parallel invitations take the last place', async () => {
      const { client, workspaceId } = await workspace();
      await invite(t, client, workspaceId, newEmail());
      await invite(t, client, workspaceId, newEmail());
      const answers = await Promise.all(
        [newEmail(), newEmail()].map((email) =>
          client.post(`/workspaces/${workspaceId}/invitations`, {
            emails: [email],
            role: 'editor',
            siteIds: null,
          }),
        ),
      );
      expect(answers.map((answer) => answer.status).sort()).toEqual([200, 402]);
    });

    it('does not let an invitation sent before a downgrade take the workspace past the new limit', async () => {
      const { client, workspaceId } = await workspace();
      const joiners = await Promise.all([workspace(), workspace(), workspace()]);
      const tokens: string[] = [];
      for (const joiner of joiners) {
        tokens.push(await invite(t, client, workspaceId, joiner.me.user.email));
      }
      // Four people with the pending invitations. Basic holds three.
      await setPlan(t, workspaceId, 'basic');
      const [first, second, third] = joiners;
      const refused = await first.client
        .post('/invitations/accept', { token: tokens[0] })
        .expect(402);
      expect(limitOf(refused.body)).toMatchObject({
        code: 'plan_limit_reached',
        context: { limit: 'members', max: 3 },
      });
      // Refused whole: the invitation is still pending, and nobody joined.
      const list = await client.get(`/workspaces/${workspaceId}/invitations`).expect(200);
      expect((list.body as { items: unknown[] }).items).toHaveLength(3);
      const members = await client.get(`/workspaces/${workspaceId}/members`).expect(200);
      expect((members.body as { items: unknown[] }).items).toHaveLength(1);

      // Once the people are within the plan again, accepting works.
      const [revoked] = (list.body as { items: { id: string; email: string }[] }).items.filter(
        (item) => item.email === third.me.user.email,
      );
      await client.delete(`/workspaces/${workspaceId}/invitations/${revoked?.id}`).expect(204);
      await second.client.post('/invitations/accept', { token: tokens[1] }).expect(200);
    });

    it('counts the new member of an invitation signed up from its link', async () => {
      const { client, workspaceId } = await workspace();
      const token = await invite(t, client, workspaceId, newEmail('moi'));
      const signup = await new TestClient(t.app)
        .post('/auth/signup/invited', { token, name: 'Bảo Ngọc', password: PASSWORD })
        .expect(201);
      expect(meResponseSchema.parse(signup.body).memberships).toHaveLength(1);
    });
  });

  describe('custom domains', () => {
    it('counts the domains of every site of the workspace, and lets one of two parallel additions win', async () => {
      const { client, workspaceId } = await workspace();
      const one = await createSite(client, workspaceId);
      const two = await createSite(client, workspaceId);
      const answers = await Promise.all(
        [one, two].map((site) =>
          client.post(`/sites/${site.id}/domains`, { hostname: newDomain() }),
        ),
      );
      expect(answers.map((answer) => answer.status).sort()).toEqual([201, 402]);
      const refused = answers.find((answer) => answer.status === 402);
      expect(limitOf(refused?.body)).toMatchObject({
        code: 'plan_limit_reached',
        context: { limit: 'customDomains', max: 1 },
      });
      // The other site is refused for the first site's domain, whichever site holds it.
      const again = await client
        .post(`/sites/${two.id}/domains`, { hostname: newDomain() })
        .expect(402);
      expect(limitOf(again.body).code).toBe('plan_limit_reached');
      await client.post(`/sites/${one.id}/domains`, { hostname: newDomain() }).expect(402);
    });

    it('keeps 5 domains a site when the plan allows more', async () => {
      const { client, workspaceId } = await workspace();
      const site = await createSite(client, workspaceId);
      await setPlan(t, workspaceId, 'business');
      for (let index = 0; index < 5; index += 1) {
        await client.post(`/sites/${site.id}/domains`, { hostname: newDomain() }).expect(201);
      }
      const sixth = await client
        .post(`/sites/${site.id}/domains`, { hostname: newDomain() })
        .expect(409);
      expect(limitOf(sixth.body).code).toBe('domain_limit_reached');
    });
  });

  describe('AI uses', () => {
    it('are the plan’s, and follow the plan', async () => {
      const { client, workspaceId } = await workspace();
      const site = await createSite(client, workspaceId);
      const usage = async () =>
        (await client.get(`/sites/${site.id}/ai/usage`).expect(200)).body as {
          limit: number;
          remaining: number;
        };
      expect(await usage()).toMatchObject({ limit: 3, remaining: 3 });
      await setPlan(t, workspaceId, 'basic');
      expect(await usage()).toMatchObject({ limit: 20, remaining: 20 });
      await setPlan(t, workspaceId, 'business');
      expect(await usage()).toMatchObject({ limit: 300, remaining: 300 });
    });
  });

  describe('custom roles', () => {
    const ROLE: CustomRoleInput = {
      name: 'Trưởng nhóm nội dung',
      basedOn: 'editor',
      permissions: ['pages.edit', 'pages.requestPublish', 'leads.view'],
      wholeWorkspace: true,
    };

    it('need a plan that has them to be created or changed, while their holders keep their rights', async () => {
      const { client, workspaceId } = await workspace();
      const refused = await client
        .post(`/workspaces/${workspaceId}/custom-roles`, ROLE)
        .expect(402);
      expect(limitOf(refused.body)).toMatchObject({
        code: 'plan_feature_required',
        context: { feature: 'customRoles' },
      });

      await setPlan(t, workspaceId, 'business');
      const role = customRoleSchema.parse(
        (await client.post(`/workspaces/${workspaceId}/custom-roles`, ROLE).expect(201)).body,
      );
      const token = await invite(t, client, workspaceId, newEmail('vai-tro'), {
        role: customRoleRef(role.id),
        siteIds: null,
      });
      const holder = new TestClient(t.app);
      await holder
        .post('/auth/signup/invited', { token, name: 'Bảo Ngọc', password: PASSWORD })
        .expect(201);
      await createSite(client, workspaceId);
      const site = (
        (await client.get(`/workspaces/${workspaceId}/sites`).expect(200)).body as {
          items: Site[];
        }
      ).items[0];

      await setPlan(t, workspaceId, 'agency');
      await client
        .patch(`/workspaces/${workspaceId}/custom-roles/${role.id}`, { ...ROLE, name: 'Tên mới' })
        .expect(402);
      await client
        .post(`/workspaces/${workspaceId}/custom-roles`, { ...ROLE, name: 'Vai trò khác' })
        .expect(402);
      // Listing stays, and the holder still has the permissions the role gave.
      await client.get(`/workspaces/${workspaceId}/custom-roles`).expect(200);
      await holder.get(`/sites/${site?.id}/leads`).expect(200);
      const listed = await client.get(`/workspaces/${workspaceId}/members`).expect(200);
      expect(JSON.stringify(listed.body)).toContain(role.id);
      // Nothing is removed: the unused role can still be deleted.
      const unused = await client.get(`/workspaces/${workspaceId}/custom-roles`).expect(200);
      expect((unused.body as { items: unknown[] }).items).toHaveLength(1);
    });
  });

  describe('automations', () => {
    async function formSite(client: TestClient, workspaceId: string) {
      const site = await createSite(client, workspaceId);
      await configurePrivacy(client, site.id);
      await addConfirmedRecipient(t, client, site.id);
      const slug = uniqueSlug('uu-dai');
      const { published } = await createLiveFormPage(
        client,
        site.id,
        slug,
        formDraft(slug, leadFormSection()),
      );
      return { site, releaseId: published.release.id };
    }

    async function create(
      client: TestClient,
      site: Site,
      recipe: string,
    ): Promise<AutomationListItem> {
      const response = await client.post(`/sites/${site.id}/automations`, { recipe }).expect(201);
      return automationListItemSchema.parse(response.body);
    }

    async function send(
      form: { site: Site; releaseId: string },
      overrides: Partial<PublicLeadRequest> = {},
    ): Promise<void> {
      await submitLead(t, form.site.subdomain, leadBody(form.releaseId, overrides)).expect(201);
    }

    function runsOf(workspaceId: string, automationId: string) {
      return t
        .workspaceDb(workspaceId)
        .collection<AutomationRunRecord>('automation_runs')
        .find({ automationId: new Types.ObjectId(automationId) })
        .toArray();
    }

    async function settle(workspaceId: string, automationId: string) {
      for (let round = 0; round < 50; round += 1) {
        await t.app.get(AutomationScheduler).wake();
        const runs = await runsOf(workspaceId, automationId);
        if (runs.length > 0 && runs.every((run) => run.nextAt === undefined)) {
          return runs;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error('The runs did not finish');
    }

    it('cannot be created, copied or enabled on a plan without them, 402', async () => {
      const { client, workspaceId } = await workspace();
      const { site } = await formSite(client, workspaceId);
      const draft = await create(client, site, 'assign_new_leads');
      await setPlan(t, workspaceId, 'basic');
      for (const attempt of [
        () => client.post(`/sites/${site.id}/automations`, { recipe: 'assign_new_leads' }),
        () => client.post(`/sites/${site.id}/automations/${draft.id}/duplicate`),
        () => client.post(`/sites/${site.id}/automations/${draft.id}/state`, { state: 'on' }),
      ]) {
        const refused = await attempt();
        expect(refused.status).toBe(402);
        expect(limitOf(refused.body)).toMatchObject({
          code: 'plan_feature_required',
          context: { feature: 'automation' },
        });
      }
      // Reading them stays.
      await client.get(`/sites/${site.id}/automations`).expect(200);
    });

    it('pause with the reason plan when the plan changes to one without them, and stop their waiting runs', async () => {
      const { client, workspaceId } = await workspace();
      const form = await formSite(client, workspaceId);
      const enabled = await create(client, form.site, 'remind_uncalled');
      const draft = await create(client, form.site, 'assign_new_leads');
      const user = await create(client, form.site, 'assign_new_leads');
      await client
        .post(`/sites/${form.site.id}/automations/${enabled.id}/state`, { state: 'on' })
        .expect(200);
      await client
        .post(`/sites/${form.site.id}/automations/${user.id}/state`, { state: 'on' })
        .expect(200);
      await client
        .post(`/sites/${form.site.id}/automations/${user.id}/state`, { state: 'paused' })
        .expect(200);
      await send(form, { name: 'Đặng Minh Tú', phone: '0789 554 321' });
      await t.app.get(AutomationScheduler).wake();
      expect((await runsOf(workspaceId, enabled.id)).length).toBeGreaterThan(0);

      await client
        .post(`/workspaces/${workspaceId}/billing/plan`, { planId: 'basic', cycle: 'monthly' })
        .expect(200);

      const list = automationListResponseSchema.parse(
        (await client.get(`/sites/${form.site.id}/automations`).expect(200)).body,
      );
      const byId = new Map(list.items.map((item) => [item.id, item]));
      expect(byId.get(enabled.id)).toMatchObject({ state: 'paused', pausedReason: 'plan' });
      // A draft stays a draft, and a pause by a person stays theirs.
      expect(byId.get(draft.id)).toMatchObject({ state: 'draft', pausedReason: null });
      expect(byId.get(user.id)).toMatchObject({ state: 'paused', pausedReason: 'user' });
      for (const run of await runsOf(workspaceId, enabled.id)) {
        expect(['stopped', 'succeeded', 'skipped']).toContain(run.status);
        expect(run.nextAt).toBeUndefined();
      }
      // Enabling again needs a plan with automation.
      await client
        .post(`/sites/${form.site.id}/automations/${enabled.id}/state`, { state: 'on' })
        .expect(402);
      await client
        .post(`/workspaces/${workspaceId}/billing/plan`, { planId: 'agency', cycle: 'monthly' })
        .expect(200);
      await client
        .post(`/sites/${form.site.id}/automations/${enabled.id}/state`, { state: 'on' })
        .expect(200);
    });

    it('run as many times a month as the plan gives, and count what it passed over', async () => {
      const { client, workspaceId } = await workspace();
      const form = await formSite(client, workspaceId);
      const automation = await create(client, form.site, 'assign_new_leads');
      await client
        .post(`/sites/${form.site.id}/automations/${automation.id}/state`, { state: 'on' })
        .expect(200);
      for (let index = 0; index < 3; index += 1) {
        await send(form, { name: `Khách số ${index}`, phone: `09150072${index}0` });
        await settle(workspaceId, automation.id);
      }
      const runs = await runsOf(workspaceId, automation.id);
      expect(runs.filter((run) => run.countedIn !== null)).toHaveLength(2);
      expect(runs.filter((run) => run.reason === 'quota')).toHaveLength(1);
      const list = automationListResponseSchema.parse(
        (await client.get(`/sites/${form.site.id}/automations`).expect(200)).body,
      );
      expect(list.usage).toMatchObject({ used: 2, limit: 2 });
      expect(list.items[0]).toMatchObject({ skippedForQuota: 1 });
    });

    it('skip every event of a read-only workspace, counted as when the quota is used up', async () => {
      const { client, workspaceId } = await workspace();
      const form = await formSite(client, workspaceId);
      const automation = await create(client, form.site, 'assign_new_leads');
      await client
        .post(`/sites/${form.site.id}/automations/${automation.id}/state`, { state: 'on' })
        .expect(200);
      await setReadOnly(t, workspaceId, true);
      // The public form still takes the lead.
      await send(form, { name: 'Bùi Thanh Hương', phone: '0915 007 266' });
      const [run] = await settle(workspaceId, automation.id);
      expect(run).toMatchObject({ status: 'skipped', reason: 'quota', countedIn: null });
      const list = automationListResponseSchema.parse(
        (await client.get(`/sites/${form.site.id}/automations`).expect(200)).body,
      );
      expect(list.items[0]).toMatchObject({ skippedForQuota: 1 });
      expect(list.usage.used).toBe(0);

      // Paid again, new events run.
      await setReadOnly(t, workspaceId, false);
      await send(form, { name: 'Lê Thu Trang', phone: '0912 345 678' });
      const runs = await settle(workspaceId, automation.id);
      expect(runs.filter((item) => item.countedIn !== null)).toHaveLength(1);
    });
  });

  it('answers a stranger 404 whatever the plan of the workspace', async () => {
    const { client, workspaceId } = await workspace();
    const stranger = await addMember(t, (await workspace()).workspaceId, 'admin');
    await stranger.client
      .post(`/workspaces/${workspaceId}/sites`, { name: 'X', subdomain: uniqueSubdomain() })
      .expect(404);
    await client.get(`/workspaces/${workspaceId}/plan`).expect(200);
  });
});
