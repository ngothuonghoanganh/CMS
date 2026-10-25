import type { ColorSchemeId, ThemePresetId } from '@plp/contracts';

export interface ColorScheme {
  label: string;
  background: string;
  /** Cards and inputs sitting on the background. */
  surface: string;
  heading: string;
  text: string;
  muted: string;
  /** Primary buttons and icons. */
  accent: string;
  /** Text on `accent`. */
  accentText: string;
  link: string;
  border: string;
}

export interface ThemePreset {
  id: ThemePresetId;
  label: string;
  description: string;
  /** CSS font stacks; the apps load these fonts with next/font under the same variable names. */
  fonts: { heading: string; body: string };
  schemes: Record<ColorSchemeId, ColorScheme>;
}

const SANS = 'var(--font-be-vietnam-pro), system-ui, sans-serif';
const SERIF = 'var(--font-lora), Georgia, serif';

/**
 * Every pair a section draws (heading/text/muted/link on background and surface, accentText on
 * accent, accent against background and surface) meets WCAG AA; themes.spec.ts enforces it.
 */
export const themePresets: Record<ThemePresetId, ThemePreset> = {
  mint: {
    id: 'mint',
    label: 'Bạc hà',
    description: 'Xanh ngọc dịu, nhấn cam. Hợp y tế, chăm sóc sức khỏe, dịch vụ gia đình.',
    fonts: { heading: SANS, body: SANS },
    schemes: {
      light: {
        label: 'Sáng',
        background: '#FFFFFF',
        surface: '#F4FAF8',
        heading: '#0B2E2A',
        text: '#2D4A46',
        muted: '#4A6661',
        accent: '#0F5E55',
        accentText: '#FFFFFF',
        link: '#0F5E55',
        border: '#D3E5E1',
      },
      soft: {
        label: 'Bạc hà',
        background: '#EAF6F3',
        surface: '#FFFFFF',
        heading: '#0B2E2A',
        text: '#2D4A46',
        muted: '#45615C',
        accent: '#0F5E55',
        accentText: '#FFFFFF',
        link: '#0F5E55',
        border: '#BFE6DE',
      },
      brand: {
        label: 'Thương hiệu',
        background: '#0F5E55',
        surface: '#0B4740',
        heading: '#FFFFFF',
        text: '#E4EFEC',
        muted: '#CFE9E3',
        accent: '#F2A33A',
        accentText: '#0B2E2A',
        link: '#FFFFFF',
        border: '#2D6E64',
      },
      dark: {
        label: 'Tối',
        background: '#0B2E2A',
        surface: '#123B36',
        heading: '#FFFFFF',
        text: '#D3E5E1',
        muted: '#B9CFCA',
        accent: '#F2A33A',
        accentText: '#0B2E2A',
        link: '#FFFFFF',
        border: '#2D4A46',
      },
    },
  },
  indigo: {
    id: 'indigo',
    label: 'Chàm',
    description: 'Xanh chàm hiện đại, nhấn vàng. Hợp công nghệ, giáo dục, tư vấn.',
    fonts: { heading: SANS, body: SANS },
    schemes: {
      light: {
        label: 'Sáng',
        background: '#FFFFFF',
        surface: '#F5F6FF',
        heading: '#161A3A',
        text: '#383D5C',
        muted: '#565B78',
        accent: '#4338CA',
        accentText: '#FFFFFF',
        link: '#4338CA',
        border: '#DADCF2',
      },
      soft: {
        label: 'Oải hương',
        background: '#EEF0FF',
        surface: '#FFFFFF',
        heading: '#161A3A',
        text: '#383D5C',
        muted: '#50557A',
        accent: '#4338CA',
        accentText: '#FFFFFF',
        link: '#3730A3',
        border: '#C7CBFF',
      },
      brand: {
        label: 'Thương hiệu',
        background: '#3730A3',
        surface: '#2E2889',
        heading: '#FFFFFF',
        text: '#E6E7FF',
        muted: '#CDD0FF',
        accent: '#FFD166',
        accentText: '#1B1A33',
        link: '#FFFFFF',
        border: '#5B55C2',
      },
      dark: {
        label: 'Tối',
        background: '#15172B',
        surface: '#1E2140',
        heading: '#FFFFFF',
        text: '#D9DBF0',
        muted: '#B4B8D8',
        accent: '#A5ABF5',
        accentText: '#15172B',
        link: '#FFFFFF',
        border: '#343858',
      },
    },
  },
  sunset: {
    id: 'sunset',
    label: 'Hoàng hôn',
    description: 'Cam đất ấm áp, tiêu đề có chân. Hợp ẩm thực, làm đẹp, sự kiện.',
    fonts: { heading: SERIF, body: SANS },
    schemes: {
      light: {
        label: 'Sáng',
        background: '#FFFFFF',
        surface: '#FFF7F2',
        heading: '#3A1A12',
        text: '#5A3428',
        muted: '#6E4A3E',
        accent: '#B4441C',
        accentText: '#FFFFFF',
        link: '#A33D19',
        border: '#F1D9CD',
      },
      soft: {
        label: 'Đào',
        background: '#FFF1E8',
        surface: '#FFFFFF',
        heading: '#3A1A12',
        text: '#5A3428',
        muted: '#6B4538',
        accent: '#A33D19',
        accentText: '#FFFFFF',
        link: '#A33D19',
        border: '#F5CDB8',
      },
      brand: {
        label: 'Thương hiệu',
        background: '#A33D19',
        surface: '#8C3415',
        heading: '#FFFFFF',
        text: '#FFF1E8',
        muted: '#FFE0D0',
        accent: '#FFE3B3',
        accentText: '#3A1A12',
        link: '#FFFFFF',
        border: '#C2603A',
      },
      dark: {
        label: 'Tối',
        background: '#2B1510',
        surface: '#3A1F18',
        heading: '#FFFFFF',
        text: '#F3DDD4',
        muted: '#D9BCAF',
        accent: '#FF9F6E',
        accentText: '#2B1510',
        link: '#FFFFFF',
        border: '#4F2E25',
      },
    },
  },
};
