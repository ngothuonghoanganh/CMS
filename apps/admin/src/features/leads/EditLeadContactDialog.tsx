'use client';

import {
  endpoints,
  formatLeadPhone,
  type LeadDetail,
  type UpdateLeadContactRequest,
  updateLeadContactRequestSchema,
} from '@plp/contracts';
import { Button, Callout, Dialog, Field, Input } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { type SubmitEvent, useId, useRef } from 'react';
import { ApiError, api } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { firstInvalidField, keepFieldFocus, useSchemaForm } from '../shell/use-schema-form';
import styles from './LeadInbox.module.css';

export interface EditLeadContactDialogProps {
  lead: LeadDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (lead: LeadDetail) => void;
  /** The lead was deleted meanwhile. */
  onGone: () => void;
}

const FIELDS = ['name', 'phone', 'email'] as const;

/**
 * "Sửa thông tin" (owner only, ADR-017): corrects how the person is named and reached, e.g. when
 * they asked for it. The consent evidence stays as it was given.
 */
export function EditLeadContactDialog({
  lead,
  open,
  onOpenChange,
  onSaved,
  onGone,
}: EditLeadContactDialogProps) {
  const formId = useId();
  const form = useSchemaForm(updateLeadContactRequestSchema, {
    name: lead.name,
    phone: formatLeadPhone(lead.phone),
    email: lead.email ?? '',
  });
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: (body: UpdateLeadContactRequest) =>
      api(endpoints.updateLeadContact, [lead.id], { body }),
    onSuccess: (updated) => {
      onSaved(updated);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        if (error.status === 404) {
          onGone();
          return;
        }
        form.setServerErrors(error.fieldErrors());
        if (Object.keys(error.fieldErrors()).length > 0) {
          return;
        }
      }
      reportUnexpected('Correcting a lead failed', error);
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    save.reset();
    const result = form.validate();
    if (!result.ok) {
      const field = firstInvalidField(FIELDS, result.errors);
      if (field !== undefined) {
        const refs = { name: nameRef, phone: phoneRef, email: emailRef };
        refs[field].current?.focus();
      }
      return;
    }
    save.mutate(form.values);
  }

  const fieldRejected =
    save.error instanceof ApiError && Object.keys(save.error.fieldErrors()).length > 0;
  const formError = save.error === null || fieldRejected ? null : problemMessage(save.error);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Sửa thông tin"
      description="Ví dụ khi người gửi form nhờ sửa họ tên, số điện thoại hoặc email."
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Hủy
          </Button>
          <Button type="submit" form={formId} loading={save.isPending} onMouseDown={keepFieldFocus}>
            Lưu thông tin
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.contactForm} noValidate onSubmit={submit}>
        <Field label="Họ và tên" required error={form.errors.name}>
          <Input
            ref={nameRef}
            value={form.values.name}
            maxLength={100}
            autoComplete="off"
            onChange={(event) => {
              form.setValue('name', event.target.value);
            }}
            onBlur={() => {
              form.blur('name');
            }}
          />
        </Field>
        <Field label="Số điện thoại" required error={form.errors.phone}>
          <Input
            ref={phoneRef}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={form.values.phone}
            onChange={(event) => {
              form.setValue('phone', event.target.value);
            }}
            onBlur={() => {
              form.blur('phone');
            }}
          />
        </Field>
        <Field label="Email" optional error={form.errors.email}>
          <Input
            ref={emailRef}
            type="email"
            autoComplete="off"
            value={form.values.email}
            onChange={(event) => {
              form.setValue('email', event.target.value);
            }}
            onBlur={() => {
              form.blur('email');
            }}
          />
        </Field>
        <p className={styles.confirmNote}>
          Lead được tìm theo số điện thoại và email mới. Bằng chứng đồng ý giữ nguyên.
        </p>
        {formError === null ? null : (
          <Callout tone="danger" role="alert" title="Chưa lưu được thông tin">
            {formError}
          </Callout>
        )}
      </form>
    </Dialog>
  );
}
