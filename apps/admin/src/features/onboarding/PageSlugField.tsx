'use client';

import { Field, Input } from '@plp/ui';
import { SLUG_MAX } from '../seo/seo-presentation';
import type { SlugCheck } from '../seo/use-slug-field';

export interface PageSlugFieldProps {
  id: string;
  /** "smilecare.payload.site", shown before the slug. */
  host: string;
  value: string;
  /** A validation problem of the form (format, or taken according to the server). */
  error?: string | undefined;
  check: SlugCheck;
  onChange: (value: string) => void;
  onBlur: () => void;
}

function helpOf(value: string, check: SlugCheck): string {
  if (check.state === 'checking') {
    return 'Đang kiểm tra đường dẫn…';
  }
  if (check.state === 'available') {
    return value === ''
      ? 'Đường dẫn trống: đây sẽ là trang chủ của site.'
      : 'Đường dẫn này dùng được.';
  }
  return 'Chỉ dùng chữ thường không dấu, số và dấu gạch ngang.';
}

/** "Đường dẫn" of a new page, with the site host before it and a live availability check. */
export function PageSlugField({
  id,
  host,
  value,
  error,
  check,
  onChange,
  onBlur,
}: PageSlugFieldProps) {
  const checkProblem =
    check.state === 'rejected' || check.state === 'failed' ? check.message : undefined;
  return (
    // The check answers while the user keeps typing: its result is a status message (WCAG 4.1.3).
    <Field
      label="Đường dẫn"
      id={id}
      required
      help={helpOf(value, check)}
      error={error ?? checkProblem}
      announceMessages
    >
      <Input
        prefix={`${host}/`}
        mono
        value={value}
        maxLength={SLUG_MAX}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onBlur={onBlur}
      />
    </Field>
  );
}
