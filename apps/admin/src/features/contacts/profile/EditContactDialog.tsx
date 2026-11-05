'use client';

import {
  type ContactProfile,
  endpoints,
  formatLeadPhone,
  type UpdateContactDetailsRequest,
  updateContactDetailsRequestSchema,
} from '@plp/contracts';
import { Button, Callout, Dialog, Field, Input } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { type SubmitEvent, useId, useRef } from 'react';
import { ApiError, api } from '../../../lib/api';
import { problemBesideFields, reportUnexpected } from '../../shell/problem-message';
import { firstInvalidField, keepFieldFocus, useSchemaForm } from '../../shell/use-schema-form';
import styles from './ContactProfile.module.css';

export interface EditContactDialogProps {
  siteId: string;
  contact: ContactProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (contact: ContactProfile) => void;
}

const FIELDS = ['name', 'phone', 'email'] as const;

/**
 * "Sửa thông tin" of a profile (`personalData.manage`, ADR-017, ADR-033): how the person is named
 * and reached. The leads keep what the person sent, as evidence.
 */
export function EditContactDialog({
  siteId,
  contact,
  open,
  onOpenChange,
  onSaved,
}: EditContactDialogProps) {
  const formId = useId();
  const form = useSchemaForm(updateContactDetailsRequestSchema, {
    name: contact.name,
    phone: contact.phone === null ? '' : formatLeadPhone(contact.phone),
    email: contact.email ?? '',
  });
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: (body: UpdateContactDetailsRequest) =>
      api(endpoints.updateContactDetails, [siteId, contact.id], { body }),
    onSuccess: (updated) => {
      onSaved(updated);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        form.setServerErrors(error.fieldErrors());
        if (Object.keys(error.fieldErrors()).length > 0) {
          return;
        }
      }
      reportUnexpected('Correcting a contact failed', error);
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

  // Said above the form unless every problem is already beside its field.
  const formError = save.error === null ? null : problemBesideFields(save.error, FIELDS);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A running save cannot be dismissed half-way: its answer shows here.
        if (!next && save.isPending) {
          return;
        }
        onOpenChange(next);
      }}
      title="Sửa thông tin"
      description="Ví dụ khi khách nhờ sửa họ tên, số điện thoại hoặc email."
      footer={
        <>
          <Button
            variant="secondary"
            disabled={save.isPending}
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
      <form id={formId} className={styles.dialogForm} noValidate onSubmit={submit}>
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
        <p className={styles.empty}>
          Các lead giữ nguyên thông tin khách đã gửi, cùng bằng chứng đồng ý.
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
