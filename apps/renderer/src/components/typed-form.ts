import { leadFormFieldNames as names } from '@plp/contracts';
import { leadFieldId } from '@plp/sections/react';

/*
 * What a visitor typed into the lead form drawn on the server before its script arrived (ADR-016).
 * React replaces that form with its own when the script loads, seconds later on a slow phone, and
 * the new one starts empty: what was typed, ticked and where the caret was carry over to it.
 */

/** The form of a lead form section: the server's until the client's replaces it, then that one. */
export function formOf(sectionId: string): HTMLFormElement | null {
  const field = document.getElementById(leadFieldId(sectionId, 'name'));
  return field instanceof HTMLInputElement ? field.form : null;
}

export interface TypedForm {
  /** Text fields by name. */
  values: Readonly<Record<string, string>>;
  /** Boxes by name. */
  checked: Readonly<Record<string, boolean>>;
  /** The field being typed in, and where its caret was. */
  focus: { name: string; start: number | null; end: number | null } | null;
}

/** Fields a person fills in; the hidden ones (release, submission) come with the page itself. */
const TYPED_FIELDS: ReadonlySet<string> = new Set([
  names.name,
  names.phone,
  names.email,
  names.message,
  names.consent,
  names.marketing,
  names.honeypot,
]);

/** Inputs whose caret can be placed: an email field has none (`setSelectionRange` refuses it). */
const CARET_TYPES: ReadonlySet<string> = new Set(['text', 'tel', 'search', 'url', 'password']);

type Field = HTMLInputElement | HTMLTextAreaElement;

function fieldsOf(form: HTMLFormElement): Field[] {
  return [...form.elements].filter(
    (element): element is Field =>
      (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
      TYPED_FIELDS.has(element.name),
  );
}

function isBox(field: Field): field is HTMLInputElement {
  return field instanceof HTMLInputElement && field.type === 'checkbox';
}

function hasCaret(field: Field): boolean {
  return field instanceof HTMLTextAreaElement || CARET_TYPES.has(field.type);
}

/** What the visitor did in `form`, or null when they did nothing yet. */
export function readTypedForm(form: HTMLFormElement | null): TypedForm | null {
  if (form === null) {
    return null;
  }
  const values: Record<string, string> = {};
  const checked: Record<string, boolean> = {};
  for (const field of fieldsOf(form)) {
    if (isBox(field)) {
      if (field.checked) {
        checked[field.name] = true;
      }
    } else if (field.value !== '') {
      values[field.name] = field.value;
    }
  }
  const active = form.ownerDocument.activeElement;
  const focused = fieldsOf(form).find((field) => field === active);
  const focus = focused
    ? {
        name: focused.name,
        start: hasCaret(focused) ? focused.selectionStart : null,
        end: hasCaret(focused) ? focused.selectionEnd : null,
      }
    : null;
  return Object.keys(values).length === 0 && Object.keys(checked).length === 0 && focus === null
    ? null
    : { values, checked, focus };
}

/** Puts what was typed into the form that replaced the server's, focus and caret included. */
export function writeTypedForm(form: HTMLFormElement | null, typed: TypedForm): void {
  if (form === null) {
    return;
  }
  for (const field of fieldsOf(form)) {
    if (isBox(field)) {
      field.checked = typed.checked[field.name] ?? field.checked;
    } else {
      field.value = typed.values[field.name] ?? field.value;
    }
  }
  const focus = typed.focus;
  const target =
    focus === null ? undefined : fieldsOf(form).find((field) => field.name === focus.name);
  if (focus !== null && target !== undefined) {
    target.focus();
    if (hasCaret(target) && focus.start !== null && focus.end !== null) {
      target.setSelectionRange(focus.start, focus.end);
    }
  }
}
