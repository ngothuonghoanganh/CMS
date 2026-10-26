import { LEAD_ROUTE, leadFormFieldNames as names, type PublicLeadCapture } from '@plp/contracts';
import type { Ref, SubmitEvent } from 'react';
import type { LeadFormContent } from '../schema/sections/lead-form.js';
import frame from './frame.module.css';
import styles from './sections/LeadForm.module.css';

/** Fields that can show an error under them. */
export type LeadFormErrorField = 'name' | 'phone' | 'email' | 'message' | 'consent';

/** The send button's label while a lead is on its way. */
const SENDING_LABEL = 'Đang gửi…';

/** What the lead form shows; serializable, so the renderer can hand it to a client component. */
export interface LeadFormViewProps {
  sectionId: string;
  content: LeadFormContent;
  capture: PublicLeadCapture | null;
  /** The release the form sends back (ADR-016); null when the form cannot send (previews). */
  releaseId: string | null;
}

/** State of an interactive form, set by the renderer's client component. */
export interface LeadFormInteraction {
  errors?: Partial<Record<LeadFormErrorField, string>>;
  formError?: string | null;
  submitting?: boolean;
  onSubmit?: (event: SubmitEvent<HTMLFormElement>) => void;
}

/** Id of a field's control, so the client can focus the first field with an error. */
export function leadFieldId(sectionId: string, field: LeadFormErrorField): string {
  return `lead-${sectionId}-${field}`;
}

function errorId(sectionId: string, field: LeadFormErrorField): string {
  return `${leadFieldId(sectionId, field)}-error`;
}

interface FieldErrorProps {
  sectionId: string;
  field: LeadFormErrorField;
  message: string | undefined;
}

function FieldError({ sectionId, field, message }: FieldErrorProps) {
  return message === undefined ? null : (
    <span id={errorId(sectionId, field)} className={styles.error}>
      {message}
    </span>
  );
}

function invalidProps(sectionId: string, field: LeadFormErrorField, message: string | undefined) {
  return message === undefined
    ? {}
    : { 'aria-invalid': true, 'aria-describedby': errorId(sectionId, field) };
}

/**
 * The lead form as visitors see it (ADR-016): a plain `<form method="post">` that works without
 * JavaScript, rendered by the server and hydrated by the renderer's client component with the same
 * markup. The consent box is never ticked in advance (rule 10).
 */
