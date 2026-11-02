import {
  AI_JOB_STREAM_TYPE,
  type AiSuggestionChange,
  type AiSuggestionRequest,
  aiUsageSchema,
  problemSchema,
  type SectionInstance,
  type Site,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeAi,
  postSuggestion,
  scopeTextOf,
  suggest,
  suggestionResultOf,
  untilAborted,
} from '../../../test/ai.js';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import {
  cleanSeo,
  composition,
  heroSection,
  leadFormSection,
  sampleSection,
} from '../../../test/compositions.js';
import { createLiveFormPage, insertLeads, storedLead } from '../../../test/leads.js';
import { createPage, getPage, replaceDraft, uniqueSlug } from '../../../test/pages.js';
import { CONSENT_TEXTS, configurePrivacy, PRIVACY_SETTINGS } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { addMember, createSite } from '../../../test/resources.js';
import type { FakeAiTextModel } from './adapters/fake-ai-text-model.js';
import { AiError } from './ai-text-model.js';

const QUOTA = 20;

/** A workspace of its own with a page of a Hero, an FAQ and a footer: each test counts its uses. */
interface Fixture {
  client: TestClient;
  workspaceId: string;
  site: Site;
  pageId: string;
  hero: SectionInstance;
  faq: SectionInstance;
  footer: SectionInstance;
  name: string;
  email: string;
}

function okChanges(changes: readonly AiSuggestionChange[]) {
  return changes.flatMap((change) => (change.status === 'ok' ? [change] : []));
}

