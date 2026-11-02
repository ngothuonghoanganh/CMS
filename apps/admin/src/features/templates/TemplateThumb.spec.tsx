import { themePresets } from '@plp/sections/schema';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { summaryFixture } from './test-fixtures';
import { TemplateThumb } from './TemplateThumb';

describe('TemplateThumb', () => {
  it('draws one band per section in its scheme of the site’s theme, as one picture', () => {
    const { sections } = summaryFixture('nha-khoa-uu-dai');
    render(
      <TemplateThumb
        sections={sections}
        themePresetId="sunset"
        label="Bản xem thu nhỏ: Nha khoa"
      />,
    );
    const picture = screen.getByRole('img', { name: 'Bản xem thu nhỏ: Nha khoa' });
    const bands = picture.querySelectorAll<HTMLElement>('[data-type]');
    expect([...bands].map((band) => band.dataset['type'])).toEqual(
      sections.map((section) => section.type),
    );
    sections.forEach((section, index) => {
      expect(bands[index]?.style.getPropertyValue('--thumb-bg')).toBe(
        themePresets.sunset.schemes[section.colorScheme].background,
      );
    });
  });
});
