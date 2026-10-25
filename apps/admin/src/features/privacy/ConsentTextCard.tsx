'use client';

import {
  CONTROLLER_NAME_PLACEHOLDER,
  type ConsentVersion,
  createConsentVersionRequestSchema,
  endpoints,
  fillControllerName,
  MARKETING_CONSENT_MAX,
  REQUIRED_CONSENT_MAX,
  SUGGESTED_MARKETING_CONSENT_TEXT,
  SUGGESTED_REQUIRED_CONSENT_TEXT,
} from '@plp/contracts';
import {
  Badge,
  Button,
  Callout,
  Card,
  Field,
  Input,
  LockIcon,
  Switch,
  Textarea,
  useToast,
} from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { fieldError } from '../shell/use-schema-form';
import { ConsentHistoryDialog, consentVersionsQueryKey } from './ConsentHistoryDialog';
import { consentBadgeText } from './privacy-presentation';
import styles from './PrivacyScreen.module.css';

const { requiredText: requiredTextSchema, marketingText: marketingTextSchema } =
  createConsentVersionRequestSchema.shape;

interface TextErrors {
  requiredText: string | undefined;
  marketingText: string | undefined;
}

const NO_ERRORS: TextErrors = { requiredText: undefined, marketingText: undefined };

interface Texts {
  requiredText: string;
  marketing: boolean;
  marketingText: string;
}

/** The saved version, or the design's suggested texts when there is none yet. */
function textsOf(version: ConsentVersion | null): Texts {
  return {
    requiredText: version?.requiredText ?? SUGGESTED_REQUIRED_CONSENT_TEXT,
    marketing: version === null || version.marketingText !== null,
    marketingText: version?.marketingText ?? SUGGESTED_MARKETING_CONSENT_TEXT,
  };
}

function differsFrom(texts: Texts, version: ConsentVersion | null): boolean {
  if (version === null) {
    return true;
  }
  const marketingText = texts.marketing ? texts.marketingText.trim() : null;
  return (
    texts.requiredText.trim() !== version.requiredText || marketingText !== version.marketingText
  );
}

export interface ConsentTextCardProps {
  siteId: string;
  current: ConsentVersion | null;
  /** The saved business name, filled into the preview; null until the settings are saved. */
  controllerName: string | null;
  /** Only the workspace owner saves a new version (ADR-004). */
  canEdit: boolean;
  onSaved: (version: ConsentVersion) => void;
}

/**
 * "Nội dung đồng ý trên form": the required consent text, the optional marketing checkbox and a
 * preview of what visitors see. Saving creates the next immutable version (rule 10); leads keep
 * the version they agreed to.
 */
