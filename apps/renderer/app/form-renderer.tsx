'use client';

import {
  PAGE_RUNTIME_CLASS_NAMES,
  type FormField,
  type FormNode,
} from '@payload/contracts';
import React, { useState, type FormEvent } from 'react';

import { getAnalyticsSessionId } from './analytics-client';

type FormRendererProps = {
  node: FormNode;
  submissionUrl?: string;
};

type FormValue = string | boolean;
type FormState = 'idle' | 'submitting' | 'success' | 'error' | 'rate-limited';

function initialValue(field: FormField): FormValue {
  return field.type === 'checkbox' ? false : '';
}

function initialValues(node: FormNode): Record<string, FormValue> {
  return Object.fromEntries(
    node.props.fields.map((field) => [field.id, initialValue(field)]),
  );
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: FormValue;
  onChange: (value: FormValue) => void;
}) {
  const id = `payload-form-${field.id}`;
  const common = {
    id,
    name: field.name,
    required: field.required,
  };

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          {...common}
          maxLength={10_000}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          value={typeof value === 'string' ? value : ''}
        />
      );
    case 'select':
      return (
        <select
          {...common}
          onChange={(event) => onChange(event.target.value)}
          value={typeof value === 'string' ? value : ''}
        >
          <option value="">{field.placeholder || 'Select an option'}</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case 'radio':
      return (
        <div
          className={PAGE_RUNTIME_CLASS_NAMES.formOptions}
          role="radiogroup"
          aria-label={field.label}
        >
          {field.options.map((option) => (
            <label key={option.value}>
              <input
                checked={value === option.value}
                name={field.name}
                onChange={() => onChange(option.value)}
                required={field.required && value === ''}
                type="radio"
                value={option.value}
              />
              {option.label}
            </label>
          ))}
        </div>
      );
    case 'checkbox':
      return (
        <input
          {...common}
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
      );
    case 'email':
    case 'phone':
    case 'text':
      return (
        <input
          {...common}
          maxLength={10_000}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          type={field.type === 'phone' ? 'tel' : field.type}
          value={typeof value === 'string' ? value : ''}
        />
      );
  }
}

export function FormRenderer({ node, submissionUrl }: FormRendererProps) {
  const [values, setValues] = useState(() => initialValues(node));
  const [state, setState] = useState<FormState>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submissionUrl || state === 'submitting') return;
    setState('submitting');
    setError(null);
    try {
      const response = await fetch(submissionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(getAnalyticsSessionId()
            ? { analyticsSessionId: getAnalyticsSessionId() }
            : {}),
          values: node.props.fields.map((field) => ({
            fieldId: field.id,
            value: values[field.id] ?? initialValue(field),
          })),
        }),
      });
      if (response.status === 429) {
        setState('rate-limited');
        setError('Please wait a moment before trying again.');
        return;
      }
      if (!response.ok) {
        let message = 'We could not submit this form. Please try again.';
        try {
          const body = (await response.json()) as { error?: { message?: string } };
          message = body.error?.message || message;
        } catch {
          // Keep the safe fallback for a non-JSON response.
        }
        throw new Error(message);
      }
      setState('success');
    } catch (caughtError) {
      setState('error');
      setError(caughtError instanceof Error ? caughtError.message : 'Submission failed.');
    }
  }

  if (state === 'success') {
    return (
      <div
        aria-live="polite"
        className={PAGE_RUNTIME_CLASS_NAMES.formSuccess}
        data-payload-node-id={node.id}
        data-payload-node-type="form"
        role="status"
      >
        {node.props.successMessage}
      </div>
    );
  }

  return (
    <form
      className={PAGE_RUNTIME_CLASS_NAMES.form}
      data-payload-node-id={node.id}
      data-payload-node-type="form"
      onSubmit={submit}
    >
      {node.props.fields.map((field) => (
        <div className={PAGE_RUNTIME_CLASS_NAMES.formField} key={field.id}>
          <label htmlFor={`payload-form-${field.id}`}>
            {field.label}
            {field.required ? <span aria-hidden="true"> *</span> : null}
          </label>
          <FieldControl
            field={field}
            onChange={(value) =>
              setValues((current) => ({ ...current, [field.id]: value }))
            }
            value={values[field.id] ?? initialValue(field)}
          />
        </div>
      ))}
      {error ? (
        <p aria-live="polite" className={PAGE_RUNTIME_CLASS_NAMES.formError} role="alert">
          {error}
        </p>
      ) : null}
      <button disabled={!submissionUrl || state === 'submitting'} type="submit">
        {state === 'submitting' ? 'Submitting…' : node.props.submitLabel}
      </button>
    </form>
  );
}
