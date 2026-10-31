import { createHash, createHmac } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { meResponseSchema, problemSchema, SESSION_COOKIE } from '@plp/contracts';
import { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, signupInput, TestClient } from '../../../test/client.js';
import { TEST_LOGIN_ATTEMPT_SECRET } from '../../../test/env.js';
import { createSite } from '../../../test/resources.js';
import { LoginAttemptsRepository } from './login-attempts.repository.js';
import { hashSessionToken, newSessionToken } from './session-token.js';
import { SessionsRepository } from './sessions.repository.js';
import { UsersRepository } from './users.repository.js';

describe('auth', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_auth');
  });

  afterAll(async () => {
    await t.close();
  });

  it('signs up a user as owner of a new workspace and sets an httpOnly session cookie', async () => {
    const client = new TestClient(t.app);
    const input = signupInput({ workspaceName: 'Mây Xanh Agency' });
    const response = await client.post('/auth/signup', input).expect(201);

    const me = meResponseSchema.parse(response.body);
    expect(me.user.email).toBe(input.email);
    expect(me.memberships).toHaveLength(1);
    expect(me.memberships[0]?.workspace.name).toBe('Mây Xanh Agency');
    expect(me.memberships[0]?.role).toBe('owner');

    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');

    const meResponse = await client.get('/auth/me').expect(200);
    expect(meResponseSchema.parse(meResponse.body).user.id).toBe(me.user.id);
  });

  it('never stores the session token itself', async () => {
    const client = new TestClient(t.app);
    const response = await client.post('/auth/signup', signupInput()).expect(201);
    const token = /plp_session=([^;]+)/.exec(String(response.headers['set-cookie']))?.[1];
    expect(token).toBeDefined();
    const stored = await t.connection.collection('sessions').findOne({ tokenHash: token });
    expect(stored).toBeNull();
  });

  it('normalizes the email and rejects a second signup with the same address', async () => {
    const input = signupInput();
    await new TestClient(t.app)
      .post('/auth/signup', { ...input, email: input.email.toUpperCase() })
      .expect(201);
    const response = await new TestClient(t.app).post('/auth/signup', input).expect(409);
    expect(problemSchema.parse(response.body).code).toBe('email_taken');
  });

  it('validates the signup body with the contract schema', async () => {
    const response = await new TestClient(t.app)
      .post('/auth/signup', { ...signupInput(), password: 'short' })
      .expect(422);
    const problem = problemSchema.parse(response.body);
    expect(problem.code).toBe('validation_failed');
    expect(problem.issues?.[0]?.path).toEqual(['password']);
  });

  it('logs in with the right password and rejects a wrong one with a generic message', async () => {
    const input = signupInput();
    await new TestClient(t.app).post('/auth/signup', input).expect(201);

    const ok = new TestClient(t.app);
    await ok.post('/auth/login', { email: input.email, password: input.password }).expect(200);
    await ok.get('/auth/me').expect(200);

    const wrong = await new TestClient(t.app)
      .post('/auth/login', { email: input.email, password: 'wrong-password' })
      .expect(401);
    const unknown = await new TestClient(t.app)
      .post('/auth/login', { email: 'nobody@example.com', password: 'wrong-password' })
      .expect(401);
    expect(problemSchema.parse(wrong.body).title).toBe(problemSchema.parse(unknown.body).title);
  });

  it('logs out by deleting the session', async () => {
    const { client } = await signedUpClient(t.app);
    await client.post('/auth/logout').expect(204);
    const response = await client.get('/auth/me').expect(401);
    expect(problemSchema.parse(response.body).code).toBe('unauthenticated');
  });

  it('requires a session on protected routes', async () => {
    const response = await request(t.app.getHttpServer()).get('/auth/me').expect(401);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  it('refuses an expired session to reads and writes, before the TTL monitor removes it', async () => {
    const { client, me, workspaceId } = await signedUpClient(t.app);
    const site = await createSite(client, workspaceId, { name: 'Nha khoa Smile Care' });
    // MongoDB deletes the record up to a minute or more after `expiresAt`; until then only the
    // guard's expiry check refuses it. Expired a moment ago, so a guard comparing with a "now"
    // taken earlier (at startup, say) lets it through.
    await t.connection
      .collection('sessions')
      .updateMany(
        { userId: new Types.ObjectId(me.user.id) },
        { $set: { expiresAt: new Date(Date.now() - 1) } },
      );

    const meResponse = await client.get('/auth/me').expect(401);
    expect(problemSchema.parse(meResponse.body).code).toBe('unauthenticated');
    const rename = await client.patch(`/sites/${site.id}`, { name: 'Đổi tên' }).expect(401);
    expect(problemSchema.parse(rename.body).code).toBe('unauthenticated');
    const stored = await t.connection
      .collection('sites')
      .findOne({ _id: new Types.ObjectId(site.id) });
    expect(stored?.['name']).toBe('Nha khoa Smile Care');
  });

  it('finds a session until its expiry and never after', async () => {
    const sessions = t.app.get(SessionsRepository);
    const tokenHash = hashSessionToken(newSessionToken());
    // An hour ahead, so the TTL monitor leaves the record alone and only the query decides.
    const expiresAt = new Date(Date.now() + 3_600_000);
    await sessions.create(new Types.ObjectId(), tokenHash, expiresAt);

    expect(await sessions.findActive(tokenHash, new Date())).toMatchObject({
      tokenHash,
      expiresAt,
    });
    expect(await sessions.findActive(tokenHash, new Date(expiresAt.getTime() - 1))).not.toBeNull();
    expect(await sessions.findActive(tokenHash, expiresAt)).toBeNull();
    expect(await sessions.findActive(tokenHash, new Date(expiresAt.getTime() + 1))).toBeNull();
  });

  it('rejects state-changing requests that do not come from the admin origin', async () => {
    const response = await request(t.app.getHttpServer())
      .post('/auth/signup')
      .set('Origin', 'https://evil.example')
      .send(signupInput())
      .expect(403);
    expect(problemSchema.parse(response.body).code).toBe('origin_rejected');
  });
});

