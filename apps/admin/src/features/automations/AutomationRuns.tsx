'use client';

import {
  type AutomationDetail,
  type AutomationRunDetail,
  type AutomationRunFilter,
  type AutomationRunListResponse,
  automationRunFilters,
  endpoints,
  type Site,
} from '@plp/contracts';
import {
  ArrowLeftIcon,
  Badge,
  Button,
  IconButtonLink,
  Spinner,
  useToast,
  WarningTriangleIcon,
} from '@plp/ui';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '../../lib/api';
import { formatCount, formatTime } from '../../lib/format';
import { cx } from '../shell/cx';
import { fetchNextPageAfterRead } from '../shell/fetch-next-page';
import { automationsHref } from '../shell/navigation';
import { problemMessage } from '../shell/problem-message';
import { serverFirstPage } from '../shell/server-render';
import { useNow } from '../shell/use-now';
import { AutomationTabs } from './AutomationEditor';
import { triggerLabel } from './automation-presentation';
import { automationQueryKeys } from './queries';
import {
  automationRunsBadge,
  runBadge,
  runEvent,
  runFilterLabels,
  runReason,
  runStatusLabels,
  runWhen,
  stepDone,
  stepFailure,
  stepTitle,
} from './run-presentation';
import styles from './AutomationRuns.module.css';

export interface AutomationRunsProps {
  site: Site;
  automation: AutomationDetail;
  /** The first page of every run, as the server loaded it. */
  initial: AutomationRunListResponse;
  canManage: boolean;
  loadedAt: number;
}

/**
 * Screen 27 "Lịch sử chạy" (ADR-034): the runs newest first, the one picked step by step, and
 * "Thử lại bước này" or "Bỏ qua lượt này" on a failed one. An automation paused by its errors
 * offers to retry its failed runs.
 */
