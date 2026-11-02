'use client';

import {
  endpoints,
  FORGOT_PASSWORD_PATH,
  type MeResponse,
  passwordSchema,
  personNameSchema,
  type Problem,
  type SignupLookupResponse,
  type SignupVerifyRequest,
  workspaceNameSchema,
} from '@plp/contracts';
import { Button, ButtonLink, Callout, Field, Input, Spinner } from '@plp/ui';
import {
  type UseMutationResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, useState } from 'react';
import { z } from 'zod';
import { ApiError, api } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { firstInvalidField, keepFieldFocus, useSchemaForm } from '../shell/use-schema-form';
import { PASSWORDS_DIFFER } from './new-password';
import { useLinkToken } from './use-link-token';
import styles from './AuthForm.module.css';

/** The page's fields; the API checks the names and the password by the sign-up rules. */
const accountFormSchema = z.object({
  name: personNameSchema,
  workspaceName: workspaceNameSchema,
  password: passwordSchema,
  // Compared with the password on submit, never sent.
  confirm: z.string().min(1, 'Nhập lại mật khẩu'),
});

const fieldIds = {
  name: 'verify-name',
  workspaceName: 'verify-workspace',
  password: 'verify-password',
  confirm: 'verify-confirm',
} as const;
const fieldOrder = ['name', 'workspaceName', 'password', 'confirm'] as const;

type Verify = UseMutationResult<MeResponse, Error, SignupVerifyRequest>;

/** The problem of a failed call, when the API sent one. */
function problemOf(error: Error | null): Problem | null {
  return error instanceof ApiError ? error.problem : null;
}

/**
 * The page of a sign-up's confirmation link (ADR-026). Opening it only looks the sign-up up: the
 * email it proves, and the names typed in the form. Whoever opens it chooses the password, so a
 * sign-up made with someone else's email gives its maker nothing. The account and its workspace
 * are created on the click, then open from the start page as a sign-up always did.
 */
export function VerifySignup() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const token = useLinkToken();
  const verify = useMutation({
    mutationFn: (body: SignupVerifyRequest) => api(endpoints.verifySignup, [], { body }),
    onSuccess: () => {
      // Data cached for a previous session must not leak into this one.
      queryClient.clear();
      router.replace('/');
    },
    onError: (error) => {
      reportUnexpected('Confirming a sign-up failed', error);
    },
  });
  // Another link opened in this tab changes only the fragment: an earlier outcome is not about it.
  const thisLink = typeof token === 'string' && verify.variables?.token === token;
  const created = thisLink && verify.isSuccess;
  const lookup = useQuery({
    queryKey: ['signup-link', token],
    queryFn: () => api(endpoints.lookupSignup, [], { body: { token: token ?? '' } }),
    // Once the account exists the link is used up; asking again would only say so.
    enabled: typeof token === 'string' && !created,
    retry: false,
  });

  if (token === undefined) {
    return null;
  }
  if (token === null) {
    return (
      <div className={styles.form}>
        <Callout tone="warning" title="Liên kết không đầy đủ">
          Mở lại link trong email xác nhận, hoặc đăng ký lại để nhận link mới.
        </Callout>
        <ButtonLink as={Link} href="/signup" variant="secondary" fullWidth>
          Đăng ký lại
        </ButtonLink>
      </div>
    );
  }
  if (created) {
    return <Spinner label="Đang mở workspace" />;
  }

  const problem = (thisLink ? problemOf(verify.error) : null) ?? problemOf(lookup.error);
  if (problem?.code === 'signup_link_invalid') {
    return <LinkUsedUp problem={problem} />;
  }
  if (problem?.code === 'email_taken') {
    return (
      <div className={styles.form}>
        <Callout tone="warning" role="alert" title={problem.title}>
          {problem.detail}
        </Callout>
        <ButtonLink as={Link} href="/login" fullWidth>
          Đăng nhập
        </ButtonLink>
        <p className={styles.switch}>
          <Link href={FORGOT_PASSWORD_PATH}>Quên mật khẩu?</Link>
        </p>
      </div>
    );
  }
  if (lookup.isError) {
    return (
      <div className={styles.form}>
        <Callout tone="danger" role="alert">
          {problemMessage(lookup.error)}
        </Callout>
        <Button
          variant="secondary"
          fullWidth
          loading={lookup.isFetching}
          onClick={() => {
            void lookup.refetch();
          }}
        >
          Thử lại
        </Button>
      </div>
    );
  }
  if (lookup.data === undefined) {
    return <Spinner label="Đang mở link xác nhận" />;
  }
  // A form of its own per link: another link starts from what its sign-up stored.
  return <AccountForm key={token} token={token} signup={lookup.data} verify={verify} />;
}

