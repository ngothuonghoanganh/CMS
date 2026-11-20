'use client';

import { type BillingInfo, billingInfoSchema, endpoints } from '@plp/contracts';
import { Button, Callout, Field, Input, useToast } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type KeyboardEvent, type SubmitEvent, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { firstInvalidField, keepFieldFocus, useSchemaForm } from '../shell/use-schema-form';
import { problemBesideFields, reportUnexpected } from '../shell/problem-message';
import { billingInfoValues, taxCodeMessage } from './payment-presentation';
import { billingQueryKeys } from './queries';
import { paymentsMessage } from './payment-problem';
import styles from './Payments.module.css';

export interface BillingInfoCardProps {
  workspaceId: string;
  info: BillingInfo | null;
}

const FIELD_ORDER = ['companyName', 'taxCode', 'address', 'email'] as const;
const FIELD_IDS = {
  companyName: 'iv-name',
  taxCode: 'iv-tax',
  address: 'iv-address',
  email: 'iv-mail',
} as const;

/**
 * "Thông tin xuất hóa đơn" (board 29): the company's name, tax code, address and email, copied
 * onto each invoice when it is made. A change applies to later invoices only.
 */
export function BillingInfoCard({ workspaceId, info }: BillingInfoCardProps) {
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);

  function close() {
    setEditing(false);
    // The form leaves the page: focus goes back to the button that opened it.
    requestAnimationFrame(() => {
      editButton.current?.focus();
    });
  }

  return (
    <section aria-labelledby="billing-info-title" className={styles.card}>
      <div className={styles.cardHead}>
        <h2 id="billing-info-title" className={styles.cardTitle}>
          Thông tin xuất hóa đơn
        </h2>
        {editing ? null : (
          <Button
            ref={editButton}
            variant="secondary"
            size="sm"
            onClick={() => {
              setEditing(true);
            }}
          >
            {info === null ? 'Nhập thông tin' : 'Sửa'}
          </Button>
        )}
      </div>
      {editing ? (
        <BillingInfoForm workspaceId={workspaceId} info={info} onClose={close} />
      ) : info === null ? (
        <p className={styles.noMethod}>
          Chưa có thông tin. Nhập tên đơn vị và mã số thuế để hóa đơn ghi đúng đơn vị của bạn.
        </p>
      ) : (
        <dl className={styles.facts}>
          <dt>Tên đơn vị</dt>
          <dd>{info.companyName}</dd>
          <dt>Mã số thuế</dt>
          <dd className={styles.mono}>{info.taxCode}</dd>
          <dt>Địa chỉ</dt>
          <dd>{info.address}</dd>
          <dt>Email nhận hóa đơn</dt>
          <dd>{info.email}</dd>
        </dl>
      )}
    </section>
  );
}

function BillingInfoForm({
  workspaceId,
  info,
  onClose,
}: {
  workspaceId: string;
  info: BillingInfo | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const form = useSchemaForm(billingInfoSchema, billingInfoValues(info));
  const [formError, setFormError] = useState<string | null>(null);

  // The button that opened the form is gone: focus moves into the form, on its first field.
  useEffect(() => {
    document.getElementById(FIELD_IDS.companyName)?.focus();
  }, []);

  const save = useMutation({
    mutationFn: (body: BillingInfo) => api(endpoints.updateBillingInfo, [workspaceId], { body }),
    onSuccess: (saved) => {
      queryClient.setQueryData(billingQueryKeys.info(workspaceId), saved);
      toast({ tone: 'success', title: 'Đã lưu thông tin xuất hóa đơn' });
      onClose();
    },
    onError: (error) => {
      reportUnexpected('Saving the billing info failed', error);
      const fieldErrors = error instanceof ApiError ? error.fieldErrors() : {};
      form.setServerErrors(fieldErrors);
      const shown = FIELD_ORDER.filter((field) => fieldErrors[field] !== undefined);
      const first = shown[0];
      if (first !== undefined) {
        document.getElementById(FIELD_IDS[first])?.focus();
      }
      setFormError(
        error instanceof ApiError && error.status === 403
          ? paymentsMessage(error)
          : problemBesideFields(error, shown),
      );
    },
  });

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const result = form.validate();
    if (!result.ok) {
      const first = firstInvalidField(FIELD_ORDER, result.errors);
      if (first !== undefined) {
        document.getElementById(FIELD_IDS[first])?.focus();
      }
      return;
    }
    save.mutate(result.data);
  }

  // Esc is "Hủy", as in a dialog: the form closes and focus goes back to the button.
  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Escape' && !save.isPending) {
      event.preventDefault();
      onClose();
    }
  }

  function bind(field: (typeof FIELD_ORDER)[number]) {
    return {
      value: form.values[field],
      onChange: (event: { target: { value: string } }) => {
        form.setValue(field, event.target.value);
      },
      onBlur: () => {
        form.blur(field);
      },
    };
  }

  return (
    <form
      noValidate
      aria-label="Thông tin xuất hóa đơn"
      className={styles.form}
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
    >
      <Field label="Tên đơn vị" id={FIELD_IDS.companyName} required error={form.errors.companyName}>
        <Input name="companyName" autoComplete="organization" {...bind('companyName')} />
      </Field>
      <Field
        label="Mã số thuế"
        id={FIELD_IDS.taxCode}
        required
        error={taxCodeMessage(form.values.taxCode, form.errors.taxCode)}
      >
        <Input name="taxCode" mono inputMode="numeric" {...bind('taxCode')} />
      </Field>
      <Field label="Địa chỉ" id={FIELD_IDS.address} required error={form.errors.address}>
        <Input name="address" autoComplete="street-address" {...bind('address')} />
      </Field>
      <Field
        label="Email nhận hóa đơn điện tử"
        id={FIELD_IDS.email}
        required
        error={form.errors.email}
      >
        <Input name="email" type="email" inputMode="email" {...bind('email')} />
      </Field>
      <p className={styles.fine}>
        Thông tin mới áp dụng cho hóa đơn từ kỳ sau. Hóa đơn đã xuất không đổi.
      </p>
      {formError === null ? null : (
        <Callout tone="danger" role="alert">
          {formError}
        </Callout>
      )}
      <div className={styles.formActions}>
        <Button variant="secondary" disabled={save.isPending} onClick={onClose}>
          Hủy
        </Button>
        <Button type="submit" loading={save.isPending} onMouseDown={keepFieldFocus}>
          Lưu
        </Button>
      </div>
    </form>
  );
}
