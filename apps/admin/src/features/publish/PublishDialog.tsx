'use client';

import {
  can,
  type CheckItem,
  checksResultSchema,
  endpoints,
  holdersOf,
  IDEMPOTENCY_KEY_HEADER,
  type Site,
  type Access,
} from '@plp/contracts';
import {
  AlertCircleIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  Button,
  ButtonLink,
  Callout,
  CheckCircleIcon,
  CheckIcon,
  Dialog,
  ExternalLinkIcon,
  Field,
  Input,
  Spinner,
  Textarea,
  useToast,
  VisuallyHidden,
  WarningTriangleIcon,
} from '@plp/ui';
import { useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useEffectEvent, useId, useReducer, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { formatRelativeTime } from '../../lib/format';
import { displayUrl, internalVisitUrl } from '../../lib/site-url';
import { siteQueryKeys } from '../dashboard/queries';
import { CopyAddressButton } from '../domain/CopyAddressButton';
import { DraftConflictError, type PublishDialogRenderProps } from '../editor';
import { cx } from '../shell/cx';
import { pageHref } from '../shell/navigation';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import {
  approvalLine,
  checksSummaryLine,
  currentAcknowledgements,
  draftChangedSince,
  initialPublishState,
  isFirstPublish,
  liveSince,
  nextVersion,
  ownerOnlyFixNote,
  pendingApproval,
  type PreparedPublish,
  publishChanges,
  publishDisabledReason,
  publishFooterNote,
  publishModeOf,
  type PublishNotice,
  publishReducer,
  publishTitle,
  requestButtonLabel,
  requestDisabledReason,
  tallyChecks,
} from './publish-state';
import { qrCodeDataUrl } from './qr-code';
import styles from './PublishDialog.module.css';

/** Same bound as `publishRequestSchema.note` and `requestApprovalSchema.note`. */
const NOTE_MAX = 200;
/** Same bound as `rejectApprovalSchema.reason`. */
const REASON_MAX = 500;
const QR_SIZE = 84;

export interface PublishDialogProps extends PublishDialogRenderProps {
  /** The page's site: its default origin is where the page goes live. */
  site: Pick<Site, 'id' | 'publicOrigin'>;
}

/** The draft, the live pointer or the site settings changed since the dialog loaded them. */
function isStaleConflict(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    (error.code === 'revision_conflict' ||
      error.code === 'pointer_conflict' ||
      error.code === 'site_changed')
  );
}

async function qrCodeOrNull(url: string): Promise<string | null> {
  try {
    return await qrCodeDataUrl(url);
  } catch (error) {
    // The page is live either way; the dialog then shows the address without the code.
    console.error('Drawing the QR code of the live page failed', error);
    return null;
  }
}

/** The public address a draft slug will have: "smilecare.payload.site/uu-dai". */
function targetAddress(origin: string, slug: string): string {
  return displayUrl(slug === '' ? origin : `${origin}/${slug}`);
}

interface CheckRowProps {
  item: CheckItem;
  role: Access;
  ignored?: boolean;
  onFix: () => void;
  onToggle?: () => void;
}

