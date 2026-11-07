'use client';

import {
  AUTOMATION_EMAIL_RECIPIENTS_MAX,
  AUTOMATION_EMAIL_SUBJECT_MAX,
  AUTOMATION_ROTATION_MAX,
  type AutomationAction,
  type AutomationCondition,
  type AutomationOptions,
  automationPlaceholders,
  type AutomationTrigger,
  leadStillNewMinutes,
  opportunityStageLabels,
  opportunityStages,
  WEBHOOK_URL_MAX,
} from '@plp/contracts';
import {
  Button,
  Checkbox,
  CopyIcon,
  Field,
  IconButton,
  Input,
  RefreshIcon,
  Select,
  TrashIcon,
  useToast,
} from '@plp/ui';
import { useId, useRef } from 'react';
import { parseVnd, formatVnd } from '../../lib/format';
import {
  actionKindLabels,
  actionProblem,
  conditionKindLabels,
  conditionProblem,
  newTrigger,
  webhookUrlProblem,
} from './automation-steps';
import styles from './AutomationEditor.module.css';

const TRIGGER_KINDS: ReadonlyArray<[AutomationTrigger['kind'], string]> = [
  ['lead_created', 'Có lead mới'],
  ['lead_still_new', 'Lead còn “Mới” sau một lúc'],
  ['opportunity_stage_changed', 'Cơ hội đổi giai đoạn'],
  ['task_overdue', 'Công việc quá hạn'],
];

const MINUTES_LABELS: Record<(typeof leadStillNewMinutes)[number], string> = {
  5: '5 phút',
  15: '15 phút',
  30: '30 phút',
  60: '1 giờ',
  240: '4 giờ',
  1440: '1 ngày',
};

const DUE_CHOICES: ReadonlyArray<[number, string]> = [
  [0, 'Ngay lúc đó'],
  [15, 'Sau 15 phút'],
  [30, 'Sau 30 phút'],
  [60, 'Sau 1 giờ'],
  [240, 'Sau 4 giờ'],
  [1440, 'Sau 1 ngày'],
  [4320, 'Sau 3 ngày'],
];

/** A list of choices as checkboxes: members, pages, stages. */
function Checklist<T extends string>({
  legend,
  items,
  selected,
  max,
  onChange,
  error,
  disabled = false,
}: {
  disabled?: boolean;
  legend: string;
  items: ReadonlyArray<{ id: T; label: string }>;
  selected: readonly T[];
  max?: number;
  onChange: (next: T[]) => void;
  error?: string | null;
}) {
  const errorId = useId();
  return (
    <fieldset className={styles.checklist} aria-describedby={error ? errorId : undefined}>
      <legend className={styles.fieldLabel}>{legend}</legend>
      {items.length === 0 ? <p className={styles.note}>Chưa có lựa chọn nào.</p> : null}
      {items.map((item) => {
        const on = selected.includes(item.id);
        return (
          <Checkbox
            key={item.id}
            label={item.label}
            checked={on}
            disabled={disabled || (!on && max !== undefined && selected.length >= max)}
            onChange={(event) => {
              onChange(
                event.target.checked
                  ? [...selected, item.id]
                  : selected.filter((id) => id !== item.id),
              );
            }}
          />
        );
      })}
      {error ? (
        <span id={errorId} className={styles.fieldError}>
          {error}
        </span>
      ) : null}
    </fieldset>
  );
}

export interface TriggerPanelProps {
  trigger: AutomationTrigger;
  options: AutomationOptions;
  readOnly: boolean;
  onChange: (trigger: AutomationTrigger) => void;
}

