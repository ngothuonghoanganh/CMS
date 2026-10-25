import { ctaSchema, textSchema } from '@plp/contracts';
import { z } from 'zod';
import { defineSection } from '../define.js';

export const ctaBandContentSchema = z.object({
  heading: textSchema(100),
  text: textSchema(240),
  cta: ctaSchema,
});
export type CtaBandContent = z.infer<typeof ctaBandContentSchema>;

export const ctaBandSection = defineSection<CtaBandContent>({
  type: 'cta_band',
  label: 'Dải kêu gọi hành động',
  description: 'Nhắc lại lời mời ở cuối trang.',
  category: 'cta',
  contentSchema: ctaBandContentSchema,
  variants: [
    {
      id: 'band',
      label: 'Dải kêu gọi',
      description: 'Nhắc lại lời mời ở cuối trang.',
      hasMedia: false,
    },
  ],
  defaultVariant: 'band',
  defaultColorScheme: 'brand',
  singleton: false,
  fields: [
    {
      kind: 'text',
      key: 'heading',
      label: 'Tiêu đề',
      maxLength: 100,
      multiline: false,
      required: true,
    },
    { kind: 'text', key: 'text', label: 'Mô tả', maxLength: 240, multiline: true },
    { kind: 'cta', key: 'cta', label: 'Nút', labelMaxLength: 40, required: true },
  ],
  sampleContent: () => ({
    heading: 'Sẵn sàng bắt đầu?',
    text: 'Một câu nhắc lại ưu đãi hoặc lý do nên hành động ngay hôm nay.',
    cta: { label: 'Liên hệ ngay', link: { kind: 'none' } },
  }),
  summarize: (content) =>
    content.heading.trim() === '' ? 'Chưa có tiêu đề' : `“${content.heading}”`,
});
