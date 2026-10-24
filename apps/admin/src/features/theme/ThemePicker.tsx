'use client';

import { type ThemePresetId, themePresetIds } from '@plp/contracts';
import { themePresets } from '@plp/sections/schema';
import { RadioCardGroup } from '@plp/ui';
import { SchemeStrip } from './ThemeSwatches';

export interface ThemePickerProps {
  value: ThemePresetId;
  onChange: (value: ThemePresetId) => void;
  /** Read-only for editors: only the workspace owner changes the site theme (ADR-004). */
  disabled?: boolean | undefined;
  /** Defaults to "Giao diện site". */
  legend?: string | undefined;
}

/** The site theme presets as radio cards with their four color schemes. */
export function ThemePicker({ value, onChange, disabled = false, legend }: ThemePickerProps) {
  return (
    <RadioCardGroup
      legend={legend ?? 'Giao diện site'}
      value={value}
      onChange={onChange}
      minColumnWidth={220}
      options={themePresetIds.map((id) => ({
        value: id,
        label: themePresets[id].label,
        description: themePresets[id].description,
        preview: <SchemeStrip themePresetId={id} />,
        disabled,
      }))}
    />
  );
}
