'use client';

import {
  endpoints,
  FORGOT_PASSWORD_PATH,
  passwordSchema,
  type ResetPasswordRequest,
} from '@plp/contracts';
import { Button, ButtonLink, Callout, Field, Input } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, useState } from 'react';
import { z } from 'zod';
import { ApiError, api } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { firstInvalidField, keepFieldFocus, useSchemaForm } from '../shell/use-schema-form';
import { confirmPasswordSchema, PASSWORDS_DIFFER } from './new-password';
import { useLinkToken } from './use-link-token';
import styles from './AuthForm.module.css';

/** The new password twice; the API checks the first with the sign-up rules. */
const newPasswordFormSchema = z.object({
  password: passwordSchema,
  confirm: confirmPasswordSchema,
});

const fieldIds = { password: 'reset-password', confirm: 'reset-confirm' } as const;
const fieldOrder = ['password', 'confirm'] as const;

/**
 * "Đặt mật khẩu mới" from a reset link (ADR-026): the secret in the fragment goes to the API with
 * the new password. Every session ends there, and this browser is signed in.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const token = useLinkToken();
  const form = useSchemaForm(newPasswordFormSchema, { password: '', confirm: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const reset = useMutation({
    mutationFn: (body: ResetPasswordRequest) => api(endpoints.resetPassword, [], { body }),
    onSuccess: () => {
      // Data cached for a previous session must not leak into this one.
      queryClient.clear();
      router.replace('/');
    },
    onError: (error) => {
      reportUnexpected('Setting a new password failed', error);
      const fieldErrors = error instanceof ApiError ? error.fieldErrors() : {};
      if (fieldErrors['password'] !== undefined) {
        form.setServerErrors(fieldErrors);
        document.getElementById(fieldIds.password)?.focus();
        return;
      }
      setFormError(problemMessage(error));
    },
  });

  if (token === undefined) {
    return null;
  }
  // Another link opened in this tab changes only the fragment: an earlier outcome is not about it.
  const thisLink = token !== null && reset.variables?.token === token;
  const problem = thisLink && reset.error instanceof ApiError ? reset.error.problem : null;
  if (token === null || problem?.code === 'reset_link_invalid') {
    return (
      <div className={styles.form}>
        <Callout
          tone={token === null ? 'warning' : 'danger'}
          role={token === null ? undefined : 'alert'}
          title={problem?.title ?? 'Liên kết không đầy đủ'}
        >
          {problem?.detail ?? 'Mở lại link trong email đặt lại mật khẩu, hoặc yêu cầu link mới.'}
        </Callout>
        <ButtonLink as={Link} href={FORGOT_PASSWORD_PATH} fullWidth>
          Gửi link mới
        </ButtonLink>
      </div>
    );
  }
  const linkToken = token;

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
    if (result.data.password !== result.data.confirm) {
      form.setServerErrors({ confirm: PASSWORDS_DIFFER });
      document.getElementById(fieldIds.confirm)?.focus();
      return;
    }
    reset.mutate({ token: linkToken, password: result.data.password });
  }

  return (
    <form method="post" noValidate className={styles.form} onSubmit={handleSubmit}>
      <Field
        label="Mật khẩu mới"
        id={fieldIds.password}
        required
        help="Ít nhất 8 ký tự."
        error={form.errors.password}
      >
        <Input
          type="password"
          name="password"
          autoComplete="new-password"
          value={form.values.password}
          onChange={(event) => {
            form.setValue('password', event.target.value);
          }}
          onBlur={() => {
            form.blur('password');
          }}
        />
      </Field>
      <Field
        label="Nhập lại mật khẩu mới"
        id={fieldIds.confirm}
        required
        error={form.errors.confirm}
      >
        <Input
          type="password"
          name="confirm"
          autoComplete="new-password"
          value={form.values.confirm}
          onChange={(event) => {
            form.setValue('confirm', event.target.value);
          }}
        />
      </Field>
      {formError === null || !thisLink ? null : (
        <Callout tone="danger" role="alert">
          {formError}
        </Callout>
      )}
      <Button
        type="submit"
        fullWidth
        loading={reset.isPending || reset.isSuccess}
        onMouseDown={keepFieldFocus}
      >
        Đặt mật khẩu mới
      </Button>
    </form>
  );
}
