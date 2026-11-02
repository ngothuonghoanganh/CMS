import { createHash, createHmac } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { problemSchema } from '@plp/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import {
  linkTokenIn,
  SIGNUP_EMAIL_SUBJECT,
  signUp,
  signupForm,
  signupInput,
  signupVerifyBody,
  TestClient,
} from '../../../test/client.js';
import { TEST_LOGIN_ATTEMPT_SECRET } from '../../../test/env.js';
import { AuthEmailLimitsRepository } from './auth-email-limits.repository.js';
import { PendingSignupsRepository } from './pending-signups.repository.js';

/**
 * ADR-026: an address receives at most 3 account emails an hour, of every kind; a send the SMTP
 * server refuses is a 503 and does not count.
 */
describe('account emails', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_account_emails');
  });

  afterAll(async () => {
    await t.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The key of a mailbox; the test addresses without `+` or Gmail dots are their own mailbox. */
  const keyOf = (mailbox: string) =>
    createHmac('sha256', TEST_LOGIN_ATTEMPT_SECRET).update(mailbox).digest('hex');

  const counted = async (email: string) =>
    (
      await t.connection
        .collection<{ count: number }>('auth_email_limits')
        .findOne({ key: keyOf(email) })
    )?.count ?? null;

  const post = (path: string, body: object) => new TestClient(t.app).post(path, body);

  it('sends an address 3 account emails an hour, all kinds together', async () => {
    const input = signupInput();
    // The confirmation is the first; the helper reads it.
    await signUp(t.app, input);
    await post('/auth/password/forgot', { email: input.email }).expect(202);
    await post('/auth/signup', { ...signupForm(signupInput()), email: input.email }).expect(202);
    expect(await counted(input.email)).toBe(3);

    for (const [path, body] of [
      ['/auth/password/forgot', { email: input.email }],
      ['/auth/signup', { ...signupForm(signupInput()), email: input.email }],
      ['/auth/signup/resend', { email: input.email }],
    ] as const) {
      const problem = problemSchema.parse((await post(path, body).expect(429)).body);
      expect(problem.code).toBe('rate_limited');
      expect(problem.detail).toContain('60 phút');
    }
    expect(t.emails.to(input.email).map((email) => email.subject)).toEqual([
      'Đặt lại mật khẩu',
      'Email này đã có tài khoản',
    ]);
    // Another address has its own limit.
    await post('/auth/password/forgot', { email: signupInput().email }).expect(202);
  });

  it('counts the emails of one mailbox together, however its address is written', async () => {
    // One Gmail inbox: `+tag`, dots and googlemail.com all reach it (ADR-021's `mailboxOf`).
    const first = 'hopthuchung+1@gmail.com';
    const second = 'hop.thu.chung+2@gmail.com';
    const signup = (email: string) => post('/auth/signup', { ...signupForm(signupInput()), email });

    await signup(first).expect(202);
    await signup(second).expect(202);
    await post('/auth/signup/resend', { email: first }).expect(202);
    for (const send of [
      () => signup('hopthuchung+4@googlemail.com'),
      () => post('/auth/signup/resend', { email: second }),
    ]) {
      const problem = problemSchema.parse((await send().expect(429)).body);
      expect(problem).toMatchObject({
        code: 'rate_limited',
        title: 'Đã gửi quá nhiều email tới hộp thư này',
      });
    }

    const variants = [first, second, 'hopthuchung+4@googlemail.com'];
    const sent = t.emails.sent.filter((email) => email.to.some((to) => variants.includes(to)));
    expect(sent.map((email) => email.to)).toEqual([[first], [second], [first]]);
    // One count for the mailbox, the refused requests included; none for an address of it.
    expect(await counted('hopthuchung@gmail.com')).toBe(5);
    expect(
      await t.connection
        .collection('auth_email_limits')
        .countDocuments({ key: { $in: variants.map(keyOf) } }),
    ).toBe(0);
    // Another mailbox has its own limit.
    await signup('hopthukhac+1@gmail.com').expect(202);
  });

  it('limits an email without an account the same way, so the limit tells nothing', async () => {
    const withAccount = signupInput();
    // The confirmation counted one of its three.
    await signUp(t.app, withAccount);
    await post('/auth/password/forgot', { email: withAccount.email }).expect(202);
    await post('/auth/password/forgot', { email: withAccount.email }).expect(202);
    const without = signupInput().email;
    for (let request = 0; request < 3; request += 1) {
      await post('/auth/password/forgot', { email: without }).expect(202);
    }
    expect(t.emails.to(without)).toEqual([]);

    const [first, second] = await Promise.all(
      [withAccount.email, without].map(async (email) => {
        const response = await post('/auth/password/forgot', { email }).expect(429);
        const { requestId: _requestId, ...problem } = problemSchema.parse(response.body);
        return problem;
      }),
    );
    expect(first).toEqual(second);
  });

  it('keys the count with an HMAC of the email and starts again after the hour', async () => {
    const email = signupInput().email;
    for (let request = 0; request < 3; request += 1) {
      await post('/auth/signup/resend', { email }).expect(202);
    }
    await post('/auth/signup/resend', { email }).expect(429);
    const plain = createHash('sha256').update(email).digest('hex');
    expect(await t.connection.collection('auth_email_limits').countDocuments({ key: plain })).toBe(
      0,
    );
    const record = await t.connection
      .collection<{ expiresAt: Date }>('auth_email_limits')
      .findOne({ key: keyOf(email) });
    expect((record?.expiresAt.getTime() ?? 0) - Date.now()).toBeLessThanOrEqual(3_600_000);

    await t.connection
      .collection('auth_email_limits')
      .updateOne({ key: keyOf(email) }, { $set: { expiresAt: new Date(Date.now() - 1) } });
    await post('/auth/signup/resend', { email }).expect(202);
    expect(await counted(email)).toBe(1);
  });

  it('answers 503 when SMTP takes nothing, gives the email back and keeps the sign-up', async () => {
    const input = signupInput();
    t.emails.failNext('smtp_unavailable');
    const warned = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const response = await post('/auth/signup', signupForm(input)).expect(503);
    expect(problemSchema.parse(response.body)).toMatchObject({
      code: 'email_unavailable',
      title: 'Chưa gửi được email, thử lại sau ít phút',
    });
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(await counted(input.email)).toBe(0);
    // Only the code is logged: the server's answer may quote the address.
    expect(warned).toHaveBeenCalledWith({ code: 'smtp_unavailable' }, 'Sign-up email not sent');
    expect(JSON.stringify(warned.mock.calls)).not.toContain(input.email);
    expect(
      await t.connection.collection('pending_signups').countDocuments({ email: input.email }),
    ).toBe(1);

    // "Gửi lại" works, and its link creates the account.
    await post('/auth/signup/resend', { email: input.email }).expect(202);
    const [email] = t.emails.to(input.email);
    expect(email?.subject).toBe(SIGNUP_EMAIL_SUBJECT);
    await post(
      '/auth/signup/verify',
      signupVerifyBody(linkTokenIn(email?.text ?? '') ?? '', input),
    ).expect(201);
    expect(await counted(input.email)).toBe(1);
  });

  it('answers 503 for a reset link SMTP refused, and keeps the link for "Gửi lại"', async () => {
    const input = signupInput();
    await signUp(t.app, input);
    t.emails.failNext('timeout');
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const response = await post('/auth/password/forgot', { email: input.email }).expect(503);
    expect(problemSchema.parse(response.body).code).toBe('email_unavailable');
    expect(await counted(input.email)).toBe(1);
    expect(await t.connection.collection('password_resets').countDocuments()).toBeGreaterThan(0);
    await post('/auth/password/forgot', { email: input.email }).expect(202);
    expect(t.emails.to(input.email).map((email) => email.subject)).toEqual(['Đặt lại mật khẩu']);
  });

  it('gives the email back when storing the sign-up fails, and keeps the answer when that fails too', async () => {
    const input = signupInput();
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(t.app.get(PendingSignupsRepository), 'replace').mockRejectedValueOnce(
      new Error('connection reset'),
    );
    await post('/auth/signup', signupForm(input)).expect(500);
    expect(await counted(input.email)).toBe(0);

    t.emails.failNext('smtp_unavailable');
    vi.spyOn(t.app.get(AuthEmailLimitsRepository), 'giveBack').mockRejectedValueOnce(
      new Error('not primary'),
    );
    const response = await post('/auth/signup', signupForm(input)).expect(503);
    expect(problemSchema.parse(response.body).code).toBe('email_unavailable');
    // Still counted, the safe side; logged without the key that stands for the address.
    expect(await counted(input.email)).toBe(1);
    const entry = logged.mock.calls.find(
      ([, message]) => message === 'Sign-up email still counted: giving it back failed',
    );
    expect(entry).toBeDefined();
    expect(JSON.stringify(entry)).not.toContain(keyOf(input.email));
  });
});
