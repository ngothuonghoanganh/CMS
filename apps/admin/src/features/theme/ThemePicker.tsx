'use client';

import { type ThemePresetId, themePresetIds } from '@plp/contracts';
import { themePresets } from '@plp/sections/schema';
import { RadioCardGroup } from '@plp/ui';
import { SchemeStrip } from './ThemeSwatches';

export interface ThemePickerProps {
  /** The chosen preset, or null while a form has none yet. */
  value: ThemePresetId | null;
  onChange: (value: ThemePresetId) => void;
  /** Read-only for editors: only the workspace owner changes the site theme (ADR-004). */
  disabled?: boolean | undefined;
  /** Defaults to "Giao diện site". */
  legend?: string | undefined;
  showLegend?: boolean | undefined;
  /** Radio group name, e.g. the form field it fills. */
  name?: string | undefined;
  /** Defaults to 220. */
  minColumnWidth?: number | undefined;
}

/**
 * The site theme presets as radio cards with their four color schemes: site creation, site
 * settings and the editor's theme dialog show the same picker.
 */
export function ThemePicker({
  value,
  onChange,
  disabled = false,
  legend,
  showLegend,
  name,
  minColumnWidth = 220,
}: ThemePickerProps) {
  return (
    <RadioCardGroup
      legend={legend ?? 'Giao diện site'}
      showLegend={showLegend}
      name={name}
      value={value}
      onChange={onChange}
      minColumnWidth={minColumnWidth}
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
