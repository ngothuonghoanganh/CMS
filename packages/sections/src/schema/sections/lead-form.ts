import { textSchema } from '@plp/contracts';
import { z } from 'zod';
import { defineSection } from '../define.js';

/**
 * The lead form (ADR-016). Its fields are fixed: name and phone are always asked, email and a
 * message can be turned on and are then optional; there are no custom fields. The consent texts
 * are not content: they come from the site's settings, snapshotted by the release (ADR-017).
 */
export const leadFormContentSchema = z.object({
  heading: textSchema(100),
  description: textSchema(240),
  showEmail: z.boolean(),
  showMessage: z.boolean(),
  submitLabel: textSchema(40),
  successTitle: textSchema(80),
  successMessage: textSchema(240),
});
export type LeadFormContent = z.infer<typeof leadFormContentSchema>;

/** The questions a form asks, in order, as listed in the page structure. */
export function leadFormFieldLabels(content: Pick<LeadFormContent, 'showEmail' | 'showMessage'>) {
  return [
    'Họ và tên',
    'Số điện thoại',
    ...(content.showEmail ? ['Email'] : []),
    ...(content.showMessage ? ['Lời nhắn'] : []),
  ];
}

export const leadFormSection = defineSection<LeadFormContent>({
  type: 'lead_form',
  label: 'Form đăng ký',
  description: 'Mặc định Họ và tên + Số điện thoại, ô đồng ý không tick sẵn.',
  category: 'form',
  contentSchema: leadFormContentSchema,
  variants: [
    {
      id: 'stacked',
      label: 'Form đăng ký',
      description: 'Mặc định Họ và tên + Số điện thoại, ô đồng ý không tick sẵn.',
      hasMedia: false,
    },
  ],
  defaultVariant: 'stacked',
  defaultColorScheme: 'light',
  singleton: true,
  capturesLeads: true,
  fields: [
    {
      kind: 'text',
      key: 'heading',
      label: 'Tiêu đề',
      maxLength: 100,
      multiline: false,
      required: true,
    },
    { kind: 'text', key: 'description', label: 'Mô tả', maxLength: 240, multiline: true },
    {
      kind: 'boolean',
      key: 'showEmail',
      label: 'Hỏi email (không bắt buộc)',
      help: 'Họ và tên, số điện thoại luôn được hỏi.',
    },
    { kind: 'boolean', key: 'showMessage', label: 'Cho để lại lời nhắn (không bắt buộc)' },
    {
      kind: 'text',
      key: 'submitLabel',
      label: 'Chữ trên nút gửi',
      maxLength: 40,
      multiline: false,
      required: true,
    },
    {
      kind: 'text',
      key: 'successTitle',
      label: 'Tiêu đề sau khi gửi',
      maxLength: 80,
      multiline: false,
      required: true,
    },
    {
      kind: 'text',
      key: 'successMessage',
      label: 'Lời nhắn sau khi gửi',
      maxLength: 240,
      multiline: true,
    },
  ],
  sampleContent: () => ({
    heading: 'Đăng ký tư vấn miễn phí',
    description: 'Để lại tên và số điện thoại, chúng tôi sẽ gọi lại trong giờ làm việc.',
    showEmail: false,
    showMessage: false,
    submitLabel: 'Gửi đăng ký',
    successTitle: 'Đã nhận đăng ký của bạn',
    successMessage: 'Chúng tôi sẽ gọi lại cho bạn trong giờ làm việc.',
  }),
  summarize: (content) => leadFormFieldLabels(content).join(' · '),
});
