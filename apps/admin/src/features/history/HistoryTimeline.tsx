'use client';

import type { HistoryEntry, ReleaseSummary } from '@plp/contracts';
import { Badge, Button } from '@plp/ui';
import { useId } from 'react';
import { slugPath } from '../../lib/site-url';
import { cx } from '../shell/cx';
import {
  byline,
  entryKey,
  pointerEntryView,
  type PointerEntry,
  releaseChangesLine,
  type ReleaseEntry,
} from './history-presentation';
import styles from './HistoryScreen.module.css';

export interface HistoryTimelineProps {
  items: readonly HistoryEntry[];
  liveReleaseId: string | null;
  /** The release shown in the rollback panel. */
  selectedReleaseId: string | null;
  /** Release whose preview link is being created. */
  previewPendingId: string | null;
  onPreview: (release: ReleaseSummary) => void;
  onCopyToDraft: (release: ReleaseSummary) => void;
  onRestore: (release: ReleaseSummary) => void;
}

function ReleaseCard({
  entry,
  live,
  selected,
  previewPending,
  onPreview,
  onCopyToDraft,
  onRestore,
}: {
  entry: ReleaseEntry;
  live: boolean;
  selected: boolean;
  previewPending: boolean;
} & Pick<HistoryTimelineProps, 'onPreview' | 'onCopyToDraft' | 'onRestore'>) {
  const { release } = entry;
  const headingId = useId();
  return (
    <div className={cx(styles.card, selected && styles.selected)}>
      <div className={styles.cardHead}>
        <h3 id={headingId} className={styles.version}>
          v{release.version}
        </h3>
        {live ? (
          <Badge tone="success" dot size="sm">
            ĐANG LIVE
          </Badge>
        ) : null}
        <span className={styles.byline}>{byline(release.createdBy.name, release.createdAt)}</span>
      </div>
      {release.note === '' ? null : <p className={styles.note}>{release.note}</p>}
      <p className={styles.changes}>{releaseChangesLine(release)}</p>
      <div className={styles.cardFoot}>
        <span className={styles.slug}>{slugPath(release.slug)}</span>
        <span className={styles.cardActions}>
          <Button
            variant="ghost"
            size="sm"
            loading={previewPending}
            aria-describedby={headingId}
            onClick={() => {
              onPreview(release);
            }}
          >
            Xem bản này
          </Button>
          <Button
            variant="secondary"
            size="sm"
            aria-describedby={headingId}
            onClick={() => {
              onCopyToDraft(release);
            }}
          >
            Sao chép vào bản nháp
          </Button>
          {live ? null : (
            <Button
              variant="secondary"
              size="sm"
              aria-describedby={headingId}
              className={styles.restore}
              onClick={() => {
                onRestore(release);
              }}
            >
              Khôi phục bản này
            </Button>
          )}
        </span>
      </div>
    </div>
  );
}

function PointerCard({ entry }: { entry: PointerEntry }) {
  const view = pointerEntryView(entry);
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        {view.title === null ? null : <h3 className={styles.version}>{view.title}</h3>}
        <Badge tone={view.tone} size="sm">
          {view.badge}
        </Badge>
        <span className={styles.byline}>{byline(entry.by.name, entry.at)}</span>
      </div>
      <p className={styles.note}>{view.sentence}</p>
      {entry.reason === null || entry.reason === '' ? null : (
        <p className={styles.changes}>Lý do: {entry.reason}</p>
      )}
    </div>
  );
}

/** Releases and pointer moves, newest first, on a vertical line (board 06). */
export function HistoryTimeline({
  items,
  liveReleaseId,
  selectedReleaseId,
  previewPendingId,
  onPreview,
  onCopyToDraft,
  onRestore,
}: HistoryTimelineProps) {
  return (
    <ol className={styles.timeline}>
      {items.map((entry) => {
        const live = entry.kind === 'release' && entry.release.id === liveReleaseId;
        return (
          <li key={entryKey(entry)} className={styles.entry}>
            <span aria-hidden="true" className={styles.rail}>
              <span
                className={cx(
                  styles.dot,
                  live && styles.dotLive,
                  entry.kind === 'pointer' && styles.dotPointer,
                )}
              />
              <span className={styles.railLine} />
            </span>
            {entry.kind === 'release' ? (
              <ReleaseCard
                entry={entry}
                live={live}
                selected={entry.release.id === selectedReleaseId}
                previewPending={entry.release.id === previewPendingId}
                onPreview={onPreview}
                onCopyToDraft={onCopyToDraft}
                onRestore={onRestore}
              />
            ) : (
              <PointerCard entry={entry} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
