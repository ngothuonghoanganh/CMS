import type { AiSuggestionResult } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { makeStore } from '../test-fixtures';
import {
  acceptedChangesOf,
  actionBlockerOf,
  conflictOf,
  fieldLabelOf,
  mergeRetry,
  retryAskOf,
  runningLabelOf,
  scopeOptionsOf,
  scopeTextOf,
  scopeTitleOf,
  suggestionRequestOf,
} from './assistant-model';

const HERO = 'hero00000001';
const FAQ = 'faq000000001';
const NAVBAR = 'navbar000001';
const FOOTER = 'footer000001';

const USAGE = {
  enabled: true,
  month: '2026-11',
  limit: 100,
  used: 4,
  remaining: 96,
  resetsOn: '2026-12-01',
} as const;

function draftOf(store = makeStore()) {
  return store.getState().draft;
}

describe('the text a request carries (ADR-031)', () => {
  it('sends the scope’s section whole, with the text the AI may write only', () => {
    const draft = draftOf();
    const text = scopeTextOf(draft, {
      scope: { kind: 'field', sectionId: HERO, path: 'heading' },
      action: 'rewrite',
    });
    expect(text.seo).toBeNull();
    expect(text.sections).toHaveLength(1);
    const [hero] = text.sections;
    expect(hero).toMatchObject({ id: HERO, type: 'hero', variant: 'split' });
    expect(Object.keys(hero?.texts ?? {})).toEqual([
      'eyebrow',
      'heading',
      'subheading',
      'primaryCta.label',
    ]);
    // Where a button leads and the image never leave the editor this way.
    expect(JSON.stringify(text)).not.toMatch(/link|assetId|alt/);
  });

  it('sends every section of the page, and the SEO texts for “Gợi ý SEO”', () => {
    const store = makeStore();
    store.getState().updateSeo({ title: 'Niềng răng', description: 'Ưu đãi tháng 11' });
    const text = scopeTextOf(store.getState().draft, {
      scope: { kind: 'page' },
      action: 'suggest_seo',
    });
    expect(text.sections.map((section) => section.id)).toEqual([
      NAVBAR,
      HERO,
      'benefits0001',
      FAQ,
      FOOTER,
    ]);
    // The footer holds the business's own facts: nothing of it is the AI's.
    expect(text.sections[4]?.texts).toEqual({});
    expect(text.seo).toEqual({ title: 'Niềng răng', description: 'Ưu đãi tháng 11' });
    expect(
      suggestionRequestOf(
        { scope: { kind: 'page' }, action: 'suggest_seo', instruction: '' },
        text,
      ),
    ).toMatchObject({ seo: text.seo, instruction: '' });
  });

  it('sends what the editor holds now, unsaved changes included', () => {
    const store = makeStore();
    store.getState().updateContent(HERO, 'heading', 'Chưa lưu nhưng đang sửa');
    const text = scopeTextOf(store.getState().draft, {
      scope: { kind: 'section', sectionId: HERO },
      action: 'rewrite',
    });
    expect(text.sections[0]?.texts['heading']).toBe('Chưa lưu nhưng đang sửa');
    const request = suggestionRequestOf(
      {
        scope: { kind: 'section', sectionId: HERO },
        action: 'change_tone',
        tone: 'energetic',
        instruction: 'ngắn',
      },
      text,
    );
    expect(request).toMatchObject({ tone: 'energetic', instruction: 'ngắn' });
    expect(request).not.toHaveProperty('seo');
  });
});

