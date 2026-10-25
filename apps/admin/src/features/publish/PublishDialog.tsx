'use client';

import {
  type CheckItem,
  checksResultSchema,
  endpoints,
  IDEMPOTENCY_KEY_HEADER,
  type Site,
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
  checksSummaryLine,
  currentAcknowledgements,
  initialPublishState,
  isFirstPublish,
  liveSince,
  nextVersion,
  type PreparedPublish,
  publishChanges,
  publishDisabledReason,
  publishFooterNote,
  type PublishNotice,
  publishReducer,
  publishTitle,
  tallyChecks,
} from './publish-state';
import { qrCodeDataUrl } from './qr-code';
import styles from './PublishDialog.module.css';

/** Same bound as `publishRequestSchema.note`. */
const NOTE_MAX = 200;
const QR_SIZE = 84;

export interface PublishDialogProps extends PublishDialogRenderProps {
  /** The page's site: its default origin is where the page goes live. */
  site: Pick<Site, 'id' | 'defaultOrigin'>;
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
  ignored?: boolean;
  onFix: () => void;
  onToggle?: () => void;
}

function CheckRow({ item, ignored = false, onFix, onToggle }: CheckRowProps) {
  const titleId = useId();
  const blocking = item.severity === 'blocking';
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
      </div>
      <div className={styles.checkActions}>
        <Button
          variant={blocking ? 'secondary' : 'ghost'}
          size="sm"
          aria-describedby={titleId}
          onClick={onFix}
        >
          {blocking ? 'Sửa ngay' : 'Sửa'}
        </Button>
        {onToggle ? (
          <Button
            variant="secondary"
            size="sm"
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
 * draft, loads fresh checks and uses a new idempotency key.
 */
function PublishSession({
  onOpenChange,
  pageId,
  ensureSaved,
  onFixTarget,
  onPageUpdated,
  site,
}: Omit<PublishDialogProps, 'open'>) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(publishReducer, initialPublishState);
  // One key for every attempt of this session: a retried request never publishes twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const run = useRef(0);
  const reasonId = useId();
  const noteId = useId();

  /**
   * Saves pending changes, then loads the checks for the saved revision. After a conflict the
   * whole page is reloaded (`fresh`), since the live pointer may have moved too.
   */
  async function prepare(
    options: { notice?: PublishNotice | undefined; fresh?: boolean; initial?: boolean } = {},
  ) {
    run.current += 1;
    const current = run.current;
    // The session starts in the preparing state; later runs show it again.
    if (options.initial !== true) {
      dispatch({ type: 'prepare_started', notice: options.notice ?? null });
    }
    try {
      const saved = await ensureSaved();
      let prepared: PreparedPublish;
      if (options.fresh === true) {
        const detail = await api(endpoints.getPage, [pageId]);
        prepared = {
          revision: detail.draft.revision,
          page: detail.page,
          checks: detail.checks,
          loadedAt: Date.now(),
        };
      } else {
        const checks = await api(endpoints.getChecks, [pageId]);
        prepared = { revision: checks.revision, page: saved.page, checks, loadedAt: Date.now() };
      }
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
      const response = await api(endpoints.publish, [pageId], {
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
          fresh: true,
          notice: {
            title: 'Trang vừa thay đổi trong lúc xuất bản',
            message: `${error.problem.title}. Bản nháp và kiểm tra đã được tải lại, hãy xem lại rồi xuất bản.`,
          },
        });
        return;
      }
      if (error instanceof ApiError && error.code === 'publish_blocked') {
        const notice = {
          title: 'Kết quả kiểm tra đã thay đổi',
          message: 'Xem lại các mục bên dưới, sửa hoặc bỏ qua chúng rồi xuất bản.',
        };
        const checks = checksResultSchema.safeParse(error.problem.context?.checks);
        if (checks.success) {
          onPageUpdated(prepared.page, checks.data);
          dispatch({ type: 'checks_refreshed', checks: checks.data, notice });
        } else {
          await prepare({ notice });
        }
        return;
      }
      reportUnexpected('Publishing failed', error);
      dispatch({ type: 'submit_failed', message: problemMessage(error) });
    }
  }

  function close() {
    onOpenChange(false);
  }

  const dialogProps = {
    open: true,
    onOpenChange: (next: boolean) => {
      // A running publish cannot be dismissed half-way.
      if (!next && !state.submitting) {
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
          previousLive === null ? null : (
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
  const disabledReason = publishDisabledReason(tally);
  const live = page.liveRelease;
  const since = liveSince(page);
  const version = nextVersion(page);
  const changes = publishChanges(page);

  return (
    <Dialog
      {...dialogProps}
      title={publishTitle(page)}
      description={
        <span className={styles.target}>
          lên <span className={styles.url}>{targetAddress(site.defaultOrigin, page.slug)}</span>
        </span>
      }
      footerStart={publishFooterNote(page)}
      footer={
        <>
          {disabledReason === null ? null : (
            <span id={reasonId} className={styles.reason}>
              {disabledReason}
            </span>
          )}
          <Button variant="secondary" disabled={state.submitting} onClick={close}>
            Hủy
          </Button>
          <Button
            loading={state.submitting}
            leadingIcon={<ArrowUpIcon size={18} />}
            disabled={disabledReason !== null}
            aria-describedby={disabledReason === null ? undefined : reasonId}
            onClick={() => {
              void publish(prepared);
            }}
          >
            Xuất bản v{version}
          </Button>
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
                  item={item}
                  onFix={() => {
                    onFixTarget(item.target);
                  }}
                />
              ))}
              {checks.warnings.map((item) => (
                <CheckRow
                  key={item.fingerprint}
                  item={item}
                  ignored={state.acknowledged.includes(item.fingerprint)}
                  onFix={() => {
                    onFixTarget(item.target);
                  }}
                  onToggle={() => {
                    dispatch({ type: 'warning_toggled', fingerprint: item.fingerprint });
                  }}
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

        <Field label="Ghi chú cho phiên bản" optional id={noteId}>
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
          <Callout tone="danger" role="alert" title="Chưa xuất bản được">
            {state.error}
          </Callout>
        )}
      </div>
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
