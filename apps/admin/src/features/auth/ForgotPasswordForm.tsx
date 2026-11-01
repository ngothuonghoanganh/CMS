'use client';

import {
  type AccountEmailRequest,
  accountEmailRequestSchema,
  endpoints,
  RESET_LINK_VALID_MINUTES,
} from '@plp/contracts';
import { Button, ButtonLink, Callout, Field, Input } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { type SubmitEvent, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { keepFieldFocus, useSchemaForm } from '../shell/use-schema-form';
import { useFocusOnMount } from './use-focus-on-mount';
import styles from './AuthForm.module.css';

const EMAIL_ID = 'forgot-email';

/**
 * "Quên mật khẩu" (ADR-026): asks for a reset link. The answer is the same whether the email has
 * an account or not, and so is what the page says.
 */
export function ForgotPasswordForm() {
  const form = useSchemaForm(accountEmailRequestSchema, { email: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const forgot = useMutation({
    mutationFn: (body: AccountEmailRequest) => api(endpoints.forgotPassword, [], { body }),
    onError: (error) => {
      reportUnexpected('Asking for a password reset failed', error);
      const fieldErrors = error instanceof ApiError ? error.fieldErrors() : {};
      if (fieldErrors['email'] !== undefined) {
        form.setServerErrors(fieldErrors);
        document.getElementById(EMAIL_ID)?.focus();
        return;
      }
      setFormError(problemMessage(error));
    },
  });

  if (forgot.isSuccess) {
    return <Requested />;
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const result = form.validate();
    if (!result.ok) {
      document.getElementById(EMAIL_ID)?.focus();
      return;
    }
    forgot.mutate(result.data);
  }

  return (
    <form method="post" noValidate className={styles.form} onSubmit={handleSubmit}>
      <Field label="Email" id={EMAIL_ID} required error={form.errors.email}>
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
      {formError === null ? null : (
        <Callout tone="danger" role="alert">
          {formError}
        </Callout>
      )}
      <Button type="submit" fullWidth loading={forgot.isPending} onMouseDown={keepFieldFocus}>
        Gửi link đặt lại mật khẩu
      </Button>
    </form>
  );
}

function Requested() {
  const panel = useFocusOnMount<HTMLDivElement>();
  return (
    <div ref={panel} tabIndex={-1} className={styles.sent}>
      <Callout tone="success" role="status" title="Đã gửi yêu cầu">
        Nếu email này có tài khoản, chúng tôi đã gửi link đặt lại mật khẩu. Link có hiệu lực{' '}
        {RESET_LINK_VALID_MINUTES} phút.
      </Callout>
      <p className={styles.note}>Không thấy email? Hãy xem cả mục spam.</p>
      <ButtonLink as={Link} href="/login" variant="secondary" fullWidth>
        Quay lại đăng nhập
      </ButtonLink>
    </div>
  );
}
