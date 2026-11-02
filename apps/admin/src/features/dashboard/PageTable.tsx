'use client';

import type { PageListItem, PageSummary } from '@plp/contracts';
import {
  AlertCircleIcon,
  Badge,
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
  TrashIcon,
  VisuallyHidden,
  WarningTriangleIcon,
} from '@plp/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
import type { DateInput } from '../../lib/format';
import { internalVisitUrl, slugPath } from '../../lib/site-url';
import { cx } from '../shell/cx';
import { openPageHref, pageHref } from '../shell/navigation';
import { type DeletablePage, deletable, UNPUBLISH_BEFORE_DELETE } from './DeletePageDialog';
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
  /** The user edits pages: rows open the editor and offer "SEO & chia sẻ" (ADR-020). */
  canEdit: boolean;
  /** The user takes pages off the live site: rows offer "Gỡ xuất bản" and "Xóa trang". */
  canManageLive: boolean;
  /** The user sees leads, and so "LEAD 7 NGÀY" (ADR-020). */
  canViewLeads: boolean;
  /** Opens the unpublish dialog; focus returns to the row's menu button when it closes. */
  onUnpublish: (page: UnpublishablePage) => void;
  /** Opens "Xóa trang" for a page that is not live (ADR-027). */
  onDelete: (page: DeletablePage) => void;
}

function RowActions({
  siteId,
  page,
  canEdit,
  canManageLive,
  onUnpublish,
  onDelete,
}: {
  siteId: string;
  page: PageSummary;
  canEdit: boolean;
  canManageLive: boolean;
  onUnpublish: PageTableProps['onUnpublish'];
  onDelete: PageTableProps['onDelete'];
}) {
  const router = useRouter();
  const live = canManageLive ? unpublishable(page) : null;
  const { liveUrl } = page;
  return (
    <div className={styles.actions}>
      <ButtonLink as={Link} href={openPageHref(siteId, page.id, canEdit)} variant="secondary">
        {canEdit ? 'Sửa' : 'Xem'}
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
        {canEdit ? (
          <DropdownMenuItem
            icon={<SearchIcon size={18} />}
            onSelect={() => {
              router.push(pageHref(siteId, page.id, 'seo'));
            }}
          >
            SEO & chia sẻ
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          icon={<HistoryIcon size={18} />}
          onSelect={() => {
            router.push(pageHref(siteId, page.id, 'history'));
          }}
        >
          Lịch sử phiên bản
        </DropdownMenuItem>
        {canManageLive ? <DropdownMenuSeparator /> : null}
        {live === null ? null : (
          <DropdownMenuItem
            tone="danger"
            icon={<EyeOffIcon size={18} />}
            onSelect={() => {
              onUnpublish(live);
            }}
          >
            Gỡ xuất bản
          </DropdownMenuItem>
        )}
        {canManageLive ? (
          <DropdownMenuItem
            tone="danger"
            icon={<TrashIcon size={18} />}
            disabled={!deletable(page)}
            description={deletable(page) ? undefined : UNPUBLISH_BEFORE_DELETE}
            onSelect={() => {
              onDelete(page);
            }}
          >
            Xóa trang
          </DropdownMenuItem>
        ) : null}
      </DropdownMenu>
    </div>
  );
}

/** "LEAD 7 NGÀY": a number for a live page or one with recent leads, "—" otherwise (board 01). */
function leadsCell({ leadsLast7Days: leads, liveRelease }: PageListItem): string {
  if (leads === null) {
    return '—';
  }
  return leads > 0 || liveRelease !== null ? String(leads) : '—';
}

/** The page list of screen 01: page, status, live version, checks, recent leads and actions. */
export function PageTable({
  siteId,
  pages,
  now,
  thumbnailColor,
  canEdit,
  canManageLive,
  canViewLeads,
  onUnpublish,
  onDelete,
}: PageTableProps) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">TRANG</th>
          <th scope="col">TRẠNG THÁI</th>
          <th scope="col" className={styles.versionColumn}>
            PHIÊN BẢN LIVE
          </th>
          <th scope="col">KIỂM TRA</th>
          {canViewLeads ? (
            <th scope="col" className={styles.leads}>
              LEAD 7 NGÀY
            </th>
          ) : null}
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
                    <Link href={openPageHref(siteId, page.id, canEdit)} className={styles.title}>
                      {page.title}
                    </Link>
                    <span className={styles.slug}>{slugPath(page.slug)}</span>
                  </div>
                </div>
              </td>
              <td>
                <div className={styles.statusCell}>
                  <StatusBadge status={view.badge} />
                  {page.approval?.status === 'pending' ? (
                    <Badge tone="info" size="sm">
                      Chờ duyệt
                    </Badge>
                  ) : null}
                  <span className={styles.sub}>{view.subtext}</span>
                  {/* Shown instead of the version column when the list is narrow. */}
                  <span className={cx(styles.stack, styles.versionInline)}>
                    <span className={styles.version}>
                      <VisuallyHidden>Phiên bản live: </VisuallyHidden>
                      {view.versionLine}
                    </span>
                    {view.authorLine === null ? null : (
                      <span className={styles.sub}>{view.authorLine}</span>
                    )}
                  </span>
                </div>
              </td>
              <td className={styles.versionColumn}>
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
              {canViewLeads ? <td className={styles.leads}>{leadsCell(page)}</td> : null}
              <td>
                <RowActions
                  siteId={siteId}
                  page={page}
                  canEdit={canEdit}
                  canManageLive={canManageLive}
                  onUnpublish={onUnpublish}
                  onDelete={onDelete}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
