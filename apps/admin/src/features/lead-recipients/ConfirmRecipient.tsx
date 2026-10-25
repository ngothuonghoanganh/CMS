'use client';

import { endpoints, recipientTokenSchema } from '@plp/contracts';
import { Button, Callout } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { ApiError, api } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import styles from './ConfirmRecipient.module.css';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
  };
}

/** The link's secret from `#token=…`: the fragment never reaches a server or its logs. */
function tokenFromHash(): string | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  return token !== null && recipientTokenSchema.safeParse(token).success ? token : null;
}

/** Confirms a lead address with one click on the link it was emailed (ADR-018). */
export function ConfirmRecipient() {
  // Undefined while rendering on the server, where there is no fragment; null for a bad link.
  const token = useSyncExternalStore(subscribe, tokenFromHash, () => undefined);
  const confirm = useMutation({
    mutationFn: (secret: string) =>
      api(endpoints.confirmLeadRecipient, [], { body: { token: secret } }),
    onSuccess: () => {
      // The secret has done its job; keep it out of the history.
      window.history.replaceState(null, '', window.location.pathname);
    },
    onError: (error) => {
      reportUnexpected('Confirming a lead address failed', error);
    },
  });

  if (confirm.isSuccess) {
    return (
      <Callout tone="success" role="status" title="Đã xác nhận">
        {`${confirm.data.email} sẽ nhận email khi có lead mới từ ${confirm.data.siteName}.`}
      </Callout>
    );
  }
  if (token === undefined) {
    return null;
  }
  if (token === null) {
    return (
      <Callout tone="warning" title="Liên kết không đầy đủ">
        Mở lại liên kết trong email xác nhận, hoặc nhờ chủ site gửi lại thư.
      </Callout>
    );
  }
  return (
    <div className={styles.confirm}>
      {confirm.isError ? (
        <Callout
          tone="danger"
          role="alert"
          title={
            confirm.error instanceof ApiError ? confirm.error.problem.title : 'Chưa xác nhận được'
          }
        >
          {confirm.error instanceof ApiError && confirm.error.problem.detail !== undefined
            ? confirm.error.problem.detail
            : problemMessage(confirm.error)}
        </Callout>
      ) : null}
      <Button
        loading={confirm.isPending}
        onClick={() => {
          confirm.mutate(token);
        }}
      >
        Xác nhận nhận lead
      </Button>
    </div>
  );
}
