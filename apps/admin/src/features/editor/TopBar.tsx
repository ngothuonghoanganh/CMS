'use client';

import {
  AlertCircleIcon,
  ArrowLeftIcon,
  Button,
  CheckCircleIcon,
  CheckIcon,
  DesktopIcon,
  EyeIcon,
  HistoryIcon,
  IconButton,
  IconButtonLink,
  MobileIcon,
  RedoIcon,
  SegmentedControl,
  SettingsIcon,
  Spinner,
  StatusBadge,
  TabletIcon,
  UndoIcon,
  VisuallyHidden,
  WarningTriangleIcon,
} from '@plp/ui';
import type { ReactNode } from 'react';
import { useClientNow } from '../shell/use-now';
import { useEditor, useEditorStoreApi } from './editor-context';
import { GuardedLink } from './GuardedLink';
import {
  checksSummaryView,
  deviceLabels,
  liveStatusView,
  pendingChangeCount,
  publishButtonLabel,
  saveStatusView,
} from './presentation';
import type { Device } from './store';
import styles from './TopBar.module.css';

const deviceIcons: Record<Device, ReactNode> = {
  desktop: <DesktopIcon size={18} />,
  tablet: <TabletIcon size={18} />,
  mobile: <MobileIcon size={18} />,
};

const devices: readonly Device[] = ['desktop', 'tablet', 'mobile'];

/**
 * "Đã lưu bản nháp · 2 phút trước". Only the state and the reason of a failure are in the live
 * region: the relative time (refreshed every 30 s) sits beside it, so screen readers announce
 * save transitions, not the clock.
 */
function SaveStatus({ onRetry }: { onRetry: () => void }) {
  const saveState = useEditor((state) => state.saveState);
  const lastSavedAt = useEditor((state) => state.lastSavedAt);
  const saveError = useEditor((state) => state.saveError);
  const now = useClientNow();
  const view = saveStatusView(
    saveState,
    lastSavedAt,
    saveError,
    now === null ? null : new Date(now),
  );
  const issue =
    saveState === 'error' && saveError !== null && saveError.kind !== 'retryable'
      ? saveError.message
      : null;
  return (
    <span className={styles.save} data-tone={view.tone}>
      {saveState === 'saving' ? <Spinner size={12} /> : null}
      {saveState === 'saved' ? <CheckIcon size={14} strokeWidth={2.2} /> : null}
      {view.tone === 'danger' ? <AlertCircleIcon size={14} strokeWidth={2} /> : null}
      <span role="status" className={styles.saveText}>
        {view.text}
        {issue === null ? null : <span className={styles.saveIssue}> · {issue}</span>}
      </span>
      {view.time === null ? null : <span>· {view.time}</span>}
      {view.canRetry ? (
        <>
          <span aria-hidden="true">·</span>
          <button type="button" className={styles.retry} onClick={onRetry}>
            Thử lại
          </button>
        </>
      ) : null}
    </span>
  );
}

export interface TopBarProps {
  siteId: string;
  pageId: string;
  onRetrySave: () => void;
  onPreview: () => void;
  previewPending: boolean;
  /** Opens the publish dialog (screen 05). */
  onOpenPublish: () => void;
}

export function TopBar({
  siteId,
  pageId,
  onRetrySave,
  onPreview,
  previewPending,
  onOpenPublish,
}: TopBarProps) {
  const store = useEditorStoreApi();
  const page = useEditor((state) => state.page);
  const checks = useEditor((state) => state.checks);
  const device = useEditor((state) => state.device);
  const canUndo = useEditor((state) => state.history.past.length > 0);
  const canRedo = useEditor((state) => state.history.future.length > 0);
  const live = liveStatusView(page);
  const summary = checksSummaryView(checks);
  const pageBase = `/sites/${siteId}/pages/${pageId}`;
  const publishLabel = publishButtonLabel(page);
  const changeCount = pendingChangeCount(page);

  const checksButton = (
    <button
      type="button"
      className={styles.checks}
      data-tone={summary.tone}
      onClick={onOpenPublish}
    >
      {summary.tone === 'success' ? (
        <CheckCircleIcon size={16} />
      ) : summary.tone === 'danger' ? (
        <AlertCircleIcon size={16} strokeWidth={2} />
      ) : (
        <WarningTriangleIcon size={16} strokeWidth={2} />
      )}
      {summary.text}
    </button>
  );

  const publishButton = (
    <Button
      onClick={onOpenPublish}
      trailingIcon={
        changeCount > 0 ? (
          <span className={styles.count}>
            {changeCount}
            <VisuallyHidden> thay đổi</VisuallyHidden>
          </span>
        ) : undefined
      }
    >
      {publishLabel}
    </Button>
  );

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <IconButtonLink
          as={GuardedLink}
          href={`/sites/${siteId}`}
          aria-label="Quay lại danh sách trang"
          icon={<ArrowLeftIcon size={20} />}
          size="sm"
        />
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{page.title}</h1>
          <span className={styles.statusLine}>
            <SaveStatus onRetry={onRetrySave} />
            <span aria-hidden="true">·</span>
            <StatusBadge status={live.kind} size="sm">
              {live.text}
            </StatusBadge>
          </span>
        </div>
      </div>
      <div className={styles.center}>
        <SegmentedControl
          aria-label="Xem theo thiết bị"
          value={device}
          options={devices.map((value) => ({
            value,
            label: deviceLabels[value],
            icon: deviceIcons[value],
            iconOnly: true,
          }))}
          onChange={(value) => {
            store.getState().setDevice(value);
          }}
        />
        <span className={styles.divider} aria-hidden="true" />
        <IconButton
          size="sm"
          aria-label="Hoàn tác"
          aria-keyshortcuts="Control+Z Meta+Z"
          tooltip="Hoàn tác (Ctrl+Z)"
          icon={<UndoIcon size={20} />}
          disabled={!canUndo}
          onClick={() => {
            store.getState().undo();
          }}
        />
        <IconButton
          size="sm"
          aria-label="Làm lại"
          aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
          tooltip="Làm lại (Ctrl+Shift+Z)"
          icon={<RedoIcon size={20} />}
          disabled={!canRedo}
          onClick={() => {
            store.getState().redo();
          }}
        />
      </div>
      <div className={styles.right}>
        {checksButton}
        <IconButtonLink
          as={GuardedLink}
          href={`${pageBase}/history`}
          aria-label="Lịch sử phiên bản"
          tooltip="Lịch sử phiên bản"
          icon={<HistoryIcon size={20} />}
          size="sm"
        />
        <IconButtonLink
          as={GuardedLink}
          href={`${pageBase}/seo`}
          aria-label="Cài đặt trang và SEO"
          tooltip="Cài đặt trang & SEO"
          icon={<SettingsIcon size={20} />}
          size="sm"
        />
        <Button
          variant="secondary"
          leadingIcon={<EyeIcon size={18} />}
          loading={previewPending}
          onClick={onPreview}
        >
          Xem trước
        </Button>
        {publishButton}
      </div>
    </header>
  );
}
