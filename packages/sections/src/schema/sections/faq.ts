import { textSchema } from '@plp/contracts';
import { z } from 'zod';
import { defineSection } from '../define.js';

export const FAQ_MIN = 1;
export const FAQ_MAX = 12;

const faqItemSchema = z.object({
  question: textSchema(160),
  answer: textSchema(600),
});

export const faqContentSchema = z.object({
  heading: textSchema(80),
  items: z.array(faqItemSchema).min(FAQ_MIN).max(FAQ_MAX),
});
export type FaqContent = z.infer<typeof faqContentSchema>;

export const faqSection = defineSection<FaqContent>({
  type: 'faq',
  label: 'Câu hỏi thường gặp',
  description: 'Giải đáp thắc mắc trước khi khách hàng quyết định.',
  category: 'faq',
  contentSchema: faqContentSchema,
  variants: [
    {
      id: 'accordion',
      label: 'Hỏi đáp mở rộng',
      description: 'Câu hỏi bấm để mở, đọc được bằng bàn phím.',
      hasMedia: false,
    },
  ],
  defaultVariant: 'accordion',
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
      kind: 'list',
      key: 'items',
      label: 'Câu hỏi',
      itemLabel: 'Câu hỏi',
      min: FAQ_MIN,
      max: FAQ_MAX,
      itemTitleKey: 'question',
      itemFields: [
        {
          kind: 'text',
          key: 'question',
          label: 'Câu hỏi',
          maxLength: 160,
          multiline: false,
          required: true,
        },
        {
          kind: 'text',
          key: 'answer',
          label: 'Trả lời',
          maxLength: 600,
          multiline: true,
          required: true,
        },
      ],
      newItem: () => ({ question: 'Câu hỏi mới?', answer: 'Câu trả lời ngắn gọn, rõ ràng.' }),
    },
  ],
  sampleContent: () => ({
    heading: 'Câu hỏi thường gặp',
    items: [
      {
        question: 'Câu hỏi khách hàng hay hỏi nhất?',
        answer: 'Trả lời ngắn gọn, đi thẳng vào điều khách quan tâm.',
      },
      {
        question: 'Chi phí và thời gian như thế nào?',
        answer: 'Nêu rõ mức giá hoặc cách tính và thời gian dự kiến.',
      },
      {
        question: 'Tôi cần chuẩn bị gì?',
        answer: 'Liệt kê những gì khách cần mang theo hoặc chuẩn bị.',
      },
    ],
  }),
  summarize: (content) => `${content.items.length} câu hỏi`,
});
