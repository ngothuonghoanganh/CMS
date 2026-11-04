/*
 * Two glyphs of boards 37–39 that @plp/ui has no icon for yet. Drawn like its icons (24 × 24,
 * hidden from assistive technology); the control that holds one carries the accessible name.
 */

interface GlyphProps {
  size?: number | undefined;
}

/** "▸" of "Xem thử" and "Xem thử tất cả". */
export function PlayIcon({ size = 14 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M7 4.5v15l12-7.5z" />
    </svg>
  );
}

/** "↻" of "Dùng lại cài đặt trang": the circle of HistoryIcon, without its hands. */
export function ResetIcon({ size = 13 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.5" />
      <path d="M4 4v4.5h4.5" />
    </svg>
  );
}
