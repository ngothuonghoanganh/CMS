import type { NestExpressApplication } from '@nestjs/platform-express';
import type { MeResponse, SignupRequest } from '@plp/contracts';
import { meResponseSchema } from '@plp/contracts';
import request from 'supertest';
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

/** Signs up a fresh user (owner of a new workspace) and returns the signed-in client. */
export async function signedUpClient(
  app: NestExpressApplication,
  overrides: Partial<SignupRequest> = {},
): Promise<{ client: TestClient; me: MeResponse; workspaceId: string }> {
  const client = new TestClient(app);
  const response = await client.post('/auth/signup', signupInput(overrides)).expect(201);
  const me = meResponseSchema.parse(response.body);
  const workspaceId = me.memberships[0]?.workspace.id;
  if (!workspaceId) {
    throw new Error('Signup did not create a workspace');
  }
  return { client, me, workspaceId };
}
