import { EMPTY_IMAGE, imageRefSchema, textSchema } from '@plp/contracts';
import { z } from 'zod';
import { defineSection } from '../define.js';

/** A row needs a few logos to read as one, and stays one or two rows (ADR-007). */
const LOGOS_MIN = 3;
const LOGOS_MAX = 12;
const LOGOS_SAMPLE = 4;

/** One partner: its logo, whose description is the partner's name. */
const logoItemSchema = z.object({ image: imageRefSchema });

export const logosContentSchema = z.object({
  heading: textSchema(80),
  items: z.array(logoItemSchema).min(LOGOS_MIN).max(LOGOS_MAX),
});
export type LogosContent = z.infer<typeof logosContentSchema>;

function emptyLogo() {
  return { image: { ...EMPTY_IMAGE } };
}

export const logosSection = defineSection<LogosContent>({
  type: 'logos',
  label: 'Logo đối tác',
  description: 'Đối tác và khách hàng tiêu biểu đã tin dùng bạn.',
  category: 'social',
  contentSchema: logosContentSchema,
  variants: [
    {
      id: 'row',
      label: 'Logo đối tác',
      description: 'Hàng logo đơn sắc, tự xuống dòng trên điện thoại.',
      // Logos are the whole content: there is no text beside them to reorder on phones.
      hasMedia: false,
      motion: { grid: true, accents: ['lines'] },
    },
  ],
  defaultVariant: 'row',
  defaultColorScheme: 'light',
  singleton: false,
  fields: [
    { kind: 'text', key: 'heading', label: 'Tiêu đề', maxLength: 80, multiline: false },
    {
      kind: 'list',
      key: 'items',
      label: 'Logo',
      itemLabel: 'Đối tác',
      min: LOGOS_MIN,
      max: LOGOS_MAX,
      itemTitleKey: 'image',
      itemFields: [
        {
          kind: 'image',
          key: 'image',
          label: 'Logo',
          required: true,
          recommendedSize: '400 × 160 px, nền trong suốt',
          altLabel: 'Tên đối tác',
          altPlaceholder: 'Ví dụ: Bệnh viện Hòa Bình',
        },
      ],
      newItem: emptyLogo,
    },
  ],
  sampleContent: () => ({
    heading: 'Đối tác đã tin dùng chúng tôi',
    items: Array.from({ length: LOGOS_SAMPLE }, emptyLogo),
  }),
  summarize: (content) =>
    content.heading.trim() === '' ? `${content.items.length} logo` : `“${content.heading}”`,
});
