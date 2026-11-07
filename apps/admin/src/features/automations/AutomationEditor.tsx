'use client';

import {
  AUTOMATION_ACTIONS_MAX,
  AUTOMATION_CONDITIONS_MAX,
  AUTOMATION_RUNS_PER_MONTH,
  type AutomationAction,
  type AutomationCondition,
  type AutomationDefinition,
  type AutomationDetail,
  type AutomationListItem,
  endpoints,
  type Site,
  type TestAutomationResponse,
  type TestStepResult,
} from '@plp/contracts';
import {
  ArrowLeftIcon,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  IconButtonLink,
  PlusIcon,
  Select,
  Spinner,
  useToast,
} from '@plp/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { formatCount, formatRelativeTime } from '../../lib/format';
import { automationHref, automationRunsHref, automationsHref } from '../shell/navigation';
import { cx } from '../shell/cx';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { useNow } from '../shell/use-now';
import { stateBadge } from './automation-presentation';
import {
  type ActionKind,
  actionKindLabels,
  actionProblem,
  actionSummary,
  actionTitle,
  type ConditionKind,
  conditionKindLabels,
  conditionProblem,
  conditionSummary,
  conditionTitle,
  missingCount,
  newAction,
  newCondition,
  type StepRef,
  triggerSummary,
  triggerTitle,
} from './automation-steps';
import { ActionPanel, ConditionPanel, TriggerPanel } from './StepPanel';
import styles from './AutomationEditor.module.css';

/** The autosave waits this long after the last change. */
const SAVE_DELAY_MS = 600;

type Saving = 'saved' | 'pending' | 'saving' | 'failed';

export interface AutomationEditorProps {
  site: Site;
  initial: AutomationDetail;
  canManage: boolean;
  loadedAt: number;
}

interface StepView {
  ref: StepRef;
  chip: 'KHI' | 'NẾU' | 'THÌ';
  title: string;
  summary: string;
  problem: string | null;
  test: TestStepResult | null;
}

function same(a: StepRef, b: StepRef): boolean {
  return a.kind === b.kind && (a.kind === 'trigger' || ('index' in b && a.index === b.index));
}

/**
 * Screen 26 "Thiết lập automation" (ADR-034): KHI, NẾU and THÌ as a column of steps, the step
 * picked set up on the right, each change saved as a new version. "Chạy thử" shows what every
 * step would do; "Bật automation" asks first.
 */