describe('auth rate limit', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_auth_limit', { env: { AUTH_RATE_LIMIT_PER_MINUTE: 2 } });
  });

  afterAll(async () => {
    await t.close();
  });

  it('limits repeated login attempts', async () => {
    const client = new TestClient(t.app);
    const body = { email: 'nobody@example.com', password: 'whatever-123' };
    await client.post('/auth/login', body).expect(401);
    await client.post('/auth/login', body).expect(401);
    const response = await client.post('/auth/login', body).expect(429);
    expect(problemSchema.parse(response.body).code).toBe('rate_limited');
  });

  it('ignores X-Forwarded-For sent by the client by default', async () => {
    // Without a trusted edge proxy the header comes straight from the browser through the admin
    // rewrite, so it must not open a fresh bucket.
    const limited = await createTestApp('plp_test_auth_limit_xff', {
      env: { AUTH_RATE_LIMIT_PER_MINUTE: 2 },
    });
    try {
      const body = { email: 'nobody@example.com', password: 'whatever-123' };
      const attempt = (address: string) =>
        new TestClient(limited.app).post('/auth/login', body).set('X-Forwarded-For', address);
      await attempt('203.0.113.1').expect(401);
      await attempt('203.0.113.2').expect(401);
      await attempt('203.0.113.3').expect(429);
    } finally {
      await limited.close();
    }
  });
});

describe('auth rate limit behind a trusted edge proxy', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_auth_limit_edge', {
      env: { AUTH_RATE_LIMIT_PER_MINUTE: 2, TRUST_PROXY_HOPS: 1 },
    });
  });

  afterAll(async () => {
    await t.close();
  });

  it('counts each client behind the admin proxy separately', async () => {
    // The edge appends the visitor's address to X-Forwarded-For and the admin's /api rewrite passes
    // it on; the socket address is always the admin's.
    const fromClient = (address: string, path: string, body: object) =>
      new TestClient(t.app).post(path, body).set('X-Forwarded-For', address);
    const body = { email: 'nobody@example.com', password: 'whatever-123' };

    await fromClient('203.0.113.10', '/auth/login', body).expect(401);
    await fromClient('203.0.113.10', '/auth/login', body).expect(401);
    await fromClient('203.0.113.10', '/auth/login', body).expect(429);
    await fromClient('198.51.100.20', '/auth/login', {
      email: 'someone-else@example.com',
      password: 'whatever-123',
    }).expect(401);

    await fromClient('203.0.113.30', '/auth/signup', signupInput()).expect(201);
    await fromClient('203.0.113.30', '/auth/signup', signupInput()).expect(201);
    await fromClient('203.0.113.30', '/auth/signup', signupInput()).expect(429);
    await fromClient('198.51.100.40', '/auth/signup', signupInput()).expect(201);
  });
});

