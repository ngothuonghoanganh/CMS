import { describe, expect, it } from 'vitest';
import {
  aiJobEventSchema,
  aiPageJobRequestSchema,
  aiSuggestionEventSchema,
  aiSuggestionRequestSchema,
  contentPathSchema,
} from './ai.js';
import { compositionSchema } from './composition.js';

const BRIEF = {
  product: 'Niềng răng trong suốt Invisalign',
  audience: 'Người đi làm 22–35 tuổi ở TP.HCM',
  goal: 'lead',
  differentiators: 'Bác sĩ nhiều năm kinh nghiệm chỉnh nha.',
  tone: 'friendly',
  language: 'vi',
} as const;

describe('the AI brief (ADR-031)', () => {
  it('needs the product, the audience and the message; pasted content is optional', () => {
    const parsed = aiPageJobRequestSchema.parse({
      title: 'Niềng răng trong suốt',
      slug: 'nieng-rang',
      brief: BRIEF,
      structure: [{ type: 'hero', variant: 'split' }],
    });
    expect(parsed.brief.existingContent).toBe('');

    const empty = aiPageJobRequestSchema.safeParse({
      title: 'Trang',
      slug: 'trang',
      brief: { ...BRIEF, product: '  ', audience: '', differentiators: '' },
      structure: [],
    });
    expect(empty.success).toBe(false);
    expect(empty.error?.issues.map((issue) => issue.message)).toEqual([
      'Nhập sản phẩm hoặc dịch vụ',
      'Nhập khách hàng mục tiêu',
      'Nhập điểm khác biệt và thông điệp chính',
      'Trang cần ít nhất một section',
    ]);
  });

  it('caps pasted content, which is text only', () => {
    const long = aiPageJobRequestSchema.safeParse({
      title: 'Trang',
      slug: 'trang',
      brief: { ...BRIEF, existingContent: 'a'.repeat(4001) },
      structure: [{ type: 'hero', variant: 'split' }],
    });
    expect(long.error?.issues[0]?.message).toBe('Tối đa 4000 ký tự');
  });

  it('lets the AI choose the motion unless the user picks a style (ADR-032)', () => {
    const request = {
      title: 'Trang',
      slug: 'trang',
      brief: BRIEF,
      structure: [{ type: 'hero', variant: 'split' }],
    };
    expect(aiPageJobRequestSchema.parse(request).motion).toBe('auto');
    expect(aiPageJobRequestSchema.parse({ ...request, motion: 'none' }).motion).toBe('none');
    expect(aiPageJobRequestSchema.parse({ ...request, motion: 'luxe' }).motion).toBe('luxe');
    expect(aiPageJobRequestSchema.safeParse({ ...request, motion: 'bounce' }).success).toBe(false);
  });

  it('reads one line of the progress stream', () => {
    expect(
      aiJobEventSchema.parse({ type: 'section', sectionId: 'abcdefgh1234', status: 'writing' }),
    ).toEqual({ type: 'section', sectionId: 'abcdefgh1234', status: 'writing' });
    expect(aiJobEventSchema.safeParse({ type: 'progress' }).success).toBe(false);
  });
});

describe('reviewPaths of a section (ADR-031)', () => {
  it('reads as empty in drafts and releases stored before it', () => {
    const parsed = compositionSchema.parse({
      version: 1,
      sections: [
        {
          id: 'abcdefgh1234',
          type: 'hero',
          variant: 'split',
          colorScheme: 'light',
          spacing: 'normal',
          visibility: { desktop: true, mobile: true },
          mobileOrder: 'auto',
          content: {},
          samplePaths: ['heading'],
        },
      ],
    });
    expect(parsed.sections[0]?.reviewPaths).toEqual([]);
  });
});

describe('a request to the assistant (ADR-031, board 21)', () => {
  const HERO = {
    id: 'abcdefgh1234',
    type: 'hero',
    variant: 'split',
    texts: { heading: 'Niềng răng trong suốt', 'primaryCta.label': 'Đặt lịch' },
  } as const;

  function messages(input: unknown): string[] {
    const parsed = aiSuggestionRequestSchema.safeParse(input);
    return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
  }

  it('takes a scope, an action and the scope’s text; the instruction is optional', () => {
    const parsed = aiSuggestionRequestSchema.parse({
      scope: { kind: 'section', sectionId: HERO.id },
      action: 'rewrite',
      sections: [HERO],
    });
    expect(parsed.instruction).toBe('');
    expect(
      messages({
        scope: { kind: 'field', sectionId: HERO.id, path: 'items.1.answer' },
        action: 'shorten',
        instruction: '  nhấn mạnh trả góp 0%  ',
        sections: [HERO],
      }),
    ).toEqual([]);
  });

  it('needs what each action needs', () => {
    const base = { scope: { kind: 'page' }, sections: [HERO] };
    expect(messages({ ...base, action: 'custom', instruction: '   ' })).toEqual([
      'Nhập yêu cầu cho trợ lý',
    ]);
    expect(messages({ ...base, action: 'change_tone' })).toEqual(['Chọn giọng văn']);
    expect(messages({ ...base, action: 'suggest_seo' })).toEqual(['Thiếu tiêu đề và mô tả SEO']);
    expect(
      messages({
        ...base,
        scope: { kind: 'section', sectionId: HERO.id },
        action: 'suggest_seo',
        seo: { title: '', description: '' },
      }),
    ).toEqual(['Gợi ý SEO dùng chữ của toàn trang']);
    expect(messages({ ...base, action: 'rewrite', instruction: 'a'.repeat(301) })).toEqual([
      'Tối đa 300 ký tự',
    ]);
  });

  it('accepts content paths only', () => {
    for (const path of ['heading', 'primaryCta.label', 'items.11.answer']) {
      expect(contentPathSchema.safeParse(path).success).toBe(true);
    }
    for (const path of ['', '.heading', 'items..title', '__proto__.x', 'heading;']) {
      expect(contentPathSchema.safeParse(path).success).toBe(false);
    }
  });

  it('reads the result line: changes, failed parts, whether a use was spent', () => {
    const line = {
      type: 'result',
      result: {
        changes: [
          {
            status: 'ok',
            sectionId: HERO.id,
            path: 'heading',
            before: 'Niềng răng trong suốt',
            after: 'Niềng răng không ai nhận ra',
            review: false,
          },
          {
            status: 'ok',
            sectionId: 'seo',
            path: 'title',
            before: '',
            after: 'Niềng răng',
            review: false,
          },
          {
            status: 'failed',
            sectionId: HERO.id,
            path: 'primaryCta.label',
            before: 'Đặt lịch',
            failure: 'ai_invalid_output',
          },
        ],
        charged: true,
        failure: null,
        usage: {
          enabled: true,
          month: '2026-11',
          limit: 100,
          used: 4,
          remaining: 96,
          resetsOn: '2026-12-01',
        },
      },
    };
    expect(aiSuggestionEventSchema.parse(line)).toEqual(line);
    expect(aiSuggestionEventSchema.parse({ type: 'heartbeat' })).toEqual({ type: 'heartbeat' });
  });
});