/** "BƯỚC 1 · KHI". */
export function TriggerPanel({ trigger, options, readOnly, onChange }: TriggerPanelProps) {
  return (
    <>
      <Field label="Khi nào chạy">
        <Select
          value={trigger.kind}
          disabled={readOnly}
          onChange={(event) => {
            const kind = TRIGGER_KINDS.find(([value]) => value === event.target.value)?.[0];
            if (kind !== undefined) {
              onChange(newTrigger(kind));
            }
          }}
        >
          {TRIGGER_KINDS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      {trigger.kind === 'lead_created' ? (
        <Checklist
          disabled={readOnly}
          legend="Từ trang (bỏ trống là mọi trang)"
          items={options.pages.map((page) => ({ id: page.id, label: page.title }))}
          selected={trigger.pageIds}
          onChange={(pageIds) => {
            onChange({ ...trigger, pageIds });
          }}
        />
      ) : null}
      {trigger.kind === 'lead_still_new' ? (
        <Field label="Sau">
          <Select
            value={String(trigger.minutes)}
            disabled={readOnly}
            onChange={(event) => {
              const minutes = leadStillNewMinutes.find(
                (value) => String(value) === event.target.value,
              );
              if (minutes !== undefined) {
                onChange({ ...trigger, minutes });
              }
            }}
          >
            {leadStillNewMinutes.map((minutes) => (
              <option key={minutes} value={minutes}>
                {MINUTES_LABELS[minutes]}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {trigger.kind === 'opportunity_stage_changed' ? (
        <Field label="Vào giai đoạn">
          <Select
            value={trigger.stage ?? ''}
            disabled={readOnly}
            onChange={(event) => {
              const stage = opportunityStages.find((value) => value === event.target.value) ?? null;
              onChange({ ...trigger, stage });
            }}
          >
            <option value="">Bất kỳ giai đoạn nào</option>
            {opportunityStages.map((stage) => (
              <option key={stage} value={stage}>
                {opportunityStageLabels[stage]}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <p className={styles.note}>
        Mỗi sự kiện chỉ chạy automation này một lần, kể cả khi sự kiện đến lại.
      </p>
    </>
  );
}

export interface ConditionPanelProps {
  condition: AutomationCondition;
  options: AutomationOptions;
  readOnly: boolean;
  onChange: (condition: AutomationCondition) => void;
  onRemove: () => void;
}

/** "BƯỚC N · ĐIỀU KIỆN". */
export function ConditionPanel({
  condition,
  options,
  readOnly,
  onChange,
  onRemove,
}: ConditionPanelProps) {
  const listId = useId();
  const problem = conditionProblem(condition);
  return (
    <>
      {condition.kind === 'source_contains' ? (
        <>
          <Field label="Trường nguồn">
            <Select
              value={condition.field}
              disabled={readOnly}
              onChange={(event) => {
                const field = (['source', 'medium', 'campaign'] as const).find(
                  (value) => value === event.target.value,
                );
                if (field !== undefined) {
                  onChange({ ...condition, field });
                }
              }}
            >
              <option value="source">utm_source</option>
              <option value="medium">utm_medium</option>
              <option value="campaign">utm_campaign</option>
            </Select>
          </Field>
          <Field label="Chứa" error={problem ?? undefined}>
            <Input
              value={condition.text}
              maxLength={60}
              disabled={readOnly}
              placeholder="facebook"
              onChange={(event) => {
                onChange({ ...condition, text: event.target.value });
              }}
            />
          </Field>
          <p className={styles.note}>Không phân biệt chữ hoa, chữ thường và dấu.</p>
        </>
      ) : null}
      {condition.kind === 'page_in' ? (
        <Checklist
          disabled={readOnly}
          legend="Trang"
          items={options.pages.map((page) => ({ id: page.id, label: page.title }))}
          selected={condition.pageIds}
          error={problem}
          onChange={(pageIds) => {
            onChange({ ...condition, pageIds });
          }}
        />
      ) : null}
      {condition.kind === 'contact_has_tag' ? (
        <>
          <Field label="Nhãn" error={problem ?? undefined}>
            <Input
              value={condition.tag}
              maxLength={30}
              list={listId}
              autoComplete="off"
              disabled={readOnly}
              onChange={(event) => {
                onChange({ ...condition, tag: event.target.value });
              }}
            />
          </Field>
          <datalist id={listId}>
            {options.tags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
        </>
      ) : null}
      {condition.kind === 'opportunity_value_at_least' ? (
        <Field label="Giá trị cơ hội từ">
          <Input
            inputMode="numeric"
            value={formatVnd(condition.value)}
            disabled={readOnly}
            onChange={(event) => {
              onChange({
                ...condition,
                value: Math.min(parseVnd(event.target.value) ?? 0, 10_000_000_000),
              });
            }}
          />
        </Field>
      ) : null}
      {condition.kind === 'stage_is' ? (
        <Checklist
          disabled={readOnly}
          legend="Giai đoạn"
          items={opportunityStages.map((stage) => ({
            id: stage,
            label: opportunityStageLabels[stage],
          }))}
          selected={condition.stages}
          error={problem}
          onChange={(stages) => {
            onChange({ ...condition, stages });
          }}
        />
      ) : null}
      {readOnly ? null : (
        <Button variant="ghost" size="sm" leadingIcon={<TrashIcon size={16} />} onClick={onRemove}>
          Xóa điều kiện “{conditionKindLabels[condition.kind]}”
        </Button>
      )}
    </>
  );
}

export interface ActionPanelProps {
  action: AutomationAction;
  options: AutomationOptions;
  readOnly: boolean;
  onChange: (action: AutomationAction) => void;
  onRemove: () => void;
  /** A webhook step's secret as the API showed it once, in this page view only. */
  revealedSecret?: string | undefined;
  /** "Đổi bí mật"; absent for a role that only views. */
  onRotateSecret?: (() => void) | undefined;
  rotating?: boolean;
}

/** "BƯỚC N · HÀNH ĐỘNG". */
export function ActionPanel({
  action,
  options,
  readOnly,
  onChange,
  onRemove,
  revealedSecret,
  onRotateSecret,
  rotating = false,
}: ActionPanelProps) {
  const listId = useId();
  const subjectRef = useRef<HTMLInputElement>(null);
  const problem = actionProblem(action);
  const members = options.members.map((person) => ({ id: person.id, label: person.name }));
  return (
    <>
      {action.kind === 'assign' ? (
        <>
          <Checklist
            disabled={readOnly}
            legend="Giao cho"
            items={members}
            selected={action.memberIds}
            max={AUTOMATION_ROTATION_MAX}
            error={problem}
            onChange={(memberIds) => {
              onChange({ ...action, memberIds });
            }}
          />
          <p className={styles.note}>
            Chọn nhiều người thì lead được giao xoay vòng, lần lượt từng người.
          </p>
        </>
      ) : null}
      {action.kind === 'create_task' ? (
        <>
          <Field label="Việc cần làm" error={problem ?? undefined}>
            <Input
              value={action.title}
              maxLength={120}
              disabled={readOnly}
              onChange={(event) => {
                onChange({ ...action, title: event.target.value });
              }}
            />
          </Field>
          <Field label="Hạn">
            <Select
              value={String(action.dueInMinutes)}
              disabled={readOnly}
              onChange={(event) => {
                onChange({ ...action, dueInMinutes: Number(event.target.value) });
              }}
            >
              {DUE_CHOICES.some(([minutes]) => minutes === action.dueInMinutes) ? null : (
                <option value={action.dueInMinutes}>Sau {action.dueInMinutes} phút</option>
              )}
              {DUE_CHOICES.map(([minutes, label]) => (
                <option key={minutes} value={minutes}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Giao cho">
            <Select
              value={action.assignee}
              disabled={readOnly}
              onChange={(event) => {
                onChange({
                  ...action,
                  assignee: event.target.value === 'owner' ? 'owner' : event.target.value,
                });
              }}
            >
              <option value="owner">Người phụ trách khách</option>
              {members.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </Select>
          </Field>
        </>
      ) : null}
      {action.kind === 'add_tag' ? (
        <>
          <Field label="Nhãn" error={problem ?? undefined}>
            <Input
              value={action.tag}
              maxLength={30}
              list={listId}
              autoComplete="off"
              disabled={readOnly}
              onChange={(event) => {
                onChange({ ...action, tag: event.target.value });
              }}
            />
          </Field>
          <datalist id={listId}>
            {options.tags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
        </>
      ) : null}
      {action.kind === 'email' ? (
        <>
          <Field label="Người nhận">
            <Select
              value={action.to === 'owner' ? 'owner' : 'members'}
              disabled={readOnly}
              onChange={(event) => {
                onChange({ ...action, to: event.target.value === 'owner' ? 'owner' : [] });
              }}
            >
              <option value="owner">Người phụ trách khách</option>
              <option value="members">Thành viên được chọn</option>
            </Select>
          </Field>
          {action.to === 'owner' ? null : (
            <Checklist
              disabled={readOnly}
              legend="Thành viên"
              items={members}
              selected={action.to}
              max={AUTOMATION_EMAIL_RECIPIENTS_MAX}
              error={
                action.to.length === 0 ? 'Chọn ít nhất một người nhận để bật automation.' : null
              }
              onChange={(to) => {
                onChange({ ...action, to });
              }}
            />
          )}
          <Field label="Tiêu đề" error={action.subject === '' ? 'Nhập tiêu đề' : undefined}>
            <Input
              ref={subjectRef}
              value={action.subject}
              maxLength={AUTOMATION_EMAIL_SUBJECT_MAX}
              disabled={readOnly}
              onChange={(event) => {
                onChange({ ...action, subject: event.target.value });
              }}
            />
          </Field>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Chèn thông tin</span>
            <span className={styles.placeholders}>
              {automationPlaceholders.map((placeholder) => (
                <button
                  key={placeholder}
                  type="button"
                  className={styles.placeholder}
                  disabled={readOnly}
                  onClick={() => {
                    const input = subjectRef.current;
                    const at = input?.selectionStart ?? action.subject.length;
                    const end = input?.selectionEnd ?? at;
                    const subject = `${action.subject.slice(0, at)}${placeholder}${action.subject.slice(end)}`;
                    onChange({
                      ...action,
                      subject: subject.slice(0, AUTOMATION_EMAIL_SUBJECT_MAX),
                    });
                    input?.focus();
                  }}
                >
                  {placeholder}
                </button>
              ))}
            </span>
            <span className={styles.note}>
              Số điện thoại và email của khách không được đưa vào email; người nhận mở hồ sơ để xem.
            </span>
          </div>
        </>
      ) : null}
      {action.kind === 'webhook' ? (
        <WebhookFields
          action={action}
          readOnly={readOnly}
          onChange={onChange}
          revealedSecret={revealedSecret}
          onRotateSecret={onRotateSecret}
          rotating={rotating}
        />
      ) : null}
      {readOnly ? null : (
        <Button variant="ghost" size="sm" leadingIcon={<TrashIcon size={16} />} onClick={onRemove}>
          Xóa hành động “{actionKindLabels[action.kind]}”
        </Button>
      )}
    </>
  );
}

interface WebhookFieldsProps {
  action: Extract<AutomationAction, { kind: 'webhook' }>;
  readOnly: boolean;
  onChange: (action: AutomationAction) => void;
  revealedSecret: string | undefined;
  onRotateSecret: (() => void) | undefined;
  rotating: boolean;
}

/**
 * The address a webhook step calls and the secret it signs with (ADR-034). The secret shows once,
 * as the API returns it; after that only "Đổi bí mật" gives a new one.
 */
function WebhookFields({
  action,
  readOnly,
  onChange,
  revealedSecret,
  onRotateSecret,
  rotating,
}: WebhookFieldsProps) {
  const { toast } = useToast();
  const problem = webhookUrlProblem(action.url);
  return (
    <>
      <Field
        label="Địa chỉ nhận (URL)"
        help="Payload gửi POST với dữ liệu lead dạng JSON, thử lại khi máy chủ nhận lỗi."
        error={problem ?? undefined}
      >
        <Input
          type="url"
          inputMode="url"
          value={action.url}
          maxLength={WEBHOOK_URL_MAX}
          placeholder="https://crm.example.vn/api/leads"
          autoComplete="off"
          spellCheck={false}
          disabled={readOnly}
          onChange={(event) => {
            onChange({ ...action, url: event.target.value.trim() });
          }}
        />
      </Field>
      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>Bí mật để ký</span>
        {revealedSecret !== undefined ? (
          <>
            <span className={styles.secretRow}>
              <code className={styles.secret}>{revealedSecret}</code>
              <IconButton
                aria-label="Sao chép bí mật"
                size="sm"
                variant="secondary"
                icon={<CopyIcon size={14} />}
                onClick={() => {
                  navigator.clipboard.writeText(revealedSecret).then(
                    () => {
                      toast({ tone: 'success', title: 'Đã sao chép bí mật' });
                    },
                    (error: unknown) => {
                      console.error('Copying a webhook secret failed', error);
                      toast({
                        tone: 'danger',
                        title: 'Chưa sao chép được',
                        description: 'Hãy chọn bí mật rồi sao chép thủ công.',
                      });
                    },
                  );
                }}
              />
            </span>
            <span className={styles.note}>
              Bí mật chỉ hiện một lần. Lưu vào hệ thống nhận ngay bây giờ.
            </span>
          </>
        ) : (
          <span className={styles.note}>
            {action.secretId === ''
              ? 'Bí mật được tạo khi lưu bước này.'
              : 'Đã lưu và mã hóa. Bí mật không hiện lại; đổi bí mật nếu đã làm mất.'}
          </span>
        )}
        <span className={styles.note}>
          Mỗi lần gọi có header X-PLP-Signature (HMAC-SHA256 của “t.body”) và Idempotency-Key để hệ
          thống nhận bỏ qua lần gửi trùng.
        </span>
        {onRotateSecret !== undefined && action.secretId !== '' ? (
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<RefreshIcon size={16} />}
            loading={rotating}
            onClick={onRotateSecret}
          >
            Đổi bí mật
          </Button>
        ) : null}
      </div>
    </>
  );
}
