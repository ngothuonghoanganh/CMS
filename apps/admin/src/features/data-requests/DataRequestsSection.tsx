'use client';

import {
  type DataRequest,
  type DataRequestListResponse,
  dataRequestTypeLabels,
  endpoints,
  vnDateTimeOf,
} from '@plp/contracts';
import {
  AlertCircleIcon,
  Badge,
  Button,
  Callout,
  Card,
  CheckIcon,
  ClockIcon,
  PlusIcon,
  VisuallyHidden,
} from '@plp/ui';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { api } from '../../lib/api';
import { formatDayMonth, formatTime } from '../../lib/format';
import { cx } from '../shell/cx';
import { problemMessage } from '../shell/problem-message';
import { useNow } from '../shell/use-now';
import { DataRequestDialog } from './DataRequestDialog';
import {
  dataRequestStatusView,
  deadlineLines,
  requesterLine,
  requesterName,
} from './data-request-presentation';
import { DATA_REQUEST_PAGE_SIZE, dataRequestQueryKeys } from './queries';
import { type ReceiptDefaults, RecordDataRequestDialog } from './RecordDataRequestDialog';
import styles from './DataRequests.module.css';

export interface DataRequestsSectionProps {
  siteId: string;
  /** The first page the server loaded, and when (epoch ms). */
  initial: DataRequestListResponse;
  loadedAt: number;
}

const STATUS_ICONS = {
  clock: <ClockIcon size={13} strokeWidth={2} />,
  check: <CheckIcon size={13} strokeWidth={2.4} />,
  alert: <AlertCircleIcon size={13} strokeWidth={2} />,
};

/** Today and the time now in Vietnam: the default receipt of a new request. */
function receiptNow(): ReceiptDefaults {
  const [day = '', time = ''] = vnDateTimeOf(new Date()).split(' ');
  return { day, time: time.slice(0, 5) };
}

/**
 * "Yêu cầu từ người gửi form" (board 12, ADR-017), owner only: requests to see, correct or delete
 * data or to withdraw consent, with their deadlines in working days.
 */
