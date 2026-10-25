'use client';

import {
  endpoints,
  type PageSummary,
  type PointerMoveResponse,
  type ReleaseSummary,
  type Site,
} from '@plp/contracts';
import { themePresets } from '@plp/sections/schema';
import {
  ArrowRightIcon,
  Button,
  Callout,
  CheckCircleIcon,
  Field,
  GlobeIcon,
  HistoryIcon,
  Input,
} from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { formatDayMonth } from '../../lib/format';
import { displayUrl } from '../../lib/site-url';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import styles from './RollbackPanel.module.css';

/** Same bound as `pointerMoveRequestSchema.reason`. */
const REASON_MAX = 300;

export interface RollbackPanelProps {
  site: Pick<Site, 'defaultOrigin' | 'themePresetId'>;
  page: PageSummary;
  /** The older release to make live. */
  release: ReleaseSummary;
  /** The release the history says is live now; the pointer move expects it. */
  liveReleaseId: string | null;
  onCancel: () => void;
  /** After the pointer moved; the panel stays busy until the returned promise settles. */
  onRolledBack: (result: PointerMoveResponse) => Promise<void>;
  /** The live page changed in the meantime (409): refresh the history. */
  onConflict: () => void;
}

function isConflict(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409;
}

/**
 * "Khôi phục v11 thành bản live?" (board 06): explains what a rollback changes, asks for the
 * reason and moves the live pointer. Releases and the draft are never modified (ADR-006).
 */
export function RollbackPanel({
  site,
  page,
  release,
  liveReleaseId,
  onCancel,
  onRolledBack,
  onConflict,
}: RollbackPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const hintId = useId();
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  const live = page.liveRelease;
  const thumbnail = themePresets[site.themePresetId].schemes.brand;
  const address = displayUrl(
    release.slug === '' ? site.defaultOrigin : `${site.defaultOrigin}/${release.slug}`,
  );
  const changeCount = page.status.changeCount;

  useEffect(() => {
    // On narrow screens the panel sits below the list: bring it into view with focus.
    const heading = headingRef.current;
    if (heading === null) {
      return;
    }
    if (typeof heading.scrollIntoView === 'function') {
      heading.scrollIntoView({ block: 'nearest' });
    }
    heading.focus();
  }, []);

  const rollback = useMutation({
    mutationFn: (text: string) =>
      api(endpoints.movePointer, [page.id], {
        body: {
          targetReleaseId: release.id,
          expectedCurrentReleaseId: liveReleaseId,
          reason: text,
        },
      }),
    onSuccess: (result) => onRolledBack(result),
    onError: (error) => {
      if (isConflict(error)) {
        onConflict();
        return;
      }
      reportUnexpected('Rolling back failed', error);
    },
  });

  return (
    <section aria-labelledby={headingId} className={styles.panel}>
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.title}>
        Khôi phục v{release.version} thành bản live?
      </h2>

      <div className={styles.compare}>
        <div className={styles.side}>
          <span
            aria-hidden="true"
            className={styles.thumb}
            style={{ background: live === null ? undefined : thumbnail.background }}
          >
            <span className={styles.line} style={{ background: thumbnail.heading }} />
            <span className={styles.lineShort} style={{ background: thumbnail.muted }} />
          </span>
          <span className={styles.caption}>Live bây giờ</span>
          <span className={styles.value}>
            {live === null
              ? 'Không có bản live'
              : `v${live.version} · ${formatDayMonth(live.publishedAt)}`}
          </span>
        </div>
        <ArrowRightIcon size={18} className={styles.arrow} />
        <div className={styles.side}>
          <span
            aria-hidden="true"
            className={`${styles.thumb} ${styles.thumbTarget}`}
            style={{ background: thumbnail.background }}
          >
            <span className={styles.line} style={{ background: thumbnail.heading }} />
            <span className={styles.lineShort} style={{ background: thumbnail.muted }} />
          </span>
          <span className={styles.caption}>Sẽ live</span>
          <span className={`${styles.value} ${styles.target}`}>
            v{release.version} · {formatDayMonth(release.createdAt)}
          </span>
        </div>
      </div>

      <ul className={styles.bullets}>
        <li>
          <GlobeIcon size={18} className={styles.bulletIcon} />
          <span>
            Áp dụng cho <span className={styles.mono}>{address}</span>
          </span>
        </li>
        <li>
          <CheckCircleIcon size={18} className={styles.bulletIcon} />
          <span>
            {changeCount > 0
              ? `Bản nháp hiện tại (${changeCount} thay đổi) được giữ nguyên.`
              : 'Bản nháp hiện tại được giữ nguyên.'}
          </span>
        </li>
        {live === null ? null : (
          <li>
            <HistoryIcon size={18} className={styles.bulletIcon} />
            <span>v{live.version} vẫn nằm trong lịch sử, bạn có thể hoàn tác ngay sau đó.</span>
          </li>
        )}
      </ul>

      <Field
        label="Lý do"
        labelNote="ghi vào nhật ký hoạt động"
        required
        counter={{ length: reason.length, max: REASON_MAX }}
      >
        <Input
          value={reason}
          maxLength={REASON_MAX}
          placeholder="Ví dụ: Giá ưu đãi mới chưa được duyệt"
          disabled={rollback.isPending}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </Field>

      {rollback.error === null ? null : (
        <Callout tone={isConflict(rollback.error) ? 'warning' : 'danger'} role="alert">
          {isConflict(rollback.error)
            ? `${problemMessage(rollback.error)}. Lịch sử đã được tải lại, hãy kiểm tra rồi thử lại.`
            : problemMessage(rollback.error)}
        </Callout>
      )}

      <div className={styles.footer}>
        {trimmed === '' ? (
          <span id={hintId} className={styles.hint}>
            Nhập lý do để tiếp tục.
          </span>
        ) : null}
        <div className={styles.buttons}>
          <Button variant="secondary" disabled={rollback.isPending} onClick={onCancel}>
            Hủy
          </Button>
          <Button
            loading={rollback.isPending}
            disabled={trimmed === ''}
            aria-describedby={trimmed === '' ? hintId : undefined}
            onClick={() => {
              rollback.mutate(trimmed);
            }}
          >
            Khôi phục v{release.version}
          </Button>
        </div>
      </div>
    </section>
  );
}
