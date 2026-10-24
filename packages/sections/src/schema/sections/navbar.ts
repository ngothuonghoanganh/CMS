import { ctaSchema, textSchema } from '@plp/contracts';
import { z } from 'zod';
import { defineSection } from '../define.js';

export const navbarContentSchema = z.object({
  /** Empty means "use the site name". */
  brandText: textSchema(40),
  showLogo: z.boolean(),
  cta: ctaSchema,
});
export type NavbarContent = z.infer<typeof navbarContentSchema>;

export const navbarSection = defineSection<NavbarContent>({
  type: 'navbar',
  label: 'Thanh điều hướng',
  description: 'Logo hoặc tên site và một nút kêu gọi ở đầu trang.',
  category: 'navigation',
  contentSchema: navbarContentSchema,
  variants: [
    {
      id: 'logo-cta',
      label: 'Logo · nút',
      description: 'Logo bên trái, một nút nổi bật bên phải.',
      hasMedia: false,
    },
  ],
  defaultVariant: 'logo-cta',
  defaultColorScheme: 'light',
  singleton: true,
  position: 'first',
  fields: [
    {
      kind: 'text',
      key: 'brandText',
      label: 'Tên hiển thị',
      help: 'Để trống để dùng tên site.',
      maxLength: 40,
      multiline: false,
    },
    { kind: 'boolean', key: 'showLogo', label: 'Hiện logo của site' },
    { kind: 'cta', key: 'cta', label: 'Nút', labelMaxLength: 30 },
  ],
  sampleContent: () => ({
    brandText: '',
    showLogo: true,
    cta: { label: 'Đặt lịch', link: { kind: 'none' } },
  }),
  summarize: (content) => {
    const brand = content.brandText.trim() === '' ? 'Logo' : content.brandText;
    return content.cta.label.trim() === '' ? brand : `${brand} · nút ${content.cta.label}`;
  },
});
