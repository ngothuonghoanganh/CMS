import type { IncomingMessage } from 'node:http';
import {
  AI_JOB_STREAM_TYPE,
  type AiJob,
  aiJobEventSchema,
  aiJobSchema,
  aiUsageSchema,
  pageListResponseSchema,
  problemSchema,
  type Site,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  AI_BRIEF,
  aiJobBody,
  fakeAi,
  finishedJob,
  Gate,
  postAiJob,
  postAiRetry,
  runAiJob,
  streamEvents,
  TestClock,
  untilAborted,
} from '../../../test/ai.js';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, signupInput, TestClient } from '../../../test/client.js';
import { createSecondInstance } from '../../../test/instances.js';
import { createLiveFormPage, insertLeads, storedLead } from '../../../test/leads.js';
import { getPage, uniqueSlug } from '../../../test/pages.js';
import { CONSENT_TEXTS, configurePrivacy, PRIVACY_SETTINGS } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { addMember, createSite } from '../../../test/resources.js';
import {
  FAKE_MOTION_ENTER,
  FAKE_MOTION_STYLE,
  type FakeAiTextModel,
} from './adapters/fake-ai-text-model.js';
import { AiClock } from './ai-quota.service.js';
import { AiError } from './ai-text-model.js';

const QUOTA = 5;

/** A workspace of its own, its owner and a site: each test counts its own uses. */
interface Owner {
  client: TestClient;
  workspaceId: string;
  site: Site;
  name: string;
  email: string;
}