export function AutomationEditor({ site, initial, canManage, loadedAt }: AutomationEditorProps) {
  const { toast } = useToast();
  const now = useNow(loadedAt);
  const nameId = useId();
  const [detail, setDetail] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [definition, setDefinition] = useState<AutomationDefinition>(initial.definition);
  const [selected, setSelected] = useState<StepRef>(() =>
    initial.definition.actions.length > 0
      ? { kind: 'action', index: initial.definition.actions.length - 1 }
      : { kind: 'trigger' },
  );
  const [mode, setMode] = useState<'config' | 'test'>('config');
  const [source, setSource] = useState<'latest' | 'sample'>('latest');
  const [test, setTest] = useState<TestAutomationResponse | null>(null);
  const [saving, setSaving] = useState<Saving>('saved');
  const [savedAt, setSavedAt] = useState(Date.parse(initial.updatedAt));
  const [activateOpen, setActivateOpen] = useState(false);
  // A webhook step's secret, shown once by the save that created it or by "Đổi bí mật".
  const [revealed, setRevealed] = useState<ReadonlyMap<string, string>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // An enabled automation's steps wait for "Tạm dừng"; its name can change any time.
  const stepsLocked = detail.state === 'on';
  const readOnly = !canManage || stepsLocked;

  const save = useMutation({
    mutationFn: (body: { name: string; definition?: AutomationDefinition }) =>
      api(endpoints.updateAutomation, [site.id, detail.id], { body }),
    onMutate: () => {
      setSaving('saving');
    },
    onSuccess: (saved, body) => {
      setDetail(saved);
      if (saved.revealedSecrets.length > 0) {
        setRevealed(
          (current) =>
            new Map([
              ...current,
              ...saved.revealedSecrets.map((item) => [item.secretId, item.secret] as const),
            ]),
        );
        // A webhook step sent without a secret takes the one the API gave it.
        setDefinition((current) => adoptSecrets(current, body.definition, saved.definition));
      }
      setSaving((current) => (current === 'pending' ? current : 'saved'));
      setSavedAt(Date.now());
    },
    onError: (error) => {
      setSaving('failed');
      reportUnexpected('Saving an automation failed', error);
    },
  });

  function schedule(nextName: string, nextDefinition: AutomationDefinition) {
    if (!canManage) {
      return;
    }
    setSaving('pending');
    setTest(null);
    if (timer.current !== null) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      if (nextName.trim() !== '') {
        save.mutate({
          name: nextName.trim(),
          ...(stepsLocked ? {} : { definition: nextDefinition }),
        });
      }
    }, SAVE_DELAY_MS);
  }

  useEffect(
    () => () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  function change(next: AutomationDefinition) {
    setDefinition(next);
    schedule(name, next);
  }

  const runTest = useMutation({
    mutationFn: (from: 'latest' | 'sample') =>
      api(endpoints.testAutomation, [site.id, detail.id], { body: { definition, source: from } }),
    onSuccess: setTest,
    onError: (error) => {
      reportUnexpected('Testing an automation failed', error);
      toast({ tone: 'danger', title: 'Chưa chạy thử được', description: problemMessage(error) });
    },
  });

  const rotate = useMutation({
    mutationFn: (secretId: string) =>
      api(endpoints.rotateWebhookSecret, [site.id, detail.id], { body: { secretId } }),
    onSuccess: (item) => {
      setRevealed((current) => new Map([...current, [item.secretId, item.secret]]));
      toast({
        tone: 'success',
        title: 'Đã đổi bí mật',
        description: 'Bí mật cũ ngừng ký ngay. Cập nhật bí mật mới ở hệ thống nhận.',
      });
    },
    onError: (error) => {
      toast({ tone: 'danger', title: 'Chưa đổi được bí mật', description: problemMessage(error) });
    },
  });

  const pause = useMutation({
    mutationFn: () =>
      api(endpoints.setAutomationState, [site.id, detail.id], { body: { state: 'paused' } }),
    onSuccess: (item) => {
      setDetail((current) => ({ ...current, ...item }));
      toast({ tone: 'success', title: `Đã tạm dừng “${item.name}”` });
    },
    onError: (error) => {
      toast({ tone: 'danger', title: 'Chưa tạm dừng được', description: problemMessage(error) });
    },
  });

  const missing = missingCount(definition);
  const badge = stateBadge({ ...detail, missing });
  const steps: StepView[] = [
    {
      ref: { kind: 'trigger' },
      chip: 'KHI',
      title: triggerTitle(definition.trigger),
      summary: triggerSummary(definition.trigger, detail.options, site.name),
      problem: null,
      test: test?.trigger ?? null,
    },
    ...definition.conditions.map((condition, index) => ({
      ref: { kind: 'condition' as const, index },
      chip: 'NẾU' as const,
      title: conditionTitle(condition),
      summary: conditionSummary(condition, detail.options),
      problem: conditionProblem(condition),
      test: test?.conditions[index] ?? null,
    })),
    ...definition.actions.map((action, index) => ({
      ref: { kind: 'action' as const, index },
      chip: 'THÌ' as const,
      title: actionTitle(action),
      summary: actionSummary(action, detail.options),
      problem: actionProblem(action),
      test: test?.actions[index] ?? null,
    })),
  ];
  const position = steps.findIndex((step) => same(step.ref, selected));
  const current = steps[position] ?? steps[0];

  function addCondition(kind: ConditionKind) {
    const next = { ...definition, conditions: [...definition.conditions, newCondition(kind)] };
    change(next);
    setSelected({ kind: 'condition', index: next.conditions.length - 1 });
    setMode('config');
  }

  function addAction(kind: ActionKind) {
    const next = { ...definition, actions: [...definition.actions, newAction(kind)] };
    change(next);
    setSelected({ kind: 'action', index: next.actions.length - 1 });
    setMode('config');
  }

  const selectedCondition =
    selected.kind === 'condition' ? definition.conditions[selected.index] : undefined;
  const selectedAction =
    selected.kind === 'action' ? definition.actions[selected.index] : undefined;

  function replaceCondition(next: AutomationCondition) {
    if (selected.kind !== 'condition') {
      return;
    }
    const at = selected.index;
    change({
      ...definition,
      conditions: definition.conditions.map((item, index) => (index === at ? next : item)),
    });
  }

  function replaceAction(next: AutomationAction) {
    if (selected.kind !== 'action') {
      return;
    }
    const at = selected.index;
    change({
      ...definition,
      actions: definition.actions.map((item, index) => (index === at ? next : item)),
    });
  }

  function removeSelected() {
    if (selected.kind === 'condition') {
      const at = selected.index;
      change({
        ...definition,
        conditions: definition.conditions.filter((_item, index) => index !== at),
      });
    } else if (selected.kind === 'action') {
      const at = selected.index;
      change({ ...definition, actions: definition.actions.filter((_item, index) => index !== at) });
    }
    setSelected({ kind: 'trigger' });
  }

  const passing = test === null ? 0 : test.actions.filter((step) => step.outcome === 'pass').length;
  const skipped = test?.actions.filter((step) => step.outcome === 'skip') ?? [];

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <IconButtonLink
            as={Link}
            href={automationsHref(site.id)}
            aria-label="Quay lại danh sách automation"
            icon={<ArrowLeftIcon size={18} />}
            variant="ghost"
          />
          <div className={styles.titleBlock}>
            <label htmlFor={nameId} className={styles.visuallyHidden}>
              Tên automation
            </label>
            <input
              id={nameId}
              className={styles.nameInput}
              value={name}
              maxLength={80}
              readOnly={!canManage}
              onChange={(event) => {
                setName(event.target.value);
                schedule(event.target.value, definition);
              }}
            />
            <span className={styles.meta}>
              <Badge tone={badge.tone} size="sm">
                {badge.label}
              </Badge>
              <span role="status">
                {saving === 'failed'
                  ? 'Chưa lưu được — sửa tiếp để thử lại'
                  : saving === 'saved'
                    ? `Đã lưu · ${formatRelativeTime(savedAt, Math.max(now, savedAt))}`
                    : 'Đang lưu…'}
              </span>
            </span>
          </div>
        </div>
        <AutomationTabs siteId={site.id} automationId={detail.id} current="setup" />
        <div className={styles.headerActions}>
          {missing > 0 ? (
            <span className={styles.missingPill}>{missing} bước thiếu cấu hình</span>
          ) : null}
          {canManage ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setMode('test');
                  runTest.mutate(source);
                }}
              >
                Chạy thử
              </Button>
              {detail.state === 'on' ? (
                <Button
                  variant="secondary"
                  loading={pause.isPending}
                  onClick={() => {
                    pause.mutate();
                  }}
                >
                  Tạm dừng
                </Button>
              ) : (
                <Button
                  disabled={missing > 0 || saving !== 'saved'}
                  onClick={() => {
                    setActivateOpen(true);
                  }}
                >
                  Bật automation
                </Button>
              )}
            </>
          ) : null}
        </div>
      </header>

      <div className={styles.body}>
        <section aria-label="Các bước" className={styles.stepsColumn}>
          <ol className={styles.steps}>
            {steps.map((step, index) => {
              const on = mode === 'config' && same(step.ref, selected);
              return (
                <li
                  key={`${step.ref.kind}-${'index' in step.ref ? step.ref.index : 0}`}
                  className={styles.stepItem}
                >
                  {index > 0 ? <span aria-hidden="true" className={styles.connector} /> : null}
                  <button
                    type="button"
                    aria-pressed={on}
                    className={cx(
                      styles.step,
                      on && styles.stepSelected,
                      step.problem !== null && mode === 'config' && styles.stepWarn,
                    )}
                    onClick={() => {
                      setSelected(step.ref);
                      setMode('config');
                    }}
                  >
                    <span className={cx(styles.chip, styles[`chip-${step.ref.kind}`])}>
                      {step.chip}
                    </span>
                    <span className={styles.stepText}>
                      <span className={styles.stepTitle}>{step.title}</span>
                      <span className={styles.stepSummary}>{step.summary}</span>
                      {step.problem !== null && mode === 'config' ? (
                        <span className={styles.stepProblem}>{step.problem}</span>
                      ) : null}
                      {mode === 'test' && step.test !== null ? (
                        <span className={cx(styles.stepTest, styles[`test-${step.test.outcome}`])}>
                          {step.test.text}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
            {canManage && !stepsLocked ? (
              <li className={styles.stepItem}>
                <span aria-hidden="true" className={styles.connector} />
                <DropdownMenu
                  align="center"
                  trigger={
                    <button type="button" className={styles.addStep}>
                      <PlusIcon size={16} />
                      Thêm điều kiện hoặc hành động
                    </button>
                  }
                >
                  {(Object.keys(conditionKindLabels) as ConditionKind[]).map((kind) => (
                    <DropdownMenuItem
                      key={kind}
                      disabled={definition.conditions.length >= AUTOMATION_CONDITIONS_MAX}
                      onSelect={() => {
                        addCondition(kind);
                      }}
                    >
                      Nếu · {conditionKindLabels[kind]}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  {(Object.keys(actionKindLabels) as ActionKind[]).map((kind) => (
                    <DropdownMenuItem
                      key={kind}
                      disabled={definition.actions.length >= AUTOMATION_ACTIONS_MAX}
                      onSelect={() => {
                        addAction(kind);
                      }}
                    >
                      Thì · {actionKindLabels[kind]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenu>
              </li>
            ) : null}
          </ol>
          {canManage && stepsLocked ? (
            <p className={styles.lockedNote}>
              Automation đang bật. Tạm dừng để sửa các bước; lượt chạy đang chờ dùng phiên bản đã
              bật.
            </p>
          ) : null}
          <div className={styles.rules}>
            <div className={styles.rule}>
              <strong>Không chạy trùng</strong>
              <span>Mỗi sự kiện chỉ chạy automation này một lần, kể cả khi sự kiện đến lại.</span>
            </div>
            <div className={styles.rule}>
              <strong>Khi một bước lỗi</strong>
              <span>Thử lại 3 lần trong 1 giờ, các bước đã xong không chạy lại.</span>
            </div>
          </div>
        </section>

        <aside aria-label="Bảng bên phải" className={styles.panel}>
          {mode === 'config' && current !== undefined ? (
            <>
              <span className={styles.panelKicker}>
                BƯỚC {position + 1} ·{' '}
                {current.ref.kind === 'trigger'
                  ? 'KHI'
                  : current.ref.kind === 'condition'
                    ? 'ĐIỀU KIỆN'
                    : 'HÀNH ĐỘNG'}
              </span>
              <h2 className={styles.panelTitle}>{current.title}</h2>
              {current.ref.kind === 'trigger' ? (
                <TriggerPanel
                  trigger={definition.trigger}
                  options={detail.options}
                  readOnly={readOnly}
                  onChange={(trigger) => {
                    change({ ...definition, trigger });
                  }}
                />
              ) : null}
              {selectedCondition !== undefined && current.ref.kind === 'condition' ? (
                <ConditionPanel
                  key={current.ref.index}
                  condition={selectedCondition}
                  options={detail.options}
                  readOnly={readOnly}
                  onChange={(next) => {
                    replaceCondition(next);
                  }}
                  onRemove={removeSelected}
                />
              ) : null}
              {selectedAction !== undefined && current.ref.kind === 'action' ? (
                <ActionPanel
                  key={current.ref.index}
                  action={selectedAction}
                  options={detail.options}
                  readOnly={readOnly}
                  onChange={(next) => {
                    replaceAction(next);
                  }}
                  onRemove={removeSelected}
                  revealedSecret={
                    selectedAction.kind === 'webhook'
                      ? revealed.get(selectedAction.secretId)
                      : undefined
                  }
                  onRotateSecret={
                    canManage && selectedAction.kind === 'webhook'
                      ? () => {
                          rotate.mutate(selectedAction.secretId);
                        }
                      : undefined
                  }
                  rotating={rotate.isPending}
                />
              ) : null}
            </>
          ) : null}
          {mode === 'test' ? (
            <>
              <h2 className={styles.panelTitle}>Chạy thử</h2>
              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Dùng dữ liệu của</span>
                <Select
                  value={source}
                  onChange={(event) => {
                    const next = event.target.value === 'sample' ? 'sample' : 'latest';
                    setSource(next);
                    runTest.mutate(next);
                  }}
                >
                  <option value="latest">
                    {test?.lead
                      ? `Lead gần nhất · ${test.lead.name} · ${formatRelativeTime(test.lead.at, now)}`
                      : 'Lead gần nhất'}
                  </option>
                  <option value="sample">Lead mẫu (không có dữ liệu thật)</option>
                </Select>
              </label>
              <div role="status" className={styles.testNote}>
                Chạy thử không giao việc, không gửi email, không gọi webhook. Kết quả hiện ngay trên
                từng bước bên trái.
              </div>
              {runTest.isPending ? <Spinner size={20} label="Đang chạy thử" /> : null}
              {test !== null && !runTest.isPending ? (
                <div className={styles.testSummary}>
                  {test.lead === null && source === 'latest' ? (
                    <span>Site chưa có lead nào; dùng lead mẫu.</span>
                  ) : null}
                  <span>
                    <strong>{passing} bước sẽ chạy</strong> với lead này.
                  </span>
                  {skipped.length > 0 ? (
                    <span>
                      <strong>{skipped.length} bước bị bỏ qua</strong>:{' '}
                      {skipped.map((step) => step.text.replace(/^Bỏ qua: /, '')).join('; ')}.
                    </span>
                  ) : null}
                </div>
              ) : null}
              <Button
                variant="secondary"
                loading={runTest.isPending}
                onClick={() => {
                  runTest.mutate(source);
                }}
              >
                Chạy thử lại
              </Button>
            </>
          ) : null}
        </aside>
      </div>

      {activateOpen ? (
        <ActivateDialog
          siteId={site.id}
          automation={detail}
          onClose={() => {
            setActivateOpen(false);
          }}
          onEnabled={(item) => {
            setDetail((before) => ({ ...before, ...item }));
            setActivateOpen(false);
            toast({ tone: 'success', title: `Đã bật “${item.name}”` });
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The secrets of webhook steps the save sent without one, from the API's answer; a step changed
 * meanwhile keeps what it has.
 */
function adoptSecrets(
  current: AutomationDefinition,
  sent: AutomationDefinition | undefined,
  saved: AutomationDefinition,
): AutomationDefinition {
  return {
    ...current,
    actions: current.actions.map((action, index) => {
      const before = sent?.actions[index];
      const after = saved.actions[index];
      return action.kind === 'webhook' &&
        action.secretId === '' &&
        before?.kind === 'webhook' &&
        before.secretId === '' &&
        after?.kind === 'webhook'
        ? { ...action, secretId: after.secretId }
        : action;
    }),
  };
}

/** "Thiết lập" and "Lịch sử chạy" (boards 26 and 27). */
export function AutomationTabs({
  siteId,
  automationId,
  current,
}: {
  siteId: string;
  automationId: string;
  current: 'setup' | 'runs';
}) {
  return (
    <nav aria-label="Automation" className={styles.tabs}>
      <Link
        href={automationHref(siteId, automationId)}
        aria-current={current === 'setup' ? 'page' : undefined}
        className={styles.tab}
      >
        Thiết lập
      </Link>
      <Link
        href={automationRunsHref(siteId, automationId)}
        aria-current={current === 'runs' ? 'page' : undefined}
        className={styles.tab}
      >
        Lịch sử chạy
      </Link>
    </nav>
  );
}

interface ActivateDialogProps {
  siteId: string;
  automation: AutomationDetail;
  onClose: () => void;
  onEnabled: (item: AutomationListItem) => void;
}

/** "Bật …?": what changes from now, and the recent leads it may pick up (ADR-034). */
function ActivateDialog({ siteId, automation, onClose, onEnabled }: ActivateDialogProps) {
  const [includeRecent, setIncludeRecent] = useState(false);
  const numbers = useQuery({
    queryKey: ['sites', siteId, 'automations', automation.id, 'activation'],
    queryFn: ({ signal }) =>
      api(endpoints.automationActivation, [siteId, automation.id], { signal }),
    staleTime: 0,
    gcTime: 0,
  });
  const enable = useMutation({
    mutationFn: () =>
      api(endpoints.setAutomationState, [siteId, automation.id], {
        body: { state: 'on', ...(includeRecent ? { includeRecent: true } : {}) },
      }),
    onSuccess: onEnabled,
  });
  const data = numbers.data;
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !enable.isPending) {
          onClose();
        }
      }}
      title={`Bật “${automation.name}”?`}
      footer={
        <>
          <Button variant="secondary" disabled={enable.isPending} onClick={onClose}>
            Để sau
          </Button>
          <Button
            loading={enable.isPending}
            disabled={data === undefined}
            onClick={() => {
              enable.mutate();
            }}
          >
            Bật automation
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        {data === undefined ? (
          <Spinner size={20} label="Đang đếm lead" />
        ) : (
          <>
            <p className={styles.dialogText}>
              {data.canIncludeRecent
                ? `Automation chạy cho lead mới từ lúc bật. ${formatCount(data.leads)} lead cũ không bị ảnh hưởng.`
                : 'Automation chạy cho sự kiện mới từ lúc bật; sự kiện đã qua không bị ảnh hưởng.'}
            </p>
            {data.canIncludeRecent && data.recentUnassigned > 0 ? (
              <Checkbox
                checked={includeRecent}
                onChange={(event) => {
                  setIncludeRecent(event.target.checked);
                }}
                label={`Chạy luôn cho ${formatCount(data.recentUnassigned)} lead trong 24 giờ qua chưa có người phụ trách`}
              />
            ) : null}
            <span className={styles.note}>
              Bạn tạm dừng được bất cứ lúc nào. Mỗi lượt chạy tính vào hạn mức{' '}
              {formatCount(AUTOMATION_RUNS_PER_MONTH)} lượt mỗi tháng của workspace.
            </span>
          </>
        )}
        {enable.isError ? (
          <span role="alert" className={styles.fieldError}>
            {problemMessage(enable.error)}
          </span>
        ) : null}
      </div>
    </Dialog>
  );
}
