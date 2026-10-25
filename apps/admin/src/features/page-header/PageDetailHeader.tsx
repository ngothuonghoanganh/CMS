'use client';

import type { PageSummary, PointerMoveResponse } from '@plp/contracts';
import {
  ButtonLink,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  ExternalLinkIcon,
  EyeOffIcon,
  IconButton,
  type LinkComponent,
  MoreHorizontalIcon,
  StatusBadge,
  TabsNav,
} from '@plp/ui';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { presentPageStatus } from '../dashboard/status-presentation';
import {
  type UnpublishablePage,
  unpublishable,
  UnpublishDialog,
} from '../dashboard/UnpublishDialog';
import { pageHref, siteHref } from '../shell/navigation';
import styles from './PageDetailHeader.module.css';
import { internalVisitUrl } from '../../lib/site-url';

export type PageView = 'seo' | 'history';

export interface PageDetailHeaderProps {
  siteId: string;
  page: PageSummary;
  /** The tab being shown. */
  current: PageView;
  /** The current time (epoch ms) for status lines such as "Gỡ ngày 24/10". */
  now: number;
  /**
   * Link component for the header's links. Defaults to `next/link`; the SEO page passes one that
   * asks before leaving with unsaved changes.
   */
  link?: LinkComponent | undefined;
  /** After "Gỡ xuất bản" succeeded; the site's page and activity queries are refreshed already. */
  onUnpublished?: ((result: PointerMoveResponse) => void) | undefined;
}

/** The tabs of one page: "Nội dung" (the editor), "SEO & chia sẻ", "Lịch sử phiên bản". */
export function pageTabs(siteId: string, pageId: string, current: PageView) {
  return [
    { href: pageHref(siteId, pageId, 'edit'), label: 'Nội dung', current: false },
    { href: pageHref(siteId, pageId, 'seo'), label: 'SEO & chia sẻ', current: current === 'seo' },
    {
      href: pageHref(siteId, pageId, 'history'),
      label: 'Lịch sử phiên bản',
      current: current === 'history',
    },
  ];
}

/**
 * Header of the page-level screens (boards 06 and 07): breadcrumb, title with status, "Mở editor",
 * "Tùy chọn khác" (unpublish) and the page tabs.
 */
export function PageDetailHeader({
  siteId,
  page,
  current,
  now,
  link = Link,
  onUnpublished,
}: PageDetailHeaderProps) {
  const LinkAs = link;
  const presentation = presentPageStatus(page, now);
  const live = unpublishable(page);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [unpublishTarget, setUnpublishTarget] = useState<UnpublishablePage | null>(null);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const target = returnFocus.current;
    if (unpublishOpen || target === null) {
      return;
    }
    // The dialog opened from a menu item that no longer exists; focus its menu button instead.
    const timer = setTimeout(() => {
      returnFocus.current = null;
      if (target.isConnected) {
        target.focus();
      }
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [unpublishOpen]);

  return (
    <header className={styles.header}>
      <nav aria-label="Đường dẫn" className={styles.breadcrumb}>
        <LinkAs href={siteHref(siteId)} className={styles.crumb}>
          Trang
        </LinkAs>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{page.title}</span>
      </nav>
      <div className={styles.titleRow}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{page.title}</h1>
          <StatusBadge status={presentation.badge} />
          <span className={styles.subtext}>{presentation.subtext}</span>
        </div>
        <div className={styles.actions}>
          <ButtonLink as={LinkAs} href={pageHref(siteId, page.id, 'edit')}>
            Mở editor
          </ButtonLink>
          {live === null ? null : (
            <DropdownMenu
              trigger={
                <IconButton
                  ref={menuTrigger}
                  aria-label="Tùy chọn khác"
                  variant="secondary"
                  icon={<MoreHorizontalIcon size={18} />}
                />
              }
            >
              {live.liveUrl === null ? null : (
                <DropdownMenuItem
                  icon={<ExternalLinkIcon size={18} />}
                  onSelect={() => {
                    if (live.liveUrl !== null) {
                      window.open(internalVisitUrl(live.liveUrl), '_blank', 'noopener,noreferrer');
                    }
                  }}
                >
                  Xem trang live
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                tone="danger"
                icon={<EyeOffIcon size={18} />}
                onSelect={() => {
                  returnFocus.current = menuTrigger.current;
                  setUnpublishTarget(live);
                  setUnpublishOpen(true);
                }}
              >
                Gỡ xuất bản
              </DropdownMenuItem>
            </DropdownMenu>
          )}
        </div>
      </div>
      <TabsNav aria-label="Mục của trang" as={LinkAs} items={pageTabs(siteId, page.id, current)} />
      {unpublishTarget === null ? null : (
        <UnpublishDialog
          key={unpublishTarget.liveRelease.id}
          page={unpublishTarget}
          open={unpublishOpen}
          onOpenChange={setUnpublishOpen}
          onUnpublished={onUnpublished}
        />
      )}
    </header>
  );
}
