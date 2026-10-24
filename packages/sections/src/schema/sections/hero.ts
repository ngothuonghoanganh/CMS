import { ctaSchema, EMPTY_IMAGE, imageRefSchema, textSchema } from '@plp/contracts';
import { z } from 'zod';
import { defineSection } from '../define.js';

export const heroContentSchema = z.object({
  eyebrow: textSchema(60),
  heading: textSchema(80),
  subheading: textSchema(240),
  primaryCta: ctaSchema,
  secondaryCta: ctaSchema,
  image: imageRefSchema,
});
export type HeroContent = z.infer<typeof heroContentSchema>;

export const heroSection = defineSection<HeroContent>({
  type: 'hero',
  label: 'Hero',
  description: 'Thông điệp chính đầu trang, kèm nút kêu gọi hành động.',
  category: 'hero',
  contentSchema: heroContentSchema,
  variants: [
    {
      id: 'split',
      label: 'Chữ · Ảnh',
      description: 'Tiêu đề, mô tả, 1–2 nút và ảnh bên cạnh.',
      hasMedia: true,
    },
    {
      id: 'centered',
      label: 'Căn giữa',
      description: 'Thông điệp ngắn, một nút nổi bật.',
      hasMedia: false,
      hiddenFields: ['image', 'secondaryCta'],
    },
    {
      id: 'background',
      label: 'Ảnh nền',
      description: 'Ảnh lớn phía sau, chữ đặt trên lớp phủ đủ tương phản.',
      hasMedia: true,
    },
  ],
  defaultVariant: 'split',
  defaultColorScheme: 'soft',
  singleton: false,
  fields: [
    { kind: 'text', key: 'eyebrow', label: 'Dòng nhỏ phía trên', maxLength: 60, multiline: false },
    {
      kind: 'text',
      key: 'heading',
      label: 'Tiêu đề',
      maxLength: 80,
      multiline: false,
      required: true,
    },
    { kind: 'text', key: 'subheading', label: 'Mô tả', maxLength: 240, multiline: true },
    { kind: 'cta', key: 'primaryCta', label: 'Nút chính', labelMaxLength: 40, required: true },
    { kind: 'cta', key: 'secondaryCta', label: 'Nút phụ', labelMaxLength: 40 },
    { kind: 'image', key: 'image', label: 'Ảnh', recommendedSize: '1200 × 900 px' },
  ],
  sampleContent: () => ({
    eyebrow: 'Ưu đãi trong tháng',
    heading: 'Tiêu đề nói rõ lợi ích lớn nhất cho khách hàng',
    subheading: 'Một hai câu giải thích bạn giúp khách hàng điều gì và vì sao nên chọn bạn.',
    primaryCta: { label: 'Đăng ký tư vấn', link: { kind: 'none' } },
    secondaryCta: { label: '', link: { kind: 'none' } },
    image: { ...EMPTY_IMAGE },
  }),
  summarize: (content) =>
    content.heading.trim() === '' ? 'Chưa có tiêu đề' : `“${content.heading}”`,
});
