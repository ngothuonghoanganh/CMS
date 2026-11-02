'use client';

import { endpoints, FORGOT_PASSWORD_PATH, type SignupVerifyRequest } from '@plp/contracts';
import { Button, ButtonLink, Callout } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, api } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { useLinkToken } from './use-link-token';
import styles from './AuthForm.module.css';

/**
 * "Xác nhận và tạo workspace" (ADR-026): the token goes to the API only on this click, then the
 * new workspace opens as a sign-up always did, from the start page.
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

  // Another link opened in this tab changes only the fragment: an earlier outcome is not about it.
  const thisLink = verify.variables?.token === token;
  const problem = thisLink && verify.error instanceof ApiError ? verify.error.problem : null;
  if (problem?.code === 'signup_link_invalid') {
    return (
      <div className={styles.form}>
        <Callout tone="danger" role="alert" title={problem.title}>
          {problem.detail}
        </Callout>
        <ButtonLink as={Link} href="/signup" fullWidth>
          Đăng ký lại
        </ButtonLink>
      </div>
    );
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
  return (
    <div className={styles.form}>
      {thisLink && verify.isError ? (
        <Callout tone="danger" role="alert">
          {problemMessage(verify.error)}
        </Callout>
      ) : null}
      <Button
        fullWidth
        loading={thisLink && (verify.isPending || verify.isSuccess)}
        onClick={() => {
          verify.mutate({ token });
        }}
      >
        Xác nhận và tạo workspace
      </Button>
    </div>
  );
}