/**
 * A link that no longer works. Often it was confirmed already, on another device or in another
 * tab: signing up again would only email "Email này đã có tài khoản", so logging in is offered too.
 */
function LinkUsedUp({ problem }: { problem: Problem }) {
  return (
    <div className={styles.form}>
      <Callout tone="danger" role="alert" title={problem.title}>
        {problem.detail}
      </Callout>
      <ButtonLink as={Link} href="/signup" fullWidth>
        Đăng ký lại
      </ButtonLink>
      <p className={styles.note}>Nếu bạn đã xác nhận email này, hãy đăng nhập.</p>
      <ButtonLink as={Link} href="/login" variant="secondary" fullWidth>
        Đăng nhập
      </ButtonLink>
    </div>
  );
}

/** The email the link proves, the names to correct, and the password the account will have. */
function AccountForm({
  token,
  signup,
  verify,
}: {
  token: string;
  signup: SignupLookupResponse;
  verify: Verify;
}) {
  const form = useSchemaForm(accountFormSchema, {
    name: signup.name,
    workspaceName: signup.workspaceName,
    password: '',
    confirm: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  function focus(field: keyof typeof fieldIds) {
    document.getElementById(fieldIds[field])?.focus();
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const result = form.validate();
    if (!result.ok) {
      const field = firstInvalidField(fieldOrder, result.errors);
      if (field !== undefined) {
        focus(field);
      }
      return;
    }
    const { confirm, ...account } = result.data;
    if (account.password !== confirm) {
      form.setServerErrors({ confirm: PASSWORDS_DIFFER });
      focus('confirm');
      return;
    }
    verify.mutate(
      { token, ...account },
      {
        onError: (error) => {
          const fieldErrors = error instanceof ApiError ? error.fieldErrors() : {};
          const field = firstInvalidField(fieldOrder, fieldErrors);
          if (field !== undefined) {
            form.setServerErrors(fieldErrors);
            focus(field);
            return;
          }
          // The page shows a link that stopped working, or an email taken meanwhile, instead.
          setFormError(problemMessage(error));
        },
      },
    );
  }

  function bind(field: keyof typeof fieldIds) {
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
    <form method="post" noValidate className={styles.form} onSubmit={handleSubmit}>
      <Field label="Email" id="verify-email" help="Link xác nhận gắn với email này.">
        <Input type="email" value={signup.email} readOnly />
      </Field>
      <Field label="Họ và tên" id={fieldIds.name} required error={form.errors.name}>
        <Input autoComplete="name" {...bind('name')} />
      </Field>
      <Field
        label="Tên workspace"
        id={fieldIds.workspaceName}
        required
        help="Tên agency hoặc doanh nghiệp của bạn. Các site khách hàng nằm trong workspace này."
        error={form.errors.workspaceName}
      >
        <Input autoComplete="organization" {...bind('workspaceName')} />
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
      <Field label="Nhập lại mật khẩu" id={fieldIds.confirm} required error={form.errors.confirm}>
        <Input
          type="password"
          autoComplete="new-password"
          name="confirm"
          value={form.values.confirm}
          onChange={(event) => {
            form.setValue('confirm', event.target.value);
          }}
        />
      </Field>
      {formError === null ? null : (
        <Callout tone="danger" role="alert">
          {formError}
        </Callout>
      )}
      <Button type="submit" fullWidth loading={verify.isPending} onMouseDown={keepFieldFocus}>
        Tạo tài khoản và workspace
      </Button>
    </form>
  );
}
