import { EMPTY_IMAGE, imageRefSchema, textSchema } from '@plp/contracts';
import { z } from 'zod';
import { defineSection } from '../define.js';

export const benefitIcons = [
  'sparkles',
  'shield',
  'clock',
  'heart',
  'star',
  'check',
  'smile',
  'leaf',
] as const;
export const benefitIconLabels: Record<(typeof benefitIcons)[number], string> = {
  sparkles: 'Lấp lánh',
  shield: 'Khiên bảo vệ',
  clock: 'Đồng hồ',
  heart: 'Trái tim',
  star: 'Ngôi sao',
  check: 'Dấu tích',
  smile: 'Mặt cười',
  leaf: 'Chiếc lá',
};

/** The alternating layout explains 2 to 6 points; the grid needs 3 to 6 (ADR-007). */
export const BENEFITS_MIN = 2;
export const BENEFITS_GRID_MIN = 3;
export const BENEFITS_MAX = 6;

const benefitItemSchema = z.object({
  icon: z.enum(benefitIcons),
  title: textSchema(60),
  description: textSchema(200),
  image: imageRefSchema,
});

export const benefitsContentSchema = z.object({
  heading: textSchema(80),
  intro: textSchema(240),
  items: z.array(benefitItemSchema).min(BENEFITS_MIN).max(BENEFITS_MAX),
});
export type BenefitsContent = z.infer<typeof benefitsContentSchema>;

function sampleItem(icon: (typeof benefitIcons)[number], title: string, description: string) {
  return { icon, title, description, image: { ...EMPTY_IMAGE } };
}

export const benefitsSection = defineSection<BenefitsContent>({
  type: 'benefits',
  label: 'Lợi ích',
  description: 'Vì sao khách hàng nên chọn bạn: biểu tượng, tiêu đề ngắn và một câu mô tả.',
  category: 'benefits',
  contentSchema: benefitsContentSchema,
  variants: [
    {
      id: 'grid',
      label: 'Lưới 3–6 lợi ích',
      description: 'Biểu tượng, tiêu đề ngắn và một câu mô tả.',
      hasMedia: false,
      hiddenFields: ['items.image'],
      listMin: { items: BENEFITS_GRID_MIN },
    },
    {
      id: 'alternate',
      label: 'Xen kẽ ảnh và chữ',
      description: 'Giải thích chi tiết từng điểm mạnh, mỗi điểm một ảnh.',
      hasMedia: true,
      hiddenFields: ['items.icon'],
    },
  ],
  defaultVariant: 'grid',
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
    { kind: 'text', key: 'intro', label: 'Giới thiệu', maxLength: 240, multiline: true },
    {
      kind: 'list',
      key: 'items',
      label: 'Các lợi ích',
      itemLabel: 'Lợi ích',
      min: BENEFITS_MIN,
      max: BENEFITS_MAX,
      itemTitleKey: 'title',
      itemFields: [
        {
          kind: 'select',
          key: 'icon',
          label: 'Biểu tượng',
          options: benefitIcons.map((icon) => ({ value: icon, label: benefitIconLabels[icon] })),
        },
        {
          kind: 'text',
          key: 'title',
          label: 'Tiêu đề',
          maxLength: 60,
          multiline: false,
          required: true,
        },
        { kind: 'text', key: 'description', label: 'Mô tả', maxLength: 200, multiline: true },
        { kind: 'image', key: 'image', label: 'Ảnh', recommendedSize: '1000 × 750 px' },
      ],
      newItem: () => sampleItem('check', 'Lợi ích mới', 'Một câu mô tả ngắn về lợi ích này.'),
    },
  ],
  sampleContent: () => ({
    heading: 'Vì sao khách hàng chọn chúng tôi',
    intro: '',
    items: [
      sampleItem('sparkles', 'Lợi ích thứ nhất', 'Mô tả ngắn: điều khách hàng nhận được.'),
      sampleItem('shield', 'Lợi ích thứ hai', 'Mô tả ngắn: vì sao điều này quan trọng.'),
      sampleItem('clock', 'Lợi ích thứ ba', 'Mô tả ngắn: bạn khác đối thủ ở đâu.'),
    ],
  }),
  summarize: (content) =>
    content.heading.trim() === '' ? `${content.items.length} lợi ích` : `“${content.heading}”`,
});
