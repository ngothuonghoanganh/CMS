'use client';

import {
  type DataRequestDetail,
  dataRequestTypeLabels,
  endpoints,
  formatLeadPhone,
  LEAD_PERSON_EXPORT_MAX,
  type PersonExportRequest,
} from '@plp/contracts';
import {
  Button,
  Callout,
  Dialog,
  DownloadIcon,
  DropdownMenu,
  DropdownMenuItem,
  Spinner,
  useToast,
} from '@plp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { api, downloadFile } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/format';
import { analyticsQueryKeys } from '../analytics/queries';
import { siteQueryKeys } from '../dashboard/queries';
import { cappedCountLabel } from '../leads/lead-presentation';
import { leadQueryKeys } from '../leads/queries';
import { leadHref } from '../shell/navigation';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { logSentence, matchMarketing, requesterName } from './data-request-presentation';
import { dataRequestQueryKeys } from './queries';
import styles from './DataRequests.module.css';

export interface DataRequestDialogProps {
  siteId: string;
  requestId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When the screen loaded (epoch ms): deadlines are judged against it. */
  now: number;
}

/** What completing a request does, by its type. */
const COMPLETE_LABELS = {
  access: 'Đã gửi bản sao',
  rectify: 'Đã sửa xong',
  delete: 'Xóa dữ liệu và hoàn tất',
  withdraw_marketing: 'Rút đồng ý và hoàn tất',
} as const;

/** The actions that change leads ask once more before they run. */
function confirmation(request: DataRequestDetail): string | null {
  const count = request.leads === null ? '0' : cappedCountLabel(request.leads);
  switch (request.type) {
    case 'delete':
      return `Xóa ${count} lead có số điện thoại hoặc email này trong site, kèm bằng chứng đồng ý. Không hoàn tác được. Thông báo đã gửi qua email trước đó không bị xóa theo. Yêu cầu chỉ giữ lại thông tin liên hệ đã che.`;
    case 'withdraw_marketing':
      return `Ghi nhận việc rút đồng ý nhận ưu đãi trên các lead của người này (${count} lead). Lead vẫn được giữ; đừng gửi ưu đãi cho người này nữa.`;
    case 'access':
    case 'rectify':
      return null;
  }
}

/**
 * "Xử lý" and "Xem nhật ký" (board 12, ADR-017): the request, the person's leads, the steps that
 * remain and the log. Each type is handled with the inbox's own operations.
 */
