'use client';

import { createContext, useContext } from 'react';

/** Props a `Field` hands to its control so the label, help and errors are announced. */
export interface FieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
  'aria-required': true | undefined;
}

export type FieldTone = 'default' | 'warning' | 'danger';

export interface FieldContextValue {
  control: FieldControlProps;
  tone: FieldTone;
}

export const FieldContext = createContext<FieldContextValue | null>(null);

/** The surrounding Field's wiring, or `null` when the control is used on its own. */
export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext);
}

/** An explicit `invalid` prop wins over the surrounding Field's tone. */
export function toneOf(fieldTone: FieldTone | undefined, invalid: boolean): FieldTone {
  return invalid ? 'danger' : (fieldTone ?? 'default');
}

/** Joins id lists for `aria-describedby`; `undefined` when empty so the attribute is omitted. */
export function joinIds(
  ...ids: ReadonlyArray<string | false | null | undefined>
): string | undefined {
  const joined = ids.filter((id): id is string => typeof id === 'string' && id !== '').join(' ');
  return joined === '' ? undefined : joined;
}
