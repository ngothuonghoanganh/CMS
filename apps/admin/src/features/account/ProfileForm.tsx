'use client';

import {
  endpoints,
  type SessionUser,
  type UpdateMeRequest,
  updateMeRequestSchema,
} from '@plp/contracts';
import { Button, Callout, Field, Input, useToast } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { keepFieldFocus, useSchemaForm } from '../shell/use-schema-form';
import styles from './Account.module.css';

const NAME_ID = 'account-name';

/** The email, read only, and the display name, with the limits of sign-up (ADR-026). */
export function ProfileForm({ user }: { user: SessionUser }) {
  const router = useRouter();
  const { toast } = useToast();
  const form = useSchemaForm(updateMeRequestSchema, { name: user.name });
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: UpdateMeRequest) => api(endpoints.updateMe, [], { body }),
    onSuccess: (me) => {
      form.setValue('name', me.user.name);
      toast({ tone: 'success', title: 'Đã lưu tên hiển thị' });
      // The sidebar and the other screens read the name from the server.
      router.refresh();
    },
    onError: (error) => {
      reportUnexpected('Saving the display name failed', error);
      const fieldErrors = error instanceof ApiError ? error.fieldErrors() : {};
      if (fieldErrors['name'] !== undefined) {
        form.setServerErrors(fieldErrors);
        document.getElementById(NAME_ID)?.focus();
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
      document.getElementById(NAME_ID)?.focus();
      return;
    }
    save.mutate(result.data);
  }

  return (
    <form method="post" noValidate className={styles.form} onSubmit={handleSubmit}>
      <Field label="Email" id="account-email" help="Email dùng để đăng nhập. Chưa đổi được email.">
        <Input type="email" value={user.email} readOnly />
      </Field>
      <Field
        label="Tên hiển thị"
        id={NAME_ID}
        required
        help="Hiện ở menu tài khoản, lịch sử xuất bản và danh sách thành viên."
        error={form.errors.name}
      >
        <Input
          name="name"
          autoComplete="name"
          value={form.values.name}
          onChange={(event) => {
            form.setValue('name', event.target.value);
          }}
          onBlur={() => {
            form.blur('name');
          }}
        />
      </Field>
      {formError === null ? null : (
        <Callout tone="danger" role="alert">
          {formError}
        </Callout>
      )}
      <div className={styles.actions}>
        <Button type="submit" loading={save.isPending} onMouseDown={keepFieldFocus}>
          Lưu tên hiển thị
        </Button>
      </div>
    </form>
  );
}
