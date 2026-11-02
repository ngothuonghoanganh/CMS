'use client';

import {
  endpoints,
  SIGNUP_LINK_VALID_HOURS,
  type SignupRequest,
  signupRequestSchema,
} from '@plp/contracts';
import { Button, Callout, Field, Input } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { type ReactNode, type SubmitEvent, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { FormCard } from '../shell/FormCard';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { firstInvalidField, keepFieldFocus, useSchemaForm } from '../shell/use-schema-form';
import { useFocusOnMount } from './use-focus-on-mount';
import styles from './AuthForm.module.css';

type SignupField = keyof SignupRequest;

const fieldIds: Record<SignupField, string> = {
  name: 'signup-name',
  email: 'signup-email',
  workspaceName: 'signup-workspace',
};
const fieldOrder: readonly SignupField[] = ['name', 'email', 'workspaceName'];

export interface SignupFormProps {
  /** The line under the card, e.g. the link to the login page. */
  footer: ReactNode;
}

/**
 * Sign-up (ADR-026): the form emails a confirmation link, then the card says to check the inbox,
 * with "Gửi lại" and "Đổi email". No password here: the link's page sets it, so only whoever
 * reads the mailbox can. The account and its workspace exist once the link is used.
 */
export function SignupForm({ footer }: SignupFormProps) {
  const form = useSchemaForm(signupRequestSchema, {
    name: '',
    email: '',
    workspaceName: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  // "Đổi email" brings the form back with the email field focused.
  const focusEmail = useRef(false);

  const signup = useMutation({
    mutationFn: (body: SignupRequest) => api(endpoints.signup, [], { body }),
    onSuccess: ({ email }) => {
      setSentTo(email);
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

  useEffect(() => {
    if (sentTo === null && focusEmail.current) {
      focusEmail.current = false;
      document.getElementById(fieldIds.email)?.focus();
    }
  }, [sentTo]);

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

  if (sentTo !== null) {
    return (
      <FormCard
        title="Kiểm tra email"
        description="Còn một bước: xác nhận email để tạo workspace."
        footer={footer}
      >
        <CheckEmail
          email={sentTo}
          onChangeEmail={() => {
            focusEmail.current = true;
            signup.reset();
            setSentTo(null);
          }}
        />
      </FormCard>
    );
  }

  return (
    <FormCard
      title="Tạo tài khoản"
      description="Tạo workspace cho agency hoặc doanh nghiệp của bạn, rồi thêm site khách hàng đầu tiên."
      footer={footer}
    >
      {/* POST: sent before the page is interactive, the browser must not put the email in the URL. */}
      <form method="post" noValidate className={styles.form} onSubmit={handleSubmit}>
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
        <Button type="submit" fullWidth loading={signup.isPending} onMouseDown={keepFieldFocus}>
          Tạo tài khoản
        </Button>
      </form>
    </FormCard>
  );
}

/** "Kiểm tra email": where the link went, and what to do when it does not arrive. */
function CheckEmail({ email, onChangeEmail }: { email: string; onChangeEmail: () => void }) {
  // The form that had focus is gone: the message takes it, so it is read out.
  const panel = useFocusOnMount<HTMLDivElement>();
  const resend = useMutation({
    mutationFn: () => api(endpoints.resendSignup, [], { body: { email } }),
    onError: (error) => {
      reportUnexpected('Sending the sign-up email again failed', error);
    },
  });

  return (
    <div ref={panel} tabIndex={-1} className={styles.sent}>
      <p className={styles.message}>
        Chúng tôi đã gửi link xác nhận tới <strong>{email}</strong>. Mở email, bấm link và đặt mật
        khẩu để tạo workspace. Link có hiệu lực {SIGNUP_LINK_VALID_HOURS} giờ.
      </p>
      <p className={styles.note}>Không thấy email? Hãy xem cả mục spam, hoặc gửi lại.</p>
      {resend.isSuccess ? (
        <Callout tone="success" role="status">
          Đã gửi lại email tới {email}.
        </Callout>
      ) : null}
      {resend.isError ? (
        <Callout tone="danger" role="alert">
          {problemMessage(resend.error)}
        </Callout>
      ) : null}
      <div className={styles.actions}>
        <Button
          variant="secondary"
          loading={resend.isPending}
          onClick={() => {
            resend.mutate();
          }}
        >
          Gửi lại
        </Button>
        <Button variant="ghost" onClick={onChangeEmail}>
          Đổi email
        </Button>
      </div>
    </div>
  );
}
