'use client';

import {
  FormPropsSchema,
  ListPropsSchema,
  type ComponentPropertyDefinition,
  type FormField,
  type FormProps,
  type ListProps,
} from '@payload/contracts';
import { SelectField, TextAreaField, TextField } from '../../app/ui/fields';

export type CustomPropertyEditorProps = {
  definition: ComponentPropertyDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
};

function newItemId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `item-${(uuid ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, '')}`;
}

function newFieldId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `field-${(uuid ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, '')}`;
}

export function ListPropertyEditor({ value, onChange }: CustomPropertyEditorProps) {
  const parsed = ListPropsSchema.safeParse(value);
  if (!parsed.success) return null;
  const list = parsed.data;

  function update(patch: Partial<ListProps>) {
    onChange({ ...list, ...patch });
  }

  return (
    <div className="builder-list-editor">
      <div className="builder-property-control">
        <span className="builder-property-label">Items</span>
        <button
          className="button button-secondary button-small"
          disabled={list.items.length >= 100}
          onClick={() =>
            update({ items: [...list.items, { id: newItemId(), text: 'New item' }] })
          }
          type="button"
        >
          + Add item
        </button>
      </div>
      {list.items.map((item, index) => (
        <div className="builder-list-item" key={item.id}>
          <TextField
            compact
            label={`Item ${index + 1}`}
            onChange={(event) =>
              update({
                items: list.items.map((current) =>
                  current.id === item.id
                    ? { ...current, text: event.target.value }
                    : current,
                ),
              })
            }
            value={item.text}
          />
          <div className="row-actions">
            <button
              aria-label={`Move item ${index + 1} up`}
              className="button button-ghost button-small"
              disabled={index === 0}
              onClick={() => {
                const items = [...list.items];
                const current = items[index];
                const previous = items[index - 1];
                if (!current || !previous) return;
                items[index - 1] = current;
                items[index] = previous;
                update({ items });
              }}
              type="button"
            >
              ↑
            </button>
            <button
              aria-label={`Move item ${index + 1} down`}
              className="button button-ghost button-small"
              disabled={index === list.items.length - 1}
              onClick={() => {
                const items = [...list.items];
                const current = items[index];
                const next = items[index + 1];
                if (!current || !next) return;
                items[index] = next;
                items[index + 1] = current;
                update({ items });
              }}
              type="button"
            >
              ↓
            </button>
            <button
              aria-label={`Remove item ${index + 1}`}
              className="button button-danger button-small"
              disabled={list.items.length <= 1}
              onClick={() =>
                update({ items: list.items.filter((current) => current.id !== item.id) })
              }
              type="button"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function formFieldType(field: FormField): FormField['type'] {
  return field.type;
}

export function FormPropertyEditor({ value, onChange }: CustomPropertyEditorProps) {
  const parsed = FormPropsSchema.safeParse(value);
  if (!parsed.success) return null;
  const form = parsed.data;

  function update(patch: Partial<FormProps>) {
    onChange({ ...form, ...patch });
  }

  function patchField(index: number, patch: Record<string, unknown>) {
    update({
      fields: form.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      ),
    });
  }

  function changeType(index: number, type: FormField['type']) {
    const field = form.fields[index];
    if (!field) return;
    const next: Record<string, unknown> = {
      id: field.id,
      label: field.label,
      name: field.name,
      required: field.required,
      type,
    };
    if (type !== 'checkbox' && type !== 'radio') next.placeholder = 'Optional';
    if (type === 'select' || type === 'radio') {
      next.options = [{ value: 'option', label: 'Option' }];
    }
    patchField(index, next);
  }

  return (
    <div className="builder-form-editor">
      <TextField
        compact
        label="Submit button label"
        onChange={(event) => update({ submitLabel: event.target.value })}
        value={form.submitLabel}
      />
      <TextAreaField
        compact
        label="Success message"
        onChange={(event) => update({ successMessage: event.target.value })}
        rows={3}
        value={form.successMessage}
      />
      <div className="builder-property-control">
        <span className="builder-property-label">Fields</span>
        <button
          className="button button-secondary button-small"
          disabled={form.fields.length >= 20}
          onClick={() => {
            const id = newFieldId();
            update({
              fields: [
                ...form.fields,
                {
                  id,
                  type: 'text',
                  label: 'New field',
                  name: id,
                  required: false,
                  placeholder: '',
                },
              ],
            });
          }}
          type="button"
        >
          + Add field
        </button>
      </div>
      {form.fields.map((field, index) => (
        <fieldset className="builder-form-field" key={field.id}>
          <legend>
            {index + 1}. {field.label}
          </legend>
          <TextField
            compact
            aria-label={`Form field label ${field.id}`}
            label="Label"
            onChange={(event) => patchField(index, { label: event.target.value })}
            value={field.label}
          />
          <SelectField
            aria-label={`Form field type ${field.id}`}
            compact
            label="Type"
            onChange={(event) =>
              changeType(index, event.target.value as FormField['type'])
            }
            value={formFieldType(field)}
          >
            {['text', 'email', 'phone', 'textarea', 'select', 'checkbox', 'radio'].map(
              (type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ),
            )}
          </SelectField>
          {'placeholder' in field ? (
            <TextField
              compact
              label="Placeholder"
              onChange={(event) => patchField(index, { placeholder: event.target.value })}
              value={field.placeholder ?? ''}
            />
          ) : null}
          <label className="checkbox-field">
            <input
              checked={field.required}
              onChange={(event) => patchField(index, { required: event.target.checked })}
              type="checkbox"
            />
            Required
          </label>
          {'options' in field ? (
            <div className="builder-form-options">
              {field.options.map((option, optionIndex) => (
                <TextField
                  compact
                  key={`${field.id}-${optionIndex}`}
                  label={`Option ${optionIndex + 1}`}
                  onChange={(event) =>
                    patchField(index, {
                      options: field.options.map((current, currentIndex) =>
                        currentIndex === optionIndex
                          ? { ...current, label: event.target.value }
                          : current,
                      ),
                    })
                  }
                  value={option.label}
                />
              ))}
            </div>
          ) : null}
          <div className="row-actions">
            <button
              aria-label={`Move field ${index + 1} up`}
              className="button button-ghost button-small"
              disabled={index === 0}
              onClick={() => {
                const fields = [...form.fields];
                const current = fields[index];
                const previous = fields[index - 1];
                if (!current || !previous) return;
                fields[index - 1] = current;
                fields[index] = previous;
                update({ fields });
              }}
              type="button"
            >
              ↑
            </button>
            <button
              aria-label={`Move field ${index + 1} down`}
              className="button button-ghost button-small"
              disabled={index === form.fields.length - 1}
              onClick={() => {
                const fields = [...form.fields];
                const current = fields[index];
                const next = fields[index + 1];
                if (!current || !next) return;
                fields[index] = next;
                fields[index + 1] = current;
                update({ fields });
              }}
              type="button"
            >
              ↓
            </button>
            <button
              className="button button-danger button-small"
              disabled={form.fields.length <= 1}
              onClick={() =>
                update({ fields: form.fields.filter((_, i) => i !== index) })
              }
              type="button"
            >
              Remove
            </button>
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export const CUSTOM_PROPERTY_EDITORS = {
  form: FormPropertyEditor,
  list: ListPropertyEditor,
} as const;
