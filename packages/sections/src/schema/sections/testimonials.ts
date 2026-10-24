import { EMPTY_IMAGE, imageRefSchema, textSchema } from '@plp/contracts';
import { z } from 'zod';
import { defineSection } from '../define.js';

export const TESTIMONIALS_MIN = 1;
export const TESTIMONIALS_MAX = 6;

const testimonialSchema = z.object({
  quote: textSchema(300),
  name: textSchema(60),
  detail: textSchema(60),
  avatar: imageRefSchema,
});

export const testimonialsContentSchema = z.object({
  heading: textSchema(80),
  items: z.array(testimonialSchema).min(TESTIMONIALS_MIN).max(TESTIMONIALS_MAX),
});
export type TestimonialsContent = z.infer<typeof testimonialsContentSchema>;

function sampleItem(quote: string, name: string, detail: string) {
  return { quote, name, detail, avatar: { ...EMPTY_IMAGE } };
}

export const testimonialsSection = defineSection<TestimonialsContent>({
  type: 'testimonials',
  label: 'Cảm nhận khách hàng',
  description: 'Nhận xét thật từ khách hàng, có tên và ảnh.',
  category: 'social',
  contentSchema: testimonialsContentSchema,
  variants: [
    {
      id: 'cards',
      label: 'Nhận xét dạng thẻ',
      description: '1–6 nhận xét có tên và ảnh khách hàng.',
      hasMedia: false,
    },
    {
      id: 'quote',
      label: 'Trích dẫn nổi bật',
      description:
        'Một nhận xét lớn, phù hợp ngay trước lời kêu gọi. Chỉ hiển thị nhận xét đầu tiên.',
      hasMedia: false,
      hiddenFields: ['heading'],
    },
  ],
  defaultVariant: 'cards',
  defaultColorScheme: 'soft',
  singleton: false,
  fields: [
    { kind: 'text', key: 'heading', label: 'Tiêu đề', maxLength: 80, multiline: false },
    {
      kind: 'list',
      key: 'items',
      label: 'Nhận xét',
      itemLabel: 'Nhận xét',
      min: TESTIMONIALS_MIN,
      max: TESTIMONIALS_MAX,
      itemTitleKey: 'name',
      itemFields: [
        {
          kind: 'text',
          key: 'quote',
          label: 'Lời nhận xét',
          maxLength: 300,
          multiline: true,
          required: true,
        },
        {
          kind: 'text',
          key: 'name',
          label: 'Tên khách hàng',
          maxLength: 60,
          multiline: false,
          required: true,
        },
        {
          kind: 'text',
          key: 'detail',
          label: 'Thông tin thêm',
          help: 'Ví dụ: Quận 3, khách hàng từ 2024.',
          maxLength: 60,
          multiline: false,
        },
        { kind: 'image', key: 'avatar', label: 'Ảnh khách hàng', recommendedSize: '200 × 200 px' },
      ],
      newItem: () =>
        sampleItem('Nhận xét của khách hàng về trải nghiệm thực tế.', 'Tên khách hàng', ''),
    },
  ],
  sampleContent: () => ({
    heading: 'Khách hàng nói gì về chúng tôi',
    items: [
      sampleItem(
        'Nhận xét ngắn, cụ thể về kết quả khách hàng nhận được.',
        'Tên khách hàng',
        'Thông tin thêm',
      ),
      sampleItem(
        'Một nhận xét khác nói về trải nghiệm dịch vụ.',
        'Tên khách hàng',
        'Thông tin thêm',
      ),
      sampleItem('Nhận xét thứ ba giúp khách mới yên tâm hơn.', 'Tên khách hàng', 'Thông tin thêm'),
    ],
  }),
  summarize: (content) => `${content.items.length} nhận xét`,
});
