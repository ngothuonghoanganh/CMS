import type { LeadCounts, PageListResponse, Site } from '@plp/contracts';
import { Badge, Card, CheckCircleIcon, LockIcon } from '@plp/ui';
import Link from 'next/link';
import { hostOf } from '../../lib/site-url';
import { cappedCountLabel } from '../leads/lead-presentation';
import { useLeadCounts } from '../leads/queries';
import { leadsHref, newLeadsHref, openPageHref, siteHref } from '../shell/navigation';
import styles from './SiteSummary.module.css';

export interface SiteSummaryProps {
  site: Site;
  attention: PageListResponse['attention'];
  /** The counts the server loaded; null for roles that do not see leads (ADR-020). */
  initialLeadCounts: LeadCounts | null;
  loadedAt: number;
  /** The user edits pages: "Mở trang" opens the editor rather than the history. */
  canEditPages: boolean;
  /** The user manages domains: the card links to "Tên miền". */
  canManageDomains: boolean;
}

function Arrow() {
  return <span aria-hidden="true">→</span>;
}

/** The leads of the last 7 days, following changes made in the inbox. */
function LeadsCard({
  siteId,
  initial,
  loadedAt,
}: {
  siteId: string;
  initial: LeadCounts;
  loadedAt: number;
}) {
  const leadCounts = useLeadCounts(siteId, initial, loadedAt).data;
  return (
    <Card className={styles.card}>
      <span className={styles.label}>Lead 7 ngày qua</span>
      <div className={styles.leadRow}>
        <span className={styles.leadCount}>{cappedCountLabel(leadCounts.last7Days)}</span>
        {leadCounts.new.count === 0 ? null : (
          // "Chưa xử lý" counts the status "Mới" of every time, like the sidebar badge.
          <Link href={newLeadsHref(siteId)} className={styles.pending}>
            {cappedCountLabel(leadCounts.new)} chưa xử lý
          </Link>
        )}
      </div>
      <Link href={leadsHref(siteId)} className={styles.link}>
        Mở hộp thư lead
        <Arrow />
      </Link>
    </Card>
  );
}

/** "Tóm tắt site": the live address, what needs attention and the leads of the last 7 days. */
export function SiteSummary({
  site,
  attention,
  initialLeadCounts,
  loadedAt,
  canEditPages,
  canManageDomains,
}: SiteSummaryProps) {
  const { pagesWithChanges, pagesWithBlockingErrors, firstPage } = attention;
  const allGood = pagesWithChanges === 0 && pagesWithBlockingErrors === 0;
  return (
    <section aria-label="Tóm tắt site" className={styles.summary}>
      <Card className={styles.card}>
        <span className={styles.label}>Địa chỉ live</span>
        <div className={styles.hostRow}>
          <span className={styles.host}>{hostOf(site.publicOrigin)}</span>
          <Badge tone="success" icon={<LockIcon size={12} strokeWidth={2.4} />}>
            Luôn hoạt động
          </Badge>
        </div>
        {canManageDomains ? (
          <Link href={`${siteHref(site.id)}/domain`} className={styles.link}>
            Quản lý tên miền
            <Arrow />
          </Link>
        ) : null}
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
          <Link href={openPageHref(site.id, firstPage.id, canEditPages)} className={styles.link}>
            Mở trang “{firstPage.title}”
            <Arrow />
          </Link>
        )}
      </Card>

      {initialLeadCounts === null ? null : (
        <LeadsCard siteId={site.id} initial={initialLeadCounts} loadedAt={loadedAt} />
      )}
    </section>
  );
}
