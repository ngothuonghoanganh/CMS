'use client';

import {
  type CreateDataRequestRequest,
  dataRequestContactSchema,
  dataRequestDeadlines,
  type DataRequestDetail,
  type DataRequestType,
  dataRequestTypeLabels,
  dataRequestTypes,
  endpoints,
  receivedAtProblem,
  vnInstantOf,
} from '@plp/contracts';
import {
  AlertCircleIcon,
  Button,
  Callout,
  Dialog,
  Field,
  Input,
  RadioCardGroup,
  useToast,
} from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { type SubmitEvent, useId, useRef, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { firstInvalidField, useSchemaForm } from '../shell/use-schema-form';
import { dataRequestTypeDescriptions } from './data-request-presentation';
import styles from './DataRequests.module.css';

/** The receipt a new request starts with: today and the time now, in Vietnam. */
export interface ReceiptDefaults {
  /** "2026-10-23" */
  day: string;
  /** "10:15" */
  time: string;
}

export interface RecordDataRequestDialogProps {
  siteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults: ReceiptDefaults;
  onRecorded: (request: DataRequestDetail) => void;
}

const CONTACT_FIELDS = ['name', 'phone', 'email'] as const;

const TYPE_OPTIONS = dataRequestTypes.map((type) => ({
  value: type,
  label: dataRequestTypeLabels[type],
  description: dataRequestTypeDescriptions[type],
}));

/** The instant of the receipt fields (Vietnam time), or null while they are incomplete. */
function receiptOf(day: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }
  const at = vnInstantOf(day, time);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * "Ghi nhận yêu cầu" (board 12, ADR-017): a request that came by email or phone, who made it and
 * when. The deadlines show as soon as the receipt is set.
 */
export function RecordDataRequestDialog({
  siteId,
  open,
  onOpenChange,
  defaults,
  onRecorded,
}: RecordDataRequestDialogProps) {
  const { toast } = useToast();
  const formId = useId();
  const typeErrorId = `${formId}-type-error`;
  const form = useSchemaForm(dataRequestContactSchema, { name: '', phone: '', email: '' });
  const [type, setType] = useState<DataRequestType | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [day, setDay] = useState(defaults.day);
  const [time, setTime] = useState(defaults.time);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLDivElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);

  const record = useMutation({
    mutationFn: (body: CreateDataRequestRequest) =>
      api(endpoints.createDataRequest, [siteId], { body }),
    onSuccess: (request) => {
      toast({ tone: 'success', title: 'Đã ghi nhận yêu cầu' });
      onRecorded(request);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors();
        form.setServerErrors(fields);
        const receipt = fields['receivedAt'];
        if (receipt !== undefined) {
          setReceiptError(receipt);
          dayRef.current?.focus();
        }
        if (Object.keys(fields).length > 0) {
          return;
        }
      }
      reportUnexpected('Recording a data request failed', error);
    },
  });

  const receivedAt = receiptOf(day, time);
  const deadlines = receivedAt === null ? null : dataRequestDeadlines(receivedAt);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    record.reset();
    const contact = form.validate();
    const typeProblem = type === null ? 'Chọn điều người đó yêu cầu' : null;
    setTypeError(typeProblem);
    const receiptProblem =
      receivedAt === null
        ? 'Chọn ngày và giờ nhận yêu cầu'
        : receivedAtProblem(receivedAt, new Date());
    setReceiptError(receiptProblem);
    if (!contact.ok) {
      const field = firstInvalidField(CONTACT_FIELDS, contact.errors);
      if (field !== undefined) {
        const refs = { name: nameRef, phone: phoneRef, email: emailRef };
        refs[field].current?.focus();
      }
      return;
    }
    if (type === null) {
      typeRef.current?.querySelector('input')?.focus();
      return;
    }
    if (receiptProblem !== null || receivedAt === null) {
      dayRef.current?.focus();
      return;
    }
    record.mutate({ ...form.values, type, receivedAt: receivedAt.toISOString() });
  }

  const fieldRejected =
    record.error instanceof ApiError && Object.keys(record.error.fieldErrors()).length > 0;
  const formError = record.error === null || fieldRejected ? null : problemMessage(record.error);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Ghi nhận yêu cầu"
      description="Yêu cầu của người đã gửi form, nhận qua email hoặc điện thoại."
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
          <Button type="submit" form={formId} loading={record.isPending}>
            Ghi nhận
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} noValidate onSubmit={submit}>
        <div className={styles.row}>
          <Field label="Họ tên người yêu cầu" optional error={form.errors.name}>
            <Input
              ref={nameRef}
              value={form.values.name}
              maxLength={100}
              // Someone else's details: the browser must not fill in the owner's own.
              autoComplete="off"
              onChange={(event) => {
                form.setValue('name', event.target.value);
              }}
              onBlur={() => {
                form.blur('name');
              }}
            />
          </Field>
        </div>
        <div className={styles.row}>
          <Field
            label="Số điện thoại"
            error={form.errors.phone}
            help="Nhập số điện thoại, email hoặc cả hai: dùng để tìm các lead của người này."
          >
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
          <Field label="Email" error={form.errors.email}>
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
        </div>
        <div ref={typeRef} className={styles.block}>
          <RadioCardGroup
            legend="Người đó yêu cầu"
            showLegend
            options={TYPE_OPTIONS}
            value={type}
            minColumnWidth={240}
            // Focus goes to the first radio: the reason is read with it, like a field's error.
            describedBy={typeError === null ? undefined : typeErrorId}
            invalid={typeError !== null}
            onChange={(value) => {
              setType(value);
              setTypeError(null);
            }}
          />
          {typeError === null ? null : (
            <p id={typeErrorId} className={styles.fieldError}>
              <AlertCircleIcon size={14} strokeWidth={2} />
              {typeError}
            </p>
          )}
        </div>
        <div className={styles.row}>
          <Field label="Ngày nhận" error={receiptError ?? undefined}>
            <Input
              ref={dayRef}
              type="date"
              value={day}
              onChange={(event) => {
                setDay(event.target.value);
                setReceiptError(null);
              }}
            />
          </Field>
          <Field label="Giờ nhận" help="Giờ Việt Nam">
            <Input
              type="time"
              value={time}
              onChange={(event) => {
                setTime(event.target.value);
                setReceiptError(null);
              }}
            />
          </Field>
        </div>
        <p className={styles.preview} aria-live="polite">
          {deadlines === null
            ? 'Chọn ngày và giờ nhận để xem hạn xử lý.'
            : `Phản hồi trước ${formatDate(deadlines.respondBy)} · Hoàn tất trước ${formatDate(deadlines.completeBy)} (tính theo ngày làm việc)`}
        </p>
        {formError === null ? null : (
          <Callout tone="danger" role="alert" title="Chưa ghi nhận được yêu cầu">
            {formError}
          </Callout>
        )}
      </form>
    </Dialog>
  );
}
