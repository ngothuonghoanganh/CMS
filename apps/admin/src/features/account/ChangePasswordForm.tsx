'use client';

import {
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  endpoints,
  passwordSchema,
} from '@plp/contracts';
import { Button, Callout, Field, Input, useToast } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { type SubmitEvent, useState } from 'react';
import { z } from 'zod';
import { ApiError, api } from '../../lib/api';
import { confirmPasswordSchema, PASSWORDS_DIFFER } from '../auth/new-password';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { useLogout } from '../shell/use-logout';
import { firstInvalidField, keepFieldFocus, useSchemaForm } from '../shell/use-schema-form';
import styles from './Account.module.css';

/** The current password, and the new one twice; the API checks the new one by sign-up rules. */
const changePasswordFormSchema = z.object({
  currentPassword: changePasswordRequestSchema.shape.currentPassword,
  newPassword: passwordSchema,
  confirm: confirmPasswordSchema,
});

type PasswordField = keyof z.infer<typeof changePasswordFormSchema>;

const fieldIds: Record<PasswordField, string> = {
  currentPassword: 'account-current-password',
  newPassword: 'account-new-password',
  confirm: 'account-confirm-password',
};
const fieldOrder: readonly PasswordField[] = ['currentPassword', 'newPassword', 'confirm'];
const EMPTY = { currentPassword: '', newPassword: '', confirm: '' };

/**
 * "Đổi mật khẩu" (ADR-026): a wrong current password counts against the login limit; a change
 * signs out the other devices and keeps this one.
 */
export function ChangePasswordForm() {
  const { toast } = useToast();
  const form = useSchemaForm(changePasswordFormSchema, EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: (body: ChangePasswordRequest) => api(endpoints.changePassword, [], { body }),
    onSuccess: () => {
      for (const field of fieldOrder) {
        form.setValue(field, '');
      }
      toast({
        tone: 'success',
        title: 'Đã đổi mật khẩu',
        description: 'Các thiết bị khác đã được đăng xuất.',
      });
    },
    onError: (error) => {
      reportUnexpected('Changing the password failed', error);
      const fieldErrors = error instanceof ApiError ? error.fieldErrors() : {};
      const field = firstInvalidField(fieldOrder, fieldErrors);
      if (field !== undefined) {
        form.setServerErrors(fieldErrors);
        document.getElementById(fieldIds[field])?.focus();
        return;
      }
      setFormError(problemMessage(error));
    },
  });
  const logout = useLogout();
  // Changed elsewhere meanwhile (ADR-026): this session no longer counts, so logging in again is
  // the way on.
  const signInAgain = change.error instanceof ApiError && change.error.code === 'password_changed';

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
    if (result.data.newPassword !== result.data.confirm) {
      form.setServerErrors({ confirm: PASSWORDS_DIFFER });
      document.getElementById(fieldIds.confirm)?.focus();
      return;
    }
    change.mutate({
      currentPassword: result.data.currentPassword,
      newPassword: result.data.newPassword,
    });
  }

  function bind(field: PasswordField) {
    return {
      name: field,
      type: 'password',
      value: form.values[field],
      onChange: (event: { target: { value: string } }) => {
        form.setValue(field, event.target.value);
      },
    };
  }

  return (
    <form method="post" noValidate className={styles.form} onSubmit={handleSubmit}>
      <Field
        label="Mật khẩu hiện tại"
        id={fieldIds.currentPassword}
        required
        error={form.errors.currentPassword}
      >
        <Input autoComplete="current-password" {...bind('currentPassword')} />
      </Field>
      <Field
        label="Mật khẩu mới"
        id={fieldIds.newPassword}
        required
        help="Ít nhất 8 ký tự."
        error={form.errors.newPassword}
      >
        <Input autoComplete="new-password" {...bind('newPassword')} />
      </Field>
      {/* Enter in this field leaves the focus in it: the live region says the passwords differ. */}
      <Field
        label="Nhập lại mật khẩu mới"
        id={fieldIds.confirm}
        required
        error={form.errors.confirm}
        announceMessages
      >
        <Input autoComplete="new-password" {...bind('confirm')} />
      </Field>
      {formError === null ? null : (
        <Callout
          tone="danger"
          role="alert"
          action={
            signInAgain ? (
              <Button
                variant="secondary"
                size="sm"
                loading={logout.isPending}
                onClick={() => {
                  void logout.signOut();
                }}
              >
                Đăng nhập lại
              </Button>
            ) : undefined
          }
        >
          {formError}
        </Callout>
      )}
      <div className={styles.actions}>
        <Button type="submit" loading={change.isPending} onMouseDown={keepFieldFocus}>
          Đổi mật khẩu
        </Button>
      </div>
    </form>
  );
}