describe('the assistant of the editor (ADR-031, board 21)', () => {
  let t: TestApp;
  let fake: FakeAiTextModel;

  async function fixture(): Promise<Fixture> {
    const { client, workspaceId, me } = await signedUpClient(t.app);
    const site = await createSite(client, workspaceId);
    const created = await createPage(client, site.id);
    const hero = heroSection({ heading: 'Niềng răng trong suốt Invisalign' });
    const faq = sampleSection('faq');
    const footer = sampleSection('footer');
    await replaceDraft(client, site.id, created.page.id, {
      slug: created.draft.slug,
      composition: composition([hero, faq, footer]),
      seo: cleanSeo(),
    });
    return {
      client,
      workspaceId,
      site,
      pageId: created.page.id,
      hero,
      faq,
      footer,
      name: me.user.name,
      email: me.user.email,
    };
  }

  async function usage(client: TestClient, siteId: string) {
    return aiUsageSchema.parse((await client.get(`/sites/${siteId}/ai/usage`).expect(200)).body);
  }

  function heroRewrite(f: Fixture): AiSuggestionRequest {
    return {
      scope: { kind: 'section', sectionId: f.hero.id },
      action: 'rewrite',
      sections: [scopeTextOf(f.hero)],
    };
  }

  beforeAll(async () => {
    t = await createTestApp('plp_test_ai_suggestions', {
      env: { AI_PROVIDER: 'fake', AI_MONTHLY_QUOTA: String(QUOTA) },
    });
    fake = fakeAi(t);
  });

  beforeEach(() => {
    fake.reset();
  });

  afterAll(async () => {
    await t.close();
  });

  it('suggests a section’s new text and leaves the draft as it is', async () => {
    const f = await fixture();
    const before = await getPage(f.client, f.site.id, f.pageId);
    const response = await postSuggestion(f.client, f.site.id, f.pageId, heroRewrite(f)).expect(
      200,
    );
    expect(response.headers['content-type']).toBe(`${AI_JOB_STREAM_TYPE}; charset=utf-8`);
    expect(response.headers['cache-control']).toBe('no-store, no-transform');

    const result = suggestionResultOf(response);
    expect(result).toMatchObject({ charged: true, failure: null, usage: { used: 1 } });
    expect(result.changes).toEqual([
      {
        status: 'ok',
        sectionId: f.hero.id,
        path: 'eyebrow',
        before: '',
        after: 'Tư vấn miễn phí',
        review: false,
      },
      expect.objectContaining({ path: 'heading', before: 'Niềng răng trong suốt Invisalign' }),
      // The fake states a figure and flags it, as the AI is told to.
      expect.objectContaining({ path: 'subheading', review: true }),
      expect.objectContaining({ path: 'primaryCta.label', after: 'Nhận tư vấn miễn phí' }),
    ]);
    // Saving is not the AI's: the draft and its revision did not move.
    const after = await getPage(f.client, f.site.id, f.pageId);
    expect(after.draft).toEqual(before.draft);
    expect(await usage(f.client, f.site.id)).toMatchObject({ used: 1, remaining: QUOTA - 1 });
  });

  it('writes what each scope and action asks for, one use each', async () => {
    const f = await fixture();
    const hero = scopeTextOf(f.hero);
    const faq = scopeTextOf(f.faq);
    const page = [hero, faq, scopeTextOf(f.footer)];
    // The fake writes the FAQ's sample heading as it is: no change there.
    const faqItems = [0, 1, 2].flatMap((index) =>
      [`items.${index}.question`, `items.${index}.answer`].map((path) => `${f.faq.id}:${path}`),
    );
    const cases: [AiSuggestionRequest, string[]][] = [
      [
        {
          scope: { kind: 'field', sectionId: f.faq.id, path: 'items.1.answer' },
          action: 'rewrite',
          sections: [faq],
        },
        [`${f.faq.id}:items.1.answer`],
      ],
      [
        {
          scope: { kind: 'section', sectionId: f.hero.id },
          action: 'suggest_heading',
          sections: [hero],
        },
        [`${f.hero.id}:heading`],
      ],
      [
        {
          scope: { kind: 'section', sectionId: f.hero.id },
          action: 'suggest_cta',
          sections: [hero],
        },
        [`${f.hero.id}:primaryCta.label`],
      ],
      [
        {
          scope: { kind: 'section', sectionId: f.hero.id },
          action: 'change_tone',
          tone: 'energetic',
          sections: [hero],
        },
        ['eyebrow', 'heading', 'subheading', 'primaryCta.label'].map(
          (path) => `${f.hero.id}:${path}`,
        ),
      ],
      [
        { scope: { kind: 'section', sectionId: f.faq.id }, action: 'shorten', sections: [faq] },
        faqItems,
      ],
      [
        {
          scope: { kind: 'section', sectionId: f.faq.id },
          action: 'write_section',
          sections: [faq],
        },
        faqItems,
      ],
      [
        {
          scope: { kind: 'page' },
          action: 'suggest_seo',
          sections: page,
          seo: { title: '', description: '' },
        },
        ['seo:title', 'seo:description'],
      ],
    ];
    let used = 0;
    for (const [body, expected] of cases) {
      const result = await suggest(f.client, f.site.id, f.pageId, body);
      expect(result.changes.every((change) => change.status === 'ok')).toBe(true);
      expect(result.changes.map((change) => `${change.sectionId}:${change.path}`)).toEqual(
        expected,
      );
      used += 1;
      expect(result).toMatchObject({ charged: true, usage: { used } });
    }

    // The whole page: one request per section with text, none for the footer; one use.
    fake.reset();
    const whole = await suggest(f.client, f.site.id, f.pageId, {
      scope: { kind: 'page' },
      action: 'custom',
      instruction: 'Nhấn mạnh trả góp 0%',
      sections: page,
    });
    expect(fake.requests.map((request) => request.schema.name)).toEqual([
      'section_hero',
      'section_faq',
    ]);
    expect(fake.requests.every((request) => request.prompt.includes('Nhấn mạnh trả góp 0%'))).toBe(
      true,
    );
    expect(new Set(whole.changes.map((change) => change.sectionId))).toEqual(
      new Set([f.hero.id, f.faq.id]),
    );
    expect(whole.usage.used).toBe(used + 1);
  });

  it('suggests from the text the editor holds, saved or not', async () => {
    const f = await fixture();
    const unsaved = { ...scopeTextOf(f.hero), texts: { heading: 'Chữ chưa lưu của bản nháp' } };
    await suggest(f.client, f.site.id, f.pageId, {
      scope: { kind: 'section', sectionId: f.hero.id },
      action: 'rewrite',
      sections: [unsaved],
    });
    expect(fake.requests[0]?.prompt).toContain('Chữ chưa lưu của bản nháp');
    expect(fake.requests[0]?.prompt).not.toContain('Niềng răng trong suốt Invisalign');
  });

  it('keeps what parsed, marks what did not, and retries once telling the AI what was wrong', async () => {
    const f = await fixture();
    const tooLong = 'Tiêu đề quá dài '.repeat(10);
    fake.respondWith(() => ({
      text: JSON.stringify({
        eyebrow: 'Ưu đãi tháng này',
        heading: tooLong,
        subheading: 'Bác sĩ theo dõi suốt liệu trình.',
        primaryCta: 'Đặt lịch tư vấn',
        review: [],
      }),
      usage: { inputTokens: 1, outputTokens: 1 },
      truncated: false,
    }));
    const result = await suggest(f.client, f.site.id, f.pageId, heroRewrite(f));
    expect(result.changes).toEqual([
      expect.objectContaining({ status: 'ok', path: 'eyebrow', after: 'Ưu đãi tháng này' }),
      expect.objectContaining({ status: 'failed', path: 'heading', failure: 'ai_invalid_output' }),
      expect.objectContaining({ status: 'ok', path: 'subheading' }),
    ]);
    expect(result).toMatchObject({ charged: true, failure: null, usage: { used: 1 } });
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[1]?.prompt).toContain('Your previous answer could not be used:');
    expect(fake.requests[1]?.prompt).toContain('- heading is longer than 80 characters');
    expect(fake.requests[1]?.prompt).not.toContain(tooLong);
  });

  it('spends no use when nothing came back: an invalid answer, an error, the same text', async () => {
    const f = await fixture();
    fake.respondWith(() => ({
      text: 'không phải JSON',
      usage: { inputTokens: 1, outputTokens: 1 },
      truncated: false,
    }));
    const invalid = await suggest(f.client, f.site.id, f.pageId, heroRewrite(f));
    expect(invalid).toMatchObject({ charged: false, failure: 'ai_invalid_output' });
    expect(invalid.changes.every((change) => change.status === 'failed')).toBe(true);
    expect(fake.requests).toHaveLength(2);

    fake.respondWith(() => {
      throw new AiError('overloaded', 'The AI service answered HTTP 503', { status: 503 });
    });
    const failed = await suggest(f.client, f.site.id, f.pageId, heroRewrite(f));
    expect(failed).toMatchObject({ charged: false, failure: 'ai_overloaded' });

    fake.respondWith(() => ({
      text: JSON.stringify({ text: f.hero.content['heading'], review: [] }),
      usage: { inputTokens: 1, outputTokens: 1 },
      truncated: false,
    }));
    const same = await suggest(f.client, f.site.id, f.pageId, {
      scope: { kind: 'field', sectionId: f.hero.id, path: 'heading' },
      action: 'rewrite',
      sections: [scopeTextOf(f.hero)],
    });
    expect(same).toEqual(expect.objectContaining({ changes: [], charged: false, failure: null }));
    expect(await usage(f.client, f.site.id)).toMatchObject({ used: 0, remaining: QUOTA });
  });

  it('gives the use back when the client goes away (“Hủy”)', async () => {
    const f = await fixture();
    let aborted = false;
    fake.respondWith((_request, signal) => {
      signal.addEventListener('abort', () => {
        aborted = true;
      });
      return untilAborted(signal);
    });
    const pending = postSuggestion(f.client, f.site.id, f.pageId, heroRewrite(f));
    // Superagent sends on `then`; the request is cut before any answer, so neither is awaited.
    pending.then(
      () => undefined,
      () => undefined,
    );
    await vi.waitFor(() => {
      expect(fake.requests).toHaveLength(1);
    });
    // Reserved before the AI was asked.
    expect((await usage(f.client, f.site.id)).used).toBe(1);
    pending.abort();
    await vi.waitFor(async () => {
      expect(aborted).toBe(true);
      expect((await usage(f.client, f.site.id)).used).toBe(0);
    });
  });

  it('refuses a path the AI may not write before reserving anything', async () => {
    const f = await fixture();
    const hero = scopeTextOf(f.hero);
    const link = await postSuggestion(f.client, f.site.id, f.pageId, {
      scope: { kind: 'section', sectionId: f.hero.id },
      action: 'rewrite',
      sections: [{ ...hero, texts: { ...hero.texts, 'primaryCta.link': 'https://example.com' } }],
    }).expect(422);
    expect(problemSchema.parse(link.body).issues).toEqual([
      {
        path: ['sections', 0, 'texts', 'primaryCta.link'],
        code: 'not_writable',
        message: 'AI không viết nội dung này',
      },
    ]);
    const footer = await postSuggestion(f.client, f.site.id, f.pageId, {
      scope: { kind: 'field', sectionId: f.footer.id, path: 'phone' },
      action: 'rewrite',
      sections: [scopeTextOf(f.footer)],
    }).expect(422);
    expect(problemSchema.parse(footer.body).issues?.[0]).toMatchObject({
      path: ['scope', 'path'],
      code: 'not_writable',
    });
    const testimonials = sampleSection('testimonials', 'cards');
    const quote = await postSuggestion(f.client, f.site.id, f.pageId, {
      scope: { kind: 'section', sectionId: testimonials.id },
      action: 'rewrite',
      sections: [
        {
          ...scopeTextOf(testimonials),
          texts: { heading: 'Khách nói gì', 'items.0.quote': 'Lời khách bịa ra' },
        },
      ],
    }).expect(422);
    expect(problemSchema.parse(quote.body).issues?.[0]?.code).toBe('not_writable');
    expect(fake.requests).toHaveLength(0);
    expect((await usage(f.client, f.site.id)).used).toBe(0);
  });

  it('sends the AI the scope’s text, the site’s and the page’s names, never personal data', async () => {
    const { client, workspaceId, me } = await signedUpClient(t.app);
    const site = await createSite(client, workspaceId);
    await configurePrivacy(client, site.id);
    await addConfirmedRecipient(t, client, site.id, 'nhan-lead-tro-ly@smilecare.vn');
    const live = await createLiveFormPage(client, site.id, uniqueSlug('form'));
    await insertLeads(t, [
      storedLead({
        workspaceId,
        siteId: site.id,
        pageId: live.pageId,
        releaseId: live.published.release.id,
        name: 'Trần Thu Hà',
        phone: '+84912345678',
        email: 'thu.ha@gmail.com',
      }),
    ]);
    const hero = heroSection({ ctaLink: { kind: 'phone', phone: '+84987654321' } });
    const form = leadFormSection();
    const page = await createPage(client, site.id);
    await replaceDraft(client, site.id, page.page.id, {
      slug: page.draft.slug,
      composition: composition([hero, form]),
      seo: cleanSeo(),
    });
    await suggest(client, site.id, page.page.id, {
      scope: { kind: 'page' },
      action: 'rewrite',
      sections: [scopeTextOf(hero), scopeTextOf(form)],
    });
    await suggest(client, site.id, page.page.id, {
      scope: { kind: 'page' },
      action: 'suggest_seo',
      sections: [scopeTextOf(hero), scopeTextOf(form)],
      seo: { title: '', description: '' },
    });
    expect(fake.requests).toHaveLength(3);
    const sent = fake.requests.map((request) => `${request.system}\n${request.prompt}`).join('\n');
    for (const expected of [site.name, page.page.title, String(hero.content['heading'])]) {
      expect(sent).toContain(expected);
    }
    for (const personal of [
      'Trần Thu Hà',
      '+84912345678',
      '912345678',
      'thu.ha@gmail.com',
      'nhan-lead-tro-ly@smilecare.vn',
      '+84987654321',
      PRIVACY_SETTINGS.controllerName,
      PRIVACY_SETTINGS.requestEmail,
      PRIVACY_SETTINGS.policyUrl,
      CONSENT_TEXTS.requiredText,
      CONSENT_TEXTS.marketingText,
      me.user.name,
      me.user.email,
    ]) {
      expect(sent).not.toContain(personal);
    }
  });

  it('refuses when the month’s uses are spent, telling when they come back', async () => {
    const f = await fixture();
    const month = (await usage(f.client, f.site.id)).month;
    await t
      .workspaceDb(f.workspaceId)
      .collection('ai_usage')
      .updateOne(
        { workspaceId: new Types.ObjectId(f.workspaceId), month },
        { $set: { used: QUOTA, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
    const refused = await postSuggestion(f.client, f.site.id, f.pageId, heroRewrite(f)).expect(429);
    expect(problemSchema.parse(refused.body)).toMatchObject({
      code: 'ai_quota_exhausted',
      context: { limit: QUOTA },
    });
    expect(fake.requests).toHaveLength(0);
  });

  it('lets one person send 10 AI requests a minute', async () => {
    const f = await fixture();
    const nothing: AiSuggestionRequest = {
      scope: { kind: 'section', sectionId: f.footer.id },
      action: 'rewrite',
      sections: [scopeTextOf(f.footer)],
    };
    for (let index = 0; index < 10; index += 1) {
      await postSuggestion(f.client, f.site.id, f.pageId, nothing).expect(422);
    }
    const limited = await postSuggestion(f.client, f.site.id, f.pageId, heroRewrite(f)).expect(429);
    expect(problemSchema.parse(limited.body)).toMatchObject({
      code: 'rate_limited',
      title: 'Bạn gửi yêu cầu AI quá nhanh',
    });
    expect((await usage(f.client, f.site.id)).used).toBe(0);
  });

  it('keeps suggestions in their workspace: another one finds nothing (404)', async () => {
    const a = await fixture();
    const b = await fixture();
    for (const response of [
      await postSuggestion(b.client, a.site.id, a.pageId, heroRewrite(a)),
      // B's own site with A's page: the page is looked for in B's site.
      await postSuggestion(b.client, b.site.id, a.pageId, heroRewrite(a)),
    ]) {
      expect(response.status).toBe(404);
    }
    expect(fake.requests).toHaveLength(0);
    expect((await usage(a.client, a.site.id)).used).toBe(0);
    expect((await usage(b.client, b.site.id)).used).toBe(0);
  });

  it('needs pages.edit on the site', async () => {
    const f = await fixture();
    const viewer = await addMember(t, f.workspaceId, 'viewer');
    const refused = await postSuggestion(viewer.client, f.site.id, f.pageId, heroRewrite(f)).expect(
      403,
    );
    expect(problemSchema.parse(refused.body).code).toBe('forbidden');
    const contributor = await addMember(t, f.workspaceId, 'contributor');
    const result = await suggest(contributor.client, f.site.id, f.pageId, heroRewrite(f));
    expect(okChanges(result.changes).length).toBeGreaterThan(0);
  });
});

describe('the assistant without an AI service (AI_PROVIDER=none)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_ai_suggest_none');
  });

  afterAll(async () => {
    await t.close();
  });

  it('says AI is not enabled and reserves nothing', async () => {
    const { client, workspaceId } = await signedUpClient(t.app);
    const site = await createSite(client, workspaceId);
    const page = await createPage(client, site.id);
    const hero = heroSection();
    const refused = await postSuggestion(client, site.id, page.page.id, {
      scope: { kind: 'section', sectionId: hero.id },
      action: 'rewrite',
      sections: [scopeTextOf(hero)],
    }).expect(409);
    expect(problemSchema.parse(refused.body)).toMatchObject({
      code: 'ai_disabled',
      title: 'AI chưa được bật',
    });
  });
});
