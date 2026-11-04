'use client';

import type { LeadFormViewProps } from '@plp/sections/react';
import { lazy, type ReactNode, Suspense, useLayoutEffect, useRef } from 'react';
import { formOf, readTypedForm, type TypedForm } from './typed-form';

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

/** What a visitor does in a form: typing, ticking, moving the caret or the focus. */
const TYPING_EVENTS = ['input', 'change', 'focusin', 'keyup', 'pointerup', 'selectionchange'];

export function LeadFormSlot({ fallback, ...view }: LeadFormSlotProps) {
  const typedRef = useRef<TypedForm | null>(null);

  // While the script loads, keep what the visitor does in the server's form: when the script
  // arrives, React takes that form off the page for its own without telling anything inside it.
  useLayoutEffect(() => {
    const serverForm = formOf(view.sectionId);
    if (serverForm === null) {
      return undefined;
    }
    const keep = () => {
      if (serverForm.isConnected) {
        typedRef.current = readTypedForm(serverForm);
      }
    };
    keep();
    const page = serverForm.ownerDocument;
    for (const type of TYPING_EVENTS) {
      page.addEventListener(type, keep, true);
    }
    return () => {
      for (const type of TYPING_EVENTS) {
        page.removeEventListener(type, keep, true);
      }
    };
  }, [view.sectionId]);

  return (
    <Suspense fallback={fallback}>
      <LeadFormClient {...view} typedRef={typedRef} />
    </Suspense>
  );
}