export function AutomationRuns({
  site,
  automation: initialAutomation,
  initial,
  canManage,
  loadedAt,
}: AutomationRunsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const now = useNow(loadedAt);
  const [automation, setAutomation] = useState(initialAutomation);
  const [filter, setFilter] = useState<AutomationRunFilter>('all');
  const [picked, setPicked] = useState<string | null>(initial.items[0]?.id ?? null);
  const runsKey = [...automationQueryKeys.all(site.id), automation.id, 'runs'] as const;

  const list = useInfiniteQuery({
    queryKey: [...runsKey, 'list', filter],
    queryFn: ({ pageParam, signal }) =>
      api(endpoints.listAutomationRuns, [site.id, automation.id], {
        query: { status: filter, ...(pageParam === null ? {} : { cursor: pageParam }) },
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    ...(filter === 'all'
      ? { initialData: serverFirstPage(initial), initialDataUpdatedAt: loadedAt }
      : {}),
  });
  const pages = list.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const counts = pages[0] ?? initial;
  const selectedId = picked ?? items[0]?.id ?? null;

  const run = useQuery({
    queryKey: [...runsKey, 'run', selectedId],
    queryFn: ({ signal }) =>
      api(endpoints.getAutomationRun, [site.id, automation.id, selectedId ?? ''], { signal }),
    enabled: selectedId !== null,
  });

  function refresh(changed?: AutomationRunDetail) {
    if (changed !== undefined) {
      queryClient.setQueryData([...runsKey, 'run', changed.id], changed);
    }
    void queryClient.invalidateQueries({ queryKey: runsKey });
  }

  const retry = useMutation({
    mutationFn: (runId: string) =>
      api(endpoints.retryAutomationRun, [site.id, automation.id, runId]),
    onSuccess: (changed) => {
      refresh(changed);
      toast({ tone: 'success', title: 'Đã đưa lượt chạy vào hàng chờ thử lại' });
    },
    onError: (error) => {
      toast({ tone: 'danger', title: 'Chưa thử lại được', description: problemMessage(error) });
    },
  });

  const skip = useMutation({
    mutationFn: (runId: string) =>
      api(endpoints.skipAutomationRun, [site.id, automation.id, runId]),
    onSuccess: (changed) => {
      refresh(changed);
      toast({ tone: 'success', title: 'Đã bỏ qua lượt này' });
    },
    onError: (error) => {
      toast({ tone: 'danger', title: 'Chưa bỏ qua được', description: problemMessage(error) });
    },
  });

  // "Bật lại automation", and "Thử lại N lượt lỗi" which needs it on first.
  const enable = useMutation({
    mutationFn: async (andRetry: boolean) => {
      const item = await api(endpoints.setAutomationState, [site.id, automation.id], {
        body: { state: 'on' },
      });
      const retried = andRetry
        ? await api(endpoints.retryFailedAutomationRuns, [site.id, automation.id])
        : null;
      return { item, retried };
    },
    onSuccess: ({ item, retried }) => {
      setAutomation((current) => ({ ...current, ...item }));
      refresh();
      toast({
        tone: 'success',
        title:
          retried === null
            ? `Đã bật lại “${item.name}”`
            : `Đã bật lại và thử lại ${formatCount(retried.retried)} lượt lỗi`,
      });
    },
    onError: (error) => {
      refresh();
      toast({ tone: 'danger', title: 'Chưa bật lại được', description: problemMessage(error) });
    },
  });

  const badge = automationRunsBadge(automation, counts.failedLastDay);
  const autoPaused = automation.state === 'paused' && automation.pausedReason === 'errors';
  const degraded = automation.state === 'on' && counts.failedLastDay > 0;
  const detail = run.data;

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
            <h1 className={styles.title}>{automation.name}</h1>
            <span className={styles.meta}>
              <Badge tone={badge.tone} size="sm">
                {badge.label}
              </Badge>
              Trạng thái của cả automation
            </span>
          </div>
        </div>
        <AutomationTabs siteId={site.id} automationId={automation.id} current="runs" />
        <span className={styles.totals}>
          30 ngày: {formatCount(counts.last30Days.runs)} lượt · {formatCount(counts.failed)} lỗi
        </span>
      </header>

      <main className={styles.main}>
        <div className={styles.content}>
          {autoPaused ? (
            <div role="alert" className={styles.pausedBanner}>
              <span className={styles.bannerText}>
                <strong>Automation đã tự tạm dừng sau 20 lỗi liên tiếp.</strong> Lead mới vẫn vào
                hộp thư bình thường; chỉ các bước của automation này bị dừng.
              </span>
              {canManage ? (
                <span className={styles.bannerActions}>
                  {counts.failed > 0 ? (
                    <Button
                      variant="secondary"
                      loading={enable.isPending && enable.variables}
                      disabled={enable.isPending}
                      onClick={() => {
                        enable.mutate(true);
                      }}
                    >
                      Thử lại {formatCount(Math.min(counts.failed, 100))} lượt lỗi
                    </Button>
                  ) : null}
                  <Button
                    variant="danger"
                    loading={enable.isPending && !enable.variables}
                    disabled={enable.isPending}
                    onClick={() => {
                      enable.mutate(false);
                    }}
                  >
                    Bật lại automation
                  </Button>
                </span>
              ) : null}
            </div>
          ) : null}
          {degraded ? (
            <div role="status" className={styles.degradedBanner}>
              <WarningTriangleIcon size={18} className={styles.degradedIcon} />
              <span>
                Automation vẫn đang bật. {formatCount(counts.failedLastDay)} lượt thất bại trong 24
                giờ. Lượt khác vẫn chạy bình thường.
              </span>
            </div>
          ) : null}

          <div className={styles.columns}>
            <section aria-label="Các lượt chạy" className={styles.listCard}>
              <div className={styles.filters}>
                {automationRunFilters.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={filter === item}
                    className={styles.filter}
                    onClick={() => {
                      setFilter(item);
                      setPicked(null);
                    }}
                  >
                    {item === 'failed' && counts.failed > 0
                      ? `${runFilterLabels[item]} · ${formatCount(counts.failed)}`
                      : runFilterLabels[item]}
                  </button>
                ))}
              </div>
              {list.isPending ? <Spinner size={20} label="Đang tải lượt chạy" /> : null}
              {!list.isPending && items.length === 0 ? (
                <p className={styles.empty}>
                  {filter === 'all'
                    ? 'Chưa có lượt chạy nào. Lượt chạy hiện ở đây khi sự kiện xảy ra.'
                    : 'Không có lượt chạy nào ở mục này.'}
                </p>
              ) : null}
              <ul className={styles.runs}>
                {items.map((item) => {
                  const status = runStatusLabels[item.status];
                  const current = item.id === selectedId;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-current={current ? 'true' : undefined}
                        className={styles.run}
                        onClick={() => {
                          setPicked(item.id);
                        }}
                      >
                        <span aria-hidden="true" className={cx(styles.dot, styles[status.tone])} />
                        <span className={styles.runText}>
                          <span className={styles.runEvent}>{runEvent(item)}</span>
                          <span className={styles.runWhen}>{runWhen(item.createdAt, now)}</span>
                        </span>
                        <span className={cx(styles.runStatus, styles[status.tone])}>
                          {status.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {list.hasNextPage ? (
                <div className={styles.more}>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={list.isFetchingNextPage}
                    onClick={() => {
                      void fetchNextPageAfterRead(list);
                    }}
                  >
                    Xem thêm
                  </Button>
                </div>
              ) : null}
            </section>

            <section aria-labelledby="run-heading" className={styles.detailCard}>
              {detail === undefined ? (
                selectedId === null ? (
                  <p className={styles.empty}>Chọn một lượt chạy để xem từng bước.</p>
                ) : (
                  <Spinner size={20} label="Đang tải lượt chạy" />
                )
              ) : (
                <RunDetail
                  run={detail}
                  canManage={canManage}
                  busy={retry.isPending || skip.isPending}
                  onRetry={() => {
                    retry.mutate(detail.id);
                  }}
                  onSkip={() => {
                    skip.mutate(detail.id);
                  }}
                />
              )}
              <span className={styles.footnote}>
                Thử lại chỉ chạy bước lỗi; các bước đã xong không chạy lại. Chỉ vai trò quản lý
                automation thử lại được.
              </span>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

interface RunDetailProps {
  run: AutomationRunDetail;
  canManage: boolean;
  busy: boolean;
  onRetry: () => void;
  onSkip: () => void;
}

type Mark = 'done' | 'failed' | 'waiting' | 'idle';

/** One run as a timeline: the event, its conditions, then each action (board 27). */
function RunDetail({ run, canManage, busy, onRetry, onSkip }: RunDetailProps) {
  const badge = runBadge(run);
  const reason = runReason(run);
  const skippedAtConditions = run.reason === 'conditions';
  return (
    <>
      <div className={styles.detailHead}>
        <h2 id="run-heading" className={styles.detailTitle}>
          Lượt chạy · {run.contactName === null ? 'khách đã xóa' : `lead ${run.contactName}`}
        </h2>
        <Badge tone={badge.tone} size="sm">
          {badge.label}
        </Badge>
      </div>
      <span className={styles.detailMeta}>
        Bắt đầu {formatTime(run.createdAt)} · phiên bản {run.version} · khóa chống trùng{' '}
        <span className={styles.mono}>{run.eventKey}</span>
      </span>
      <ol className={styles.steps}>
        <Step
          mark="done"
          title={`Sự kiện: ${triggerLabel(run.definition.trigger)}`}
          time={run.createdAt}
        >
          {runEvent(run)}
        </Step>
        {run.definition.conditions.length > 0 ? (
          <Step
            mark={
              skippedAtConditions
                ? 'failed'
                : run.steps.some((step) => step.at !== null)
                  ? 'done'
                  : 'idle'
            }
            title={`Điều kiện: ${formatCount(run.definition.conditions.length)} điều kiện`}
            time={null}
          >
            {skippedAtConditions
              ? 'Không đạt.'
              : run.steps.some((step) => step.at !== null)
                ? 'Đạt.'
                : 'Chưa xét.'}
          </Step>
        ) : null}
        {run.steps.map((step, index) => {
          const waiting = step.status === 'failed' && run.status === 'waiting_retry';
          const failed = step.status === 'failed' && run.status === 'failed';
          const mark: Mark =
            step.status === 'succeeded' ? 'done' : waiting ? 'waiting' : failed ? 'failed' : 'idle';
          const failure = step.status === 'failed' ? stepFailure(step) : null;
          return (
            <Step
              // The steps of a run never change order.
              key={index}
              mark={mark}
              title={stepTitle(step)}
              time={
                waiting && run.nextAt !== null ? `Thử lại lúc ${formatTime(run.nextAt)}` : step.at
              }
            >
              {step.status === 'succeeded' ? stepDone(step) : null}
              {waiting ? `Lần ${formatCount(step.attempts)} lỗi. Sẽ tự thử lại.` : null}
              {step.status === 'pending'
                ? run.status === 'stopped'
                  ? 'Automation đã tạm dừng trước bước này.'
                  : run.status === 'skipped'
                    ? 'Không chạy.'
                    : 'Chưa chạy.'
                : null}
              {failure !== null ? (
                <span className={styles.failure}>
                  {failure.line !== null ? (
                    <span className={styles.failureLine}>{failure.line}</span>
                  ) : null}
                  <span>
                    <strong>Cách sửa:</strong> {failure.fix}
                  </span>
                </span>
              ) : null}
              {canManage && (failed || waiting) ? (
                <span className={styles.stepActions}>
                  {failed ? (
                    <Button size="sm" disabled={busy} onClick={onRetry}>
                      Thử lại bước này
                    </Button>
                  ) : null}
                  <Button size="sm" variant="secondary" disabled={busy} onClick={onSkip}>
                    Bỏ qua lượt này
                  </Button>
                </span>
              ) : null}
            </Step>
          );
        })}
      </ol>
      {reason !== null ? <p className={styles.reason}>{reason}</p> : null}
    </>
  );
}

function Step({
  mark,
  title,
  time,
  children,
}: {
  mark: Mark;
  title: string;
  /** An ISO time, or words such as "Thử lại lúc 10:12". */
  time: string | null;
  children: React.ReactNode;
}) {
  const shown = time === null ? null : Number.isNaN(Date.parse(time)) ? time : formatTime(time);
  return (
    <li className={styles.step}>
      <span aria-hidden="true" className={cx(styles.mark, styles[`mark-${mark}`])}>
        {mark === 'done' ? '✓' : mark === 'failed' ? '!' : ''}
      </span>
      <div className={cx(styles.stepBox, styles[`box-${mark}`])}>
        <span className={styles.stepHead}>
          <span className={styles.stepTitle}>{title}</span>
          {shown !== null ? <span className={styles.stepTime}>{shown}</span> : null}
        </span>
        <span className={styles.stepBody}>{children}</span>
      </div>
    </li>
  );
}
