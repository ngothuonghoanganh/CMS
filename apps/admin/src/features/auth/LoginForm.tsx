'use client';

import { endpoints, type LoginRequest, loginRequestSchema } from '@plp/contracts';
import { Button, Callout, Field, Input } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { firstInvalidField, keepFieldFocus, useSchemaForm } from '../shell/use-schema-form';
import styles from './AuthForm.module.css';

const fieldIds = { email: 'login-email', password: 'login-password' } as const;
const fieldOrder = ['email', 'password'] as const;

export interface LoginFormProps {
  /** Same-origin path to open after signing in (already sanitized). */
  next: string;
}

export function LoginForm({ next }: LoginFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useSchemaForm(loginRequestSchema, { email: '', password: '' });
  const [formError, setFormError] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: (body: LoginRequest) => api(endpoints.login, [], { body }),
    onSuccess: () => {
      // Data cached for a previous session must not leak into this one.
      queryClient.clear();
      router.replace(next);
    },
    onError: (error) => {
      reportUnexpected('Sign-in failed', error);
      const fieldErrors = error instanceof ApiError ? error.fieldErrors() : {};
      if (Object.keys(fieldErrors).length > 0) {
        form.setServerErrors(fieldErrors);
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
    login.mutate(result.data);
  }

  return (
    <form noValidate className={styles.form} onSubmit={handleSubmit}>
      <Field label="Email" id={fieldIds.email} required error={form.errors.email}>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="ban@congty.vn"
          value={form.values.email}
          onChange={(event) => {
            form.setValue('email', event.target.value);
          }}
          onBlur={() => {
            form.blur('email');
          }}
        />
      </Field>
      <Field label="Mật khẩu" id={fieldIds.password} required error={form.errors.password}>
        <Input
          type="password"
          name="password"
          autoComplete="current-password"
          value={form.values.password}
          onChange={(event) => {
            form.setValue('password', event.target.value);
          }}
          onBlur={() => {
            form.blur('password');
          }}
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
        loading={login.isPending || login.isSuccess}
        onMouseDown={keepFieldFocus}
      >
        Đăng nhập
      </Button>
    </form>
  );
}
