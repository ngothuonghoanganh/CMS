import { problemSchema } from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../test/app.js';
import { signedUpClient, signupInput, TestClient } from '../../test/client.js';
import { createSecondInstance } from '../../test/instances.js';
import { createLiveFormPage, leadBody, submitLead } from '../../test/leads.js';
import {
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../test/pages.js';
import { configurePrivacy } from '../../test/privacy.js';
import { addConfirmedRecipient } from '../../test/recipients.js';
import { createSite } from '../../test/resources.js';

/**
 * Two API processes on one database, as behind a load balancer: which limits hold for the
 * deployment as a whole (counted in MongoDB) and which count per process (ADR-004, ADR-016).
 */
describe('two API instances on one database', () => {
  let a: TestApp;
  let b: TestApp;

  beforeAll(async () => {
    a = await createTestApp('plp_test_instances', {
      ...withRevalidationRecorder(new RecordingRevalidationClient()),
      env: { LOGIN_FAILURE_LIMIT: 3, LEAD_LIMIT_PER_CLIENT: 2 },
    });
    b = await createSecondInstance(a);
  });

  afterAll(async () => {
    await b.close();
    await a.close();
  });

  const login = (instance: TestApp, email: string, password: string) =>
    new TestClient(instance.app).post('/auth/login', { email, password });

  it('limits failed logins per account across instances', async () => {
    const user = signupInput();
    await new TestClient(a.app).post('/auth/signup', user).expect(201);
    await login(a, user.email, 'wrong-password').expect(401);
    await login(b, user.email, 'wrong-password').expect(401);
    await login(a, user.email, 'wrong-password').expect(401);
    // The fourth attempt is the first one over the limit, whichever instance receives it.
    const response = await login(b, user.email, user.password).expect(429);
    expect(problemSchema.parse(response.body).code).toBe('rate_limited');
    await login(a, user.email, user.password).expect(429);
  });

  it('limits leads per visitor address across instances', async () => {
    const { client, workspaceId } = await signedUpClient(a.app);
    const site = await createSite(client, workspaceId);
    await configurePrivacy(client, site.id);
    await addConfirmedRecipient(a, client, site.id);
    const { published } = await createLiveFormPage(client, site.id, uniqueSlug('hai-may'));
    const send = (instance: TestApp) =>
      submitLead(instance, site.subdomain, leadBody(published.release.id), {
        ip: '198.51.100.77',
      });
    await send(a).expect(201);
    await send(b).expect(201);
    expect(problemSchema.parse((await send(a)).body).code).toBe('rate_limited');
    expect((await send(b)).status).toBe(429);
    expect(
      await a.connection
        .collection('leads')
        .countDocuments({ siteId: new Types.ObjectId(site.id) }),
    ).toBe(2);
  });
});

describe('the per-address auth throttle', () => {
  let a: TestApp;
  let b: TestApp;

  beforeAll(async () => {
    a = await createTestApp('plp_test_instances_throttle', {
      env: { AUTH_RATE_LIMIT_PER_MINUTE: 2 },
    });
    b = await createSecondInstance(a);
  });

  afterAll(async () => {
    await b.close();
    await a.close();
  });

  it('counts in each instance: N instances let one address try N times the limit', async () => {
    const body = { email: 'nobody@example.com', password: 'whatever-123' };
    const attempt = (instance: TestApp) => new TestClient(instance.app).post('/auth/login', body);
    await attempt(a).expect(401);
    await attempt(a).expect(401);
    await attempt(a).expect(429);
    // In memory of instance a only: instance b still has the whole minute's allowance. The
    // per-account limit above is what bounds password guessing across instances.
    await attempt(b).expect(401);
    await attempt(b).expect(401);
    await attempt(b).expect(429);
  });
});