export function LeadFormView({
  sectionId,
  content,
  capture,
  releaseId,
  errors = {},
  formError = null,
  submitting = false,
  onSubmit,
}: LeadFormViewProps & LeadFormInteraction) {
  const headingId = `lead-${sectionId}-heading`;
  const canSend = releaseId !== null && capture !== null;
  const id = (field: LeadFormErrorField) => leadFieldId(sectionId, field);
  return (
    <div className={styles.root}>
      <div className={styles.intro}>
        <h2 id={headingId} className={styles.heading}>
          {content.heading}
        </h2>
        {content.description.trim() === '' ? null : (
          <p className={[styles.description, frame.preLine].join(' ')}>{content.description}</p>
        )}
      </div>
      <form
        className={styles.form}
        method="post"
        action={canSend ? LEAD_ROUTE : undefined}
        noValidate
        aria-labelledby={headingId}
        onSubmit={onSubmit}
      >
        {releaseId === null ? null : (
          <input type="hidden" name={names.releaseId} value={releaseId} />
        )}
        <div className={styles.trap} aria-hidden="true">
          <label>
            Để trống ô này
            <input type="text" name={names.honeypot} tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <div className={styles.field}>
          <label htmlFor={id('name')} className={styles.label}>
            Họ và tên
          </label>
          <input
            id={id('name')}
            className={styles.input}
            type="text"
            name={names.name}
            autoComplete="name"
            maxLength={100}
            required
            {...invalidProps(sectionId, 'name', errors.name)}
          />
          <FieldError sectionId={sectionId} field="name" message={errors.name} />
        </div>
        <div className={styles.field}>
          <label htmlFor={id('phone')} className={styles.label}>
            Số điện thoại
          </label>
          <input
            id={id('phone')}
            className={styles.input}
            type="tel"
            inputMode="tel"
            name={names.phone}
            autoComplete="tel"
            maxLength={24}
            required
            {...invalidProps(sectionId, 'phone', errors.phone)}
          />
          <FieldError sectionId={sectionId} field="phone" message={errors.phone} />
        </div>
        {content.showEmail ? (
          <div className={styles.field}>
            <label htmlFor={id('email')} className={styles.label}>
              Email <span className={styles.optional}>(không bắt buộc)</span>
            </label>
            <input
              id={id('email')}
              className={styles.input}
              type="email"
              name={names.email}
              autoComplete="email"
              maxLength={254}
              {...invalidProps(sectionId, 'email', errors.email)}
            />
            <FieldError sectionId={sectionId} field="email" message={errors.email} />
          </div>
        ) : null}
        {content.showMessage ? (
          <div className={styles.field}>
            <label htmlFor={id('message')} className={styles.label}>
              Lời nhắn <span className={styles.optional}>(không bắt buộc)</span>
            </label>
            <textarea
              id={id('message')}
              className={[styles.input, styles.textarea].join(' ')}
              name={names.message}
              rows={3}
              maxLength={1000}
              {...invalidProps(sectionId, 'message', errors.message)}
            />
            <FieldError sectionId={sectionId} field="message" message={errors.message} />
          </div>
        ) : null}

        {capture === null ? (
          <p className={styles.note}>
            Ô đồng ý sẽ hiện khi site có nội dung đồng ý ở mục “Dữ liệu &amp; đồng ý”.
          </p>
        ) : (
          <>
            <div className={styles.check}>
              <input
                id={id('consent')}
                className={styles.checkbox}
                type="checkbox"
                name={names.consent}
                value="yes"
                required
                {...invalidProps(sectionId, 'consent', errors.consent)}
              />
              <span>
                <label htmlFor={id('consent')}>{capture.requiredText}</label>{' '}
                <a
                  className={styles.policy}
                  href={capture.policyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Chính sách quyền riêng tư
                </a>
              </span>
            </div>
            <FieldError sectionId={sectionId} field="consent" message={errors.consent} />
            {capture.marketingText === null ? null : (
              <label className={styles.check}>
                <input
                  className={styles.checkbox}
                  type="checkbox"
                  name={names.marketing}
                  value="yes"
                />
                <span>{capture.marketingText}</span>
              </label>
            )}
          </>
        )}

        {formError === null ? null : (
          <p role="alert" className={styles.formError}>
            {formError}
          </p>
        )}
        {/* Only a preview cannot send. While sending the button stays focusable (the client drops
            a second submit): disabling it would drop focus to the page, and a refused send would
            leave the visitor nowhere near the form. Its label says that the send is under way. */}
        <button
          type="submit"
          className={[frame.button, frame.buttonPrimary, styles.submit].join(' ')}
          disabled={!canSend}
          aria-disabled={submitting || undefined}
          aria-busy={submitting || undefined}
        >
          {submitting ? SENDING_LABEL : content.submitLabel}
        </button>
        {releaseId === null ? (
          <p className={styles.note}>Bản xem trước: form không gửi đi.</p>
        ) : null}
      </form>
    </div>
  );
}

export interface LeadFormSentProps {
  content: LeadFormContent;
  /** Focused after sending, so screen readers start from the confirmation. */
  headingRef?: Ref<HTMLHeadingElement>;
}

/** What replaces the form once the lead was received. */
export function LeadFormSent({ content, headingRef }: LeadFormSentProps) {
  return (
    <div className={styles.sent} role="status">
      <span className={styles.sentIcon} aria-hidden="true">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <h2 ref={headingRef} tabIndex={-1} className={styles.heading}>
        {content.successTitle}
      </h2>
      {content.successMessage.trim() === '' ? null : (
        <p className={[styles.description, frame.preLine].join(' ')}>{content.successMessage}</p>
      )}
    </div>
  );
}
