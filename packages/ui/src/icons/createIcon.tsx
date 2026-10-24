import type { ReactNode } from 'react';

export interface IconProps {
  /** Rendered width and height in pixels. Defaults to 20. */
  size?: number | undefined;
  /** Stroke width in viewBox units (the viewBox is 24 × 24). */
  strokeWidth?: number | undefined;
  className?: string | undefined;
}

export interface IconComponent {
  (props: IconProps): ReactNode;
  displayName?: string;
}

interface IconOptions {
  /** Glyphs drawn with fill instead of stroke (dots). */
  filled?: boolean;
  strokeWidth?: number;
}

/**
 * Icons are decorative: they are always hidden from assistive technology. The control that holds
 * an icon carries the accessible name (visible text or `aria-label`).
 */
export function createIcon(
  displayName: string,
  glyph: ReactNode,
  options: IconOptions = {},
): IconComponent {
  const defaultStroke = options.strokeWidth ?? 1.8;
  const filled = options.filled ?? false;

  function Icon({ size = 20, strokeWidth = defaultStroke, className }: IconProps) {
    return (
      <svg
        aria-hidden="true"
        focusable="false"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? 'currentColor' : 'none'}
        stroke={filled ? 'none' : 'currentColor'}
        strokeWidth={filled ? undefined : strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        data-icon={displayName}
      >
        {glyph}
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}
