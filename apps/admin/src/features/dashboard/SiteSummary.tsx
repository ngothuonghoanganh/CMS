import type { LeadCounts, PageListResponse, Site } from '@plp/contracts';
import { Badge, Card, CheckCircleIcon, LockIcon } from '@plp/ui';
import Link from 'next/link';
import { hostOf } from '../../lib/site-url';
import { cappedCountLabel } from '../leads/lead-presentation';
import { leadsHref, newLeadsHref, pageHref, siteHref } from '../shell/navigation';
import styles from './SiteSummary.module.css';

export interface SiteSummaryProps {
  site: Site;
  attention: PageListResponse['attention'];
  leadCounts: LeadCounts;
}

function Arrow() {
  return <span aria-hidden="true">→</span>;
}

/** "Tóm tắt site": the live address, what needs attention and the leads of the last 7 days. */
export function SiteSummary({ site, attention, leadCounts }: SiteSummaryProps) {
  const { pagesWithChanges, pagesWithBlockingErrors, firstPage } = attention;
  const allGood = pagesWithChanges === 0 && pagesWithBlockingErrors === 0;
  return (
    <section aria-label="Tóm tắt site" className={styles.summary}>
      <Card className={styles.card}>
        <span className={styles.label}>Địa chỉ live</span>
        <div className={styles.hostRow}>
          <span className={styles.host}>{hostOf(site.defaultOrigin)}</span>
          <Badge tone="success" icon={<LockIcon size={12} strokeWidth={2.4} />}>
            Luôn hoạt động
          </Badge>
        </div>
        <Link href={`${siteHref(site.id)}/domain`} className={styles.link}>
          Quản lý tên miền
          <Arrow />
        </Link>
      </Card>

      <Card className={styles.card}>
        <span className={styles.label}>Cần chú ý</span>
        {allGood ? (
          <p className={styles.ok}>
            <CheckCircleIcon size={18} />
            Mọi trang đều ổn
          </p>
        ) : (
          <ul className={styles.attention}>
            {pagesWithChanges > 0 ? (
              <li>
                <span className={styles.changesDot} aria-hidden="true" />
                {pagesWithChanges} trang có thay đổi chưa xuất bản
              </li>
            ) : null}
            {pagesWithBlockingErrors > 0 ? (
              <li>
                <span className={styles.blockingDot} aria-hidden="true" />
                {/* The API counts pages, not errors: one page can have several blocking errors. */}
                {pagesWithBlockingErrors} trang có lỗi chặn xuất bản
              </li>
            ) : null}
          </ul>
        )}
        {firstPage === null ? null : (
          <Link href={pageHref(site.id, firstPage.id, 'edit')} className={styles.link}>
            Mở trang “{firstPage.title}”
            <Arrow />
          </Link>
        )}
      </Card>

      <Card className={styles.card}>
        <span className={styles.label}>Lead 7 ngày qua</span>
        <div className={styles.leadRow}>
          <span className={styles.leadCount}>{cappedCountLabel(leadCounts.last7Days)}</span>
          {leadCounts.new.count === 0 ? null : (
            // "Chưa xử lý" counts the status "Mới" of every time, like the sidebar badge.
            <Link href={newLeadsHref(site.id)} className={styles.pending}>
              {cappedCountLabel(leadCounts.new)} chưa xử lý
            </Link>
          )}
        </div>
        <Link href={leadsHref(site.id)} className={styles.link}>
          Mở hộp thư lead
          <Arrow />
        </Link>
      </Card>
    </section>
  );
}
