import type { ReactNode } from 'react';

/** True when a slot would render something (React skips `undefined`, `null` and booleans). */
export function hasContent(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== true && node !== '';
}
