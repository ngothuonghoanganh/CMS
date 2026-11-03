import { phoneLinkSchema, textSchema, zaloLinkSchema } from '@plp/contracts';
import { z } from 'zod';
import { defineSection } from '../define.js';

const BUTTON_LABEL_MAX = 30;

/**
 * Call and chat without a form (ADR-007). Each button leads to one kind of link only, so a call
 * button can never open a web page; an unused button (empty label) is not shown, and publishing
 * needs at least one in use.
 */
export const quickContactContentSchema = z.object({
  heading: textSchema(80),
  text: textSchema(200),
  call: z.object({ label: textSchema(BUTTON_LABEL_MAX), link: phoneLinkSchema }),
  zalo: z.object({ label: textSchema(BUTTON_LABEL_MAX), link: zaloLinkSchema }),
});
export type QuickContactContent = z.infer<typeof quickContactContentSchema>;

export const quickContactSection = defineSection<QuickContactContent>({
  type: 'quick_contact',
  label: 'Gọi / Zalo nhanh',
  description: 'Hai nút liên hệ trực tiếp, không cần form.',
  category: 'form',
  contentSchema: quickContactContentSchema,
  variants: [
    {
      id: 'buttons',
      label: 'Gọi / Zalo nhanh',
      description: 'Hai nút liên hệ trực tiếp, không cần form.',
      hasMedia: false,
      motion: { accents: ['lines'] },
    },
  ],
  defaultVariant: 'buttons',
  defaultColorScheme: 'soft',
  singleton: false,
  oneButtonRequired: ['call', 'zalo'],
  fields: [
    {
      kind: 'text',
      key: 'heading',
      label: 'Tiêu đề',
      maxLength: 80,
      multiline: false,
      required: true,
    },
    { kind: 'text', key: 'text', label: 'Mô tả ngắn', maxLength: 200, multiline: true },
    {
      kind: 'cta',
      key: 'call',
      label: 'Nút gọi điện',
      labelMaxLength: BUTTON_LABEL_MAX,
      linkKinds: ['phone'],
    },
    {
      kind: 'cta',
      key: 'zalo',
      label: 'Nút Zalo',
      labelMaxLength: BUTTON_LABEL_MAX,
      linkKinds: ['zalo'],
    },
  ],
  sampleContent: () => ({
    heading: 'Cần tư vấn ngay?',
    text: 'Gọi điện hoặc nhắn Zalo, chúng tôi trả lời trong giờ làm việc.',
    call: { label: 'Gọi ngay', link: { kind: 'phone', phone: '' } },
    zalo: { label: 'Nhắn Zalo', link: { kind: 'zalo', phone: '' } },
  }),
  summarize: (content) =>
    content.heading.trim() === '' ? 'Chưa có tiêu đề' : `“${content.heading}”`,
});
