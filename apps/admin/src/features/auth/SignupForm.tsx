'use client';

import { endpoints, type SignupRequest, signupRequestSchema } from '@plp/contracts';
import { Button, Callout, Field, Input } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { firstInvalidField, keepFieldFocus, useSchemaForm } from '../shell/use-schema-form';
import styles from './AuthForm.module.css';

type SignupField = keyof SignupRequest;

const fieldIds: Record<SignupField, string> = {
  name: 'signup-name',
  email: 'signup-email',
  password: 'signup-password',
  workspaceName: 'signup-workspace',
};
const fieldOrder: readonly SignupField[] = ['name', 'email', 'password', 'workspaceName'];

export interface SignupFormProps {
  /** Same-origin path to open after signing up (already sanitized). */
  next: string;
}

export function SignupForm({ next }: SignupFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useSchemaForm(signupRequestSchema, {
    name: '',
    email: '',
    password: '',
    workspaceName: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  const signup = useMutation({
    mutationFn: (body: SignupRequest) => api(endpoints.signup, [], { body }),
    onSuccess: () => {
      queryClient.clear();
      router.replace(next);
    },
    onError: (error) => {
      reportUnexpected('Sign-up failed', error);
      const fieldErrors = error instanceof ApiError ? error.fieldErrors() : {};
      if (Object.keys(fieldErrors).length > 0) {
        form.setServerErrors(fieldErrors);
        const field = firstInvalidField(fieldOrder, fieldErrors);
        if (field !== undefined) {
          document.getElementById(fieldIds[field])?.focus();
        }
        return;
      }
      setFormError(problemMessage(error));
    },
  });

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const result = form.validate();
    if (!result.ok) {
      const field = firstInvalidField(fieldOrder, result.errors);
      if (field !== undefined) {
        document.getElementById(fieldIds[field])?.focus();
      }
      return;
    }
    signup.mutate(result.data);
  }

  function bind(field: SignupField) {
    return {
      name: field,
      value: form.values[field],
      onChange: (event: { target: { value: string } }) => {
        form.setValue(field, event.target.value);
      },
      onBlur: () => {
        form.blur(field);
      },
    };
  }

  return (
    <form noValidate className={styles.form} onSubmit={handleSubmit}>
      <Field label="Họ và tên" id={fieldIds.name} required error={form.errors.name}>
        <Input autoComplete="name" placeholder="Nguyễn Ngọc Anh" {...bind('name')} />
      </Field>
      <Field label="Email" id={fieldIds.email} required error={form.errors.email}>
        <Input
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="ban@congty.vn"
          {...bind('email')}
        />
      </Field>
      <Field
        label="Mật khẩu"
        id={fieldIds.password}
        required
        help="Ít nhất 8 ký tự."
        error={form.errors.password}
      >
        <Input type="password" autoComplete="new-password" {...bind('password')} />
      </Field>
      <Field
        label="Tên workspace"
        id={fieldIds.workspaceName}
        required
        help="Tên agency hoặc doanh nghiệp của bạn. Các site khách hàng nằm trong workspace này."
        error={form.errors.workspaceName}
      >
        <Input
          autoComplete="organization"
          placeholder="Mây Xanh Agency"
          {...bind('workspaceName')}
        />
      </Field>
      {formError === null ? null : (
        <Callout tone="danger" role="alert">
          {formError}
        </Callout>
      )}
      <Button
        type="submit"
        fullWidth
        loading={signup.isPending || signup.isSuccess}
        onMouseDown={keepFieldFocus}
      >
        Tạo tài khoản
      </Button>
    </form>
  );
}
