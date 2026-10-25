'use client';

import { type MouseEvent, useState } from 'react';
import type { z } from 'zod';

export type FieldErrors<F extends string> = Partial<Record<F, string>>;

export type ValidationResult<F extends string, Output> =
  { ok: true; data: Output } | { ok: false; errors: FieldErrors<F> };

export interface SchemaForm<F extends string, Output> {
  values: Record<F, string>;
  errors: FieldErrors<F>;
  /** Updates a value; a field that already shows an error is re-checked as the user fixes it. */
  setValue: (field: F, value: string) => void;
  /** Checks one field when it loses focus. */
  blur: (field: F) => void;
  /** Checks every field, shows the problems and returns the parsed values. */
  validate: () => ValidationResult<F, Output>;
  /** Shows field errors from the server (`ApiError.fieldErrors()`); unknown keys are ignored. */
  setServerErrors: (errors: Readonly<Record<string, string>>) => void;
}

/** The first message of a value checked against one field schema. */
export function fieldError(schema: z.ZodType, value: unknown): string | undefined {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

function withError<F extends string>(
  errors: FieldErrors<F>,
  field: F,
  message: string | undefined,
): FieldErrors<F> {
  if (errors[field] === message) {
    return errors;
  }
  const next: FieldErrors<F> = {};
  for (const [key, value] of Object.entries(errors) as Array<[F, string | undefined]>) {
    if (key !== field && value !== undefined) {
      next[key] = value;
    }
  }
  if (message !== undefined) {
    next[field] = message;
  }
  return next;
}

/**
 * Form state validated with a contract schema, so the form shows the same Vietnamese messages as
 * the API: on blur, on submit, and live while a shown error is being fixed.
 */
export function useSchemaForm<Shape extends Record<string, z.ZodType>>(
  schema: z.ZodObject<Shape>,
  initialValues: Record<Extract<keyof Shape, string>, string>,
): SchemaForm<Extract<keyof Shape, string>, z.output<z.ZodObject<Shape>>> {
  type Field = Extract<keyof Shape, string>;
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const fields = Object.keys(initialValues) as Field[];

  function check(field: Field, value: string): string | undefined {
    const fieldSchema = schema.shape[field];
    if (fieldSchema === undefined) {
      throw new Error(`Field "${field}" is not part of the form schema`);
    }
    return fieldError(fieldSchema, value);
  }

  return {
    values,
    errors,
    setValue(field, value) {
      setValues((current) => ({ ...current, [field]: value }));
      setErrors((current) =>
        current[field] === undefined ? current : withError(current, field, check(field, value)),
      );
    },
    blur(field) {
      setErrors((current) => withError(current, field, check(field, values[field])));
    },
    validate() {
      const result = schema.safeParse(values);
      if (result.success) {
        setErrors({});
        return { ok: true, data: result.data };
      }
      let next: FieldErrors<Field> = {};
      for (const issue of result.error.issues) {
        const field = fields.find((name) => name === issue.path[0]);
        if (field !== undefined && next[field] === undefined) {
          next = withError(next, field, issue.message);
        }
      }
      setErrors(next);
      return { ok: false, errors: next };
    },
    setServerErrors(serverErrors) {
      setErrors((current) => {
        let next = current;
        for (const field of fields) {
          const message = serverErrors[field];
          if (message !== undefined) {
            next = withError(next, field, message);
          }
        }
        return next;
      });
    },
  };
}

/** The first field, in form order, that has an error; used to move focus after submit. */
export function firstInvalidField<F extends string>(
  order: readonly F[],
  errors: FieldErrors<F>,
): F | undefined {
  return order.find((field) => errors[field] !== undefined);
}

/**
 * `onMouseDown` of a submit button below fields checked on blur. Pressing it would first move
 * focus out of the field being edited, and the message that check shows can push the button away
 * from the pointer before the click lands, so the form would not submit. Keeping focus in place
 * lets the click submit; the submit checks every field anyway. Keyboard use is unaffected.
 */
export function keepFieldFocus(event: MouseEvent<HTMLElement>): void {
  event.preventDefault();
}
