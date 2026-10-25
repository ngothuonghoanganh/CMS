'use client';

import { Button, ButtonLink } from '@plp/ui';
import Link from 'next/link';
import { useEffect } from 'react';
import { FormCard } from './FormCard';
import styles from './RouteError.module.css';

export interface RouteErrorProps {
  /** What the failed segment threw. Errors from Server Components arrive without details. */
  error: unknown;
  /** Fetches and renders the failed segment again. */
  retry: () => void;
}

/**
 * Shown when a screen cannot be loaded: the API is down, timed out or answered 5xx, or a render
 * threw. Server errors reach the browser without details, so the copy stays general; the error
 * (with its digest) is logged so it can be matched with the server log.
 */
export function RouteError({ error, retry }: RouteErrorProps) {
  useEffect(() => {
    console.error('Admin screen failed to load', error);
  }, [error]);

  return (
    <FormCard
      title="Không tải được trang"
      description="Máy chủ chưa phản hồi hoặc vừa gặp lỗi. Những gì đã lưu vẫn còn nguyên. Hãy thử lại sau ít phút."
    >
      <div className={styles.actions}>
        <Button onClick={retry}>Thử lại</Button>
        <ButtonLink as={Link} href="/" variant="secondary">
          Về trang chính
        </ButtonLink>
      </div>
    </FormCard>
  );
}
