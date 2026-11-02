import { describe, expect, it } from 'vitest';
import { aiJobEventSchema, aiPageJobRequestSchema } from './ai.js';
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
