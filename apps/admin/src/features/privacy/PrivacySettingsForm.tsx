'use client';

import {
  endpoints,
  type PrivacySettings,
  type RetentionMonths,
  type UpdatePrivacyRequest,
  updatePrivacyRequestSchema,
} from '@plp/contracts';
import { Button, Callout, Card, Field, Input, Select, useToast } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { type SubmitEvent, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { firstInvalidField, useSchemaForm } from '../shell/use-schema-form';
import {
  LIVE_FORMS_KEEP_CONSENT,
  parseRetention,
  RETENTION_NOTE,
  RETENTION_OPTIONS,
  retentionValue,
} from './privacy-presentation';
import styles from './PrivacyScreen.module.css';

const textFieldsSchema = updatePrivacyRequestSchema.pick({
  controllerName: true,
  requestEmail: true,
  policyUrl: true,
});
type TextField = keyof typeof textFieldsSchema.shape;
const FIELD_ORDER: readonly TextField[] = ['controllerName', 'requestEmail', 'policyUrl'];

/** Same bound as `controllerNameSchema`. */
const CONTROLLER_NAME_MAX = 120;

export interface PrivacySettingsFormProps {
  siteId: string;
  settings: PrivacySettings;
  /** Only the workspace owner changes these settings (ADR-004). */
  canEdit: boolean;
  onSaved: (settings: PrivacySettings) => void;
}

/** "Đơn vị thu thập dữ liệu", the privacy policy link and "Thời gian lưu lead" (ADR-017). */
export function PrivacySettingsForm({
  siteId,
  settings,
  canEdit,
  onSaved,
}: PrivacySettingsFormProps) {
  const { toast } = useToast();
  const saved = settings.privacy;
  const form = useSchemaForm(textFieldsSchema, {
    controllerName: saved?.controllerName ?? '',
    requestEmail: saved?.requestEmail ?? '',
    policyUrl: saved?.policyUrl ?? '',
  });
  const [retention, setRetention] = useState<RetentionMonths>(saved?.retentionMonths ?? 12);
  const controllerNameRef = useRef<HTMLInputElement>(null);
  const requestEmailRef = useRef<HTMLInputElement>(null);
  const policyUrlRef = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: (body: UpdatePrivacyRequest) =>
      api(endpoints.updatePrivacySettings, [siteId], { body }),
    onSuccess: (updated) => {
      toast({ tone: 'success', title: 'Đã lưu cài đặt dữ liệu cá nhân' });
      onSaved(updated);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        form.setServerErrors(error.fieldErrors());
        return;
      }
      reportUnexpected('Saving the privacy settings failed', error);
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    save.reset();
    const result = form.validate();
    if (!result.ok) {
      const field = firstInvalidField(FIELD_ORDER, result.errors);
      if (field !== undefined) {
        const refs = {
          controllerName: controllerNameRef,
          requestEmail: requestEmailRef,
          policyUrl: policyUrlRef,
        };
        refs[field].current?.focus();
      }
      return;
    }
    save.mutate({ ...form.values, retentionMonths: retention });
  }

  const fieldRejected =
    save.error instanceof ApiError && Object.keys(save.error.fieldErrors()).length > 0;
  const formError = save.error === null || fieldRejected ? null : problemMessage(save.error);
  const disabled = !canEdit;

  return (
    <form
      className={styles.column}
      noValidate
      onSubmit={submit}
      aria-label="Cài đặt dữ liệu cá nhân"
    >
      <Card as="section" padding="lg" aria-labelledby="privacy-controller" className={styles.card}>
        <h2 id="privacy-controller" className={styles.cardTitle}>
          Đơn vị thu thập dữ liệu
        </h2>
        <Field
          label="Tên doanh nghiệp"
          required
          error={form.errors.controllerName}
          counter={
            canEdit
              ? { length: form.values.controllerName.length, max: CONTROLLER_NAME_MAX }
              : undefined
          }
          help="Hiện trong nội dung đồng ý trên form, thay cho {Tên doanh nghiệp}."
        >
          <Input
            ref={controllerNameRef}
            value={form.values.controllerName}
            maxLength={CONTROLLER_NAME_MAX}
            disabled={disabled}
            autoComplete="organization"
            onChange={(event) => {
              form.setValue('controllerName', event.target.value);
            }}
            onBlur={() => {
              form.blur('controllerName');
            }}
          />
        </Field>
        <Field
          label="Email nhận yêu cầu về dữ liệu"
          optional
          error={form.errors.requestEmail}
          help="Nơi người gửi form liên hệ để xem, sửa hoặc xóa dữ liệu của họ."
        >
          <Input
            ref={requestEmailRef}
            type="email"
            value={form.values.requestEmail}
            disabled={disabled}
            autoComplete="email"
            onChange={(event) => {
              form.setValue('requestEmail', event.target.value);
            }}
            onBlur={() => {
              form.blur('requestEmail');
            }}
          />
        </Field>
        <Field
          label="Link chính sách quyền riêng tư"
          required
          error={form.errors.policyUrl}
          help="Trang chính sách của doanh nghiệp. Form gắn link này ngay sau ô đồng ý."
        >
          <Input
            ref={policyUrlRef}
            type="url"
            inputMode="url"
            placeholder="https://"
            value={form.values.policyUrl}
            disabled={disabled}
            onChange={(event) => {
              form.setValue('policyUrl', event.target.value);
            }}
            onBlur={() => {
              form.blur('policyUrl');
            }}
          />
        </Field>
      </Card>

      <Card as="section" padding="lg" aria-labelledby="privacy-retention" className={styles.card}>
        <h2 id="privacy-retention" className={styles.cardTitle}>
          Thời gian lưu lead
        </h2>
        <Field label="Tự động xóa lead và bằng chứng đồng ý sau" help={RETENTION_NOTE}>
          <Select
            value={retentionValue(retention)}
            disabled={disabled}
            onChange={(event) => {
              save.reset();
              setRetention(parseRetention(event.target.value));
            }}
          >
            {RETENTION_OPTIONS.map((option) => (
              <option key={retentionValue(option.value)} value={retentionValue(option.value)}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      {formError === null ? null : (
        <Callout tone="danger" role="alert" title="Chưa lưu được cài đặt">
          {formError}
        </Callout>
      )}
      {/* Saving is not publishing (rule 1): the note stays until the next save attempt. */}
      {save.isSuccess ? (
        <Callout tone="info" role="status">
          {LIVE_FORMS_KEEP_CONSENT}
        </Callout>
      ) : null}
      {canEdit ? (
        <div className={styles.actions}>
          <Button type="submit" loading={save.isPending}>
            Lưu cài đặt
          </Button>
        </div>
      ) : null}
    </form>
  );
}
