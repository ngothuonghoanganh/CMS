import { createHash } from 'node:crypto';
import {
  type AccountEmailResponse,
  meResponseSchema,
  problemSchema,
  SESSION_COOKIE,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import {
  linkTokenIn,
  requestSignup,
  SIGNUP_EMAIL_SUBJECT,
  signedUpClient,
  signUp,
  signupInput,
  TestClient,
} from '../../../test/client.js';
import { TEST_ADMIN_ORIGIN } from '../../../test/env.js';
import { invite } from '../../../test/members.js';
import { WorkspaceDatabases } from '../../shared/persistence/workspace-databases.js';
import { newLinkToken } from './account-links.js';

const HOUR_MS = 3_600_000;

interface StoredPendingSignup {
  email: string;
  name: string;
  workspaceName: string;
  passwordHash: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

/** ADR-026: the form stores a sign-up and emails a link; the link creates the account. */
describe('two-step sign-up', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_signup');
  });

  afterAll(async () => {
    await t.close();
  });

  async function workspaceDatabases(): Promise<string[]> {
    const { db } = t.connection;
    if (!db) {
      throw new Error('The master connection has no database');
    }
    const { databases } = await db.admin().listDatabases({ nameOnly: true });
    return databases
      .map(({ name }) => name)
      .filter((name) => name.startsWith(`${t.connection.name}_ws_`))
      .sort();
  }

  const pendingOf = (email: string) =>
    t.connection.collection<StoredPendingSignup>('pending_signups').findOne({ email });

  const usersWith = (email: string) => t.connection.collection('users').countDocuments({ email });

  const verify = (token: string, client = new TestClient(t.app)) =>
    client.post('/auth/signup/verify', { token });

  it('creates no account, workspace or database before the email is confirmed', async () => {
    const before = await workspaceDatabases();
    const input = signupInput({ workspaceName: 'Mây Xanh Agency' });
    const response = await new TestClient(t.app).post('/auth/signup', input).expect(202);

    expect(response.body).toEqual({ email: input.email } satisfies AccountEmailResponse);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await usersWith(input.email)).toBe(0);
    expect(await workspaceDatabases()).toEqual(before);

    const [email] = t.emails.to(input.email);
    expect(email?.subject).toBe(SIGNUP_EMAIL_SUBJECT);
    const token = linkTokenIn(email?.text ?? '');
    expect(email?.text).toContain(`${TEST_ADMIN_ORIGIN}/signup/verify#token=${token ?? ''}`);
    expect(email?.text).toContain('Mây Xanh Agency');
    expect(email?.html).toContain(`href="${TEST_ADMIN_ORIGIN}/signup/verify#token=${token ?? ''}"`);
    expect(email?.html).toContain('Xác nhận và tạo workspace');

    // The password is hashed and only the sha256 of the link's secret is kept, for 24 hours.
    const pending = await pendingOf(input.email);
    expect(pending).toMatchObject({ name: input.name, workspaceName: 'Mây Xanh Agency' });
    expect(pending?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(pending?.tokenHash).toBe(
      createHash('sha256')
        .update(token ?? '')
        .digest('hex'),
    );
    expect(JSON.stringify(pending)).not.toContain(input.password);
    expect((pending?.expiresAt.getTime() ?? 0) - (pending?.createdAt.getTime() ?? 0)).toBe(
      24 * HOUR_MS,
    );
  });

  it('creates the user, the workspace and its database from the link, and signs in', async () => {
    const before = await workspaceDatabases();
    const input = signupInput({ workspaceName: 'Bếp Nhà Lá' });
    const client = new TestClient(t.app);
    const token = await requestSignup(t.app, input, client);

    const response = await verify(token, client).expect(201);
    const me = meResponseSchema.parse(response.body);
    expect(me.user).toMatchObject({ name: input.name, email: input.email });
    expect(me.memberships).toHaveLength(1);
    expect(me.memberships[0]).toMatchObject({ role: 'owner', siteIds: null });
    expect(me.memberships[0]?.workspace.name).toBe('Bếp Nhà Lá');
    expect(me.memberships[0]?.workspace.slug).toMatch(/^bep-nha-la/);
    expect(String(response.headers['set-cookie'])).toContain(`${SESSION_COOKIE}=`);
    await client.get('/auth/me').expect(200);

    const workspaceId = new Types.ObjectId(me.memberships[0]?.workspace.id);
    expect(await workspaceDatabases()).toEqual(
      [...before, t.app.get(WorkspaceDatabases).nameOf(workspaceId)].sort(),
    );
    expect(await pendingOf(input.email)).toBeNull();
    // The password typed in the form is the account's.
    await new TestClient(t.app)
      .post('/auth/login', { email: input.email, password: input.password })
      .expect(200);
  });

  it('uses a link once', async () => {
    const input = signupInput();
    const token = await requestSignup(t.app, input);
    await verify(token).expect(201);

    const again = await verify(token).expect(410);
    const problem = problemSchema.parse(again.body);
    expect(problem.code).toBe('signup_link_invalid');
    expect(problem.detail).toContain('đăng ký lại');
    expect(again.headers['content-type']).toContain('application/problem+json');
    expect(await usersWith(input.email)).toBe(1);
  });

  it('refuses a link that expired or was never sent, and creates nothing', async () => {
    const input = signupInput();
    const token = await requestSignup(t.app, input);
    // Expired a moment ago: the TTL monitor has not removed it yet, the lookup refuses it.
    await t.connection
      .collection('pending_signups')
      .updateOne({ email: input.email }, { $set: { expiresAt: new Date(Date.now() - 1) } });
    const before = await workspaceDatabases();

    for (const link of [token, newLinkToken().token]) {
      const response = await verify(link).expect(410);
      expect(problemSchema.parse(response.body).code).toBe('signup_link_invalid');
    }
    expect(await usersWith(input.email)).toBe(0);
    expect(await workspaceDatabases()).toEqual(before);
  });

  it('creates one account when the link is confirmed twice at once', async () => {
    const input = signupInput();
    const token = await requestSignup(t.app, input);
    const before = await workspaceDatabases();

    const responses = await Promise.all([verify(token), verify(token)]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 410]);
    expect(await usersWith(input.email)).toBe(1);
    // The other confirmation's database is dropped again (ADR-025).
    expect((await workspaceDatabases()).length).toBe(before.length + 1);
  });

  it('replaces the link when the same email signs up again', async () => {
    const input = signupInput();
    const first = await requestSignup(t.app, input);
    const second = await requestSignup(t.app, { ...input, workspaceName: 'Tên mới' });

    await verify(first).expect(410);
    const me = meResponseSchema.parse((await verify(second).expect(201)).body);
    expect(me.memberships[0]?.workspace.name).toBe('Tên mới');
  });

  it('answers an email with an account exactly as a new one, and emails it something else', async () => {
    const existing = signupInput();
    await signUp(t.app, existing);
    const fresh = signupInput();

    const taken = await new TestClient(t.app)
      .post('/auth/signup', { ...signupInput(), email: existing.email })
      .expect(202);
    const free = await new TestClient(t.app).post('/auth/signup', fresh).expect(202);

    const answer = (response: typeof taken) => ({
      status: response.status,
      type: response.headers['content-type'],
      cookie: response.headers['set-cookie'],
      body: { ...(response.body as AccountEmailResponse), email: '' },
    });
    expect(answer(taken)).toEqual(answer(free));
    expect(taken.body).toEqual({ email: existing.email });

    const [message] = t.emails.to(existing.email);
    expect(message?.subject).toBe('Email này đã có tài khoản');
    expect(message?.text).toContain(`Đăng nhập: ${TEST_ADMIN_ORIGIN}/login`);
    expect(message?.text).toContain(`Quên mật khẩu: ${TEST_ADMIN_ORIGIN}/forgot-password`);
    expect(linkTokenIn(message?.text ?? '')).toBeNull();
    expect(t.emails.to(fresh.email)[0]?.subject).toBe(SIGNUP_EMAIL_SUBJECT);
    // Nothing was stored, and the account is as it was.
    expect(await pendingOf(existing.email)).toBeNull();
    await new TestClient(t.app)
      .post('/auth/login', { email: existing.email, password: existing.password })
      .expect(200);
  });

  it('refuses a link whose email got an account meanwhile, and drops the sign-up', async () => {
    const owner = await signedUpClient(t.app);
    const input = signupInput();
    const token = await requestSignup(t.app, input);
    // Invited while the sign-up waits, the person joins through the invitation instead.
    const invitation = await invite(t, owner.client, owner.workspaceId, input.email);
    await new TestClient(t.app)
      .post('/auth/signup/invited', { token: invitation, name: 'Thu Hà', password: input.password })
      .expect(201);
    const before = await workspaceDatabases();

    const response = await verify(token).expect(409);
    const problem = problemSchema.parse(response.body);
    expect(problem.code).toBe('email_taken');
    expect(problem.detail).toContain('Quên mật khẩu');
    expect(await pendingOf(input.email)).toBeNull();
    expect(await workspaceDatabases()).toEqual(before);
    await verify(token).expect(410);
  });

  it('sends a sign-up still waiting a new link, valid 24 hours again; the old one stops working', async () => {
    const input = signupInput();
    const first = await requestSignup(t.app, input);
    // Twelve hours later, say.
    await t.connection
      .collection('pending_signups')
      .updateOne(
        { email: input.email },
        { $set: { expiresAt: new Date(Date.now() + 12 * HOUR_MS) } },
      );

    const response = await new TestClient(t.app)
      .post('/auth/signup/resend', { email: input.email.toUpperCase() })
      .expect(202);
    expect(response.body).toEqual({ email: input.email });
    const emails = t.emails.to(input.email);
    expect(emails.map((email) => email.subject)).toEqual([SIGNUP_EMAIL_SUBJECT]);
    const second = linkTokenIn(emails[0]?.text ?? '');
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    const pending = await pendingOf(input.email);
    expect((pending?.expiresAt.getTime() ?? 0) - Date.now()).toBeGreaterThan(23.9 * HOUR_MS);

    await verify(first).expect(410);
    await verify(second ?? '').expect(201);
  });

  it('answers "Gửi lại" the same when no sign-up waits, and sends nothing', async () => {
    const nobody = signupInput().email;
    const response = await new TestClient(t.app)
      .post('/auth/signup/resend', { email: nobody })
      .expect(202);
    expect(response.body).toEqual({ email: nobody });

    const confirmed = signupInput();
    await signUp(t.app, confirmed);
    await new TestClient(t.app).post('/auth/signup/resend', { email: confirmed.email }).expect(202);
    expect(t.emails.to(nobody)).toEqual([]);
    expect(t.emails.to(confirmed.email)).toEqual([]);
  });

  it('validates the bodies with the contract schemas', async () => {
    const client = new TestClient(t.app);
    const short = await client
      .post('/auth/signup', { ...signupInput(), password: 'short' })
      .expect(422);
    expect(problemSchema.parse(short.body).issues?.[0]?.path).toEqual(['password']);
    await client.post('/auth/signup/verify', {}).expect(422);
    await client.post('/auth/signup/verify', { token: '' }).expect(422);
    await client.post('/auth/signup/resend', { email: 'khong-phai-email' }).expect(422);
  });
});
