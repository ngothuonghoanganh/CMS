'use client';

import type { LeadFormViewProps } from '@plp/sections/react';
import { lazy, type ReactNode, Suspense } from 'react';

/**
 * The form's script (its checks and their schemas, about 40 KB) is downloaded only by pages that
 * show a form. Until it arrives, the form drawn on the server works without it (ADR-016).
 */
const LeadFormClient = lazy(() =>
  import('./LeadFormClient').then((module) => ({ default: module.LeadFormClient })),
);

export interface LeadFormSlotProps extends LeadFormViewProps {
  /** The same form drawn on the server: it posts to `/_lead` without JavaScript. */
  fallback: ReactNode;
}

export function LeadFormSlot({ fallback, ...view }: LeadFormSlotProps) {
  return (
    <Suspense fallback={fallback}>
      <LeadFormClient {...view} />
    </Suspense>
  );
}