describe('per-account login limit', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_auth_account_limit', { env: { LOGIN_FAILURE_LIMIT: 3 } });
  });

  afterAll(async () => {
    await t.close();
  });

  async function signUp() {
    const input = signupInput();
    await new TestClient(t.app).post('/auth/signup', input).expect(201);
    return input;
  }

  const login = (email: string, password: string) =>
    new TestClient(t.app).post('/auth/login', { email, password });

  it('refuses an account after too many failed logins, even with the right password', async () => {
    const victim = await signUp();
    const other = await signUp();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await login(victim.email, 'wrong-password').expect(401);
    }

    const response = await login(victim.email, victim.password).expect(429);
    const problem = problemSchema.parse(response.body);
    expect(problem.code).toBe('rate_limited');
    expect(problem.detail).toContain('Thử lại sau 15 phút');
    await login(other.email, other.password).expect(200);
  });

  it('clears the count after a successful login', async () => {
    const user = await signUp();
    await login(user.email, 'wrong-password').expect(401);
    await login(user.email, 'wrong-password').expect(401);
    await login(user.email, user.password).expect(200);
    await login(user.email, 'wrong-password').expect(401);
    await login(user.email, 'wrong-password').expect(401);
    await login(user.email, user.password).expect(200);
  });

  it('limits an email without an account the same way', async () => {
    const email = `ghost-${String(process.pid)}@example.com`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await login(email, 'wrong-password').expect(401);
    }
    await login(email, 'wrong-password').expect(429);
  });

  it('lets no more than the limit of parallel attempts reach the password check', async () => {
    const user = await signUp();
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => login(user.email, 'wrong-password')),
    );
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([401, 401, 401, 429, 429, 429, 429, 429, 429, 429]);
  });

  /** The stored attempt counter of an email, read straight from the collection. */
  async function storedAttempts(email: string): Promise<number | null> {
    const key = createHmac('sha256', TEST_LOGIN_ATTEMPT_SECRET).update(email).digest('hex');
    const record = await t.connection
      .collection<{ count: number }>('login_attempts')
      .findOne({ accountKey: key });
    return record?.count ?? null;
  }

  /** Runs `body` with Nest's error log muted; a forced failure is an expected 500 here. */
  async function withMutedErrors(body: () => Promise<void>): Promise<void> {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      await body();
    } finally {
      logged.mockRestore();
    }
  }

  it('keys the counter with an HMAC of the email, never a plain hash of it', async () => {
    const email = `hmac-${String(process.pid)}@example.com`;
    await login(email, 'wrong-password').expect(401);
    const stored = await t.connection
      .collection<{ accountKey: string }>('login_attempts')
      .find({ accountKey: { $in: [createHash('sha256').update(email).digest('hex')] } })
      .toArray();
    // A list of emails hashed with sha256 finds nothing; only the secret finds the counter.
    expect(stored).toEqual([]);
    expect(await storedAttempts(email)).toBe(1);
  });

  it('gives the attempt back when looking the account up fails', async () => {
    const user = await signUp();
    await login(user.email, 'wrong-password').expect(401);
    await login(user.email, 'wrong-password').expect(401);
    const lookup = vi
      .spyOn(t.app.get(UsersRepository), 'findByEmail')
      .mockRejectedValueOnce(new Error('connection reset'));
    await withMutedErrors(async () => {
      const response = await login(user.email, user.password).expect(500);
      expect(problemSchema.parse(response.body).code).toBe('internal');
    });
    lookup.mockRestore();
    expect(await storedAttempts(user.email)).toBe(2);
    // The outage used up nothing: the third wrong password is still a plain 401.
    await login(user.email, 'wrong-password').expect(401);
    await login(user.email, user.password).expect(429);
  });

  it('gives the attempt back when checking the password fails', async () => {
    const user = await signUp();
    await login(user.email, 'wrong-password').expect(401);
    const users = t.connection.collection('users');
    const stored = await users.findOne({ email: user.email });
    // argon2 throws on a hash it cannot read, as it would on a corrupted record.
    await users.updateOne({ email: user.email }, { $set: { passwordHash: 'not-an-argon2-hash' } });
    await withMutedErrors(async () => {
      await login(user.email, user.password).expect(500);
      await login(user.email, user.password).expect(500);
    });
    expect(await storedAttempts(user.email)).toBe(1);
    await users.updateOne(
      { email: user.email },
      { $set: { passwordHash: stored?.['passwordHash'] as unknown } },
    );
    await login(user.email, 'wrong-password').expect(401);
    await login(user.email, user.password).expect(200);
  });

  it('burns no attempt when the session cannot be created or the counter cleared', async () => {
    const user = await signUp();
    await login(user.email, 'wrong-password').expect(401);
    await login(user.email, 'wrong-password').expect(401);
    const clear = vi
      .spyOn(t.app.get(LoginAttemptsRepository), 'clear')
      .mockRejectedValueOnce(new Error('write concern timeout'));
    await withMutedErrors(async () => {
      await login(user.email, user.password).expect(500);
    });
    clear.mockRestore();
    expect(await storedAttempts(user.email)).toBe(2);

    const create = vi
      .spyOn(t.app.get(SessionsRepository), 'create')
      .mockRejectedValueOnce(new Error('connection reset'));
    await withMutedErrors(async () => {
      await login(user.email, user.password).expect(500);
    });
    create.mockRestore();
    // The right password cleared the count before the session failed; nothing was counted since.
    expect(await storedAttempts(user.email)).toBeNull();
    await login(user.email, user.password).expect(200);
  });

  it('rethrows both errors when the attempt cannot be given back either', async () => {
    const user = await signUp();
    const repository = t.app.get(LoginAttemptsRepository);
    const lookup = vi
      .spyOn(t.app.get(UsersRepository), 'findByEmail')
      .mockRejectedValueOnce(new Error('connection reset'));
    const giveBack = vi
      .spyOn(repository, 'giveBack')
      .mockRejectedValueOnce(new Error('not primary'));
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      await login(user.email, user.password).expect(500);
      const [entry]: unknown[] = logged.mock.calls[0] ?? [];
      expect(entry).toMatchObject({
        err: {
          message: 'Login failed, and giving its attempt back failed too',
          errors: [{ message: 'connection reset' }, { message: 'not primary' }],
        },
      });
    } finally {
      logged.mockRestore();
      giveBack.mockRestore();
      lookup.mockRestore();
    }
  });

  it('gives back only within the window that counted, never below zero', async () => {
    const attempts = t.app.get(LoginAttemptsRepository);
    const key = (name: string) => `${name}-${new Types.ObjectId().toHexString()}`;
    const count = async (accountKey: string) =>
      (
        await t.connection
          .collection<{ count: number; expiresAt: Date }>('login_attempts')
          .findOne({ accountKey })
      )?.count ?? null;
    // Windows end an hour ahead, so the TTL monitor leaves the records alone.
    const now = new Date();
    const end = new Date(now.getTime() + 3_600_000);

    const once = key('once');
    const window = await attempts.begin(once, now, end);
    await attempts.giveBack(once, window, now);
    expect(await count(once)).toBe(0);
    await attempts.giveBack(once, window, now);
    expect(await count(once)).toBe(0);

    const ended = key('ended');
    const endedWindow = await attempts.begin(ended, now, end);
    await attempts.giveBack(ended, endedWindow, new Date(end.getTime() + 1));
    expect(await count(ended)).toBe(1);

    const later = key('later');
    const first = await attempts.begin(later, now, end);
    const afterEnd = new Date(end.getTime() + 1);
    const second = await attempts.begin(later, afterEnd, new Date(afterEnd.getTime() + 3_600_000));
    expect(second.count).toBe(1);
    await attempts.giveBack(later, first, afterEnd);
    expect(await count(later)).toBe(1);

    const cleared = key('cleared');
    const clearedWindow = await attempts.begin(cleared, now, end);
    await attempts.clear(cleared);
    await attempts.giveBack(cleared, clearedWindow, now);
    expect(await count(cleared)).toBeNull();
  });

  it('starts a new window once the previous one has ended', async () => {
    const user = await signUp();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await login(user.email, 'wrong-password').expect(401);
    }
    await login(user.email, user.password).expect(429);

    await t.connection
      .collection('login_attempts')
      .updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await login(user.email, user.password).expect(200);
  });
});
