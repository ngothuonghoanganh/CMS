import { EMPTY_IMAGE, imageRefSchema, textSchema } from '@plp/contracts';
import { z } from 'zod';
import { defineSection } from '../define.js';

/**
 * Two photos compared, the "before" always first (ADR-007). Each caption says which one it is, so
 * the comparison does not rest on position alone.
 */
export const beforeAfterContentSchema = z.object({
  heading: textSchema(80),
  beforeImage: imageRefSchema,
  beforeCaption: textSchema(80),
  afterImage: imageRefSchema,
  afterCaption: textSchema(80),
  note: textSchema(160),
});
export type BeforeAfterContent = z.infer<typeof beforeAfterContentSchema>;

export const beforeAfterSection = defineSection<BeforeAfterContent>({
  type: 'before_after',
  label: 'Trước & sau',
  description: 'Kết quả thật qua hai ảnh so sánh.',
  category: 'social',
  contentSchema: beforeAfterContentSchema,
  variants: [
    {
      id: 'side_by_side',
      label: 'Trước & sau',
      description: 'Hai ảnh so sánh, có chú thích và mô tả ảnh.',
      // The photos are the whole content and phones always show "before" first.
      hasMedia: false,
      motion: { accents: ['lines', 'image'] },
    },
  ],
  defaultVariant: 'side_by_side',
  defaultColorScheme: 'light',
  singleton: false,
  fields: [
    {
      kind: 'text',
      key: 'heading',
      label: 'Tiêu đề',
      maxLength: 80,
      multiline: false,
      required: true,
    },
    {
      kind: 'image',
      key: 'beforeImage',
      label: 'Ảnh trước',
      required: true,
      recommendedSize: '1000 × 750 px',
    },
    {
      kind: 'text',
      key: 'beforeCaption',
      label: 'Chú thích ảnh trước',
      maxLength: 80,
      multiline: false,
      required: true,
    },
    {
      kind: 'image',
      key: 'afterImage',
      label: 'Ảnh sau',
      required: true,
      recommendedSize: '1000 × 750 px',
    },
    {
      kind: 'text',
      key: 'afterCaption',
      label: 'Chú thích ảnh sau',
      maxLength: 80,
      multiline: false,
      required: true,
    },
    {
      kind: 'text',
      key: 'note',
      label: 'Dòng lưu ý',
      help: 'Ví dụ: Kết quả có thể khác nhau tùy từng người.',
      maxLength: 160,
      multiline: false,
    },
  ],
  sampleContent: () => ({
    heading: 'Kết quả sau liệu trình',
    beforeImage: { ...EMPTY_IMAGE },
    beforeCaption: 'Trước khi bắt đầu',
    afterImage: { ...EMPTY_IMAGE },
    afterCaption: 'Sau khi hoàn thành',
    note: 'Kết quả có thể khác nhau tùy từng người.',
  }),
  summarize: (content) =>
    content.heading.trim() === '' ? 'Chưa có tiêu đề' : `“${content.heading}”`,
});