describe('a scope that changed while the AI wrote', () => {
  it('compares the field of “Đoạn chữ” only', () => {
    const store = makeStore();
    const scope = { kind: 'field', sectionId: HERO, path: 'heading' } as const;
    const sent = scopeTextOf(store.getState().draft, { scope, action: 'rewrite' });
    store.getState().updateContent(HERO, 'subheading', 'Mô tả khác');
    expect(
      conflictOf(sent, scopeTextOf(store.getState().draft, { scope, action: 'rewrite' }), scope),
    ).toBeNull();
    store.getState().updateContent(HERO, 'heading', 'Tiêu đề khác');
    expect(
      conflictOf(sent, scopeTextOf(store.getState().draft, { scope, action: 'rewrite' }), scope),
    ).toEqual({ changed: [{ sectionId: HERO, path: 'heading' }] });
  });

  it('notices an edit, a new item, a new layout or a section gone in the scope', () => {
    const store = makeStore();
    const page = { kind: 'page' } as const;
    const sent = scopeTextOf(store.getState().draft, { scope: page, action: 'rewrite' });
    const now = () => scopeTextOf(store.getState().draft, { scope: page, action: 'rewrite' });
    expect(conflictOf(sent, now(), page)).toBeNull();
    store.getState().addListItem(FAQ, 'items');
    expect(conflictOf(sent, now(), page)?.changed).toEqual([
      { sectionId: FAQ, path: 'items.3.question' },
      { sectionId: FAQ, path: 'items.3.answer' },
    ]);
    store.getState().undo();
    store.getState().setVariant(HERO, 'centered');
    expect(conflictOf(sent, now(), page)?.changed).toContainEqual({
      sectionId: HERO,
      path: '@variant',
    });
    store.getState().undo();
    store.getState().removeSection(FAQ);
    expect(conflictOf(sent, now(), page)?.changed).toContainEqual({
      sectionId: FAQ,
      path: 'heading',
    });
  });
});

describe('what the panel calls things', () => {
  const sections = draftOf().composition.sections;

  it('names fields as the properties panel does', () => {
    expect(fieldLabelOf(sections, HERO, 'heading')).toBe('Tiêu đề');
    expect(fieldLabelOf(sections, HERO, 'primaryCta.label')).toBe('Nút chính');
    expect(fieldLabelOf(sections, FAQ, 'items.1.answer')).toBe('Câu hỏi 2 · Trả lời');
    expect(fieldLabelOf(sections, 'seo', 'title')).toBe('Tiêu đề SEO');
    expect(fieldLabelOf(sections, HERO, '@variant')).toBe('Bố cục');
  });

  it('says what runs on what', () => {
    expect(
      runningLabelOf('rewrite', scopeTitleOf(sections, { kind: 'section', sectionId: HERO })),
    ).toBe('Đang viết lại Hero…');
    expect(
      runningLabelOf(
        'shorten',
        scopeTitleOf(sections, { kind: 'field', sectionId: FAQ, path: 'items.0.answer' }),
      ),
    ).toBe('Đang rút gọn “Câu hỏi 1 · Trả lời” của Câu hỏi thường gặp…');
    expect(runningLabelOf('suggest_seo', 'trang')).toBe('Đang gợi ý SEO cho trang…');
  });
});