export function DataRequestsSection({ siteId, initial, loadedAt }: DataRequestsSectionProps) {
  const queryClient = useQueryClient();
  const headingId = useId();
  // Dialogs stay mounted once opened, so closing returns focus to the button that opened them; a
  // new key gives "Ghi nhận yêu cầu" an empty form each time.
  const [receipt, setReceipt] = useState<ReceiptDefaults | null>(null);
  const [recordKey, setRecordKey] = useState(0);
  const [recordOpen, setRecordOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);

  function showRequest(requestId: string) {
    setOpenId(requestId);
    setRequestOpen(true);
  }
  const list = useInfiniteQuery({
    queryKey: dataRequestQueryKeys.list(siteId),
    queryFn: ({ pageParam, signal }) =>
      api(endpoints.listDataRequests, [siteId], {
        query: {
          limit: DATA_REQUEST_PAGE_SIZE,
          ...(pageParam === null ? {} : { cursor: pageParam }),
        },
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialData: { pages: [initial], pageParams: [null] },
    initialDataUpdatedAt: loadedAt,
  });
  const items = list.data.pages.flatMap((page) => page.items);
  // Deadlines pass while the screen stays open: they are judged against the clock, not the load.
  const now = useNow(loadedAt);

  function row(request: DataRequest) {
    const status = dataRequestStatusView(request, now);
    const name = requesterName(request);
    const [first, ...rest] = deadlineLines(request, now);
    return (
      <tr key={request.id}>
        <td>
          <div className={styles.person}>
            <span className={styles.personName} title={name}>
              {name}
            </span>
            <span className={styles.sub}>{requesterLine(request)}</span>
          </div>
        </td>
        <td>{dataRequestTypeLabels[request.type]}</td>
        <td className={styles.nowrap}>
          <time dateTime={request.receivedAt}>
            {`${formatDayMonth(request.receivedAt)} · ${formatTime(request.receivedAt)}`}
          </time>
        </td>
        <td>
          {first === undefined ? (
            <>
              <span className={styles.sub} aria-hidden="true">
                —
              </span>
              <VisuallyHidden>Không còn hạn</VisuallyHidden>
            </>
          ) : (
            <div className={styles.deadlines}>
              <span className={cx(styles.deadlineMain, first.overdue && styles.overdue)}>
                {first.text}
              </span>
              {rest.map((line) => (
                <span
                  key={line.text}
                  className={cx(styles.deadlineNext, line.overdue && styles.overdue)}
                >
                  {line.text}
                </span>
              ))}
            </div>
          )}
        </td>
        <td>
          <Badge tone={status.tone} icon={STATUS_ICONS[status.icon]}>
            {status.text}
          </Badge>
        </td>
        <td className={styles.actionCell}>
          {request.status === 'completed' ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Xem nhật ký yêu cầu của ${name}`}
              onClick={() => {
                showRequest(request.id);
              }}
            >
              Xem nhật ký
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Xử lý yêu cầu của ${name}`}
              onClick={() => {
                showRequest(request.id);
              }}
            >
              Xử lý
            </Button>
          )}
        </td>
      </tr>
    );
  }

  return (
    <Card as="section" padding="none" aria-labelledby={headingId} className={styles.section}>
      <div className={styles.header}>
        <div>
          <h2 id={headingId} className={styles.title}>
            Yêu cầu từ người gửi form
          </h2>
          <p className={styles.subtitle}>
            Xem, sửa, xóa dữ liệu hoặc rút lại đồng ý. Hạn được tính theo ngày làm việc.
          </p>
        </div>
        <Button
          variant="secondary"
          leadingIcon={<PlusIcon size={16} />}
          onClick={() => {
            setReceipt(receiptNow());
            setRecordKey((key) => key + 1);
            setRecordOpen(true);
          }}
        >
          Ghi nhận yêu cầu
        </Button>
      </div>

      {list.isError ? (
        <div className={styles.empty}>
          <Callout
            tone="danger"
            role="alert"
            title={
              list.isFetchNextPageError
                ? 'Chưa tải thêm được yêu cầu'
                : 'Chưa tải lại được danh sách yêu cầu'
            }
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void (list.isFetchNextPageError ? list.fetchNextPage() : list.refetch());
                }}
              >
                Thử lại
              </Button>
            }
          >
            {problemMessage(list.error)}
          </Callout>
        </div>
      ) : null}

      {items.length === 0 && !list.isError ? (
        <p className={styles.empty}>
          Chưa có yêu cầu nào. Khi người gửi form nhờ xem, sửa hoặc xóa dữ liệu qua email hay điện
          thoại, hãy ghi nhận ở đây để theo dõi hạn xử lý.
        </p>
      ) : items.length === 0 ? null : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">NGƯỜI YÊU CẦU</th>
                <th scope="col">YÊU CẦU</th>
                <th scope="col">NHẬN LÚC</th>
                <th scope="col">HẠN</th>
                <th scope="col">TRẠNG THÁI</th>
                <th scope="col">
                  <VisuallyHidden>Thao tác</VisuallyHidden>
                </th>
              </tr>
            </thead>
            <tbody>{items.map(row)}</tbody>
          </table>
        </div>
      )}

      {list.hasNextPage ? (
        <div className={styles.more}>
          <Button
            variant="secondary"
            size="sm"
            loading={list.isFetchingNextPage}
            onClick={() => {
              void list.fetchNextPage();
            }}
          >
            Tải thêm
          </Button>
        </div>
      ) : null}

      {receipt === null ? null : (
        <RecordDataRequestDialog
          key={recordKey}
          siteId={siteId}
          open={recordOpen}
          onOpenChange={setRecordOpen}
          defaults={receipt}
          onRecorded={() => {
            setRecordOpen(false);
            void queryClient.invalidateQueries({ queryKey: dataRequestQueryKeys.list(siteId) });
          }}
        />
      )}
      {openId === null ? null : (
        // One instance per request: a confirmation or a result never carries over to another.
        <DataRequestDialog
          key={openId}
          siteId={siteId}
          requestId={openId}
          open={requestOpen}
          onOpenChange={setRequestOpen}
          now={now}
        />
      )}
    </Card>
  );
}
