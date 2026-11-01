import {
  acceptInvitationResponseSchema,
  accessRequestListResponseSchema,
  createInvitationsResponseSchema,
  invitationListResponseSchema,
  invitationLookupResponseSchema,
  MEMBERS_MAX,
  memberListResponseSchema,
  memberSchema,
  meResponseSchema,
  myAccessRequestResponseSchema,
  problemSchema,
  siteListResponseSchema,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, TestClient } from '../../../test/client.js';
import { invitationToken, invite, newEmail } from '../../../test/members.js';
import { addMember, createSite, insertMembership } from '../../../test/resources.js';
import { UsersRepository } from '../auth/users.repository.js';
import { EmailQuota } from '../notifications/email-quota.js';
import { InvitationsRepository } from '../workspaces/invitations.repository.js';
import { MemberGrants } from './member-grants.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';

const PASSWORD = 'mat-khau-an-toan-123';

describe('members, invitations and access requests (ADR-021)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_members');
  });

  afterAll(async () => {
    await t.close();
  });

  async function workspace() {
    const owner = await signedUpClient(t.app, { workspaceName: 'Mây Xanh Agency' });
    const smile = await createSite(owner.client, owner.workspaceId, {
      name: 'Nha khoa Smile Care',
    });
    const kitchen = await createSite(owner.client, owner.workspaceId, { name: 'Bếp Nhà Mây' });
    return { ...owner, smile, kitchen };
  }

  async function members(client: TestClient, workspaceId: string) {
    const response = await client.get(`/workspaces/${workspaceId}/members`).expect(200);
    return memberListResponseSchema.parse(response.body).items;
  }

  function lookup(token: string) {
    return new TestClient(t.app).post('/public/invitations/lookup', { token });
  }

  describe('members', () => {
    it('lists the members, most powerful first, to Chủ sở hữu and Quản trị only', async () => {
      const { client: owner, workspaceId, me } = await workspace();
      const admin = await addMember(t, workspaceId, 'admin');
      const viewer = await addMember(t, workspaceId, 'viewer');
      const editor = await addMember(t, workspaceId, 'editor');

      for (const client of [owner, admin.client]) {
        expect((await members(client, workspaceId)).map((member) => member.role)).toEqual([
          'owner',
          'admin',
          'editor',
          'viewer',
        ]);
      }
      const first = (await members(owner, workspaceId))[0];
      expect(first).toMatchObject({ userId: me.user.id, email: me.user.email, siteIds: null });

      const refused = await editor.client.get(`/workspaces/${workspaceId}/members`).expect(403);
      expect(problemSchema.parse(refused.body).title).toBe(
        'Chỉ Chủ sở hữu và Quản trị được thực hiện thao tác này',
      );
      await viewer.client.get(`/workspaces/${workspaceId}/members`).expect(403);
      const stranger = (await signedUpClient(t.app)).client;
      await stranger.get(`/workspaces/${workspaceId}/members`).expect(404);
    });

    it('changes a member’s role and sites, which the next request follows', async () => {
      const { client: owner, workspaceId, smile, kitchen } = await workspace();
      const admin = await addMember(t, workspaceId, 'admin');
      const member = await addMember(t, workspaceId, 'viewer');
      await member.client.get(`/sites/${kitchen.id}`).expect(200);

      const changed = await admin.client
        .patch(`/workspaces/${workspaceId}/members/${member.me.user.id}`, {
          role: 'editor',
          siteIds: [smile.id],
        })
        .expect(200);
      expect(memberSchema.parse(changed.body)).toMatchObject({
        role: 'editor',
        siteIds: [smile.id],
      });
      await member.client.get(`/sites/${kitchen.id}`).expect(404);
      const sites = siteListResponseSchema.parse(
        (await member.client.get(`/workspaces/${workspaceId}/sites`).expect(200)).body,
      );
      expect(sites.items.map((site) => site.id)).toEqual([smile.id]);

      // Quản trị works on every site; a site of another workspace is refused.
      await owner
        .patch(`/workspaces/${workspaceId}/members/${member.me.user.id}`, {
          role: 'admin',
          siteIds: [smile.id],
        })
        .expect(422);
      const other = await workspace();
      const foreign = await owner
        .patch(`/workspaces/${workspaceId}/members/${member.me.user.id}`, {
          role: 'editor',
          siteIds: [other.smile.id],
        })
        .expect(422);
      expect(problemSchema.parse(foreign.body).issues?.[0]?.path).toEqual(['siteIds']);
      // Chủ sở hữu is never a role one gives.
      await owner
        .patch(`/workspaces/${workspaceId}/members/${member.me.user.id}`, {
          role: 'owner',
          siteIds: null,
        })
        .expect(422);
      await owner
        .patch(`/workspaces/${workspaceId}/members/64b0000000000000000000ff`, {
          role: 'viewer',
          siteIds: null,
        })
        .expect(404);
    });

    it('never changes or removes Chủ sở hữu', async () => {
      const { workspaceId, me } = await workspace();
      const admin = await addMember(t, workspaceId, 'admin');
      const change = await admin.client
        .patch(`/workspaces/${workspaceId}/members/${me.user.id}`, {
          role: 'viewer',
          siteIds: null,
        })
        .expect(409);
      expect(problemSchema.parse(change.body).title).toBe('Không đổi được quyền của Chủ sở hữu');
      const remove = await admin.client
        .delete(`/workspaces/${workspaceId}/members/${me.user.id}`)
        .expect(409);
      expect(problemSchema.parse(remove.body).title).toBe('Không thể gỡ Chủ sở hữu');
    });

    it('lets nobody change or remove themselves', async () => {
      const { workspaceId } = await workspace();
      const admin = await addMember(t, workspaceId, 'admin');
      const url = `/workspaces/${workspaceId}/members/${admin.me.user.id}`;
      const change = await admin.client.patch(url, { role: 'viewer', siteIds: null }).expect(409);
      expect(problemSchema.parse(change.body).title).toBe('Không tự đổi quyền của mình được');
      await admin.client.delete(url).expect(409);
      expect((await members(admin.client, workspaceId)).map((member) => member.role)).toEqual([
        'owner',
        'admin',
      ]);
    });

    it('ends the invitations of a Quản trị removed or no longer managing members', async () => {
      const { client: owner, workspaceId } = await workspace();
      const removed = await addMember(t, workspaceId, 'admin');
      const demoted = await addMember(t, workspaceId, 'admin');
      const kept = await addMember(t, workspaceId, 'admin');
      const tokens = {
        removed: await invite(t, removed.client, workspaceId, newEmail('a'), {
          role: 'admin',
          siteIds: null,
        }),
        demoted: await invite(t, demoted.client, workspaceId, newEmail('b')),
        kept: await invite(t, kept.client, workspaceId, newEmail('c')),
      };

      await owner.delete(`/workspaces/${workspaceId}/members/${removed.me.user.id}`).expect(204);
      await owner
        .patch(`/workspaces/${workspaceId}/members/${demoted.me.user.id}`, {
          role: 'editor',
          siteIds: null,
        })
        .expect(200);
      // Changing the sites of a Quản trị keeps what they sent.
      await owner
        .patch(`/workspaces/${workspaceId}/members/${kept.me.user.id}`, {
          role: 'admin',
          siteIds: null,
        })
        .expect(200);

      const states = await Promise.all(
        Object.values(tokens).map(
          async (token) =>
            invitationLookupResponseSchema.parse((await lookup(token).expect(200)).body).state,
        ),
      );
      expect(states).toEqual(['revoked', 'revoked', 'pending']);
    });

    it('invites nobody for a Quản trị demoted while their batch was being counted', async () => {
      const { client: owner, workspaceId } = await workspace();
      const admin = await addMember(t, workspaceId, 'admin');
      const email = newEmail('cham');
      const quota = t.app.get(EmailQuota);
      const take = quota.take.bind(quota);
      const counted = vi.spyOn(quota, 'take').mockImplementationOnce(async (...args) => {
        // Chủ sở hữu demotes them between their permission check and the stored batch.
        await owner
          .patch(`/workspaces/${workspaceId}/members/${admin.me.user.id}`, {
            role: 'editor',
            siteIds: null,
          })
          .expect(200);
        return take(...args);
      });
      try {
        await admin.client
          .post(`/workspaces/${workspaceId}/invitations`, {
            emails: [email],
            role: 'admin',
            siteIds: null,
          })
          .expect(403);
      } finally {
        counted.mockRestore();
      }
      expect(await t.connection.collection('invitations').countDocuments({ email })).toBe(0);
      // Inviting writes the inviter's membership: a role change at that moment conflicts with it.
      await invite(t, owner, workspaceId, newEmail('giu'));
      const ownerMembership = await t.connection
        .collection('memberships')
        .findOne({ workspaceId: new Types.ObjectId(workspaceId), role: 'owner' });
      expect(ownerMembership?.inviteSeq).toBe(1);
    });

    it('sends nothing again for a Quản trị demoted while it was being counted', async () => {
      const { client: owner, workspaceId } = await workspace();
      const admin = await addMember(t, workspaceId, 'admin');
      const email = newEmail('gui-lai-cham');
      const token = await invite(t, owner, workspaceId, email);
      const [sent] = invitationListResponseSchema.parse(
        (await owner.get(`/workspaces/${workspaceId}/invitations`).expect(200)).body,
      ).items;
      const quota = t.app.get(EmailQuota);
      const take = quota.take.bind(quota);
      const counted = vi.spyOn(quota, 'take').mockImplementationOnce(async (...args) => {
        await owner
          .patch(`/workspaces/${workspaceId}/members/${admin.me.user.id}`, {
            role: 'editor',
            siteIds: null,
          })
          .expect(200);
        return take(...args);
      });
      try {
        await admin.client
          .post(`/workspaces/${workspaceId}/invitations/${sent?.id ?? ''}/resend`)
          .expect(403);
      } finally {
        counted.mockRestore();
      }
      // The refused resend changed nothing: the link Chủ sở hữu sent still works.
      expect(
        invitationLookupResponseSchema.parse((await lookup(token).expect(200)).body).state,
      ).toBe('pending');
      const [kept] = invitationListResponseSchema.parse(
        (await owner.get(`/workspaces/${workspaceId}/invitations`).expect(200)).body,
      ).items;
      expect(kept?.invitedBy.id).toBe(sent?.invitedBy.id);
    });

    it('keeps an invitation another Quản trị sent again once its first sender leaves', async () => {
      const { client: owner, workspaceId } = await workspace();
      const first = await addMember(t, workspaceId, 'admin');
      const second = await addMember(t, workspaceId, 'admin');
      const email = newEmail('gui-lai');
      await invite(t, first.client, workspaceId, email);
      const [sent] = invitationListResponseSchema.parse(
        (await owner.get(`/workspaces/${workspaceId}/invitations`).expect(200)).body,
      ).items;
      await second.client
        .post(`/workspaces/${workspaceId}/invitations/${sent?.id ?? ''}/resend`)
        .expect(200);

      await owner.delete(`/workspaces/${workspaceId}/members/${first.me.user.id}`).expect(204);
      const [kept] = invitationListResponseSchema.parse(
        (await owner.get(`/workspaces/${workspaceId}/invitations`).expect(200)).body,
      ).items;
      expect(kept).toMatchObject({ email, invitedBy: { id: second.me.user.id } });
    });

    it('ends the invitations of a Quản trị lowered by accepting their old request', async () => {
      const { client: owner, workspaceId } = await workspace();
      const admin = await addMember(t, workspaceId, 'admin');
      const token = await invite(t, admin.client, workspaceId, newEmail('ha-quyen'));
      // Asked for as Biên tập at the moment they were made Quản trị.
      const { insertedId } = await t.connection.collection('access_requests').insertOne({
        workspaceId: new Types.ObjectId(workspaceId),
        userId: new Types.ObjectId(admin.me.user.id),
        role: 'support',
        wholeWorkspace: true,
        note: '',
        status: 'pending',
        createdAt: new Date(),
        decidedAt: null,
        decidedBy: null,
        purgeAt: null,
      });

      await owner
        .post(`/workspaces/${workspaceId}/access-requests/${insertedId.toHexString()}/accept`, {
          role: 'support',
          siteIds: null,
        })
        .expect(200);
      expect(
        invitationLookupResponseSchema.parse((await lookup(token).expect(200)).body).state,
      ).toBe('revoked');
    });

    it('closes a pending request once its sender changes roles without asking', async () => {
      const { client: owner, workspaceId } = await workspace();
      const ask = (member: { client: TestClient }) =>
        member.client
          .post(`/workspaces/${workspaceId}/access-requests`, {
            role: 'admin',
            wholeWorkspace: true,
            note: '',
          })
          .expect(201);
      const promoted = await addMember(t, workspaceId, 'editor');
      const moved = await addMember(t, workspaceId, 'editor');
      await ask(promoted);
      await ask(moved);

      await owner
        .patch(`/workspaces/${workspaceId}/members/${promoted.me.user.id}`, {
          role: 'admin',
          siteIds: null,
        })
        .expect(200);
      // A change that leaves them asking keeps the request for Chủ sở hữu to decide.
      await owner
        .patch(`/workspaces/${workspaceId}/members/${moved.me.user.id}`, {
          role: 'support',
          siteIds: null,
        })
        .expect(200);

      const pending = accessRequestListResponseSchema.parse(
        (await owner.get(`/workspaces/${workspaceId}/access-requests`).expect(200)).body,
      ).items;
      expect(pending.map((request) => request.user.id)).toEqual([moved.me.user.id]);
    });

    it('removes a member with their pending request; the workspace is then not found', async () => {
      const { client: owner, workspaceId, smile } = await workspace();
      const member = await addMember(t, workspaceId, 'support');
      await member.client
        .post(`/workspaces/${workspaceId}/access-requests`, {
          role: 'editor',
          wholeWorkspace: false,
          note: '',
        })
        .expect(201);

      await owner.delete(`/workspaces/${workspaceId}/members/${member.me.user.id}`).expect(204);
      await member.client.get(`/sites/${smile.id}`).expect(404);
      await member.client.get(`/workspaces/${workspaceId}/sites`).expect(404);
      const requests = await t.connection
        .collection('access_requests')
        .countDocuments({ userId: new Types.ObjectId(member.me.user.id) });
      expect(requests).toBe(0);
      await owner.delete(`/workspaces/${workspaceId}/members/${member.me.user.id}`).expect(404);
    });

    it('hands the workspace to a Quản trị at once, the old owner becoming Quản trị', async () => {
      const { client: owner, workspaceId, me } = await workspace();
      const admin = await addMember(t, workspaceId, 'admin');
      const editor = await addMember(t, workspaceId, 'editor');
      const url = `/workspaces/${workspaceId}/ownership`;

      await admin.client
        .post(url, { toUserId: admin.me.user.id, confirmName: 'Mây Xanh Agency' })
        .expect(403);
      const typo = await owner
        .post(url, { toUserId: admin.me.user.id, confirmName: 'May Xanh Agency' })
        .expect(422);
      expect(problemSchema.parse(typo.body).issues?.[0]?.path).toEqual(['confirmName']);
      const notAdmin = await owner
        .post(url, { toUserId: editor.me.user.id, confirmName: 'Mây Xanh Agency' })
        .expect(409);
      expect(problemSchema.parse(notAdmin.body).title).toBe(
        'Chỉ Quản trị mới nhận được quyền sở hữu',
      );
      // Asked for as Biên tập at the moment they were made Quản trị.
      await t.connection.collection('access_requests').insertOne({
        workspaceId: new Types.ObjectId(workspaceId),
        userId: new Types.ObjectId(admin.me.user.id),
        role: 'admin',
        wholeWorkspace: true,
        note: '',
        status: 'pending',
        createdAt: new Date(),
        decidedAt: null,
        decidedBy: null,
        purgeAt: null,
      });

      const after = memberListResponseSchema.parse(
        (
          await owner
            .post(url, { toUserId: admin.me.user.id, confirmName: 'Mây Xanh Agency' })
            .expect(200)
        ).body,
      ).items;
      expect(after.filter((member) => member.role === 'owner').map((m) => m.userId)).toEqual([
        admin.me.user.id,
      ]);
      expect(after.find((member) => member.userId === me.user.id)?.role).toBe('admin');
      // Chủ sở hữu decides requests: theirs, which none could decide, is closed.
      expect(
        await t.connection
          .collection('access_requests')
          .countDocuments({ userId: new Types.ObjectId(admin.me.user.id), status: 'pending' }),
      ).toBe(0);
      // The former owner may no longer hand it on; the new one may.
      await owner.post(url, { toUserId: me.user.id, confirmName: 'Mây Xanh Agency' }).expect(403);
      await admin.client
        .post(url, { toUserId: me.user.id, confirmName: 'Mây Xanh Agency' })
        .expect(200);
    });
  });

  describe('invitations', () => {
    it('signs the invited person up from the link, into the workspace with the role and sites', async () => {
      const { client: owner, workspaceId, smile } = await workspace();
      const email = newEmail('thuy');
      const token = await invite(t, owner, workspaceId, email, {
        role: 'support',
        siteIds: [smile.id],
      });
      const message = t.emails.to(email).at(-1);
      expect(message?.subject).toMatch(/mời bạn vào Mây Xanh Agency$/);
      expect(message?.text).toContain('Chăm sóc khách hàng trên site Nha khoa Smile Care');

      const pending = invitationListResponseSchema.parse(
        (await owner.get(`/workspaces/${workspaceId}/invitations`).expect(200)).body,
      ).items;
      expect(pending).toEqual([
        expect.objectContaining({ email, role: 'support', siteIds: [smile.id] }),
      ]);
      expect(pending[0]?.sentAt).not.toBeNull();

      const shown = invitationLookupResponseSchema.parse((await lookup(token).expect(200)).body);
      expect(shown).toMatchObject({
        state: 'pending',
        workspaceName: 'Mây Xanh Agency',
        // Only an expired link shows whom to ask for another.
        inviterEmail: null,
        email,
        role: 'support',
        siteNames: ['Nha khoa Smile Care'],
        accountExists: false,
      });

      const invited = new TestClient(t.app);
      const signup = await invited
        .post('/auth/signup/invited', { token, name: 'Thu Hà', password: PASSWORD })
        .expect(201);
      const me = meResponseSchema.parse(signup.body);
      expect(me.user.email).toBe(email);
      // No workspace of their own: only the one they were invited to.
      expect(me.memberships).toEqual([
        {
          // Its admin address comes from its name (ADR-025), numbered as other test runs took it.
          workspace: {
            id: workspaceId,
            name: 'Mây Xanh Agency',
            slug: expect.stringMatching(/^may-xanh-agency(-\d+)?$/) as string,
          },
          role: 'support',
          siteIds: [smile.id],
        },
      ]);
      await invited.get(`/sites/${smile.id}/leads`).expect(200);
      expect(
        invitationLookupResponseSchema.parse((await lookup(token).expect(200)).body).state,
      ).toBe('accepted');
      expect(
        invitationListResponseSchema.parse(
          (await owner.get(`/workspaces/${workspaceId}/invitations`).expect(200)).body,
        ).items,
      ).toEqual([]);
    });

    it('reports members and pending invitations instead of inviting them again', async () => {
      const { client: owner, workspaceId, me } = await workspace();
      const invited = newEmail();
      await invite(t, owner, workspaceId, invited);
      const fresh = newEmail();
      const response = await owner
        .post(`/workspaces/${workspaceId}/invitations`, {
          emails: [me.user.email, invited, fresh, fresh.toUpperCase()],
          role: 'viewer',
          siteIds: null,
        })
        .expect(200);
      expect(createInvitationsResponseSchema.parse(response.body).results).toEqual([
        { email: me.user.email, outcome: 'already_member' },
        { email: invited, outcome: 'already_invited' },
        { email: fresh, outcome: 'sent' },
      ]);
      expect(t.emails.to(invited)).toHaveLength(1);
    });

    it('works once, even when two people race on the same link', async () => {
      const { client: owner, workspaceId } = await workspace();
      const email = newEmail();
      const token = await invite(t, owner, workspaceId, email);
      const first = new TestClient(t.app);
      const second = new TestClient(t.app);
      const [a, b] = await Promise.all([
        first.post('/auth/signup/invited', { token, name: 'A', password: PASSWORD }),
        second.post('/auth/signup/invited', { token, name: 'B', password: PASSWORD }),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect(await t.connection.collection('users').countDocuments({ email })).toBe(1);
      const used = await new TestClient(t.app)
        .post('/auth/signup/invited', { token, name: 'C', password: PASSWORD })
        .expect(409);
      expect(problemSchema.parse(used.body).code).toBe('invitation_unavailable');
    });

    it('lets a signed-in account accept or decline only the invitation of its own email', async () => {
      const { client: owner, workspaceId } = await workspace();
      const someone = await signedUpClient(t.app);
      const other = await signedUpClient(t.app);

      const token = await invite(t, owner, workspaceId, someone.me.user.email);
      expect(
        invitationLookupResponseSchema.parse((await lookup(token).expect(200)).body).accountExists,
      ).toBe(true);
      const wrong = await other.client.post('/invitations/accept', { token }).expect(403);
      expect(problemSchema.parse(wrong.body)).toMatchObject({
        code: 'invitation_email_mismatch',
        title: 'Lời mời này dành cho email khác',
      });
      // An account exists: signing up from the link is refused.
      await new TestClient(t.app)
        .post('/auth/signup/invited', { token, name: 'X', password: PASSWORD })
        .expect(409);

      const accepted = await someone.client.post('/invitations/accept', { token }).expect(200);
      expect(acceptInvitationResponseSchema.parse(accepted.body).workspaceId).toBe(workspaceId);
      const me = meResponseSchema.parse((await someone.client.get('/auth/me').expect(200)).body);
      expect(me.memberships.map((membership) => membership.role)).toEqual(['owner', 'editor']);

      const declined = await signedUpClient(t.app);
      const declinedToken = await invite(t, owner, workspaceId, declined.me.user.email);
      await declined.client.post('/invitations/decline', { token: declinedToken }).expect(204);
      expect(
        invitationLookupResponseSchema.parse((await lookup(declinedToken).expect(200)).body).state,
      ).toBe('declined');
      await declined.client.post('/invitations/accept', { token: declinedToken }).expect(409);
    });

    it('closes the invitation of someone who became a member meanwhile, keeping their role', async () => {
      const { client: owner, workspaceId } = await workspace();
      const someone = await signedUpClient(t.app);
      const token = await invite(t, owner, workspaceId, someone.me.user.email);
      // Joined another way while the invitation waited (a race with the batch that invited them).
      await insertMembership(t, workspaceId, someone.me.user.id, 'viewer');

      const started = Date.now();
      await someone.client.post('/invitations/accept', { token }).expect(200);
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(
        invitationLookupResponseSchema.parse((await lookup(token).expect(200)).body).state,
      ).toBe('accepted');
      const me = meResponseSchema.parse((await someone.client.get('/auth/me').expect(200)).body);
      expect(me.memberships.map((membership) => membership.role)).toEqual(['owner', 'viewer']);
    });

    it('expires after 7 days; "Gửi lại" gives a new link and the old one stops working', async () => {
      const { client: owner, workspaceId, me } = await workspace();
      const email = newEmail();
      const token = await invite(t, owner, workspaceId, email);
      await t.connection
        .collection('invitations')
        .updateOne({ email }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      // The invited person may ask the inviter for another link, by email (ADR-021).
      expect(
        invitationLookupResponseSchema.parse((await lookup(token).expect(200)).body),
      ).toMatchObject({ state: 'expired', inviterEmail: me.user.email });
      await new TestClient(t.app)
        .post('/auth/signup/invited', { token, name: 'Trễ', password: PASSWORD })
        .expect(409);

      const [listed] = invitationListResponseSchema.parse(
        (await owner.get(`/workspaces/${workspaceId}/invitations`).expect(200)).body,
      ).items;
      await owner
        .post(`/workspaces/${workspaceId}/invitations/${listed?.id ?? ''}/resend`)
        .expect(200);
      const renewed = invitationToken(t, email);
      expect(renewed).not.toBe(token);
      await lookup(token).expect(404);
      expect(
        invitationLookupResponseSchema.parse((await lookup(renewed).expect(200)).body),
      ).toMatchObject({ state: 'pending', inviterEmail: null });
    });

    it('revokes a pending invitation', async () => {
      const { client: owner, workspaceId } = await workspace();
      const email = newEmail();
      const token = await invite(t, owner, workspaceId, email);
      const [listed] = invitationListResponseSchema.parse(
        (await owner.get(`/workspaces/${workspaceId}/invitations`).expect(200)).body,
      ).items;
      await owner.delete(`/workspaces/${workspaceId}/invitations/${listed?.id ?? ''}`).expect(204);
      // Only an expired invitation gives its inviter's email.
      expect(
        invitationLookupResponseSchema.parse((await lookup(token).expect(200)).body),
      ).toMatchObject({ state: 'revoked', inviterEmail: null });
      await owner.delete(`/workspaces/${workspaceId}/invitations/${listed?.id ?? ''}`).expect(404);
      await lookup('khong-phai-token').expect(404);
    });

    it('keeps a workspace to 100 people with its pending invitations', async () => {
      const { client: owner, workspaceId } = await workspace();
      const memberships = Array.from({ length: MEMBERS_MAX - 2 }, () => ({
        workspaceId: new Types.ObjectId(workspaceId),
        userId: new Types.ObjectId(),
        role: 'viewer',
        siteIds: null,
        createdAt: new Date(),
      }));
      await t.connection.collection('memberships').insertMany(memberships);
      await invite(t, owner, workspaceId, newEmail());
      const full = await owner
        .post(`/workspaces/${workspaceId}/invitations`, {
          emails: [newEmail()],
          role: 'viewer',
          siteIds: null,
        })
        .expect(409);
      expect(problemSchema.parse(full.body).code).toBe('member_limit_reached');
    });

    it('keeps the limit when two batches are invited at the same moment', async () => {
      const { client: owner, workspaceId } = await workspace();
      // With Chủ sở hữu, 95 people: room for one batch of 5, not two.
      await t.connection.collection('memberships').insertMany(
        Array.from({ length: MEMBERS_MAX - 6 }, () => ({
          workspaceId: new Types.ObjectId(workspaceId),
          userId: new Types.ObjectId(),
          role: 'viewer',
          siteIds: null,
          createdAt: new Date(),
        })),
      );
      const batch = () =>
        owner.post(`/workspaces/${workspaceId}/invitations`, {
          emails: Array.from({ length: 5 }, () => newEmail()),
          role: 'viewer',
          siteIds: null,
        });
      const [first, second] = await Promise.all([batch(), batch()]);
      expect([first.status, second.status].sort()).toEqual([200, 409]);
      const pending = await t.connection
        .collection('invitations')
        .countDocuments({ workspaceId: new Types.ObjectId(workspaceId), status: 'pending' });
      expect(pending).toBe(5);
      // The workspace stays readable: more than 100 people would break the member list.
      await owner.get(`/workspaces/${workspaceId}/members`).expect(200);
    });

    it('counts variants of one mailbox together, and gives back all of a refused batch', async () => {
      const { client: owner, workspaceId } = await workspace();
      const [local, domain] = newEmail('hop-thu').split('@');
      const variants = Array.from(
        { length: 6 },
        (_, index) => `${local ?? ''}+${index}@${domain ?? ''}`,
      );
      const refused = await owner
        .post(`/workspaces/${workspaceId}/invitations`, {
          emails: [newEmail(), ...variants],
          role: 'viewer',
          siteIds: null,
        })
        .expect(429);
      expect(problemSchema.parse(refused.body).title).toBe('Đã gửi quá nhiều lời mời');
      expect(
        await t.connection
          .collection('invitations')
          .countDocuments({ workspaceId: new Types.ObjectId(workspaceId) }),
      ).toBe(0);
      // Nobody was invited, so nothing stays counted against the workspace's day.
      const counter = await t.connection
        .collection('lead_limits')
        .findOne({ key: `member-invite:workspace:${workspaceId}` });
      expect(counter?.['count'] ?? 0).toBe(0);
    });

    it('stores and counts nothing when what the emails need cannot be read', async () => {
      const { client: owner, workspaceId } = await workspace();
      const findWorkspace = vi
        .spyOn(t.app.get(WorkspacesRepository), 'findWorkspace')
        .mockRejectedValueOnce(new Error('database unavailable'));
      try {
        await owner
          .post(`/workspaces/${workspaceId}/invitations`, {
            emails: [newEmail()],
            role: 'viewer',
            siteIds: null,
          })
          .expect(500);
      } finally {
        findWorkspace.mockRestore();
      }
      expect(
        await t.connection
          .collection('invitations')
          .countDocuments({ workspaceId: new Types.ObjectId(workspaceId) }),
      ).toBe(0);
      const counter = await t.connection
        .collection('lead_limits')
        .findOne({ key: `member-invite:workspace:${workspaceId}` });
      expect(counter?.['count'] ?? 0).toBe(0);
    });

    it('sends every email of a batch even when one cannot be marked as sent', async () => {
      const { client: owner, workspaceId } = await workspace();
      const emails = [newEmail(), newEmail()];
      const markSent = vi
        .spyOn(t.app.get(InvitationsRepository), 'markSent')
        .mockRejectedValueOnce(new Error('database unavailable'));
      try {
        const response = await owner
          .post(`/workspaces/${workspaceId}/invitations`, {
            emails,
            role: 'viewer',
            siteIds: null,
          })
          .expect(200);
        expect(createInvitationsResponseSchema.parse(response.body).results).toEqual(
          emails.map((email) => ({ email, outcome: 'sent' })),
        );
      } finally {
        markSent.mockRestore();
      }
      for (const email of emails) {
        expect(t.emails.to(email)).toHaveLength(1);
      }
    });

    it('ends the old link even when it was read just before "Gửi lại"', async () => {
      const { client: owner, workspaceId } = await workspace();
      const email = newEmail();
      await invite(t, owner, workspaceId, email);
      const stored = await t.connection
        .collection<{ email: string; tokenHash: string }>('invitations')
        .findOne({ email });
      const before = await t.app
        .get(InvitationsRepository)
        .findByTokenHash(stored?.tokenHash ?? '');
      if (before === null) {
        throw new Error('The invitation was not stored');
      }
      await owner
        .post(`/workspaces/${workspaceId}/invitations/${before._id.toHexString()}/resend`)
        .expect(200);
      expect(await t.app.get(InvitationsRepository).claim(before, 'accepted', new Date())).toBe(
        false,
      );
    });

    it('sends one address 5 invitations a day, and gives back an email that failed', async () => {
      const { client: owner, workspaceId } = await workspace();
      const email = newEmail();
      t.emails.failNext('smtp_unavailable');
      const unsent = await owner
        .post(`/workspaces/${workspaceId}/invitations`, {
          emails: [email],
          role: 'viewer',
          siteIds: null,
        })
        .expect(200);
      expect(createInvitationsResponseSchema.parse(unsent.body).results[0]?.outcome).toBe('unsent');
      const [listed] = invitationListResponseSchema.parse(
        (await owner.get(`/workspaces/${workspaceId}/invitations`).expect(200)).body,
      ).items;
      expect(listed?.sentAt).toBeNull();
      const resend = `/workspaces/${workspaceId}/invitations/${listed?.id ?? ''}/resend`;
      for (let sent = 0; sent < 5; sent += 1) {
        await owner.post(resend).expect(200);
      }
      const refused = await owner.post(resend).expect(429);
      expect(problemSchema.parse(refused.body).title).toBe('Đã gửi quá nhiều lời mời');
      expect(t.emails.to(email)).toHaveLength(5);
    });

    it('is managed by Chủ sở hữu and Quản trị only', async () => {
      const { workspaceId } = await workspace();
      const editor = await addMember(t, workspaceId, 'editor');
      await editor.client
        .post(`/workspaces/${workspaceId}/invitations`, {
          emails: [newEmail()],
          role: 'viewer',
          siteIds: null,
        })
        .expect(403);
      await editor.client.get(`/workspaces/${workspaceId}/invitations`).expect(403);
    });
  });

  describe('access requests', () => {
    it('emails Chủ sở hữu, who accepts with the sites they decide', async () => {
      const { client: owner, workspaceId, smile, kitchen, me: ownerMe } = await workspace();
      const member = await addMember(t, workspaceId, 'viewer', [smile.id]);
      const created = await member.client
        .post(`/workspaces/${workspaceId}/access-requests`, {
          role: 'editor',
          wholeWorkspace: true,
          note: 'Cần sửa trang ưu đãi tháng 11',
        })
        .expect(201);
      const mine = myAccessRequestResponseSchema.parse(created.body).request;
      expect(mine).toMatchObject({
        role: 'editor',
        wholeWorkspace: true,
        current: { role: 'viewer', siteIds: [smile.id] },
      });

      const email = t.emails.to(ownerMe.user.email).at(-1);
      expect(email?.subject).toBe(`${member.me.user.name} xin đổi quyền trong Mây Xanh Agency`);
      expect(email?.text).toContain('đang là Chỉ xem và xin làm Biên tập trên toàn workspace');
      expect(email?.text).toContain(`/workspaces/${workspaceId}/members?request=${mine?.id ?? ''}`);

      const listed = accessRequestListResponseSchema.parse(
        (await owner.get(`/workspaces/${workspaceId}/access-requests`).expect(200)).body,
      ).items;
      expect(listed.map((request) => request.id)).toEqual([mine?.id]);

      const accepted = await owner
        .post(`/workspaces/${workspaceId}/access-requests/${mine?.id ?? ''}/accept`, {
          role: 'editor',
          siteIds: [smile.id, kitchen.id],
        })
        .expect(200);
      expect(memberSchema.parse(accepted.body)).toMatchObject({
        role: 'editor',
        siteIds: [smile.id, kitchen.id],
      });
      await member.client.get(`/sites/${kitchen.id}`).expect(200);
      expect(t.emails.to(member.me.user.email).at(-1)?.text).toContain(
        'Bạn là Biên tập trên site Nha khoa Smile Care, Bếp Nhà Mây.',
      );
      expect(
        myAccessRequestResponseSchema.parse(
          (await member.client.get(`/workspaces/${workspaceId}/access-requests/mine`).expect(200))
            .body,
        ).request,
      ).toBeNull();
      await owner
        .post(`/workspaces/${workspaceId}/access-requests/${mine?.id ?? ''}/accept`, {
          role: 'viewer',
          siteIds: null,
        })
        .expect(404);
    });

    it('keeps one pending request each, and leaves deciding to Chủ sở hữu', async () => {
      const { client: owner, workspaceId } = await workspace();
      const admin = await addMember(t, workspaceId, 'admin');
      const member = await addMember(t, workspaceId, 'support');
      const body = { role: 'editor', wholeWorkspace: false, note: '' };
      const url = `/workspaces/${workspaceId}/access-requests`;

      await member.client.post(url, body).expect(201);
      const twice = await member.client.post(url, body).expect(409);
      expect(problemSchema.parse(twice.body).code).toBe('access_request_pending');
      await admin.client.post(url, body).expect(403);
      await owner.post(url, body).expect(403);

      const decide = await admin.client.get(url).expect(403);
      expect(problemSchema.parse(decide.body).title).toBe(
        'Chỉ Chủ sở hữu được thực hiện thao tác này',
      );
      const stranger = (await signedUpClient(t.app)).client;
      await stranger.post(url, body).expect(404);
    });

    it('keeps the request when Chủ sở hữu cannot be read for the email', async () => {
      const { workspaceId } = await workspace();
      const member = await addMember(t, workspaceId, 'support');
      t.emails.sent.length = 0;
      const findOwner = vi
        .spyOn(t.app.get(WorkspacesRepository), 'findOwner')
        .mockRejectedValueOnce(new Error('database unavailable'));
      try {
        const created = myAccessRequestResponseSchema.parse(
          (
            await member.client
              .post(`/workspaces/${workspaceId}/access-requests`, {
                role: 'editor',
                wholeWorkspace: false,
                note: '',
              })
              .expect(201)
          ).body,
        );
        expect(created.request?.role).toBe('editor');
      } finally {
        findOwner.mockRestore();
      }
      expect(t.emails.sent).toEqual([]);
    });

    it('decides a request even when its email cannot be read', async () => {
      const { client: owner, workspaceId } = await workspace();
      const accepted = await addMember(t, workspaceId, 'viewer');
      const declined = await addMember(t, workspaceId, 'viewer');
      const url = `/workspaces/${workspaceId}/access-requests`;
      const body = { role: 'editor', wholeWorkspace: true, note: '' };
      await accepted.client.post(url, body).expect(201);
      await declined.client.post(url, body).expect(201);
      const requests = accessRequestListResponseSchema.parse(
        (await owner.get(url).expect(200)).body,
      ).items;
      const idOf = (member: { me: { user: { id: string } } }) =>
        requests.find((request) => request.user.id === member.me.user.id)?.id ?? '';
      t.emails.sent.length = 0;

      const scopeLine = vi
        .spyOn(t.app.get(MemberGrants), 'scopeLine')
        .mockRejectedValueOnce(new Error('database unavailable'));
      try {
        await owner
          .post(`${url}/${idOf(accepted)}/accept`, { role: 'editor', siteIds: null })
          .expect(200);
      } finally {
        scopeLine.mockRestore();
      }
      const contacts = vi
        .spyOn(t.app.get(UsersRepository), 'findContacts')
        .mockRejectedValueOnce(new Error('database unavailable'));
      try {
        await owner.post(`${url}/${idOf(declined)}/decline`).expect(204);
      } finally {
        contacts.mockRestore();
      }
      expect(t.emails.sent).toEqual([]);
      expect(
        accessRequestListResponseSchema.parse((await owner.get(url).expect(200)).body).items,
      ).toEqual([]);
    });

    it('declines, keeping the role, and tells the member', async () => {
      const { client: owner, workspaceId } = await workspace();
      const member = await addMember(t, workspaceId, 'contributor');
      const created = myAccessRequestResponseSchema.parse(
        (
          await member.client
            .post(`/workspaces/${workspaceId}/access-requests`, {
              role: 'admin',
              wholeWorkspace: true,
              note: '',
            })
            .expect(201)
        ).body,
      ).request;
      await owner
        .post(`/workspaces/${workspaceId}/access-requests/${created?.id ?? ''}/decline`)
        .expect(204);
      const me = meResponseSchema.parse((await member.client.get('/auth/me').expect(200)).body);
      expect(me.memberships.find((m) => m.workspace.id === workspaceId)?.role).toBe('contributor');
      expect(t.emails.to(member.me.user.email).at(-1)?.text).toContain(
        'Chủ sở hữu đã từ chối yêu cầu.',
      );
    });
  });
});