describe('creating a page with AI (ADR-031)', () => {
  let t: TestApp;
  let fake: FakeAiTextModel;
  const clock = new TestClock();

  async function owner(): Promise<Owner> {
    const { client, workspaceId, me } = await signedUpClient(t.app);
    const site = await createSite(client, workspaceId);
    return { client, workspaceId, site, name: me.user.name, email: me.user.email };
  }

  async function usage(client: TestClient, siteId: string) {
    return aiUsageSchema.parse((await client.get(`/sites/${siteId}/ai/usage`).expect(200)).body);
  }

  async function job(client: TestClient, siteId: string, jobId: string) {
    return aiJobSchema.parse(
      (await client.get(`/sites/${siteId}/ai/page-jobs/${jobId}`).expect(200)).body,
    );
  }

  beforeAll(async () => {
    t = await createTestApp('plp_test_ai_jobs', {
      env: { AI_PROVIDER: 'fake', AI_MONTHLY_QUOTA: String(QUOTA) },
      override: (builder) => builder.overrideProvider(AiClock).useValue(clock),
    });
    fake = fakeAi(t);
  });

  beforeEach(() => {
    fake.reset();
    clock.at = null;
  });

  afterAll(async () => {
    await t.close();
  });

  it('streams each section, then creates the draft with the AI’s text', async () => {
    const { client, site } = await owner();
    const body = aiJobBody();
    const response = await postAiJob(client, site.id, body).expect(200);
    expect(response.headers['content-type']).toBe(`${AI_JOB_STREAM_TYPE}; charset=utf-8`);
    expect(response.headers['cache-control']).toBe('no-store, no-transform');

    const events = streamEvents(response);
    const [started] = events;
    if (started?.type !== 'started') {
      throw new Error('The stream did not start with the job');
    }
    // The footer holds only what the business knows: the AI leaves it to the user.
    expect(started.job.sections.map((section) => [section.type, section.status])).toEqual([
      ['navbar', 'queued'],
      ['hero', 'queued'],
      ['benefits', 'queued'],
      ['testimonials', 'queued'],
      ['faq', 'queued'],
      ['lead_form', 'queued'],
      ['footer', 'kept'],
    ]);
    const progress = events.filter((event) => event.type === 'section');
    expect(progress).toHaveLength(12);
    for (const section of started.job.sections.filter((item) => item.status === 'queued')) {
      expect(
        progress.filter((event) => event.sectionId === section.id).map((event) => event.status),
      ).toEqual(['writing', 'done']);
    }
    const ended = finishedJob(events);
    expect(ended).toMatchObject({ status: 'done', failure: null, retriesLeft: 2 });
    expect(ended.sections.map((section) => section.status)).toEqual([
      'done',
      'done',
      'done',
      'done',
      'done',
      'done',
      'kept',
    ]);
    if (ended.pageId === null) {
      throw new Error('The job created no draft');
    }

    const detail = await getPage(client, site.id, ended.pageId);
    expect(detail.page).toMatchObject({ title: body.title, slug: body.slug, goal: 'lead' });
    expect(detail.page.status.kind).toBe('draft');
    const sections = detail.draft.composition.sections;
    expect(sections.map((section) => section.id)).toEqual(ended.sections.map((item) => item.id));
    const hero = sections[1];
    expect(hero?.content).toMatchObject({
      heading: AI_BRIEF.product,
      // Where the button leads is the builder's, never the AI's: the form, as on goal pages.
      primaryCta: {
        label: 'Nhận tư vấn miễn phí',
        link: { kind: 'section', sectionId: sections[5]?.id },
      },
    });
    expect(hero?.samplePaths).toEqual([]);
    expect(hero?.reviewPaths).toEqual(['subheading']);
    // Real customers' words stay sample text; so does the footer.
    expect(sections[3]?.samplePaths).toContain('items.0.quote');
    expect(sections[6]?.samplePaths).toEqual(['address', 'phone', 'hours']);
    expect(detail.checks.warnings.map((item) => [item.code, item.target])).toEqual(
      expect.arrayContaining([
        ['ai_review', { kind: 'section', sectionId: hero?.id, fieldPath: 'subheading' }],
        [
          'sample_content',
          { kind: 'section', sectionId: sections[3]?.id, fieldPath: 'items.0.quote' },
        ],
      ]),
    );
    expect(await usage(client, site.id)).toMatchObject({ enabled: true, used: 1, remaining: 4 });
    // Saving is not publishing: the AI wrote a draft, nothing is live.
    expect(detail.page.liveRelease).toBeNull();
  });

  it('sends the AI the brief, the site name and the draft text, never personal data', async () => {
    const { client, workspaceId, site, name, email } = await owner();
    // A site with consent texts, a lead address and leads: none of it is the AI's.
    await configurePrivacy(client, site.id);
    await addConfirmedRecipient(t, client, site.id, 'nhan-lead-ai@smilecare.vn');
    const live = await createLiveFormPage(client, site.id, uniqueSlug('form'));
    await insertLeads(t, [
      storedLead({
        workspaceId,
        siteId: site.id,
        pageId: live.pageId,
        releaseId: live.published.release.id,
        name: 'Lê Mai Anh',
        phone: '+84987106223',
        email: 'mai.anh@gmail.com',
      }),
    ]);
    const existingContent = 'Bảng giá niềng răng trọn gói, có trả góp.';
    await runAiJob(client, site.id, aiJobBody({ brief: { ...AI_BRIEF, existingContent } }));

    // Six sections, then "AI chọn" of the motion.
    expect(fake.requests).toHaveLength(7);
    const sent = fake.requests.map((request) => `${request.system}\n${request.prompt}`).join('\n');
    for (const expected of [AI_BRIEF.product, AI_BRIEF.audience, site.name, existingContent]) {
      expect(sent).toContain(expected);
    }
    for (const personal of [
      'Lê Mai Anh',
      '+84987106223',
      '987106223',
      'mai.anh@gmail.com',
      'nhan-lead-ai@smilecare.vn',
      PRIVACY_SETTINGS.controllerName,
      PRIVACY_SETTINGS.requestEmail,
      PRIVACY_SETTINGS.policyUrl,
      CONSENT_TEXTS.requiredText,
      CONSENT_TEXTS.marketingText,
      name,
      email,
    ]) {
      expect(sent).not.toContain(personal);
    }
  });

  it('“AI chọn”: the AI picks the motion after the sections, for no more uses (ADR-032)', async () => {
    const { client, site } = await owner();
    const { job: ended } = await runAiJob(client, site.id, aiJobBody());
    expect(ended).toMatchObject({ status: 'done', failure: null });
    if (ended.pageId === null) {
      throw new Error('The job created no draft');
    }
    const motionRequests = fake.requests.filter((request) => request.schema.name === 'page_motion');
    expect(motionRequests).toHaveLength(1);
    expect(fake.requests.at(-1)?.schema.name).toBe('page_motion');
    // The brief and the sections' types and variants, nothing else.
    const [asked] = motionRequests;
    expect(asked?.prompt).toContain(AI_BRIEF.product);
    expect(asked?.prompt).toContain('3. Lợi ích (benefits, grid)');
    expect(asked?.prompt).not.toContain(site.name);

    const { composition } = (await getPage(client, site.id, ended.pageId)).draft;
    expect(composition.motion).toEqual({
      style: FAKE_MOTION_STYLE,
      level: 'mid',
      accents: {},
      reduceOnMobile: false,
    });
    // The first section the AI may change, after the navigation bar and the Hero.
    expect(composition.sections.map((section) => section.motion)).toEqual([
      undefined,
      undefined,
      { enter: FAKE_MOTION_ENTER },
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect((await usage(client, site.id)).used).toBe(1);
  });

  it('keeps the style it expected when the AI’s motion fails or is no choice', async () => {
    const { client, site } = await owner();
    // A dental clinic: "Tinh tế" suits its industry first (ADR-032).
    const expected = 'subtle';
    const answers: Array<() => never | { text: string }> = [
      () => {
        throw new AiError('timeout', 'The AI service did not answer within 60000 ms');
      },
      () => ({ text: '{"style": "none", "sections": []}' }),
      () => ({ text: 'Mượt mà' }),
    ];
    for (const answer of answers) {
      fake.respondWith((request) =>
        request.schema.name === 'page_motion'
          ? { ...answer(), usage: { inputTokens: 1, outputTokens: 1 }, truncated: false }
          : undefined,
      );
      const { job: ended } = await runAiJob(client, site.id, aiJobBody());
      // The motion never fails the job.
      expect(ended).toMatchObject({ status: 'done', failure: null });
      if (ended.pageId === null) {
        throw new Error('The job created no draft');
      }
      const { composition } = (await getPage(client, site.id, ended.pageId)).draft;
      expect(composition.motion?.style).toBe(expected);
      expect(composition.sections.every((section) => section.motion === undefined)).toBe(true);
    }
    // Not asked again: the motion has no retry.
    expect(fake.requests.filter((request) => request.schema.name === 'page_motion')).toHaveLength(
      3,
    );
    expect((await usage(client, site.id)).used).toBe(3);
  });

  it('asks no motion of the AI when the user picked a style', async () => {
    const { client, site } = await owner();
    for (const motion of ['luxe', 'none'] as const) {
      const { job: ended } = await runAiJob(client, site.id, aiJobBody({ motion }));
      if (ended.pageId === null) {
        throw new Error('The job created no draft');
      }
      const { composition } = (await getPage(client, site.id, ended.pageId)).draft;
      expect(composition.motion?.style).toBe(motion === 'none' ? undefined : motion);
      expect(composition.sections.every((section) => section.motion === undefined)).toBe(true);
    }
    expect(fake.requests.some((request) => request.schema.name === 'page_motion')).toBe(false);
    // A motion the contract does not know.
    const refused = await client
      .post(`/sites/${site.id}/ai/page-jobs`, { ...aiJobBody(), motion: 'bouncy' })
      .expect(422);
    expect(problemSchema.parse(refused.body)).toMatchObject({
      code: 'validation_failed',
      issues: [expect.objectContaining({ path: ['motion'] })],
    });
  });

  it('retries an answer the schema refuses once, telling the AI what was wrong', async () => {
    const { client, site } = await owner();
    const refused = 'Tiêu đề quá dài '.repeat(10);
    let heroAnswers = 0;
    fake.respondWith((request) => {
      if (request.schema.name !== 'section_hero') {
        return undefined;
      }
      heroAnswers += 1;
      return heroAnswers === 1
        ? {
            text: JSON.stringify({ heading: refused, review: [] }),
            usage: { inputTokens: 1, outputTokens: 1 },
            truncated: false,
          }
        : undefined;
    });
    const { job: ended } = await runAiJob(client, site.id);
    expect(ended.sections.every((section) => section.status !== 'failed')).toBe(true);
    const hero = fake.requests.filter((request) => request.schema.name === 'section_hero');
    expect(hero).toHaveLength(2);
    expect(hero[1]?.prompt).toContain('Your previous answer could not be used:');
    expect(hero[1]?.prompt).toContain('- eyebrow must be a string');
    expect(hero[1]?.prompt).not.toContain(refused);
  });

  it('opens a partial draft, retries the failed sections for no use, at most twice', async () => {
    const { client, site } = await owner();
    // The FAQ never gets an answer the schema takes.
    fake.respondWith((request) =>
      request.schema.name === 'section_faq'
        ? { text: '{"heading": 42}', usage: { inputTokens: 1, outputTokens: 1 }, truncated: false }
        : undefined,
    );
    const { job: partial } = await runAiJob(client, site.id);
    expect(partial).toMatchObject({ status: 'done', failure: 'ai_invalid_output', retriesLeft: 2 });
    const faq = partial.sections.find((section) => section.type === 'faq');
    expect(faq?.status).toBe('failed');
    if (partial.pageId === null || faq === undefined) {
      throw new Error('The partial job created no draft');
    }
    let detail = await getPage(client, site.id, partial.pageId);
    const faqSection = detail.draft.composition.sections.find((section) => section.id === faq.id);
    // Not written: it keeps its sample text, which the checklist reminds of.
    expect(faqSection?.samplePaths).toContain('items.0.answer');
    expect(fake.requests.filter((request) => request.schema.name === 'section_faq')).toHaveLength(
      2,
    );

    const again = finishedJob(
      streamEvents(await postAiRetry(client, site.id, partial.id).expect(200)),
    );
    expect(again).toMatchObject({ status: 'done', retriesLeft: 1 });
    expect(again.sections.find((section) => section.id === faq.id)?.status).toBe('failed');

    fake.respondWith(null);
    const written = finishedJob(
      streamEvents(await postAiRetry(client, site.id, partial.id).expect(200)),
    );
    expect(written).toMatchObject({ status: 'done', failure: null, retriesLeft: 0 });
    expect(written.sections.every((section) => section.status !== 'failed')).toBe(true);
    detail = await getPage(client, site.id, partial.pageId);
    expect(detail.draft.revision).toBe(1);
    const rewritten = detail.draft.composition.sections.find((section) => section.id === faq.id);
    expect(rewritten?.content['items']).toMatchObject([
      { question: 'Buổi tư vấn đầu tiên gồm những gì?' },
      { question: 'Tôi cần chuẩn bị gì trước khi đến?' },
      { question: 'Có thể đổi lịch hẹn không?' },
    ]);
    expect(rewritten?.samplePaths).toEqual([]);
    // The motion was chosen once, by the first run; "Thử lại" keeps it.
    expect(detail.draft.composition.motion?.style).toBe(FAKE_MOTION_STYLE);
    expect(fake.requests.filter((request) => request.schema.name === 'page_motion')).toHaveLength(
      1,
    );
    // Retries use nothing of the month.
    expect((await usage(client, site.id)).used).toBe(1);

    const exhausted = await postAiRetry(client, site.id, partial.id).expect(409);
    expect(problemSchema.parse(exhausted.body)).toMatchObject({
      code: 'conflict',
    });
  });

  it('does not retry into a draft edited since, and keeps the edit', async () => {
    const { client, site } = await owner();
    fake.respondWith((request) =>
      request.schema.name === 'section_faq'
        ? { text: 'không phải JSON', usage: { inputTokens: 1, outputTokens: 1 }, truncated: false }
        : undefined,
    );
    const { job: partial } = await runAiJob(client, site.id);
    if (partial.pageId === null) {
      throw new Error('No draft');
    }
    const detail = await getPage(client, site.id, partial.pageId);
    await client
      .put(`/sites/${site.id}/pages/${partial.pageId}/draft`, {
        baseRevision: detail.draft.revision,
        slug: detail.draft.slug,
        composition: detail.draft.composition,
        seo: detail.draft.seo,
      })
      .expect(200);
    const refused = await postAiRetry(client, site.id, partial.id).expect(409);
    expect(problemSchema.parse(refused.body).code).toBe('revision_conflict');
  });

  it('writes no draft and gives the use back when no section is written', async () => {
    const { client, site } = await owner();
    fake.respondWith(() => {
      throw new AiError('overloaded', 'The AI service answered HTTP 503', { status: 503 });
    });
    const body = aiJobBody();
    const { job: failed } = await runAiJob(client, site.id, body);
    expect(failed).toMatchObject({ status: 'failed', failure: 'ai_overloaded', pageId: null });
    expect(failed.sections.filter((section) => section.status === 'failed')).toHaveLength(6);
    const pages = pageListResponseSchema.parse(
      (await client.get(`/sites/${site.id}/pages`).expect(200)).body,
    );
    expect(pages.items.map((page) => page.slug)).not.toContain(body.slug);
    expect((await usage(client, site.id)).used).toBe(0);
    // No draft comes of it: its motion was not asked for.
    expect(fake.requests.some((request) => request.schema.name === 'page_motion')).toBe(false);
  });

  it('takes no more uses than the month has, whatever arrives at once', async () => {
    const { client, workspaceId, site } = await owner();
    const responses = await Promise.all(
      Array.from({ length: QUOTA + 3 }, () =>
        postAiJob(client, site.id, aiJobBody({ structure: [{ type: 'hero', variant: 'split' }] })),
      ),
    );
    expect(responses.filter((response) => response.status === 200)).toHaveLength(QUOTA);
    const refused = responses.filter((response) => response.status === 429);
    expect(refused).toHaveLength(3);
    for (const response of refused) {
      expect(problemSchema.parse(response.body)).toMatchObject({
        code: 'ai_quota_exhausted',
        title: `Workspace đã dùng hết ${QUOTA} lượt AI tháng này`,
      });
    }
    expect(await usage(client, site.id)).toMatchObject({ used: QUOTA, remaining: 0 });
    const jobs = await t
      .workspaceDb(workspaceId)
      .collection('ai_jobs')
      .countDocuments({ siteId: new Types.ObjectId(site.id) });
    expect(jobs).toBe(QUOTA);
  });

  it('counts uses per calendar month in Vietnam, giving one back to the month it came from', async () => {
    const { client, workspaceId, site } = await owner();
    // 23:59 on 30/11 in Vietnam.
    clock.at = new Date('2026-11-30T16:59:00.000Z');
    await runAiJob(client, site.id, aiJobBody({ structure: [{ type: 'hero', variant: 'split' }] }));
    expect(await usage(client, site.id)).toMatchObject({
      month: '2026-11',
      used: 1,
      resetsOn: '2026-12-01',
    });

    // A job reserved in November that only fails in December gives back November's use.
    const gate = new Gate();
    fake.respondWith(async () => {
      await gate.opened;
      throw new AiError('unavailable', 'The AI service could not be reached');
    });
    const pending = postAiJob(
      client,
      site.id,
      aiJobBody({ structure: [{ type: 'hero', variant: 'split' }] }),
    ).then((response) => response);
    // The first job asked for its section and its motion; the second has reserved its use once
    // it asks.
    await vi.waitFor(() => {
      expect(fake.requests).toHaveLength(3);
    });
    clock.at = new Date('2026-11-30T17:00:00.000Z');
    expect(await usage(client, site.id)).toMatchObject({
      month: '2026-12',
      used: 0,
      remaining: QUOTA,
      resetsOn: '2027-01-01',
    });
    gate.open();
    expect(finishedJob(streamEvents(await pending)).status).toBe('failed');
    const counters = await t
      .workspaceDb(workspaceId)
      .collection('ai_usage')
      .find({}, { projection: { _id: 0, month: 1, used: 1 } })
      .sort({ month: 1 })
      .toArray();
    // Reading December's usage creates no counter; only November's was ever taken.
    expect(counters).toEqual([{ month: '2026-11', used: 1 }]);
  });

  it('“Hủy” stops the job: no draft, the use given back', async () => {
    const { client, workspaceId, site } = await owner();
    fake.respondWith((_request, signal) => untilAborted(signal));
    const body = aiJobBody();
    const pending = postAiJob(client, site.id, body).then((response) => response);
    await vi.waitFor(() => {
      expect(fake.requests.length).toBeGreaterThan(0);
    });
    const [jobDoc] = await t
      .workspaceDb(workspaceId)
      .collection('ai_jobs')
      .find({ siteId: new Types.ObjectId(site.id) })
      .toArray();
    const jobId = String(jobDoc?._id);
    const cancelled = aiJobSchema.parse(
      (await client.post(`/sites/${site.id}/ai/page-jobs/${jobId}/cancel`).expect(200)).body,
    );
    expect(cancelled).toMatchObject({ status: 'cancelled', pageId: null, failure: null });
    const ended = finishedJob(streamEvents(await pending));
    expect(ended.status).toBe('cancelled');
    const pages = pageListResponseSchema.parse(
      (await client.get(`/sites/${site.id}/pages`).expect(200)).body,
    );
    expect(pages.items.map((page) => page.slug)).not.toContain(body.slug);
    expect((await usage(client, site.id)).used).toBe(0);
    // Cancelling again changes nothing.
    await client.post(`/sites/${site.id}/ai/page-jobs/${jobId}/cancel`).expect(200);
    expect((await usage(client, site.id)).used).toBe(0);
  });

  it('stops asking the AI once “Hủy” reached another instance (ADR-004)', async () => {
    const input = signupInput();
    const { client, workspaceId } = await signedUpClient(t.app, input);
    const site = await createSite(client, workspaceId);
    const second = await createSecondInstance(t);
    try {
      // The same person, whose next request went to another instance behind the load balancer.
      const elsewhere = new TestClient(second.app);
      await elsewhere
        .post('/auth/login', { email: input.email, password: input.password })
        .expect(200);
      const gate = new Gate();
      fake.respondWith(async () => {
        await gate.opened;
        return undefined;
      });
      const pending = postAiJob(client, site.id, aiJobBody()).then((response) => response);
      // Three sections are written at once; the other three wait for a slot.
      await vi.waitFor(() => {
        expect(fake.requests).toHaveLength(3);
      });
      const [jobDoc] = await t
        .workspaceDb(workspaceId)
        .collection('ai_jobs')
        .find({ siteId: new Types.ObjectId(site.id) })
        .toArray();
      const jobId = String(jobDoc?._id);
      const cancelled = aiJobSchema.parse(
        (await elsewhere.post(`/sites/${site.id}/ai/page-jobs/${jobId}/cancel`).expect(200)).body,
      );
      expect(cancelled).toMatchObject({ status: 'cancelled', pageId: null });
      gate.open();
      expect(finishedJob(streamEvents(await pending))).toMatchObject({
        status: 'cancelled',
        pageId: null,
      });
      // The run here learned of the cancel from its next write: no other section was asked for.
      expect(fake.requests).toHaveLength(3);
      expect((await usage(client, site.id)).used).toBe(0);
    } finally {
      await second.close();
    }
  });

  it('gives a stopped “Thử lại” its sections back to retry, the draft as it was', async () => {
    const { client, site } = await owner();
    const refused = new Set(['section_faq', 'section_benefits']);
    fake.respondWith((request) =>
      refused.has(request.schema.name)
        ? { text: 'không phải JSON', usage: { inputTokens: 1, outputTokens: 1 }, truncated: false }
        : undefined,
    );
    const { job: partial } = await runAiJob(client, site.id);
    const faq = partial.sections.find((section) => section.type === 'faq');
    const benefits = partial.sections.find((section) => section.type === 'benefits');
    if (partial.pageId === null || faq === undefined || benefits === undefined) {
      throw new Error('The partial job created no draft');
    }
    const before = await getPage(client, site.id, partial.pageId);

    // "Thử lại": the FAQ is written at once, the benefits until the run is stopped.
    fake.respondWith((request, signal) =>
      request.schema.name === 'section_benefits' ? untilAborted(signal) : undefined,
    );
    const pending = postAiRetry(client, site.id, partial.id).then((response) => response);
    const statusOf = (current: AiJob, id: string) =>
      current.sections.find((section) => section.id === id)?.status;
    await vi.waitFor(async () => {
      expect(statusOf(await job(client, site.id, partial.id), faq.id)).toBe('done');
    });
    const cancelled = aiJobSchema.parse(
      (await client.post(`/sites/${site.id}/ai/page-jobs/${partial.id}/cancel`).expect(200)).body,
    );
    // The FAQ this run wrote never reached the draft: it is to write again, like the benefits.
    expect(cancelled).toMatchObject({ status: 'done', pageId: partial.pageId, retriesLeft: 1 });
    expect(statusOf(cancelled, faq.id)).toBe('failed');
    expect(statusOf(cancelled, benefits.id)).toBe('failed');
    expect(finishedJob(streamEvents(await pending)).status).toBe('done');
    expect((await getPage(client, site.id, partial.pageId)).draft).toEqual(before.draft);

    fake.respondWith(null);
    const written = finishedJob(
      streamEvents(await postAiRetry(client, site.id, partial.id).expect(200)),
    );
    expect(written).toMatchObject({ status: 'done', failure: null, retriesLeft: 0 });
    expect(written.sections.every((section) => section.status !== 'failed')).toBe(true);
    const rewritten = await getPage(client, site.id, partial.pageId);
    expect(
      rewritten.draft.composition.sections.find((section) => section.id === faq.id)?.samplePaths,
    ).toEqual([]);
  });

  it('finishes the job when the client goes away: the draft is in the page list', async () => {
    const { client, site } = await owner();
    const gate = new Gate();
    fake.respondWith(async () => {
      await gate.opened;
      return undefined;
    });
    const body = aiJobBody();
    // The admin closes the tab after the first line: the connection goes, mid-stream.
    const response = await client
      .post(`/sites/${site.id}/ai/page-jobs`, body)
      .buffer(true)
      .parse((response, done) => {
        // Superagent hands its parser the Node response, typed as its own.
        const incoming = response as unknown as IncomingMessage;
        incoming.setEncoding('utf8');
        incoming.once('data', (chunk: string) => {
          done(null, chunk);
          incoming.destroy();
        });
      })
      .expect(200);
    const firstLine = z.string().parse(response.body).split('\n')[0] ?? '';
    const started = aiJobEventSchema.parse(JSON.parse(firstLine));
    if (started.type !== 'started') {
      throw new Error('The stream did not start with the job');
    }
    gate.open();
    const ended = await vi.waitFor(
      async () => {
        const current = await job(client, site.id, started.job.id);
        expect(current.status).toBe('done');
        return current;
      },
      { timeout: 10_000 },
    );
    const pages = pageListResponseSchema.parse(
      (await client.get(`/sites/${site.id}/pages`).expect(200)).body,
    );
    expect(pages.items.find((page) => page.id === ended.pageId)?.slug).toBe(body.slug);
  });

  it('ends a job past its deadline and gives its use back, when read and at startup', async () => {
    const { client, workspaceId, site } = await owner();
    const db = t.workspaceDb(workspaceId);
    const month = (await usage(client, site.id)).month;
    /** A job whose API stopped mid-run: running, its deadline passed, its use taken. */
    async function staleJob(): Promise<string> {
      await db.collection('ai_usage').updateOne(
        { workspaceId: new Types.ObjectId(workspaceId), month },
        {
          $inc: { used: 1 },
          $setOnInsert: { createdAt: new Date() },
          $set: { updatedAt: new Date() },
        },
        { upsert: true },
      );
      const now = Date.now();
      const inserted = await db.collection('ai_jobs').insertOne({
        workspaceId: new Types.ObjectId(workspaceId),
        siteId: new Types.ObjectId(site.id),
        createdBy: new Types.ObjectId(),
        title: 'Bị gián đoạn',
        slug: uniqueSlug('gian-doan'),
        brief: { ...AI_BRIEF, existingContent: '' },
        sections: [
          { id: 'abcdefgh1234', type: 'hero', variant: 'split', status: 'writing', failure: null },
        ],
        status: 'running',
        run: { id: 'run-of-a-stopped-api', deadline: new Date(now - 1000) },
        quota: { month, refunded: false },
        pageId: null,
        pageRevision: null,
        retries: 0,
        failure: null,
        createdAt: new Date(now - 600_000),
        updatedAt: new Date(now - 600_000),
        expiresAt: new Date(now + 86_400_000),
      });
      return inserted.insertedId.toHexString();
    }

    const read = await staleJob();
    expect((await usage(client, site.id)).used).toBe(0);
    expect(await job(client, site.id, read)).toMatchObject({
      status: 'failed',
      failure: 'interrupted',
      sections: [expect.objectContaining({ status: 'failed' })],
    });

    const swept = await staleJob();
    const second = await createSecondInstance(t);
    try {
      const stored = await db.collection('ai_jobs').findOne({ _id: new Types.ObjectId(swept) });
      expect(stored).toMatchObject({ status: 'failed', run: null, quota: { refunded: true } });
    } finally {
      await second.close();
    }
    expect((await usage(client, site.id)).used).toBe(0);
  });

  it('refuses a structure the registry refuses, a taken slug, and nothing to write', async () => {
    const { client, site } = await owner();
    const invalid = await postAiJob(
      client,
      site.id,
      aiJobBody({ structure: [{ type: 'hero', variant: 'nope' }] }),
    ).expect(422);
    expect(problemSchema.parse(invalid.body).issues).toEqual([
      {
        path: ['structure', 0, 'variant'],
        code: 'invalid_variant',
        message: 'Kiểu bố cục "nope" không có trong section Hero',
      },
    ]);
    const nothing = await postAiJob(
      client,
      site.id,
      aiJobBody({ structure: [{ type: 'footer', variant: 'basic' }] }),
    ).expect(422);
    expect(problemSchema.parse(nothing.body).issues?.[0]?.code).toBe('nothing_to_write');
    const { job: first } = await runAiJob(client, site.id, aiJobBody({ slug: 'trung-duong-dan' }));
    expect(first.status).toBe('done');
    const taken = await postAiJob(client, site.id, aiJobBody({ slug: 'trung-duong-dan' })).expect(
      409,
    );
    expect(problemSchema.parse(taken.body).code).toBe('slug_taken');
    expect((await usage(client, site.id)).used).toBe(1);
  });

  it('lets one person send 10 AI requests a minute', async () => {
    const { client, site } = await owner();
    const refusedStructure = aiJobBody({ structure: [{ type: 'hero', variant: 'nope' }] });
    for (let index = 0; index < 10; index += 1) {
      await postAiJob(client, site.id, refusedStructure).expect(422);
    }
    const limited = await postAiJob(client, site.id, aiJobBody()).expect(429);
    expect(problemSchema.parse(limited.body)).toMatchObject({
      code: 'rate_limited',
      title: 'Bạn gửi yêu cầu AI quá nhanh',
    });
    expect((await usage(client, site.id)).used).toBe(0);
  });

  it('keeps jobs in their workspace: another one finds nothing (404)', async () => {
    const a = await owner();
    const b = await owner();
    const { job: ended } = await runAiJob(a.client, a.site.id);
    for (const response of [
      await b.client.get(`/sites/${a.site.id}/ai/usage`),
      await postAiJob(b.client, a.site.id, aiJobBody()),
      await b.client.get(`/sites/${a.site.id}/ai/page-jobs/${ended.id}`),
      await b.client.get(`/sites/${b.site.id}/ai/page-jobs/${ended.id}`),
      await postAiRetry(b.client, b.site.id, ended.id),
      await b.client.post(`/sites/${b.site.id}/ai/page-jobs/${ended.id}/cancel`),
    ]) {
      expect(response.status).toBe(404);
    }
    // A's job lives in A's database only.
    expect(await t.workspaceDb(b.workspaceId).collection('ai_jobs').countDocuments()).toBe(0);
    expect(await t.connection.collection('ai_jobs').countDocuments()).toBe(0);
    expect((await usage(b.client, b.site.id)).used).toBe(0);
  });

  it('needs pages.edit on the site', async () => {
    const { workspaceId, site } = await owner();
    const viewer = await addMember(t, workspaceId, 'viewer');
    const refused = await postAiJob(viewer.client, site.id, aiJobBody()).expect(403);
    expect(problemSchema.parse(refused.body).code).toBe('forbidden');
    await viewer.client.get(`/sites/${site.id}/ai/usage`).expect(403);
    const contributor = await addMember(t, workspaceId, 'contributor');
    expect((await runAiJob(contributor.client, site.id)).job.status).toBe('done');
  });
});

describe('without an AI service (AI_PROVIDER=none)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_ai_none');
  });

  afterAll(async () => {
    await t.close();
  });

  it('says AI is not enabled and starts nothing', async () => {
    const { client, workspaceId } = await signedUpClient(t.app);
    const site = await createSite(client, workspaceId);
    expect(
      aiUsageSchema.parse((await client.get(`/sites/${site.id}/ai/usage`).expect(200)).body),
    ).toMatchObject({ enabled: false, used: 0, limit: 100 });
    const refused = await postAiJob(client, site.id, aiJobBody()).expect(409);
    expect(problemSchema.parse(refused.body)).toMatchObject({
      code: 'ai_disabled',
      title: 'AI chưa được bật',
    });
  });
});
