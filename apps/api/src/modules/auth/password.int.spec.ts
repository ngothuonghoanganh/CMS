import { createHash, createHmac } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { meResponseSchema, problemSchema, SESSION_COOKIE } from '@plp/contracts';
import { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import {
  linkTokenIn,
  signedUpClient,
  signUp,
  signupInput,
  TestClient,
} from '../../../test/client.js';
import { TEST_ADMIN_ORIGIN, TEST_LOGIN_ATTEMPT_SECRET } from '../../../test/env.js';
import { newLinkToken } from './account-links.js';
import { SessionsRepository } from './sessions.repository.js';
import { UsersRepository } from './users.repository.js';

const RESET_SUBJECT = 'Đặt lại mật khẩu';
const NEW_PASSWORD = 'mat-khau-moi-an-toan-456';

interface StoredReset {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

/** A promise and the function that settles it. */
function gate(): { opened: Promise<void>; open: () => void } {
  let open = (): void => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

/** ADR-026: a forgotten password set again from an emailed link, and a changed one. */
describe('passwords', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_passwords', { env: { LOGIN_FAILURE_LIMIT: 3 } });
  });

  afterAll(async () => {
    await t.close();
  });

  const login = (email: string, password: string) =>
    new TestClient(t.app).post('/auth/login', { email, password });

  /** A client signed in with the account's password: another device. */
  async function anotherDevice(email: string, password: string): Promise<TestClient> {
    const client = new TestClient(t.app);
    await client.post('/auth/login', { email, password }).expect(200);
    return client;
  }

  /** Asks for a reset link and returns its secret. */
  async function resetToken(email: string): Promise<string> {
    await new TestClient(t.app).post('/auth/password/forgot', { email }).expect(202);
    const token = linkTokenIn(t.emails.to(email).at(-1)?.text ?? '');
    if (token === null) {
      throw new Error(`No reset link was emailed to ${email}`);
    }
    return token;
  }

  const storedAttempts = async (email: string) =>
    (
      await t.connection.collection<{ count: number }>('login_attempts').findOne({
        accountKey: createHmac('sha256', TEST_LOGIN_ATTEMPT_SECRET).update(email).digest('hex'),
      })
    )?.count ?? null;

  describe('forgotten', () => {
    it('emails a reset link valid 60 minutes, keeping only the sha256 of its secret', async () => {
      const input = signupInput();
      const me = await signUp(t.app, input);

      const response = await new TestClient(t.app)
        .post('/auth/password/forgot', { email: input.email.toUpperCase() })
        .expect(202);
      expect(response.body).toEqual({ email: input.email });

      const [email] = t.emails.to(input.email);
      expect(email?.subject).toBe(RESET_SUBJECT);
      const token = linkTokenIn(email?.text ?? '') ?? '';
      expect(email?.text).toContain(`${TEST_ADMIN_ORIGIN}/reset-password#token=${token}`);
      expect(email?.html).toContain(`href="${TEST_ADMIN_ORIGIN}/reset-password#token=${token}"`);
      const stored = await t.connection
        .collection<StoredReset>('password_resets')
        .findOne({ userId: new Types.ObjectId(me.user.id) });
      expect(stored?.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
      expect((stored?.expiresAt.getTime() ?? 0) - (stored?.createdAt.getTime() ?? 0)).toBe(
        3_600_000,
      );
    });

    it('answers an email without an account the same, and sends nothing', async () => {
      const nobody = signupInput().email;
      const response = await new TestClient(t.app)
        .post('/auth/password/forgot', { email: nobody })
        .expect(202);
      expect(response.body).toEqual({ email: nobody });
      expect(t.emails.to(nobody)).toEqual([]);
    });

    it('keeps one link per user: a new one stops the old', async () => {
      const input = signupInput();
      await signUp(t.app, input);
      const first = await resetToken(input.email);
      const second = await resetToken(input.email);

      const old = await new TestClient(t.app)
        .post('/auth/password/reset', { token: first, password: NEW_PASSWORD })
        .expect(410);
      expect(problemSchema.parse(old.body).code).toBe('reset_link_invalid');
      await new TestClient(t.app)
        .post('/auth/password/reset', { token: second, password: NEW_PASSWORD })
        .expect(200);
    });

    it('sets the new password, ends every session, signs in, and works once', async () => {
      const input = signupInput();
      const owner = await signedUpClient(t.app, input);
      const phone = await anotherDevice(input.email, input.password);
      const token = await resetToken(input.email);

      const browser = new TestClient(t.app);
      const response = await browser
        .post('/auth/password/reset', { token, password: NEW_PASSWORD })
        .expect(200);
      expect(meResponseSchema.parse(response.body).user.id).toBe(owner.me.user.id);
      expect(String(response.headers['set-cookie'])).toContain(`${SESSION_COOKIE}=`);
      await browser.get('/auth/me').expect(200);
      // Whoever held a session before, maybe on a lost device, is signed out.
      await owner.client.get('/auth/me').expect(401);
      await phone.get('/auth/me').expect(401);
      expect(
        await t.connection
          .collection('sessions')
          .countDocuments({ userId: new Types.ObjectId(owner.me.user.id) }),
      ).toBe(1);

      await login(input.email, input.password).expect(401);
      await login(input.email, NEW_PASSWORD).expect(200);
      const again = await new TestClient(t.app)
        .post('/auth/password/reset', { token, password: 'mat-khau-thu-ba-789' })
        .expect(410);
      expect(problemSchema.parse(again.body).code).toBe('reset_link_invalid');
      await login(input.email, NEW_PASSWORD).expect(200);
    });

    it('clears the failed logins that hold the account back', async () => {
      const input = signupInput();
      await signUp(t.app, input);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await login(input.email, 'wrong-password').expect(401);
      }
      await login(input.email, input.password).expect(429);

      const token = await resetToken(input.email);
      await new TestClient(t.app)
        .post('/auth/password/reset', { token, password: NEW_PASSWORD })
        .expect(200);
      expect(await storedAttempts(input.email)).toBeNull();
      await login(input.email, NEW_PASSWORD).expect(200);
    });

    it('changes nothing when a part of the reset fails, and the link still works', async () => {
      const input = signupInput();
      const { client } = await signedUpClient(t.app, input);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await login(input.email, 'wrong-password').expect(401);
      }
      const token = await resetToken(input.email);
      const muted = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const failing = vi
        .spyOn(t.app.get(SessionsRepository), 'deleteForUser')
        .mockRejectedValueOnce(new Error('connection reset'));
      try {
        await new TestClient(t.app)
          .post('/auth/password/reset', { token, password: NEW_PASSWORD })
          .expect(500);
      } finally {
        failing.mockRestore();
        muted.mockRestore();
      }
      // One transaction: the password, the link, the sessions and the failed logins are as before.
      await client.get('/auth/me').expect(200);
      expect(await storedAttempts(input.email)).toBe(3);

      await new TestClient(t.app)
        .post('/auth/password/reset', { token, password: NEW_PASSWORD })
        .expect(200);
      await client.get('/auth/me').expect(401);
      await login(input.email, NEW_PASSWORD).expect(200);
    });

    it('refuses a link that expired or was never sent, and changes nothing', async () => {
      const input = signupInput();
      const me = await signUp(t.app, input);
      const token = await resetToken(input.email);
      await t.connection
        .collection('password_resets')
        .updateOne(
          { userId: new Types.ObjectId(me.user.id) },
          { $set: { expiresAt: new Date(Date.now() - 1) } },
        );

      for (const link of [token, newLinkToken().token]) {
        const response = await new TestClient(t.app)
          .post('/auth/password/reset', { token: link, password: NEW_PASSWORD })
          .expect(410);
        const problem = problemSchema.parse(response.body);
        expect(problem.code).toBe('reset_link_invalid');
        expect(problem.detail).toContain('Quên mật khẩu');
      }
      await login(input.email, input.password).expect(200);
    });

    it('takes a new password by the sign-up rules', async () => {
      const input = signupInput();
      await signUp(t.app, input);
      const token = await resetToken(input.email);
      const response = await new TestClient(t.app)
        .post('/auth/password/reset', { token, password: 'short' })
        .expect(422);
      expect(problemSchema.parse(response.body).issues?.[0]?.path).toEqual(['password']);
      await login(input.email, input.password).expect(200);
    });
  });

  describe('changed', () => {
    it('changes the password, keeps this session and ends the others', async () => {
      const input = signupInput();
      const { client, me } = await signedUpClient(t.app, input);
      const phone = await anotherDevice(input.email, input.password);

      await client
        .post('/auth/password', { currentPassword: input.password, newPassword: NEW_PASSWORD })
        .expect(204);
      await client.get('/auth/me').expect(200);
      await phone.get('/auth/me').expect(401);
      expect(
        await t.connection
          .collection('sessions')
          .countDocuments({ userId: new Types.ObjectId(me.user.id) }),
      ).toBe(1);
      await login(input.email, input.password).expect(401);
      await login(input.email, NEW_PASSWORD).expect(200);
    });

    it('refuses a wrong current password, which costs an attempt of the login limit', async () => {
      const input = signupInput();
      const { client } = await signedUpClient(t.app, input);
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const response = await client
          .post('/auth/password', { currentPassword: 'doan-sai-123', newPassword: NEW_PASSWORD })
          .expect(422);
        expect(problemSchema.parse(response.body).issues).toEqual([
          {
            path: ['currentPassword'],
            code: 'invalid_credentials',
            message: 'Mật khẩu hiện tại không đúng',
          },
        ]);
        expect(await storedAttempts(input.email)).toBe(attempt);
      }

      // A stolen session guesses no faster than a login: both are stopped now.
      const limited = await client
        .post('/auth/password', { currentPassword: input.password, newPassword: NEW_PASSWORD })
        .expect(429);
      expect(problemSchema.parse(limited.body).code).toBe('rate_limited');
      await login(input.email, input.password).expect(429);
      await client.get('/auth/me').expect(200);
    });

    it('clears the failed attempts once the current password is right', async () => {
      const input = signupInput();
      const { client } = await signedUpClient(t.app, input);
      await login(input.email, 'wrong-password').expect(401);
      await login(input.email, 'wrong-password').expect(401);
      await client
        .post('/auth/password', { currentPassword: input.password, newPassword: NEW_PASSWORD })
        .expect(204);
      expect(await storedAttempts(input.email)).toBeNull();
    });

    it('needs a session and the admin Origin', async () => {
      await request(t.app.getHttpServer())
        .post('/auth/password')
        .set('Origin', TEST_ADMIN_ORIGIN)
        .send({ currentPassword: 'mat-khau-an-toan-123', newPassword: NEW_PASSWORD })
        .expect(401);

      const input = signupInput();
      const { client } = await signedUpClient(t.app, input);
      const response = await client.agent
        .post('/auth/password')
        .set('Origin', 'https://evil.example')
        .send({ currentPassword: input.password, newPassword: NEW_PASSWORD })
        .expect(403);
      expect(problemSchema.parse(response.body).code).toBe('origin_rejected');
      await login(input.email, input.password).expect(200);
    });

    it('takes a new password by the sign-up rules', async () => {
      const input = signupInput();
      const { client } = await signedUpClient(t.app, input);
      const response = await client
        .post('/auth/password', { currentPassword: input.password, newPassword: 'short' })
        .expect(422);
      expect(problemSchema.parse(response.body).issues?.[0]?.path).toEqual(['newPassword']);
      expect(await storedAttempts(input.email)).toBeNull();
    });
  });

  describe('racing a reset (ADR-026)', () => {
    const userOf = (email: string) =>
      t.connection
        .collection<{ _id: Types.ObjectId; credentialsVersion?: number }>('users')
        .findOne({ email });

    it('leaves no session to a login that read the old password before the reset', async () => {
      const input = signupInput();
      await signUp(t.app, input);
      const token = await resetToken(input.email);
      const users = t.app.get(UsersRepository);
      const findByEmail = users.findByEmail.bind(users);
      const read = gate();
      const resetDone = gate();
      // The login has read the account, old password hash and all, and waits there.
      const spy = vi.spyOn(users, 'findByEmail').mockImplementationOnce(async (email) => {
        const found = await findByEmail(email);
        read.open();
        await resetDone.opened;
        return found;
      });
      const thief = new TestClient(t.app);
      const owner = new TestClient(t.app);
      try {
        const loggingIn = thief
          .post('/auth/login', { email: input.email, password: input.password })
          .then((response) => response);
        await read.opened;
        await owner.post('/auth/password/reset', { token, password: NEW_PASSWORD }).expect(200);
        resetDone.open();
        // The login proved the password it read, so it answers as a login does...
        expect((await loggingIn).status).toBe(200);
      } finally {
        spy.mockRestore();
      }

      // ...but its session was issued against the password the reset replaced.
      const refused = await thief.get('/auth/me').expect(401);
      expect(problemSchema.parse(refused.body).code).toBe('unauthenticated');
      await owner.get('/auth/me').expect(200);
      await login(input.email, input.password).expect(401);
      await login(input.email, NEW_PASSWORD).expect(200);
    });

    it('refuses a change that proved the old password before the reset, and changes nothing', async () => {
      const input = signupInput();
      const { client: thief } = await signedUpClient(t.app, input);
      const token = await resetToken(input.email);
      const users = t.app.get(UsersRepository);
      const setPassword = users.setPassword.bind(users);
      const proven = gate();
      const resetDone = gate();
      // The change has proven the current password and waits before its write.
      const spy = vi
        .spyOn(users, 'setPassword')
        .mockImplementationOnce(async (...args: Parameters<UsersRepository['setPassword']>) => {
          proven.open();
          await resetDone.opened;
          return setPassword(...args);
        });
      const owner = new TestClient(t.app);
      try {
        const changing = thief
          .post('/auth/password', {
            currentPassword: input.password,
            newPassword: 'mat-khau-cua-ke-trom-789',
          })
          .then((response) => response);
        await proven.opened;
        await owner.post('/auth/password/reset', { token, password: NEW_PASSWORD }).expect(200);
        resetDone.open();

        const refused = await changing;
        expect(refused.status).toBe(409);
        expect(problemSchema.parse(refused.body)).toMatchObject({
          code: 'password_changed',
          title: 'Mật khẩu vừa được đổi ở nơi khác. Đăng nhập lại.',
        });
        expect(refused.headers['content-type']).toContain('application/problem+json');
      } finally {
        spy.mockRestore();
      }

      // The reset stands: its password, and the session it signed the owner in with.
      await owner.get('/auth/me').expect(200);
      await thief.get('/auth/me').expect(401);
      await login(input.email, 'mat-khau-cua-ke-trom-789').expect(401);
      await login(input.email, NEW_PASSWORD).expect(200);
    });

    it('moves the user to a new credentials version with every reset and change', async () => {
      const input = signupInput();
      const { client } = await signedUpClient(t.app, input);
      expect((await userOf(input.email))?.credentialsVersion).toBe(0);

      await client
        .post('/auth/password', { currentPassword: input.password, newPassword: NEW_PASSWORD })
        .expect(204);
      expect((await userOf(input.email))?.credentialsVersion).toBe(1);
      // The session that changed it goes on under the new version.
      await client.get('/auth/me').expect(200);

      const token = await resetToken(input.email);
      await new TestClient(t.app)
        .post('/auth/password/reset', { token, password: 'mat-khau-thu-ba-789' })
        .expect(200);
      expect((await userOf(input.email))?.credentialsVersion).toBe(2);
      await client.get('/auth/me').expect(401);
    });

    it('takes accounts and sessions from before the credentials version as version 0', async () => {
      const input = signupInput();
      const { client, me } = await signedUpClient(t.app, input);
      const userId = new Types.ObjectId(me.user.id);
      await t.connection
        .collection('users')
        .updateOne({ _id: userId }, { $unset: { credentialsVersion: '' } });
      await t.connection
        .collection('sessions')
        .updateMany({ userId }, { $unset: { credentialsVersion: '' } });

      await client.get('/auth/me').expect(200);
      await client
        .post('/auth/password', { currentPassword: input.password, newPassword: NEW_PASSWORD })
        .expect(204);
      expect((await userOf(input.email))?.credentialsVersion).toBe(1);
      await client.get('/auth/me').expect(200);
    });
  });

  describe('display name', () => {
    it('changes the name the account shows', async () => {
      const { client } = await signedUpClient(t.app);
      const response = await client.patch('/auth/me', { name: '  Ngọc Anh Trần  ' }).expect(200);
      expect(meResponseSchema.parse(response.body).user.name).toBe('Ngọc Anh Trần');
      const me = meResponseSchema.parse((await client.get('/auth/me').expect(200)).body);
      expect(me.user.name).toBe('Ngọc Anh Trần');
      expect(me.memberships).toHaveLength(1);
    });

    it('takes a name by the sign-up rules, from the admin only', async () => {
      const { client, me } = await signedUpClient(t.app);
      const empty = await client.patch('/auth/me', { name: '   ' }).expect(422);
      expect(problemSchema.parse(empty.body).issues?.[0]?.path).toEqual(['name']);
      await client.patch('/auth/me', { name: 'x'.repeat(81) }).expect(422);
      await client.agent
        .patch('/auth/me')
        .set('Origin', 'https://evil.example')
        .send({ name: 'Kẻ lạ' })
        .expect(403);
      await request(t.app.getHttpServer())
        .patch('/auth/me')
        .set('Origin', TEST_ADMIN_ORIGIN)
        .send({ name: 'Kẻ lạ' })
        .expect(401);
      const after = meResponseSchema.parse((await client.get('/auth/me').expect(200)).body);
      expect(after.user.name).toBe(me.user.name);
    });
  });
});
