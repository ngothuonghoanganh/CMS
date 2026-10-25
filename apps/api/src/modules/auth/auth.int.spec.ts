import { meResponseSchema, problemSchema, SESSION_COOKIE } from '@plp/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, signupInput, TestClient } from '../../../test/client.js';

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