export function ConsentTextCard({
  siteId,
  current,
  controllerName,
  canEdit,
  onSaved,
}: ConsentTextCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const headingId = useId();
  const requiredRef = useRef<HTMLTextAreaElement>(null);
  const marketingRef = useRef<HTMLInputElement>(null);
  const [texts, setTexts] = useState(() => textsOf(current));
  const [errors, setErrors] = useState<TextErrors>(NO_ERRORS);
  const [historyOpen, setHistoryOpen] = useState(false);
  const changed = differsFrom(texts, current);
  const nextVersion = (current?.version ?? 0) + 1;
  const disabled = !canEdit;

  const save = useMutation({
    mutationFn: () =>
      api(endpoints.createConsentVersion, [siteId], {
        body: {
          baseVersion: current?.version ?? 0,
          requiredText: texts.requiredText,
          marketingText: texts.marketing ? texts.marketingText : null,
        },
      }),
    onSuccess: (created) => {
      toast({ tone: 'success', title: `Đã lưu nội dung đồng ý bản ${created.version}` });
      void queryClient.invalidateQueries({ queryKey: consentVersionsQueryKey(siteId) });
      onSaved(created);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fieldErrors = error.fieldErrors();
        setErrors({
          requiredText: fieldErrors.requiredText,
          marketingText: fieldErrors.marketingText,
        });
        return;
      }
      reportUnexpected('Saving the consent text failed', error);
    },
  });

  // A version saved meanwhile (409): show the latest one instead of saving over it.
  const reload = useMutation({
    mutationFn: () => api(endpoints.getPrivacySettings, [siteId]),
    onSuccess: (settings) => {
      save.reset();
      setTexts(textsOf(settings.currentConsent));
      setErrors(NO_ERRORS);
      void queryClient.invalidateQueries({ queryKey: consentVersionsQueryKey(siteId) });
      if (settings.currentConsent !== null) {
        onSaved(settings.currentConsent);
      }
    },
    onError: (error) => {
      reportUnexpected('Reloading the consent text failed', error);
    },
  });

  function update(next: Partial<Texts>) {
    save.reset();
    setTexts((value) => ({ ...value, ...next }));
  }

  function submit() {
    const nextErrors: TextErrors = {
      requiredText: fieldError(requiredTextSchema, texts.requiredText),
      marketingText: texts.marketing
        ? fieldError(marketingTextSchema, texts.marketingText)
        : undefined,
    };
    setErrors(nextErrors);
    if (nextErrors.requiredText !== undefined) {
      requiredRef.current?.focus();
      return;
    }
    if (nextErrors.marketingText !== undefined) {
      marketingRef.current?.focus();
      return;
    }
    save.mutate();
  }

  const conflict = save.error instanceof ApiError && save.error.status === 409;
  const fieldRejected =
    save.error instanceof ApiError &&
    (save.error.fieldErrors().requiredText !== undefined ||
      save.error.fieldErrors().marketingText !== undefined);
  const formError =
    save.error === null || conflict || fieldRejected ? null : problemMessage(save.error);
  const shownName = controllerName ?? CONTROLLER_NAME_PLACEHOLDER;

  return (
    <Card as="section" padding="lg" aria-labelledby={headingId} className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 id={headingId} className={styles.cardTitle}>
          Nội dung đồng ý trên form
        </h2>
        <Badge tone={current === null ? 'warning' : 'success'}>{consentBadgeText(current)}</Badge>
      </div>

      <Field
        label="Đồng ý bắt buộc để gửi form"
        error={errors.requiredText}
        counter={
          canEdit ? { length: texts.requiredText.length, max: REQUIRED_CONSENT_MAX } : undefined
        }
        help={`Nêu rõ dữ liệu nào và dùng để làm gì. ${CONTROLLER_NAME_PLACEHOLDER} được thay bằng tên doanh nghiệp; liên kết chính sách được thêm tự động.`}
      >
        <Textarea
          ref={requiredRef}
          rows={3}
          value={texts.requiredText}
          maxLength={REQUIRED_CONSENT_MAX}
          disabled={disabled}
          onChange={(event) => {
            update({ requiredText: event.target.value });
          }}
        />
      </Field>

      <div className={styles.marketing}>
        <Switch
          label="Thêm ô đồng ý nhận ưu đãi (không bắt buộc)"
          description="Tách riêng khỏi đồng ý tư vấn. Người gửi vẫn gửi được form nếu không chọn."
          checked={texts.marketing}
          disabled={disabled}
          onCheckedChange={(marketing) => {
            update({ marketing });
          }}
        />
        {texts.marketing ? (
          <Field
            label="Nội dung ô nhận ưu đãi"
            error={errors.marketingText}
            counter={
              canEdit
                ? { length: texts.marketingText.length, max: MARKETING_CONSENT_MAX }
                : undefined
            }
          >
            <Input
              ref={marketingRef}
              value={texts.marketingText}
              maxLength={MARKETING_CONSENT_MAX}
              disabled={disabled}
              onChange={(event) => {
                update({ marketingText: event.target.value });
              }}
            />
          </Field>
        ) : null}
      </div>

      <p className={styles.lockNote}>
        <LockIcon size={16} />Ô đồng ý luôn để trống khi khách mở trang, không thể tick sẵn.
      </p>

      <div className={styles.preview} role="group" aria-labelledby={`${headingId}-preview`}>
        <span id={`${headingId}-preview`} className={styles.previewTitle}>
          Khách sẽ thấy
        </span>
        <span className={styles.previewRow}>
          <span className={styles.previewBox} aria-hidden="true" />
          <span>
            {fillControllerName(texts.requiredText, shownName)}{' '}
            <span className={styles.previewLink}>Chính sách quyền riêng tư</span>
          </span>
        </span>
        {texts.marketing ? (
          <span className={styles.previewRow}>
            <span className={styles.previewBox} aria-hidden="true" />
            <span>{texts.marketingText}</span>
          </span>
        ) : null}
      </div>

      {conflict ? (
        <Callout
          tone="warning"
          role="alert"
          title="Nội dung đồng ý vừa được lưu thành bản mới"
          action={
            <Button
              size="sm"
              variant="secondary"
              loading={reload.isPending}
              onClick={() => {
                reload.mutate();
              }}
            >
              Tải bản mới nhất
            </Button>
          }
        >
          Có người đã lưu một bản trong lúc bạn sửa. Tải bản mới nhất rồi sửa tiếp.
        </Callout>
      ) : null}
      {formError === null ? null : (
        <Callout tone="danger" role="alert" title="Chưa lưu được nội dung đồng ý">
          {formError}
        </Callout>
      )}

      <div className={styles.consentFooter}>
        <p className={styles.footerNote}>
          {canEdit ? `Lưu sẽ tạo bản ${nextVersion}. Lead cũ vẫn giữ bản đã đồng ý. ` : null}
          {current === null ? null : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setHistoryOpen(true);
              }}
            >
              Xem các bản đã lưu
            </Button>
          )}
        </p>
        {canEdit ? (
          <Button loading={save.isPending} disabled={!changed} onClick={submit}>
            {`Lưu thành bản ${nextVersion}`}
          </Button>
        ) : null}
      </div>

      <ConsentHistoryDialog siteId={siteId} open={historyOpen} onOpenChange={setHistoryOpen} />
    </Card>
  );
}
