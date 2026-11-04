'use client';

import {
  type ContactListItem,
  type ContactPerson,
  createContactRequestSchema,
  endpoints,
  type ManualContactChannel,
  manualContactChannelLabels,
  manualContactChannels,
  manualContactChannelSchema,
} from '@plp/contracts';
import { Button, Callout, Checkbox, Dialog, Field, Input, Select } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { type SubmitEvent, useId, useRef, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { problemBesideFields, reportUnexpected } from '../shell/problem-message';
import { firstInvalidField, keepFieldFocus, useSchemaForm } from '../shell/use-schema-form';
import styles from './Contacts.module.css';

export interface AddContactDialogProps {
  siteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (contact: ContactListItem) => void;
  /** "Tìm hồ sơ đó": the list searches the number that already has a profile. */
  onFindExisting: (phone: string) => void;
}

const FIELDS = ['name', 'phone'] as const;
const nameAndPhoneSchema = createContactRequestSchema.pick({ name: true, phone: true });

/**
 * "Thêm khách hàng" (board 22, ADR-033): someone who called, came in or wrote. The source is
 * required and kept as proof of where the data came from; the agreement to offers is ticked only
 * when the person said so.
 */
export function AddContactDialog({
  siteId,
  open,
  onOpenChange,
  onAdded,
  onFindExisting,
}: AddContactDialogProps) {
  const formId = useId();
  const form = useSchemaForm(nameAndPhoneSchema, { name: '', phone: '' });
  const [channel, setChannel] = useState<ManualContactChannel>('phone_call');
  const [marketing, setMarketing] = useState(false);
  const [existing, setExisting] = useState<ContactPerson | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  const add = useMutation({
    mutationFn: (body: { name: string; phone: string }) =>
      api(endpoints.createContact, [siteId], { body: { ...body, channel, marketing } }),
    onSuccess: (result) => {
      if (result.status === 'exists') {
        setExisting(result.contact);
        return;
      }
      onAdded(result.contact);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        form.setServerErrors(error.fieldErrors());
        if (Object.keys(error.fieldErrors()).length > 0) {
          return;
        }
      }
      reportUnexpected('Adding a contact failed', error);
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    add.reset();
    setExisting(null);
    const result = form.validate();
    if (!result.ok) {
      const field = firstInvalidField(FIELDS, result.errors);
      if (field !== undefined) {
        ({ name: nameRef, phone: phoneRef })[field].current?.focus();
      }
      return;
    }
    add.mutate(form.values);
  }

  const formError = add.error === null ? null : problemBesideFields(add.error, FIELDS);
  const ready = form.values.name.trim() !== '' && form.values.phone.trim() !== '';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && add.isPending) {
          return;
        }
        onOpenChange(next);
      }}
      title="Thêm khách hàng"
      footer={
        <>
          <Button
            variant="secondary"
            disabled={add.isPending}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Hủy
          </Button>
          <Button
            type="submit"
            form={formId}
            loading={add.isPending}
            disabled={!ready}
            onMouseDown={keepFieldFocus}
          >
            Thêm khách hàng
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.addForm} noValidate onSubmit={submit}>
        <div className={styles.addPair}>
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
              aria-invalid={existing === null ? undefined : true}
              onChange={(event) => {
                setExisting(null);
                form.setValue('phone', event.target.value);
              }}
              onBlur={() => {
                form.blur('phone');
              }}
            />
          </Field>
        </div>
        {existing === null ? null : (
          <div role="status" className={styles.exists}>
            <span>
              Số này đã thuộc hồ sơ <strong>{existing.name}</strong>.
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onFindExisting(form.values.phone);
              }}
            >
              Tìm hồ sơ đó
            </Button>
          </div>
        )}
        <Field
          label="Bạn có thông tin này từ đâu?"
          required
          help="Bắt buộc, được lưu cùng hồ sơ để chứng minh nguồn dữ liệu."
        >
          <Select
            value={channel}
            onChange={(event) => {
              const picked = manualContactChannelSchema.safeParse(event.target.value);
              if (picked.success) {
                setChannel(picked.data);
              }
            }}
          >
            {manualContactChannels.map((id) => (
              <option key={id} value={id}>
                {manualContactChannelLabels[id]}
              </option>
            ))}
          </Select>
        </Field>
        <Checkbox
          checked={marketing}
          onChange={(event) => {
            setMarketing(event.target.checked);
          }}
          label={
            <>
              Khách đã đồng ý nhận thông tin ưu đãi{' '}
              <span className={styles.muted}>(chỉ tick khi khách nói rõ)</span>
            </>
          }
        />
        {formError === null ? null : (
          <Callout tone="danger" role="alert" title="Chưa thêm được khách hàng">
            {formError}
          </Callout>
        )}
      </form>
    </Dialog>
  );
}
