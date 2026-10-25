'use client';

import type { PageListItem, PageSummary } from '@plp/contracts';
import {
  AlertCircleIcon,
  ButtonLink,
  CheckIcon,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  ExternalLinkIcon,
  EyeOffIcon,
  HistoryIcon,
  IconButton,
  MoreHorizontalIcon,
  SearchIcon,
  StatusBadge,
  VisuallyHidden,
  WarningTriangleIcon,
} from '@plp/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
import type { DateInput } from '../../lib/format';
import { internalVisitUrl, slugPath } from '../../lib/site-url';
import { cx } from '../shell/cx';
import { pageHref } from '../shell/navigation';
import { type ChecksTone, presentPageStatus } from './status-presentation';
import { type UnpublishablePage, unpublishable } from './UnpublishDialog';
import styles from './PageTable.module.css';

const checksIcons: Record<ChecksTone, ReactNode> = {
  danger: <AlertCircleIcon size={16} strokeWidth={2} />,
  warning: <WarningTriangleIcon size={16} strokeWidth={2} />,
  success: <CheckIcon size={16} strokeWidth={2.2} />,
  muted: null,
};

export interface PageTableProps {
  siteId: string;
  pages: readonly PageListItem[];
  now: DateInput;
  /** Thumbnail color of published pages, from the site theme. */
  thumbnailColor: string;
  /** Opens the unpublish dialog; focus returns to the row's menu button when it closes. */
  onUnpublish: (page: UnpublishablePage) => void;
}

function RowActions({
  siteId,
  page,
  onUnpublish,
}: {
  siteId: string;
  page: PageSummary;
  onUnpublish: PageTableProps['onUnpublish'];
}) {
  const router = useRouter();
  const live = unpublishable(page);
  const { liveUrl } = page;
  return (
    <div className={styles.actions}>
      <ButtonLink as={Link} href={pageHref(siteId, page.id, 'edit')} variant="secondary">
        Sửa
      </ButtonLink>
      <DropdownMenu
        trigger={
          <IconButton
            aria-label={`Tùy chọn khác cho ${page.title}`}
            icon={<MoreHorizontalIcon size={18} />}
          />
        }
      >
        {liveUrl === null ? null : (
          <DropdownMenuItem
            icon={<ExternalLinkIcon size={18} />}
            onSelect={() => {
              window.open(internalVisitUrl(liveUrl), '_blank', 'noopener,noreferrer');
            }}
          >
            Xem trang live
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          icon={<SearchIcon size={18} />}
          onSelect={() => {
            router.push(pageHref(siteId, page.id, 'seo'));
          }}
        >
          SEO & chia sẻ
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={<HistoryIcon size={18} />}
          onSelect={() => {
            router.push(pageHref(siteId, page.id, 'history'));
          }}
        >
          Lịch sử phiên bản
        </DropdownMenuItem>
        {live === null ? null : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              tone="danger"
              icon={<EyeOffIcon size={18} />}
              onSelect={() => {
                onUnpublish(live);
              }}
            >
              Gỡ xuất bản
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenu>
    </div>
  );
}

/** "LEAD 7 NGÀY": a number for a live page or one with recent leads, "—" otherwise (board 01). */
function leadsCell(page: PageListItem): string {
  return page.leadsLast7Days > 0 || page.liveRelease !== null ? String(page.leadsLast7Days) : '—';
}

/** The page list of screen 01: page, status, live version, checks, recent leads and actions. */
export function PageTable({ siteId, pages, now, thumbnailColor, onUnpublish }: PageTableProps) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">TRANG</th>
          <th scope="col">TRẠNG THÁI</th>
          <th scope="col">PHIÊN BẢN LIVE</th>
          <th scope="col">KIỂM TRA</th>
          <th scope="col" className={styles.leads}>
            LEAD 7 NGÀY
          </th>
          <th scope="col">
            <VisuallyHidden>Thao tác</VisuallyHidden>
          </th>
        </tr>
      </thead>
      <tbody>
        {pages.map((page) => {
          const view = presentPageStatus(page, now);
          const thumbnail: CSSProperties = {
            background: page.liveRelease === null ? 'var(--color-subtle)' : thumbnailColor,
          };
          return (
            <tr key={page.id}>
              <td>
                <div className={styles.pageCell}>
                  <div className={styles.thumbnail} style={thumbnail} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className={styles.stack}>
                    <Link href={pageHref(siteId, page.id, 'edit')} className={styles.title}>
                      {page.title}
                    </Link>
                    <span className={styles.slug}>{slugPath(page.slug)}</span>
                  </div>
                </div>
              </td>
              <td>
                <div className={styles.statusCell}>
                  <StatusBadge status={view.badge} />
                  <span className={styles.sub}>{view.subtext}</span>
                </div>
              </td>
              <td>
                <div className={styles.stack}>
                  <span className={styles.version}>{view.versionLine}</span>
                  {view.authorLine === null ? null : (
                    <span className={styles.sub}>{view.authorLine}</span>
                  )}
                </div>
              </td>
              <td>
                <span className={cx(styles.checks, styles[`checks-${view.checks.tone}`])}>
                  {checksIcons[view.checks.tone]}
                  {view.checks.label}
                </span>
              </td>
              <td className={styles.leads}>{leadsCell(page)}</td>
              <td>
                <RowActions siteId={siteId} page={page} onUnpublish={onUnpublish} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
