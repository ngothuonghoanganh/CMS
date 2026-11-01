import { getConnectionToken } from '@nestjs/mongoose';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { MeResponse, SignupRequest } from '@plp/contracts';
import { meResponseSchema } from '@plp/contracts';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { newLinkToken } from '../src/modules/auth/account-links.js';
import { EmailSender } from '../src/modules/notifications/email-sender.js';
import { RecordingEmailSender } from './email.js';
import { TEST_ADMIN_ORIGIN } from './env.js';

/**
 * A browser-like client: keeps the session cookie between requests and sends the admin Origin
 * header on state-changing requests, as the admin app does.
 */
export class TestClient {
  readonly agent: ReturnType<typeof request.agent>;

  constructor(app: NestExpressApplication) {
    this.agent = request.agent(app.getHttpServer());
  }

  get(path: string) {
    return this.agent.get(path);
  }

  post(path: string, body?: object) {
    const req = this.agent.post(path).set('Origin', TEST_ADMIN_ORIGIN);
    return body === undefined ? req : req.send(body);
  }

  put(path: string, body: object) {
    return this.agent.put(path).set('Origin', TEST_ADMIN_ORIGIN).send(body);
  }

  patch(path: string, body: object) {
    return this.agent.patch(path).set('Origin', TEST_ADMIN_ORIGIN).send(body);
  }

  delete(path: string) {
    return this.agent.delete(path).set('Origin', TEST_ADMIN_ORIGIN);
  }
}

let counter = 0;

export function signupInput(overrides: Partial<SignupRequest> = {}): SignupRequest {
  counter += 1;
  return {
    name: `Người dùng ${counter}`,
    email: `user${counter}-${process.pid}@example.com`,
    password: 'mat-khau-an-toan-123',
    workspaceName: `Workspace ${counter}`,
    ...overrides,
  };
}

/** Subject of the email that confirms a sign-up (ADR-026). */
export const SIGNUP_EMAIL_SUBJECT = 'Xác nhận email để tạo workspace';

/** The secret of an account link in an email: `…#token=…` (ADR-026). */
export function linkTokenIn(text: string): string | null {
  return /#token=([A-Za-z0-9_-]{43})/.exec(text)?.[1] ?? null;
}

/**
 * The secret of the sign-up link last emailed to `email`, taken out of the recording. An app that
 * sends real email (an SMTP stub) keeps the link out of reach: the sign-up gets a link of the
 * test's own instead, as `POST /auth/signup/resend` would.
 */
export async function signupLinkToken(app: NestExpressApplication, email: string): Promise<string> {
  const sender = app.get(EmailSender);
  if (sender instanceof RecordingEmailSender) {
    const token = linkTokenIn(sender.take(email, SIGNUP_EMAIL_SUBJECT)?.text ?? '');
    if (token === null) {
      throw new Error(`No sign-up link was emailed to ${email}`);
    }
    return token;
  }
  const { token, tokenHash } = newLinkToken();
  const renewed = await app
    .get<Connection>(getConnectionToken())
    .collection('pending_signups')
    .updateOne({ email }, { $set: { tokenHash } });
  if (renewed.matchedCount !== 1) {
    throw new Error(`No sign-up of ${email} waits for its confirmation`);
  }
  return token;
}

/** Anything that posts like a browser at an admin address: `TestClient`, or one of its own. */
export interface PostingClient {
  post(path: string, body?: object): request.Test;
}

/** The first step of a sign-up (ADR-026): the form. Resolves with its link's secret. */
export async function requestSignup(
  app: NestExpressApplication,
  input: SignupRequest,
  client: PostingClient = new TestClient(app),
): Promise<string> {
  await client.post('/auth/signup', input).expect(202);
  return signupLinkToken(app, input.email);
}

/**
 * Signs `input` up through both steps of ADR-026, the form and the emailed link, as a person
 * would; `client` then holds the new session.
 */
export async function signUp(
  app: NestExpressApplication,
  input: SignupRequest,
  client: PostingClient = new TestClient(app),
): Promise<MeResponse> {
  const token = await requestSignup(app, input, client);
  const response = await client.post('/auth/signup/verify', { token }).expect(201);
  return meResponseSchema.parse(response.body);
}

/** Signs up a fresh user (owner of a new workspace) and returns the signed-in client. */
export async function signedUpClient(
  app: NestExpressApplication,
  overrides: Partial<SignupRequest> = {},
): Promise<{ client: TestClient; me: MeResponse; workspaceId: string }> {
  const client = new TestClient(app);
  const me = await signUp(app, signupInput(overrides), client);
  const workspaceId = me.memberships[0]?.workspace.id;
  if (!workspaceId) {
    throw new Error('Signup did not create a workspace');
  }
  return { client, me, workspaceId };
}
