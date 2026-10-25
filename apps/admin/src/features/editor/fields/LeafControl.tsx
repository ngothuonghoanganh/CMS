'use client';

import { getAtPath, type LeafField } from '@plp/sections/schema';
import { Field, Input, Select, Switch, Textarea } from '@plp/ui';
import { useEditorStoreApi } from '../editor-context';
import { CtaControl } from './CtaControl';
import { type ControlProps, sampleNote } from './field-shared';
import styles from './fields.module.css';
import { ImageControl } from './ImageControl';

function TextControl({ section, field, path }: ControlProps<Extract<LeafField, { kind: 'text' }>>) {
  const store = useEditorStoreApi();
  const raw = getAtPath(section.content, path);
  const value = typeof raw === 'string' ? raw : '';
  const missing = field.required === true && value.trim() === '';
  const commonProps = {
    value,
    maxLength: field.maxLength,
    placeholder: field.placeholder,
    onChange: (event: { target: { value: string } }) => {
      store.getState().updateContent(section.id, path, event.target.value, { merge: true });
    },
    onBlur: () => {
      store.getState().closeHistoryStep();
    },
  };
  return (
    <div data-field-path={path}>
      <Field
        label={field.label}
        labelNote={sampleNote(section, path)}
        help={field.help}
        required={field.required}
        warning={missing ? 'Cần nhập trước khi xuất bản.' : undefined}
        counter={{ length: value.length, max: field.maxLength }}
      >
        {field.multiline ? <Textarea {...commonProps} rows={3} /> : <Input {...commonProps} />}
      </Field>
    </div>
  );
}

function SelectControl({
  section,
  field,
  path,
}: ControlProps<Extract<LeafField, { kind: 'select' }>>) {
  const store = useEditorStoreApi();
  const raw = getAtPath(section.content, path);
  return (
    <div data-field-path={path}>
      <Field label={field.label} help={field.help}>
        <Select
          value={typeof raw === 'string' ? raw : ''}
          onChange={(event) => {
            store.getState().updateContent(section.id, path, event.target.value);
          }}
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

function BooleanControl({
  section,
  field,
  path,
}: ControlProps<Extract<LeafField, { kind: 'boolean' }>>) {
  const store = useEditorStoreApi();
  return (
    <div data-field-path={path} className={styles.switchRow}>
      <Switch
        label={field.label}
        description={field.help}
        checked={getAtPath(section.content, path) === true}
        onCheckedChange={(checked) => {
          store.getState().updateContent(section.id, path, checked);
        }}
      />
    </div>
  );
}

/** The official editor of one leaf field (text, button, image, choice or switch). */
export function LeafControl({ section, field, path }: ControlProps<LeafField>) {
  switch (field.kind) {
    case 'text':
      return <TextControl section={section} field={field} path={path} />;
    case 'cta':
      return <CtaControl section={section} field={field} path={path} />;
    case 'image':
      return <ImageControl section={section} field={field} path={path} />;
    case 'select':
      return <SelectControl section={section} field={field} path={path} />;
    case 'boolean':
      return <BooleanControl section={section} field={field} path={path} />;
  }
}
