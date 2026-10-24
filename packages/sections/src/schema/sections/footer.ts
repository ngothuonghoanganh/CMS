import { ctaSchema, textSchema } from '@plp/contracts';
import { z } from 'zod';
import { defineSection } from '../define.js';

export const FOOTER_LINKS_MAX = 6;

export const footerContentSchema = z.object({
  /** Empty means "use the site name". */
  businessName: textSchema(80),
  address: textSchema(200),
  phone: textSchema(30),
  hours: textSchema(80),
  links: z
    .array(z.object({ link: ctaSchema }))
    .min(0)
    .max(FOOTER_LINKS_MAX),
  copyright: textSchema(120),
});
export type FooterContent = z.infer<typeof footerContentSchema>;

export const footerSection = defineSection<FooterContent>({
  type: 'footer',
  label: 'Chân trang',
  description: 'Địa chỉ, liên hệ và liên kết chính sách ở cuối trang.',
  category: 'footer',
  contentSchema: footerContentSchema,
  variants: [
    {
      id: 'basic',
      label: 'Chân trang cơ bản',
      description: 'Địa chỉ, liên hệ, liên kết chính sách quyền riêng tư.',
      hasMedia: false,
    },
  ],
  defaultVariant: 'basic',
  defaultColorScheme: 'dark',
  singleton: true,
  position: 'last',
  fields: [
    {
      kind: 'text',
      key: 'businessName',
      label: 'Tên doanh nghiệp',
      help: 'Để trống để dùng tên site.',
      maxLength: 80,
      multiline: false,
    },
    { kind: 'text', key: 'address', label: 'Địa chỉ', maxLength: 200, multiline: true },
    { kind: 'text', key: 'phone', label: 'Số điện thoại', maxLength: 30, multiline: false },
    { kind: 'text', key: 'hours', label: 'Giờ làm việc', maxLength: 80, multiline: false },
    {
      kind: 'list',
      key: 'links',
      label: 'Liên kết',
      itemLabel: 'Liên kết',
      min: 0,
      max: FOOTER_LINKS_MAX,
      itemTitleKey: 'link',
      itemFields: [
        { kind: 'cta', key: 'link', label: 'Liên kết', labelMaxLength: 40, required: true },
      ],
      newItem: () => ({ link: { label: 'Liên kết mới', link: { kind: 'none' } } }),
    },
    { kind: 'text', key: 'copyright', label: 'Dòng bản quyền', maxLength: 120, multiline: false },
  ],
  sampleContent: () => ({
    businessName: '',
    address: 'Địa chỉ của bạn',
    phone: 'Số điện thoại',
    hours: 'Giờ làm việc',
    links: [],
    copyright: '',
  }),
  summarize: (content) =>
    content.address.trim() === '' ? 'Liên hệ · liên kết' : 'Địa chỉ · liên hệ',
});
