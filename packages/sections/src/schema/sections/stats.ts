import { textSchema } from '@plp/contracts';
import { z } from 'zod';
import { defineSection } from '../define.js';

/** A few figures read at a glance: two to four (ADR-007, ADR-032). */
const STATS_MIN = 2;
const STATS_MAX = 4;
const VALUE_MAX = 12;

/**
 * One figure and what it counts. The figure is a fact only the business knows: it starts empty,
 * blocks publishing until filled in, and the AI never writes it (ADR-031).
 */
const statItemSchema = z.object({
  value: textSchema(VALUE_MAX),
  label: textSchema(60),
});

export const statsContentSchema = z.object({
  heading: textSchema(80),
  items: z.array(statItemSchema).min(STATS_MIN).max(STATS_MAX),
});
export type StatsContent = z.infer<typeof statsContentSchema>;

function stat(label: string) {
  return { value: '', label };
}

export const statsSection = defineSection<StatsContent>({
  type: 'stats',
  label: 'Số liệu nổi bật',
  description: 'Vài con số thật về bạn: số năm kinh nghiệm, số khách hàng, điểm đánh giá.',
  category: 'social',
  contentSchema: statsContentSchema,
  variants: [
    {
      id: 'row',
      label: 'Số liệu nổi bật',
      description: 'Các con số lớn xếp thành hàng, hai cột trên điện thoại.',
      hasMedia: false,
      motion: { grid: true, accents: ['lines', 'count'] },
    },
  ],
  defaultVariant: 'row',
  defaultColorScheme: 'soft',
  singleton: false,
  fields: [
    { kind: 'text', key: 'heading', label: 'Tiêu đề', maxLength: 80, multiline: false },
    {
      kind: 'list',
      key: 'items',
      label: 'Các số liệu',
      itemLabel: 'Số liệu',
      min: STATS_MIN,
      max: STATS_MAX,
      itemTitleKey: 'label',
      itemFields: [
        {
          kind: 'text',
          key: 'value',
          label: 'Con số',
          help: 'Số thật của bạn, ví dụ 15, 8.000+ hay 4,9/5.',
          placeholder: 'Ví dụ: 8.000+',
          maxLength: VALUE_MAX,
          multiline: false,
          required: true,
        },
        {
          kind: 'text',
          key: 'label',
          label: 'Ý nghĩa',
          placeholder: 'Ví dụ: khách hàng đã tin chọn',
          maxLength: 60,
          multiline: false,
          required: true,
        },
      ],
      newItem: () => stat('điều con số này nói'),
    },
  ],
  sampleContent: () => ({
    heading: 'Những con số nói thay chúng tôi',
    items: [
      stat('năm kinh nghiệm'),
      stat('khách hàng đã tin chọn'),
      stat('điểm đánh giá trung bình'),
    ],
  }),
  summarize: (content) =>
    content.heading.trim() === '' ? `${content.items.length} số liệu` : `“${content.heading}”`,
});
