import { Writable } from 'node:stream';
import {
  CLIENT_IP_HEADER,
  CLIENT_UA_HEADER,
  meResponseSchema,
  previewLinkResponseSchema,
  RENDERER_SIGNATURE_HEADER,
  type Site,
} from '@plp/contracts';
import { mongo, Types } from 'mongoose';
import { Logger as PinoNestLogger } from 'nestjs-pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  aiJobBody,
  AI_BRIEF,
  fakeAi,
  finishedJob,
  postAiJob,
  postSuggestion,
  scopeTextOf,
  streamEvents,
  suggestionResultOf,
} from '../../test/ai.js';
import { createTestApp, type TestApp } from '../../test/app.js';
import { requestSignup, signupInput, signupVerifyBody, TestClient } from '../../test/client.js';
import { formDraft, heroSection, leadFormSection, sampleSection } from '../../test/compositions.js';
import { TEST_ADMIN_ORIGIN } from '../../test/env.js';
import { createLiveFormPage, leadBody, PHONE_UA, submitLead } from '../../test/leads.js';
import {
  createPage,
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../test/pages.js';
import { configurePrivacy } from '../../test/privacy.js';
import { addConfirmedRecipient } from '../../test/recipients.js';
import { createSite } from '../../test/resources.js';
import { LeadLimitsRepository } from '../modules/leads/lead-limits.repository.js';
import { inviteLimitKeys } from '../modules/notifications/domain/notification-rules.js';
import { AiError } from '../modules/ai/ai-text-model.js';
import { LeadRecipientsService } from '../modules/notifications/lead-recipients.service.js';
import { HASH_PLACEHOLDER, REDACTED } from './log-redaction.js';

/** What pino writes in place of a `redact` path (its default censor). */
const CENSORED = '[Redacted]';
const VISITOR_IP = '198.51.100.23';
const AUTHORIZATION_SECRET = 'khong-bao-gio-vao-log';
/** A lead search: a phone number (rule 10). */
const SEARCH = '0938512077';
const LEAD = {
  name: 'Nguyễn Thu Hà',
  phone: '0901 234 567',
  email: 'thuha@example.com',
  message: 'Tư vấn niềng răng cho con',
};

/** The parts of pino-http's "request completed" line that can carry a secret. */
const requestLineSchema = z.object({
  msg: z.literal('request completed'),
  req: z.object({
    id: z.string(),
    url: z.string(),
    query: z.record(z.string(), z.unknown()),
    headers: z.record(z.string(), z.unknown()),
  }),
  res: z.object({ statusCode: z.number(), headers: z.record(z.string(), z.unknown()) }),
});
type RequestLine = z.infer<typeof requestLineSchema>;

/**
 * The request log of the running API (ADR-013): the app's own pino-http options, at level info,
 * write into memory. Each request under test sends an `x-request-id` to find its line.
 */
describe('request log', () => {
  const output: string[] = [];
  let t: TestApp;
  let owner: TestClient;
  let sessionToken: string;
  /** The secret of the sign-up link, sent in a body (ADR-026). */
  let signupToken: string;
  const signupAccount = signupInput();
  let workspaceId: string;
  let site: Site;
  let pageId: string;
  let releaseId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_request_log', {
      ...withRevalidationRecorder(new RecordingRevalidationClient()),
      // The fake AI writes pages, so a job's prompts and answers can be looked for (ADR-031).
      env: { LOG_LEVEL: 'info', AI_PROVIDER: 'fake' },
      logDestination: new Writable({
        write(chunk: Buffer, _encoding, done) {
          output.push(chunk.toString('utf8'));
          done();
        },
      }),
    });
    owner = new TestClient(t.app);
    // The confirmation of a sign-up sets the session cookie (ADR-026).
    signupToken = await requestSignup(t.app, signupAccount, owner);
    const signup = await owner
      .post('/auth/signup/verify', signupVerifyBody(signupToken, signupAccount))
      .set('x-request-id', 'log-signup')
      .expect(201);
    const token = /plp_session=([^;]+)/.exec(String(signup.headers['set-cookie']))?.[1];
    const firstWorkspaceId = meResponseSchema.parse(signup.body).memberships[0]?.workspace.id;
    if (token === undefined || firstWorkspaceId === undefined) {
      throw new Error('Signup set no session cookie or created no workspace');
    }
    sessionToken = token;
    workspaceId = firstWorkspaceId;
    site = await createSite(owner, workspaceId);
    await configurePrivacy(owner, site.id);
    await addConfirmedRecipient(t, owner, site.id);
    const slug = uniqueSlug('dang-ky');
    const page = await createLiveFormPage(
      owner,
      site.id,
      slug,
      formDraft(slug, leadFormSection({ showEmail: true, showMessage: true })),
    );
    pageId = page.pageId;
    releaseId = page.published.release.id;
  });

  afterAll(async () => {
    await t.close();
  });

  /** The "request completed" line of the request sent with `x-request-id: id`. */
  function requestLine(id: string): Promise<RequestLine> {
    // pino-http writes the line once the response has finished, maybe after the client read it.
    return vi.waitFor(() => {
      const line = output
        .join('')
        .split('\n')
        .filter((text) => text !== '')
        .map((text) => requestLineSchema.safeParse(JSON.parse(text)))
        .find((parsed) => parsed.success && parsed.data.req.id === id);
      if (!line?.success) {
        throw new Error(`No "request completed" line for request ${id}`);
      }
      return line.data;
    });
  }

  /** Nothing logged so far contains the session token or any of `secrets`. */
  function expectNotLogged(...secrets: string[]): void {
    const log = output.join('');
    for (const secret of [sessionToken, ...secrets]) {
      expect(log).not.toContain(secret);
    }
  }

  it('keeps the session cookie, Authorization, a link secret and a search in the Referer out of the log', async () => {
    const referer = `${TEST_ADMIN_ORIGIN}/sites/${site.id}/leads?status=new&q=${SEARCH}&lead=abc`;
    await owner
      .get('/auth/me')
      .set('x-request-id', 'log-me')
      .set('Authorization', `Bearer ${AUTHORIZATION_SECRET}`)
      .set('Referer', referer)
      .expect(200);

    expect((await requestLine('log-signup')).res.headers['set-cookie']).toBe(CENSORED);
    expect((await requestLine('log-me')).req.headers).toMatchObject({
      cookie: CENSORED,
      authorization: CENSORED,
      referer: `${TEST_ADMIN_ORIGIN}/sites/${site.id}/leads?status=new&q=${REDACTED}&lead=abc`,
    });
    // The link's page sends the new account's password with the secret (ADR-026).
    expectNotLogged(AUTHORIZATION_SECRET, SEARCH, signupToken, signupAccount.password);
  });

  it('keeps the visitor address, user agent, channel signature and lead fields out of the log', async () => {
    const submission = submitLead(t, site.subdomain, leadBody(releaseId, LEAD), {
      ip: VISITOR_IP,
      userAgent: PHONE_UA,
    }).set('x-request-id', 'log-lead');
    const signature = submission.get(RENDERER_SIGNATURE_HEADER);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    await submission.expect(201);

    const line = await requestLine('log-lead');
    expect(line.res.statusCode).toBe(201);
    expect(line.req.headers).toMatchObject({
      [CLIENT_IP_HEADER]: CENSORED,
      [CLIENT_UA_HEADER]: CENSORED,
      [RENDERER_SIGNATURE_HEADER]: CENSORED,
    });
    expectNotLogged(VISITOR_IP, PHONE_UA, signature, ...Object.values(LEAD));
  });

  it('keeps the preview token out of the URL and route params in the log', async () => {
    const response = await owner
      .post(`/sites/${site.id}/pages/${pageId}/preview-links`, { kind: 'draft' })
      .expect(201);
    const token = previewLinkResponseSchema.parse(response.body).url.split('/_preview/')[1];
    if (token === undefined) {
      throw new Error('The preview link has no token');
    }
    await request(t.app.getHttpServer())
      .get(`/public/preview/${token}`)
      .set('x-request-id', 'log-preview')
      .expect(200);

    expect((await requestLine('log-preview')).req.url).toBe(`/public/preview/${REDACTED}`);
    expectNotLogged(token);
  });

  it('keeps a lead search out of the log, in the URL and query or in the body', async () => {
    await owner
      .get(`/sites/${site.id}/leads?q=${SEARCH}`)
      .set('x-request-id', 'log-search-url')
      .expect(422);
    await owner
      .post(`/sites/${site.id}/leads/search`, { q: SEARCH })
      .set('x-request-id', 'log-search')
      .expect(200);

    const inUrl = await requestLine('log-search-url');
    expect(inUrl.req.url).toBe(`/sites/${site.id}/leads?q=${REDACTED}`);
    expect(inUrl.req.query).toEqual({ q: REDACTED });
    expect((await requestLine('log-search')).res.statusCode).toBe(200);
    expectNotLogged(SEARCH);
  });

  // Last: from here on Nest's loggers write through pino, as `main.ts` sets it up.
  it('keeps the hash of an address out of an error it logs (ADR-018)', async () => {
    const email = 'loi-dem@smilecare.vn';
    const key = inviteLimitKeys(email, {
      workspaceId: new Types.ObjectId(workspaceId),
      siteId: new Types.ObjectId(site.id),
    }).address;
    const hash = /[0-9a-f]{64}$/.exec(key)?.[0];
    if (hash === undefined) {
      throw new Error(`The address counter ${key} holds no hash`);
    }
    // The database refuses a counter, naming its key: the 500 logs the error with it as the cause.
    const errmsg = `E11000 duplicate key error collection: lead_limits index: key_1 dup key: { key: "${key}" }`;
    const hit = vi.spyOn(t.app.get(LeadLimitsRepository), 'hit').mockRejectedValueOnce(
      new mongo.MongoServerError({
        message: errmsg,
        errmsg,
        code: 11000,
        keyPattern: { key: 1 },
        keyValue: { key },
      }),
    );
    t.app.useLogger(t.app.get(PinoNestLogger));
    try {
      await owner
        .post(`/sites/${site.id}/lead-recipients`, { email })
        .set('x-request-id', 'log-hash')
        .expect(500);
    } finally {
      hit.mockRestore();
    }

    const logged = await vi.waitFor(() => {
      const line = output
        .join('')
        .split('\n')
        .find((text) => text.includes('"Unhandled error"') && text.includes('log-hash'));
      if (line === undefined) {
        throw new Error('The 500 logged no error');
      }
      return line;
    });
    expect(logged).toContain(`recipient-invite:address:${HASH_PLACEHOLDER}`);
    expectNotLogged(hash);
  });

  it('logs and answers a 500 whose error refers back to itself through toJSON', async () => {
    // A value that writes itself as a fresh object holding the value again.
    const record = {
      id: 'vong-lap',
      toJSON(): unknown {
        return { id: record.id, record };
      },
    };
    // ProblemFilter logs the error as thrown; pino's standard serializer copies its fields.
    const list = vi
      .spyOn(t.app.get(LeadRecipientsService), 'list')
      .mockRejectedValueOnce(Object.assign(new Error('Listing failed'), { record }));
    t.app.useLogger(t.app.get(PinoNestLogger));
    try {
      const response = await owner
        .get(`/sites/${site.id}/lead-recipients`)
        .set('x-request-id', 'log-cycle')
        .expect(500);
      expect(response.headers['content-type']).toContain('application/problem+json');
    } finally {
      list.mockRestore();
    }

    const logged = await vi.waitFor(() => {
      const line = output
        .join('')
        .split('\n')
        .find((text) => text.includes('"Unhandled error"') && text.includes('log-cycle'));
      if (line === undefined) {
        throw new Error('The 500 logged no error');
      }
      return line;
    });
    expect(logged).toContain('vong-lap');
  });
  it('keeps the brief, the prompts and the AI’s answers out of the log (ADR-031)', async () => {
    const brief = {
      ...AI_BRIEF,
      product: 'Sản phẩm-bí-mật-trong-brief',
      differentiators: 'Thông-điệp-bí-mật-của-khách',
      existingContent: 'Nội-dung-bí-mật-đã-có',
    };
    const answer = 'Câu-trả-lời-bí-mật-của-AI';
    const fake = fakeAi(t);
    fake.respondWith((request) => {
      if (request.schema.name === 'section_hero') {
        // An adapter that kept the request on the error it threw, and its cause.
        throw Object.assign(
          new AiError('unavailable', 'The AI service answered HTTP 500', {
            status: 500,
            cause: Object.assign(new Error('upstream'), { output: request.prompt }),
          }),
          { request: { system: request.system, prompt: request.prompt } },
        );
      }
      if (request.schema.name === 'section_faq') {
        return {
          text: `{"heading": "${answer}", "items": "${answer}"}`,
          usage: { inputTokens: 1, outputTokens: 1 },
          truncated: false,
        };
      }
      return undefined;
    });
    t.app.useLogger(t.app.get(PinoNestLogger));
    try {
      const response = await postAiJob(owner, site.id, aiJobBody({ brief }))
        .set('x-request-id', 'log-ai')
        .expect(200);
      expect(finishedJob(streamEvents(response)).status).toBe('done');
    } finally {
      fake.reset();
    }

    expect((await requestLine('log-ai')).res.statusCode).toBe(200);
    const logged = await vi.waitFor(() => {
      const line = output
        .join('')
        .split('\n')
        .find((text) => text.includes('"AI section not written"'));
      if (line === undefined) {
        throw new Error('The failed section logged nothing');
      }
      return line;
    });
    expect(logged).toContain('"sectionType":"hero"');
    expect(logged).toContain(REDACTED);
    expectNotLogged(brief.product, brief.differentiators, brief.existingContent, answer);
  });

  it('keeps the assistant’s scope text, request and answers out of the log (ADR-031)', async () => {
    const heading = 'Tiêu-đề-bí-mật-chưa-lưu';
    const instruction = 'Yêu-cầu-bí-mật-cho-trợ-lý';
    const answer = 'Gợi-ý-bí-mật-của-AI';
    const hero = heroSection({ heading });
    const faq = sampleSection('faq');
    const fake = fakeAi(t);
    fake.respondWith((request) => {
      if (request.schema.name === 'section_hero') {
        throw Object.assign(
          new AiError('unavailable', 'The AI service answered HTTP 500', {
            status: 500,
            cause: Object.assign(new Error('upstream'), { output: request.prompt }),
          }),
          { request: { system: request.system, prompt: request.prompt } },
        );
      }
      return {
        text: JSON.stringify({
          heading: answer,
          items: [0, 1, 2].map(() => ({ question: `${answer}?`, answer })),
          review: [],
        }),
        usage: { inputTokens: 1, outputTokens: 1 },
        truncated: false,
      };
    });
    const page = await createPage(owner, site.id);
    try {
      const response = await postSuggestion(owner, site.id, page.page.id, {
        scope: { kind: 'page' },
        action: 'custom',
        instruction,
        sections: [scopeTextOf(hero), scopeTextOf(faq)],
      })
        .set('x-request-id', 'log-ai-assistant')
        .expect(200);
      expect(suggestionResultOf(response).charged).toBe(true);
    } finally {
      fake.reset();
    }

    expect((await requestLine('log-ai-assistant')).res.statusCode).toBe(200);
    const logged = await vi.waitFor(() => {
      const lines = output.join('').split('\n');
      const failed = lines.find((text) => text.includes('"AI suggestion not written"'));
      const ended = lines.find((text) => text.includes('"AI suggestion ended"'));
      if (failed === undefined || ended === undefined) {
        throw new Error('The suggestion logged no failure or no end');
      }
      return failed;
    });
    expect(logged).toContain('"target":"hero"');
    expect(logged).toContain(REDACTED);
    expectNotLogged(heading, instruction, answer);
  });
});