describe('what can be asked where', () => {
  const sections = draftOf().composition.sections;

  it('offers “Đoạn chữ” for the focused text of the selected section only', () => {
    const focused = { sectionId: HERO, path: 'heading' };
    expect(scopeOptionsOf(sections, HERO, focused).field.scope).toEqual({
      kind: 'field',
      sectionId: HERO,
      path: 'heading',
    });
    expect(scopeOptionsOf(sections, FAQ, focused).field.scope).toBeNull();
    // A link is not text the AI writes.
    expect(
      scopeOptionsOf(sections, HERO, { sectionId: HERO, path: 'primaryCta.link' }).field.scope,
    ).toBeNull();
    const none = scopeOptionsOf(sections, null, null);
    expect(none.section).toEqual({ scope: null, label: 'Section' });
    expect(none.page.scope).toEqual({ kind: 'page' });
    expect(scopeOptionsOf(sections, HERO, null).section.label).toBe('Section Hero');
  });

  it('says why an action cannot run in a scope', () => {
    const hero = { kind: 'section', sectionId: HERO } as const;
    expect(actionBlockerOf(sections, hero, 'rewrite')).toBeNull();
    expect(actionBlockerOf(sections, hero, 'suggest_seo')).toBe(
      'Chọn phạm vi Toàn trang để gợi ý SEO.',
    );
    expect(actionBlockerOf(sections, { kind: 'page' }, 'suggest_seo')).toBeNull();
    expect(actionBlockerOf(sections, { kind: 'page' }, 'write_section')).toBe(
      'Chọn phạm vi Section để viết nội dung cả section.',
    );
    expect(
      actionBlockerOf(sections, { kind: 'section', sectionId: NAVBAR }, 'suggest_heading'),
    ).toBe('Phạm vi này không có tiêu đề.');
    expect(
      actionBlockerOf(
        sections,
        { kind: 'field', sectionId: HERO, path: 'subheading' },
        'suggest_cta',
      ),
    ).toBe('Phạm vi này không có nút đang dùng.');
    expect(actionBlockerOf(sections, { kind: 'section', sectionId: FOOTER }, 'rewrite')).toMatch(
      /^AI không viết chữ ở phạm vi này/,
    );
  });
});

describe('the changes of an answer', () => {
  const result: AiSuggestionResult = {
    changes: [
      { status: 'ok', sectionId: HERO, path: 'heading', before: 'A', after: 'B', review: false },
      {
        status: 'ok',
        sectionId: HERO,
        path: 'subheading',
        before: 'C',
        after: 'Giảm 20%',
        review: true,
      },
      {
        status: 'failed',
        sectionId: HERO,
        path: 'primaryCta.label',
        before: 'D',
        failure: 'ai_invalid_output',
      },
      {
        status: 'ok',
        sectionId: 'seo',
        path: 'title',
        before: '',
        after: 'Tiêu đề',
        review: false,
      },
    ],
    charged: true,
    failure: null,
    usage: USAGE,
  };

  it('applies the good changes still ticked, never the failed parts', () => {
    expect(acceptedChangesOf(result, new Set([`${HERO}:heading`]))).toEqual([
      { sectionId: HERO, path: 'subheading', after: 'Giảm 20%', review: true },
      { sectionId: 'seo', path: 'title', after: 'Tiêu đề', review: false },
    ]);
  });

  it('retries one failed part alone, and puts it in place when it is written', () => {
    const ask = {
      scope: { kind: 'section', sectionId: HERO },
      action: 'write_section',
      instruction: 'x',
    } as const;
    const failed = result.changes[2];
    if (failed === undefined) {
      throw new Error('No failed change');
    }
    expect(retryAskOf(ask, failed)).toEqual({
      scope: { kind: 'field', sectionId: HERO, path: 'primaryCta.label' },
      action: 'rewrite',
      instruction: 'x',
    });
    expect(
      retryAskOf({ ...ask, action: 'suggest_seo' }, { ...failed, sectionId: 'seo', path: 'title' }),
    ).toMatchObject({
      scope: { kind: 'page' },
      action: 'suggest_seo',
    });
    const usage = { ...USAGE, used: 5, remaining: 95 };
    const merged = mergeRetry(result, `${HERO}:primaryCta.label`, {
      changes: [
        {
          status: 'ok',
          sectionId: HERO,
          path: 'primaryCta.label',
          before: 'D',
          after: 'Đặt lịch',
          review: false,
        },
      ],
      charged: true,
      failure: null,
      usage,
    });
    expect(merged.written).toBe(true);
    expect(merged.result.changes[2]).toMatchObject({ status: 'ok', after: 'Đặt lịch' });
    expect(merged.result.usage).toEqual(usage);
    const again = mergeRetry(result, `${HERO}:primaryCta.label`, {
      ...result,
      changes: [],
      charged: false,
      usage,
    });
    expect(again.written).toBe(false);
    expect(again.result.changes[2]?.status).toBe('failed');
  });
});
