'use client';

import { endpoints, type TimelineResponse } from '@plp/contracts';
import { ArrowRightIcon, Button, CalendarIcon, Callout, FileIcon, InboxIcon } from '@plp/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { cx } from '../../shell/cx';
import { problemMessage } from '../../shell/problem-message';
import { contactQueryKeys } from '../queries';
import { type TimelineView, timelineView } from './profile-presentation';
import styles from './ContactProfile.module.css';

const ICONS: Record<TimelineView['tone'], typeof InboxIcon> = {
  lead: InboxIcon,
  note: FileIcon,
  meeting: CalendarIcon,
  stage: ArrowRightIcon,
};

export interface ProfileTimelineProps {
  siteId: string;
  contactId: string;
  initial: TimelineResponse;
  loadedAt: number;
}

/** "Dòng thời gian", newest first, a page at a time. */
export function ProfileTimeline({ siteId, contactId, initial, loadedAt }: ProfileTimelineProps) {
  const timeline = useInfiniteQuery({
    queryKey: contactQueryKeys.timeline(siteId, contactId),
    queryFn: ({ pageParam, signal }) =>
      api(endpoints.contactTimeline, [siteId, contactId], {
        query: pageParam === null ? {} : { cursor: pageParam },
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    initialData: { pages: [initial], pageParams: [null] },
    initialDataUpdatedAt: loadedAt,
  });
  const entries = timeline.data.pages.flatMap((page) => page.items);
  return (
    <>
      <h2 id="timeline-title" className={styles.timelineTitle}>
        Dòng thời gian
      </h2>
      {entries.length === 0 ? <p className={styles.empty}>Chưa có gì trong hồ sơ.</p> : null}
      <ol className={styles.timeline}>
        {entries.map((entry) => {
          const view = timelineView(entry);
          const Icon = ICONS[view.tone];
          return (
            <li key={`${entry.kind}-${entry.id}`} className={styles.entry}>
              <span
                aria-hidden="true"
                className={cx(styles.entryIcon, styles[`tone-${view.tone}`])}
              >
                <Icon size={15} />
              </span>
              <div className={styles.entryBody}>
                <span className={styles.entryHead}>
                  <span className={styles.entryTitle}>{view.title}</span>
                  <span className={styles.entryWhen}>{view.when}</span>
                </span>
                {view.body === '' ? null : <span className={styles.entryText}>{view.body}</span>}
              </div>
            </li>
          );
        })}
      </ol>
      {timeline.isFetchNextPageError ? (
        <Callout tone="danger" role="alert" title="Chưa tải thêm được">
          {problemMessage(timeline.error)}
        </Callout>
      ) : null}
      {timeline.hasNextPage ? (
        <Button
          variant="secondary"
          size="sm"
          className={styles.more}
          loading={timeline.isFetchingNextPage}
          onClick={() => {
            void timeline.fetchNextPage();
          }}
        >
          Xem thêm
        </Button>
      ) : null}
    </>
  );
}
