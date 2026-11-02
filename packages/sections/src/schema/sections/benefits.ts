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
const benefitIconLabels: Record<(typeof benefitIcons)[number], string> = {
  sparkles: 'Lấp lánh',
  shield: 'Khiên bảo vệ',
  clock: 'Đồng hồ',
  heart: 'Trái tim',
  star: 'Ngôi sao',
  check: 'Dấu tích',
  smile: 'Mặt cười',
  leaf: 'Chiếc lá',
};

/**
 * The alternating layout explains 2 to 6 points; the grid needs 3 to 6, and a process 3 to 5 steps
 * (ADR-007).
 */
const BENEFITS_MIN = 2;
const BENEFITS_GRID_MIN = 3;
const BENEFITS_MAX = 6;
const STEPS_MIN = 3;
const STEPS_MAX = 5;

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
    {
      id: 'steps',
      label: 'Quy trình 3 bước',
      description: 'Khách biết điều gì xảy ra sau khi đăng ký.',
      hasMedia: false,
      // The step number takes the place of the icon.
      hiddenFields: ['items.icon', 'items.image'],
      listMin: { items: STEPS_MIN },
      listMax: { items: STEPS_MAX },
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
      newItem: (variant) =>
        variant === 'steps'
          ? sampleItem('check', 'Bước tiếp theo', 'Một câu mô tả điều khách nhận được ở bước này.')
          : sampleItem('check', 'Lợi ích mới', 'Một câu mô tả ngắn về lợi ích này.'),
    },
  ],
  sampleContent: (variant) =>
    variant === 'steps'
      ? {
          heading: 'Bắt đầu chỉ với 3 bước',
          intro: '',
          items: [
            sampleItem('check', 'Để lại thông tin', 'Điền tên và số điện thoại, chỉ mất một phút.'),
            sampleItem(
              'check',
              'Nhận cuộc gọi tư vấn',
              'Chúng tôi gọi lại trong giờ làm việc để hiểu nhu cầu của bạn.',
            ),
            sampleItem(
              'check',
              'Bắt đầu sử dụng dịch vụ',
              'Chọn thời gian phù hợp và bắt đầu cùng chúng tôi.',
            ),
          ],
        }
      : {
          heading: 'Vì sao khách hàng chọn chúng tôi',
          intro: '',
          items: [
            sampleItem('sparkles', 'Lợi ích thứ nhất', 'Mô tả ngắn: điều khách hàng nhận được.'),
            sampleItem('shield', 'Lợi ích thứ hai', 'Mô tả ngắn: vì sao điều này quan trọng.'),
            sampleItem('clock', 'Lợi ích thứ ba', 'Mô tả ngắn: bạn khác đối thủ ở đâu.'),
          ],
        },
  summarize: (content) =>
    content.heading.trim() === '' ? `${content.items.length} lợi ích` : `“${content.heading}”`,
});