export function DataRequestDialog({
  siteId,
  requestId,
  open,
  onOpenChange,
  now,
}: DataRequestDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const headingId = useId();
  const warningId = `${headingId}-warning`;
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // A step takes its own button away: keyboard focus then moves to the part that changed.
  const focusNext = useRef<'steps' | 'log' | 'complete' | null>(null);
  const stepsHeadingRef = useRef<HTMLHeadingElement>(null);
  const logHeadingRef = useRef<HTMLHeadingElement>(null);
  const completeRef = useRef<HTMLButtonElement>(null);
  const detailKey = dataRequestQueryKeys.detail(siteId, requestId);
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: ({ signal }) => api(endpoints.getDataRequest, [requestId], { signal }),
    enabled: open,
  });
  const request = detail.data;

  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus();
      return;
    }
    const target = focusNext.current;
    focusNext.current = null;
    const element =
      target === 'steps'
        ? stepsHeadingRef.current
        : target === 'log'
          ? logHeadingRef.current
          : target === 'complete'
            ? completeRef.current
            : null;
    element?.focus();
  }, [confirming, request]);

  function updated(next: DataRequestDetail) {
    queryClient.setQueryData(detailKey, next);
    void queryClient.invalidateQueries({ queryKey: dataRequestQueryKeys.list(siteId) });
  }

  const respond = useMutation({
    mutationFn: () => api(endpoints.respondDataRequest, [requestId]),
    onSuccess: (next) => {
      focusNext.current = 'steps';
      updated(next);
      toast({ tone: 'success', title: 'Đã ghi nhận việc phản hồi người yêu cầu' });
    },
    onError: (error) => {
      reportUnexpected('Answering a data request failed', error);
      void queryClient.invalidateQueries({ queryKey: detailKey });
    },
  });

  const complete = useMutation({
    mutationFn: () => api(endpoints.completeDataRequest, [requestId]),
    onSuccess: (next) => {
      focusNext.current = 'log';
      setConfirming(false);
      updated(next);
      // Leads were deleted or changed: the inbox, its badge, the dashboard and "Hiệu quả" read
      // them again.
      void queryClient.invalidateQueries({ queryKey: leadQueryKeys.all(siteId) });
      void queryClient.invalidateQueries({ queryKey: siteQueryKeys.pages(siteId) });
      void queryClient.invalidateQueries({ queryKey: analyticsQueryKeys.all(siteId) });
      toast({ tone: 'success', title: 'Yêu cầu đã hoàn tất' });
    },
    onError: (error) => {
      reportUnexpected('Completing a data request failed', error);
      void queryClient.invalidateQueries({ queryKey: detailKey });
    },
  });

  const exportFile = useMutation({
    mutationFn: (format: PersonExportRequest['format']) =>
      downloadFile(endpoints.exportDataRequest, [requestId], { body: { format } }),
    onSuccess: (file) => {
      void queryClient.invalidateQueries({ queryKey: detailKey });
      toast(
        file.truncated
          ? {
              tone: 'warning',
              title: 'Đã xuất một phần dữ liệu',
              description: `File gồm ${LEAD_PERSON_EXPORT_MAX} lead mới nhất của người này.`,
            }
          : { tone: 'success', title: 'Đã xuất dữ liệu của người yêu cầu' },
      );
    },
    onError: (error) => {
      reportUnexpected('Exporting a data request failed', error);
    },
  });

  const failure = [respond.error, complete.error, exportFile.error].find((error) => error !== null);

  function body(request: DataRequestDetail) {
    const done = request.status === 'completed';
    const asks = confirmation(request);
    return (
      <div className={styles.form}>
        <dl className={styles.facts}>
          <dt>Người yêu cầu</dt>
          <dd>
            {[
              request.contact.name,
              request.contact.phone === null
                ? null
                : request.masked
                  ? request.contact.phone
                  : formatLeadPhone(request.contact.phone),
              request.contact.email,
            ]
              .filter((part) => part !== null)
              .join(' · ')}
          </dd>
          <dt>Nhận lúc</dt>
          <dd>{formatDateTime(request.receivedAt)}</dd>
          <dt>Hạn phản hồi</dt>
          <dd>
            {formatDate(request.respondBy)}
            {request.respondedAt === null
              ? Date.parse(request.respondBy) < now
                ? ' · đã quá hạn'
                : ''
              : ` · đã phản hồi ${formatDate(request.respondedAt)}`}
          </dd>
          <dt>Hạn hoàn tất</dt>
          <dd>
            {formatDate(request.completeBy)}
            {request.completedAt === null
              ? Date.parse(request.completeBy) < now
                ? ' · đã quá hạn'
                : ''
              : ` · hoàn tất ${formatDate(request.completedAt)}`}
          </dd>
        </dl>

        <section className={styles.block} aria-labelledby={`${headingId}-leads`}>
          <h3 id={`${headingId}-leads`} className={styles.blockTitle}>
            Lead của người này
          </h3>
          {request.leads === null ? (
            <p className={styles.note}>
              Dữ liệu của người này đã được xóa. Yêu cầu chỉ giữ thông tin liên hệ đã che để chứng
              minh đã xử lý.
            </p>
          ) : request.leads.count === 0 ? (
            <p className={styles.note}>
              Không có lead nào trong site có số điện thoại hoặc email này.
            </p>
          ) : (
            <>
              <p className={styles.note}>
                {`${cappedCountLabel(request.leads)} lead trong site có số điện thoại hoặc email này`}
                {request.matches.length < request.leads.count
                  ? `; dưới đây là ${request.matches.length} lead mới nhất.`
                  : '.'}
                {request.type === 'rectify' && !done
                  ? ' Mở từng lead và bấm “Sửa thông tin” để sửa họ tên, số điện thoại hoặc email.'
                  : ''}
              </p>
              <ul className={styles.matches} aria-labelledby={`${headingId}-leads`}>
                {request.matches.map((match) => (
                  <li key={match.id} className={styles.match}>
                    <Link href={leadHref(siteId, match.id)} className={styles.matchName}>
                      {match.name}
                    </Link>
                    <span>{formatLeadPhone(match.phone)}</span>
                    {match.email === null ? null : <span>{match.email}</span>}
                    <span className={styles.sub}>
                      {`${match.page.title} · ${formatDate(match.createdAt)}`}
                    </span>
                    {request.type === 'withdraw_marketing' ? (
                      <span className={styles.sub}>{matchMarketing(match)}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {done ? null : (
          <section className={styles.block} aria-labelledby={`${headingId}-steps`}>
            <h3
              id={`${headingId}-steps`}
              ref={stepsHeadingRef}
              tabIndex={-1}
              className={styles.blockTitle}
            >
              Xử lý
            </h3>
            {confirming && asks !== null ? (
              <Callout
                tone={request.type === 'delete' ? 'danger' : 'warning'}
                title={COMPLETE_LABELS[request.type]}
              >
                <p id={warningId} className={styles.note}>
                  {asks}
                </p>
                <div className={styles.actions}>
                  <Button
                    ref={confirmRef}
                    // Focus lands here: the consequences are read with the button.
                    aria-describedby={warningId}
                    variant={request.type === 'delete' ? 'danger' : 'primary'}
                    size="sm"
                    loading={complete.isPending}
                    onClick={() => {
                      complete.mutate();
                    }}
                  >
                    Xác nhận
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={complete.isPending}
                    onClick={() => {
                      focusNext.current = 'complete';
                      setConfirming(false);
                    }}
                  >
                    Hủy
                  </Button>
                </div>
              </Callout>
            ) : (
              <div className={styles.actions}>
                {request.status === 'open' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={respond.isPending}
                    onClick={() => {
                      respond.mutate();
                    }}
                  >
                    Đã phản hồi người yêu cầu
                  </Button>
                ) : null}
                {request.type === 'access' ? (
                  <DropdownMenu
                    align="start"
                    trigger={
                      <Button
                        variant="secondary"
                        size="sm"
                        leadingIcon={<DownloadIcon size={16} />}
                        loading={exportFile.isPending}
                      >
                        Xuất dữ liệu
                      </Button>
                    }
                  >
                    <DropdownMenuItem
                      onSelect={() => {
                        exportFile.mutate('json');
                      }}
                    >
                      File JSON
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        exportFile.mutate('csv');
                      }}
                    >
                      File CSV (Excel)
                    </DropdownMenuItem>
                  </DropdownMenu>
                ) : null}
                <Button
                  ref={completeRef}
                  variant={request.type === 'delete' ? 'danger' : 'primary'}
                  size="sm"
                  loading={complete.isPending}
                  onClick={() => {
                    complete.reset();
                    if (asks === null) {
                      complete.mutate();
                    } else {
                      setConfirming(true);
                    }
                  }}
                >
                  {COMPLETE_LABELS[request.type]}
                </Button>
              </div>
            )}
            {request.status === 'open' ? (
              <p className={styles.note}>
                Bấm “Đã phản hồi người yêu cầu” khi đã báo cho họ là bạn đang xử lý.
              </p>
            ) : null}
          </section>
        )}

        {failure === undefined ? null : (
          <Callout tone="danger" role="alert" title="Chưa thực hiện được">
            {problemMessage(failure)}
          </Callout>
        )}

        <section className={styles.block} aria-labelledby={`${headingId}-log`}>
          <h3
            id={`${headingId}-log`}
            ref={logHeadingRef}
            tabIndex={-1}
            className={styles.blockTitle}
          >
            Nhật ký
          </h3>
          <ol className={styles.log} aria-labelledby={`${headingId}-log`}>
            {request.log.map((entry, index) => (
              <li key={`${entry.at}-${String(index)}`}>
                <time dateTime={entry.at} className={styles.logTime}>
                  {formatDateTime(entry.at)}
                </time>
                {` · ${entry.actor.name} · ${logSentence(entry, request.type)}`}
              </li>
            ))}
          </ol>
        </section>
      </div>
    );
  }

  // A step that changes the request finishes before the dialog closes, like ConfirmDialog.
  const busy = respond.isPending || complete.isPending;

  /** Every way out (Escape, ✕, "Đóng"): an armed confirmation or an old result does not stay. */
  function close() {
    if (busy) {
      return;
    }
    setConfirming(false);
    respond.reset();
    complete.reset();
    exportFile.reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          onOpenChange(true);
        } else {
          close();
        }
      }}
      size="lg"
      title={request === undefined ? 'Yêu cầu về dữ liệu' : dataRequestTypeLabels[request.type]}
      description={request === undefined ? undefined : requesterName(request)}
      footer={
        <Button variant="secondary" disabled={busy} onClick={close}>
          Đóng
        </Button>
      }
    >
      {detail.isError ? (
        <Callout tone="danger" role="alert" title="Chưa tải được yêu cầu">
          {problemMessage(detail.error)}
        </Callout>
      ) : request === undefined ? (
        <Spinner label="Đang tải yêu cầu" />
      ) : (
        body(request)
      )}
    </Dialog>
  );
}
