/**
 * The deterministic icon contract shared by the editor projection and the
 * public renderer. Keeping path data framework agnostic prevents the Canvas
 * and runtime from silently drifting to different icon implementations.
 */
export const OPEN_COMPOSITION_ICON_PATHS = {
  'arrow-right': 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12.5 9.5 17 19 7.5',
  mail: 'M3 6.5 12 13l9-6.5M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  phone:
    'M7.2 3.5h2.2l1.1 4.1-1.9 1.5a14.2 14.2 0 0 0 5.3 5.3l1.5-1.9 4.1 1.1v2.2a2.1 2.1 0 0 1-2.3 2.1A15.8 15.8 0 0 1 4.1 5.8 2.1 2.1 0 0 1 6.2 3.5h1Z',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2-4.5-4.4 6.2-.9L12 3Z',
  heart:
    'M20.8 8.8c0 5.2-8.8 10-8.8 10s-8.8-4.8-8.8-10A4.8 4.8 0 0 1 12 6.5a4.8 4.8 0 0 1 8.8 2.3Z',
} as const;

export type OpenCompositionIconName = keyof typeof OPEN_COMPOSITION_ICON_PATHS;

export function openCompositionIconPath(value: unknown): string {
  return typeof value === 'string' && value in OPEN_COMPOSITION_ICON_PATHS
    ? OPEN_COMPOSITION_ICON_PATHS[value as OpenCompositionIconName]
    : OPEN_COMPOSITION_ICON_PATHS['arrow-right'];
}

export function isOpenCompositionIconName(
  value: unknown,
): value is OpenCompositionIconName {
  return typeof value === 'string' && value in OPEN_COMPOSITION_ICON_PATHS;
}