function CheckRow({ item, role, ignored = false, onFix, onToggle }: CheckRowProps) {
  const titleId = useId();
  const blocking = item.severity === 'blocking';
  const ownerOnly = ownerOnlyFixNote(item.target, role);
  return (
    <li
      className={cx(
        styles.check,
        blocking ? styles.blocking : styles.warning,
        ignored && styles.ignored,
      )}
    >
      <span className={styles.checkIcon} aria-hidden="true">
        {blocking ? (
          <AlertCircleIcon size={20} strokeWidth={2} />
        ) : (
          <WarningTriangleIcon size={20} strokeWidth={2} />
        )}
      </span>
      <div className={styles.checkText}>
        <p id={titleId} className={styles.checkTitle}>
          {blocking ? 'Lỗi chặn' : 'Cảnh báo'} · {item.title}
          {ignored ? <VisuallyHidden> (đã bỏ qua)</VisuallyHidden> : null}
        </p>
        <p className={styles.checkDescription}>{item.description}</p>
        {ownerOnly === null ? null : <p className={styles.ownerOnly}>{ownerOnly}</p>}
      </div>
      <div className={styles.checkActions}>
        {ownerOnly === null ? (
          <Button
            variant={blocking ? 'secondary' : 'ghost'}
            size="sm"
            className={blocking ? styles.fixBlocking : undefined}
            aria-describedby={titleId}
            onClick={onFix}
          >
            {blocking ? 'Sửa ngay' : 'Sửa'}
          </Button>
        ) : null}
        {onToggle ? (
          <Button
            variant="secondary"
            size="sm"
            className={styles.ignoreToggle}
            aria-pressed={ignored}
            aria-describedby={titleId}
            onClick={onToggle}
          >
            {ignored ? 'Hoàn tác' : 'Bỏ qua lần này'}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * One opening of the publish dialog. It mounts when the dialog opens, so each opening saves the
 * draft, loads the page and its checks and uses a new idempotency key.
 */
function PublishSession({
  onOpenChange,
  pageId,
  ensureSaved,
  onFixTarget,
  onPageUpdated,
  role,
  site,
  userId,
}: Omit<PublishDialogProps, 'open'>) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [state, dispatch] = useReducer(publishReducer, initialPublishState);
  // A role that cannot publish sends the draft for approval instead (ADR-023).
  const mode = publishModeOf(role);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejectPending, setRejectPending] = useState(false);
  // One key for every attempt of this session: a retried request never publishes twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const run = useRef(0);
  const reasonId = useId();
  const noteId = useId();

  /**
   * Saves pending changes, then loads the page as the server has it now: the checks of the saved
   * revision, the live pointer, and the request to publish, which others may have sent, answered
   * or refused since the editor loaded the page (ADR-023).
   */
  async function prepare(options: { notice?: PublishNotice | undefined; initial?: boolean } = {}) {
    run.current += 1;
    const current = run.current;
    // The session starts in the preparing state; later runs show it again.
    if (options.initial !== true) {
      dispatch({ type: 'prepare_started', notice: options.notice ?? null });
    }
    try {
      const saved = await ensureSaved();
      const detail = await api(endpoints.getPage, [site.id, pageId]);
      const prepared: PreparedPublish = {
        revision: detail.draft.revision,
        page: detail.page,
        checks: detail.checks,
        loadedAt: Date.now(),
      };
      if (current !== run.current) {
        return;
      }
      // The server's draft moved on without this editor: someone saved it elsewhere.
      if (prepared.revision !== saved.revision) {
        dispatch({ type: 'stale' });
        return;
      }
      onPageUpdated(prepared.page, prepared.checks);
      dispatch({ type: 'prepared', prepared });
    } catch (error) {
      if (current !== run.current) {
        return;
      }
      if (error instanceof DraftConflictError) {
        // The editor shows its own blocking "reload" dialog for this.
        onOpenChange(false);
        return;
      }
      reportUnexpected('Preparing to publish failed', error);
      dispatch({ type: 'prepare_failed', message: problemMessage(error) });
    }
  }

  const startPreparing = useEffectEvent(() => {
    void prepare({ initial: true });
  });

  useEffect(() => {
    startPreparing();
    return () => {
      // Ignore results that arrive after the dialog closed.
      run.current += 1;
    };
  }, []);

  async function publish(prepared: PreparedPublish) {
    dispatch({ type: 'submit_started' });
    try {
      const response = await api(endpoints.publish, [site.id, pageId], {
        body: {
          expectedRevision: prepared.revision,
          expectedPublishedReleaseId: prepared.page.liveRelease?.id ?? null,
          acknowledgedWarnings: currentAcknowledgements(prepared.checks, state.acknowledged),
          // The site-settings chips shown in this dialog (ADR-015).
          acknowledgedSiteChanges: prepared.page.siteChanges.map((change) => change.label),
          note: state.note.trim(),
        },
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      });
      const qrCode = await qrCodeOrNull(response.liveUrl);
      onPageUpdated(response.page, prepared.checks);
      void queryClient.invalidateQueries({ queryKey: siteQueryKeys.site(site.id) });
      dispatch({
        type: 'published',
        result: { response, previousLive: prepared.page.liveRelease, qrCode },
      });
    } catch (error) {
      if (isStaleConflict(error)) {
        await prepare({
          notice: {
            title: 'Trang vừa thay đổi trong lúc xuất bản',
            message: `${error.problem.title}. Bản nháp và kiểm tra đã được tải lại, hãy xem lại rồi xuất bản.`,
          },
        });
        return;
      }
      if (error instanceof ApiError && error.code === 'publish_blocked') {
        await showChangedChecks(error, prepared, {
          title: 'Kết quả kiểm tra đã thay đổi',
          message: 'Xem lại các mục bên dưới, sửa hoặc bỏ qua chúng rồi xuất bản.',
        });
        return;
      }
      reportUnexpected('Publishing failed', error);
      dispatch({ type: 'submit_failed', message: problemMessage(error) });
    }
  }

  /** A 422 `publish_blocked` carries the checks as they are now; show them with the notice. */
  async function showChangedChecks(
    error: ApiError,
    prepared: PreparedPublish,
    notice: PublishNotice,
  ) {
    const checks = checksResultSchema.safeParse(error.problem.context?.checks);
    if (checks.success) {
      onPageUpdated(prepared.page, checks.data);
      dispatch({ type: 'checks_refreshed', checks: checks.data, notice });
    } else {
      await prepare({ notice });
    }
  }

  /** The request was answered or withdrawn under the dialog: reload the page and say so. */
  async function requestAnswered() {
    await prepare({
      notice: {
        title: 'Yêu cầu xuất bản vừa thay đổi',
        message:
          'Trang vừa được xuất bản, hoặc yêu cầu đã được gửi lại, rút hay từ chối. Trang đã được tải lại.',
      },
    });
  }

  async function sendRequest(prepared: PreparedPublish) {
    dispatch({ type: 'submit_started' });
    try {
      const own = pendingApproval(prepared.page);
      const { page } = await api(endpoints.requestApproval, [site.id, pageId], {
        body: {
          expectedRevision: prepared.revision,
          expectedPublishedReleaseId: prepared.page.liveRelease?.id ?? null,
          // The request this dialog shows: sent again only if it still waits (ADR-023).
          approvalId: own !== null && own.requestedBy.id === userId ? own.id : null,
          note: state.note.trim(),
        },
      });
      onPageUpdated(page, prepared.checks);
      dispatch({ type: 'requested', page });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // The draft was saved elsewhere, or someone else's request waits now.
        await prepare({
          notice: {
            title: error.problem.title,
            message: 'Bản nháp và yêu cầu đã được tải lại, hãy xem lại.',
          },
        });
        return;
      }
      if (error instanceof ApiError && error.code === 'publish_blocked') {
        await showChangedChecks(error, prepared, {
          title: 'Kết quả kiểm tra đã thay đổi',
          message: 'Sửa các lỗi chặn bên dưới rồi gửi yêu cầu.',
        });
        return;
      }
      reportUnexpected('Sending a request to publish failed', error);
      dispatch({ type: 'submit_failed', message: problemMessage(error) });
    }
  }

  async function withdraw() {
    dispatch({ type: 'submit_started' });
    try {
      const { page } = await api(endpoints.withdrawApproval, [site.id, pageId]);
      onPageUpdated(page);
      dispatch({ type: 'page_changed', page });
      toast({ tone: 'success', title: 'Đã rút yêu cầu xuất bản' });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        await requestAnswered();
        return;
      }
      reportUnexpected('Withdrawing a request to publish failed', error);
      dispatch({ type: 'submit_failed', message: problemMessage(error) });
    }
  }

  async function reject(approval: { id: string; revision: number }, senderName: string) {
    const text = reason.trim();
    if (text === '') {
      setRejectError('Nhập lý do để người gửi biết cần sửa gì');
      return;
    }
    setRejectPending(true);
    setRejectError(null);
    try {
      const { page } = await api(endpoints.rejectApproval, [site.id, pageId], {
        body: { approvalId: approval.id, revision: approval.revision, reason: text },
      });
      onPageUpdated(page);
      toast({
        tone: 'success',
        title: 'Đã từ chối yêu cầu',
        description: `${senderName} sẽ nhận email kèm lý do.`,
      });
      onOpenChange(false);
    } catch (error) {
      setRejectPending(false);
      if (error instanceof ApiError && error.status === 404) {
        setRejecting(false);
        await requestAnswered();
        return;
      }
      reportUnexpected('Refusing a request to publish failed', error);
      setRejectError(problemMessage(error));
    }
  }

  function close() {
    onOpenChange(false);
  }

  const dialogProps = {
    open: true,
    onOpenChange: (next: boolean) => {
      // A running publish cannot be dismissed half-way.
      if (!next && !state.submitting && !rejectPending) {
        onOpenChange(false);
      }
    },
    className: styles.dialog,
  };

  if (state.phase === 'published' && state.published !== null) {
    const { response, previousLive, qrCode } = state.published;
    const address = displayUrl(response.liveUrl);
    return (
      <Dialog
        {...dialogProps}
        title={`v${response.release.version} đã live`}
        footerStart={
          // Restoring moves the live pointer: only roles that roll back are offered it.
          previousLive === null || !can(role, 'pages.manageLive') ? null : (
            <Link
              href={`${pageHref(site.id, pageId, 'history')}?restore=${encodeURIComponent(previousLive.id)}`}
              className={styles.restoreLink}
            >
              Có vấn đề? Khôi phục v{previousLive.version}
            </Link>
          )
        }
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Tiếp tục chỉnh sửa
            </Button>
            <ButtonLink
              href={internalVisitUrl(response.liveUrl)}
              target="_blank"
              rel="noopener noreferrer"
              trailingIcon={<ExternalLinkIcon size={16} />}
            >
              Mở trang live
              <VisuallyHidden> (mở trong thẻ mới)</VisuallyHidden>
            </ButtonLink>
          </>
        }
      >
        <div className={styles.stack}>
          <div className={styles.success}>
            <span className={styles.successIcon} aria-hidden="true">
              <CheckIcon size={26} strokeWidth={2.2} />
            </span>
            <p className={styles.successText}>
              Khách truy cập đang thấy phiên bản mới. Bản nháp tiếp tục từ đây, các thay đổi sau
              chưa ảnh hưởng tới trang live.
            </p>
          </div>
          {response.revalidation === 'failed' ? (
            <Callout tone="warning" role="status">
              Trang live có thể mất tới 5 phút để cập nhật.
            </Callout>
          ) : null}
          <div className={styles.qrCard}>
            {qrCode === null ? null : (
              <Image
                src={qrCode}
                alt={`Mã QR của ${address}`}
                width={QR_SIZE}
                height={QR_SIZE}
                unoptimized
                className={styles.qr}
              />
            )}
            <div className={styles.qrText}>
              <span className={styles.muted}>Quét mã để kiểm tra trên điện thoại</span>
              <span className={styles.urlRow}>
                <span className={styles.url}>{address}</span>
                <CopyAddressButton url={response.liveUrl} host={address} />
              </span>
            </div>
          </div>
        </div>
      </Dialog>
    );
  }

  if (state.phase === 'requested') {
    return (
      <Dialog
        {...dialogProps}
        title="Đã gửi yêu cầu duyệt"
        footer={<Button onClick={close}>Tiếp tục chỉnh sửa</Button>}
      >
        <div className={styles.stack}>
          <div className={styles.success}>
            <span className={styles.successIcon} aria-hidden="true">
              <CheckIcon size={26} strokeWidth={2.2} />
            </span>
            <p className={styles.successText}>
              {holdersOf('publishApprovals.decide')} sẽ nhận email và xem trang. Bạn sẽ nhận email
              khi trang được xuất bản hoặc khi có góp ý.
            </p>
          </div>
          <p className={styles.muted}>
            Nếu sửa tiếp, hãy gửi lại yêu cầu để người duyệt biết có bản mới.
          </p>
        </div>
      </Dialog>
    );
  }

  const waiting = state.prepared === null ? null : pendingApproval(state.prepared.page);
  if (rejecting && waiting !== null) {
    return (
      <Dialog
        {...dialogProps}
        title={`Từ chối yêu cầu của ${waiting.requestedBy.name}`}
        description="Trang live giữ nguyên. Người gửi nhận email kèm lý do."
        footer={
          <>
            <Button
              variant="secondary"
              disabled={rejectPending}
              onClick={() => {
                setRejecting(false);
                setRejectError(null);
              }}
            >
              Quay lại
            </Button>
            <Button
              variant="danger"
              loading={rejectPending}
              onClick={() => {
                void reject(waiting, waiting.requestedBy.name);
              }}
            >
              Từ chối yêu cầu
            </Button>
          </>
        }
      >
        <Field label="Lý do" required error={rejectError ?? undefined} announceMessages>
          <Textarea
            value={reason}
            maxLength={REASON_MAX}
            rows={3}
            placeholder="Ví dụ: Giá ưu đãi chưa đúng, cần sửa lại phần Hero"
            disabled={rejectPending}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        </Field>
      </Dialog>
    );
  }

  if (state.phase === 'stale') {
    return (
      <Dialog
        {...dialogProps}
        title="Bản nháp vừa thay đổi ở nơi khác"
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Hủy
            </Button>
            <Button
              onClick={() => {
                window.location.reload();
              }}
            >
              Tải lại editor
            </Button>
          </>
        }
      >
        <Callout tone="warning" role="alert">
          Bản nháp này vừa được lưu từ một tab hoặc một người khác. Tải lại editor để xem bản mới
          nhất trước khi xuất bản.
        </Callout>
      </Dialog>
    );
  }

  if (state.phase === 'failed') {
    return (
      <Dialog
        {...dialogProps}
        title="Chưa sẵn sàng xuất bản"
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Hủy
            </Button>
            <Button
              onClick={() => {
                void prepare();
              }}
            >
              Thử lại
            </Button>
          </>
        }
      >
        <Callout tone="danger" role="alert" title="Không lưu hoặc kiểm tra được bản nháp">
          {state.error}
        </Callout>
      </Dialog>
    );
  }

  const prepared = state.prepared;
  if (state.phase === 'preparing' || prepared === null) {
    return (
      <Dialog
        {...dialogProps}
        title="Chuẩn bị xuất bản"
        footer={
          <Button variant="secondary" onClick={close}>
            Hủy
          </Button>
        }
      >
        <p className={styles.preparing} role="status">
          <Spinner size={18} />
          Đang lưu bản nháp và kiểm tra trang…
        </p>
      </Dialog>
    );
  }

  const { page, checks } = prepared;
  const first = isFirstPublish(page);
  const tally = tallyChecks(checks, state.acknowledged);
  const disabledReason =
    mode === 'request'
      ? requestDisabledReason(tally, page, userId)
      : publishDisabledReason(tally, role);
  const pending = pendingApproval(page);
  const ownRequest = pending !== null && pending.requestedBy.id === userId;
  const decides = can(role, 'publishApprovals.decide');
  const refused = page.approval?.status === 'rejected' ? page.approval : null;
  const live = page.liveRelease;
  const since = liveSince(page);
  const version = nextVersion(page);
  const changes = publishChanges(page);

  return (
    <Dialog
      {...dialogProps}
      title={mode === 'request' ? 'Gửi yêu cầu xuất bản' : publishTitle(page)}
      description={
        <span className={styles.target}>
          lên <span className={styles.url}>{targetAddress(site.publicOrigin, page.slug)}</span>
        </span>
      }
      footerStart={
        mode === 'request'
          ? `Chỉ ${holdersOf('publishApprovals.decide')} duyệt được. Trang live giữ nguyên tới khi được duyệt.`
          : publishFooterNote(page)
      }
      footer={
        <>
          {disabledReason === null ? null : (
            <span id={reasonId} className={styles.reason}>
              {disabledReason}
            </span>
          )}
          {mode === 'request' && ownRequest ? (
            <Button
              variant="ghost"
              disabled={state.submitting}
              onClick={() => {
                void withdraw();
              }}
            >
              Rút yêu cầu
            </Button>
          ) : null}
          {mode === 'publish' && decides && pending !== null ? (
            <Button
              variant="secondary"
              disabled={state.submitting}
              onClick={() => {
                setRejecting(true);
              }}
            >
              Từ chối
            </Button>
          ) : null}
          <Button variant="secondary" disabled={state.submitting} onClick={close}>
            Hủy
          </Button>
          {mode === 'request' ? (
            <Button
              loading={state.submitting}
              leadingIcon={<ArrowUpIcon size={18} />}
              disabled={disabledReason !== null}
              aria-describedby={disabledReason === null ? undefined : reasonId}
              onClick={() => {
                void sendRequest(prepared);
              }}
            >
              {requestButtonLabel(page, userId)}
            </Button>
          ) : (
            <Button
              loading={state.submitting}
              leadingIcon={<ArrowUpIcon size={18} />}
              disabled={disabledReason !== null}
              aria-describedby={disabledReason === null ? undefined : reasonId}
              onClick={() => {
                void publish(prepared);
              }}
            >
              {decides && pending !== null ? 'Duyệt và xuất bản' : 'Xuất bản'} v{version}
            </Button>
          )}
        </>
      }
    >
      <div className={styles.stack}>
        <div className={styles.versions}>
          {first ? (
            <span className={styles.version}>
              <span className={styles.strong}>Trang chưa từng xuất bản</span>
            </span>
          ) : (
            <span className={styles.version}>
              <span className={styles.muted}>Đang live</span>
              <span className={styles.strong}>
                {live === null || since === null
                  ? 'Không có (đã gỡ)'
                  : `v${live.version} · ${formatRelativeTime(since, prepared.loadedAt)}`}
              </span>
            </span>
          )}
          <ArrowRightIcon size={16} className={styles.arrow} />
          <span className={styles.version}>
            <span className={styles.muted}>Sau khi xuất bản</span>
            <span className={cx(styles.strong, styles.next)}>v{version} · bản nháp hiện tại</span>
          </span>
          {changes.length > 0 ? (
            <ul className={styles.chips} aria-label="Các thay đổi">
              {changes.map((change, index) => (
                <li key={`${change.label}-${index}`} className={styles.chip}>
                  {change.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {pending === null ? null : (
          <Callout tone="info" title={approvalLine(pending, prepared.loadedAt)}>
            {pending.note === '' ? null : <p className={styles.approvalNote}>“{pending.note}”</p>}
            {draftChangedSince(pending, prepared.revision) ? (
              <p>
                {ownRequest
                  ? 'Bản nháp có thay đổi sau khi gửi. Gửi lại để người duyệt biết có bản mới.'
                  : 'Bản nháp đã thay đổi sau khi gửi yêu cầu. Bạn đang xem bản nháp hiện tại.'}
              </p>
            ) : null}
            {mode === 'publish' && !decides ? (
              <p>Xuất bản trang cũng trả lời yêu cầu này.</p>
            ) : null}
          </Callout>
        )}

        {refused === null ? null : (
          <Callout
            tone="warning"
            title={`${refused.rejectedBy.name} chưa duyệt yêu cầu · ${formatRelativeTime(refused.rejectedAt, prepared.loadedAt)}`}
          >
            Lý do: {refused.reason}
          </Callout>
        )}

        {state.notice === null ? null : (
          <Callout tone="warning" role="status" title={state.notice.title}>
            {state.notice.message}
          </Callout>
        )}

        <section className={styles.checks} aria-labelledby={`${noteId}-checks`}>
          <div className={styles.checksHeading}>
            <h3 id={`${noteId}-checks`} className={styles.checksTitle}>
              Kiểm tra trước khi xuất bản
            </h3>
            <span className={styles.summary}>{checksSummaryLine(tally)}</span>
          </div>
          {checks.blocking.length + checks.warnings.length > 0 ? (
            <ul className={styles.checkList}>
              {checks.blocking.map((item) => (
                <CheckRow
                  key={item.fingerprint}
                  role={role}
                  item={item}
                  onFix={() => {
                    onFixTarget(item.target);
                  }}
                />
              ))}
              {checks.warnings.map((item) => (
                <CheckRow
                  key={item.fingerprint}
                  role={role}
                  item={item}
                  ignored={state.acknowledged.includes(item.fingerprint)}
                  onFix={() => {
                    onFixTarget(item.target);
                  }}
                  // Whoever publishes decides on a warning; a request leaves it to them.
                  {...(mode === 'publish'
                    ? {
                        onToggle: () => {
                          dispatch({ type: 'warning_toggled', fingerprint: item.fingerprint });
                        },
                      }
                    : {})}
                />
              ))}
            </ul>
          ) : null}
          {checks.passed.length > 0 ? (
            <details className={styles.passed}>
              <summary className={styles.passedSummary}>
                <CheckCircleIcon size={18} />
                {checks.passed.length} mục đã đạt
              </summary>
              <ul className={styles.passedList}>
                {checks.passed.map((item) => (
                  <li key={item.code}>{item.title}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <Field
          label={mode === 'request' ? 'Ghi chú cho người duyệt' : 'Ghi chú cho phiên bản'}
          optional
          id={noteId}
        >
          <Input
            value={state.note}
            maxLength={NOTE_MAX}
            placeholder="Ví dụ: Đổi ảnh hero, cập nhật giá ưu đãi"
            disabled={state.submitting}
            onChange={(event) => {
              dispatch({ type: 'note_changed', note: event.target.value });
            }}
          />
        </Field>

        {state.error === null ? null : (
          <Callout
            tone="danger"
            role="alert"
            title={mode === 'request' ? 'Chưa gửi được yêu cầu' : 'Chưa xuất bản được'}
          >
            {state.error}
          </Callout>
        )}
      </div>
      <div className={styles.scrollCue} aria-hidden="true" />
    </Dialog>
  );
}

/**
 * Screen 05: review the changes and the pre-publish checks, skip warnings one by one, publish,
 * then show the live address with a QR code. Mounted by the editor through `renderPublishDialog`.
 */
export function PublishDialog({ open, ...props }: PublishDialogProps) {
  return open ? <PublishSession {...props} /> : null;
}
