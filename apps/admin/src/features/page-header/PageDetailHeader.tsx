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
  TrashIcon,
} from '@plp/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  deletable,
  DeletePageDialog,
  UNPUBLISH_BEFORE_DELETE,
} from '../dashboard/DeletePageDialog';
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
  /** The user edits pages: "Mở editor" and the tabs of the editor and SEO show (ADR-020). */
  canEdit: boolean;
  /** The user takes pages off the live site: "Gỡ xuất bản" and "Xóa trang" show. */
  canManageLive: boolean;
  /**
   * Link component for the header's links. Defaults to `next/link`; the SEO page passes one that
   * asks before leaving with unsaved changes.
   */
  link?: LinkComponent | undefined;
  /** After "Gỡ xuất bản" succeeded; the site's page and activity queries are refreshed already. */
  onUnpublished?: ((result: PointerMoveResponse) => void) | undefined;
  /**
   * After "Gỡ xuất bản" or "Xóa trang" answered that the live page changed meanwhile. The site's
   * queries are refreshed already; a screen that keeps its page elsewhere reads it again here.
   */
  onPageConflict?: (() => void) | undefined;
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
 * "Tùy chọn khác" (the live page, unpublishing, deleting) and the page tabs. Once the page is
 * deleted the page list opens: nothing of the page is left to show (ADR-027).
 */
export function PageDetailHeader({
  siteId,
  page,
  current,
  now,
  canEdit,
  canManageLive,
  link = Link,
  onUnpublished,
  onPageConflict,
}: PageDetailHeaderProps) {
  const LinkAs = link;
  const router = useRouter();
  const presentation = presentPageStatus(page, now);
  const live = unpublishable(page);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  // "Tùy chọn khác" exists for a live page only: once unpublished, focus goes to the link beside it.
  const editorLink = useRef<HTMLAnchorElement>(null);
  const menuTriggerFocused = useRef(false);
  const [unpublishTarget, setUnpublishTarget] = useState<UnpublishablePage | null>(null);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
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

  useEffect(() => {
    // Focus that moves anywhere fires `focusin` there; the removal of the focused button does not.
    const forget = (event: FocusEvent) => {
      if (event.target !== menuTrigger.current) {
        menuTriggerFocused.current = false;
      }
    };
    document.addEventListener('focusin', forget);
    return () => {
      document.removeEventListener('focusin', forget);
    };
  }, []);

  const liveUrl = live?.liveUrl ?? null;
  // Without "Gỡ xuất bản" and "Xóa trang", the menu only opens the live page.
  const hasMenu = canManageLive || liveUrl !== null;
  // The menu can go while "Tùy chọn khác" has the focus: for a role that only views the live page,
  // a read brings the page as no longer live. The button goes, and its focus with it.
  useEffect(() => {
    if (hasMenu || !menuTriggerFocused.current) {
      return;
    }
    menuTriggerFocused.current = false;
    if (document.activeElement === null || document.activeElement === document.body) {
      editorLink.current?.focus();
    }
  }, [hasMenu]);

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
          {canEdit ? (
            <ButtonLink ref={editorLink} as={LinkAs} href={pageHref(siteId, page.id, 'edit')}>
              Mở editor
            </ButtonLink>
          ) : null}
          {!hasMenu ? null : (
            <DropdownMenu
              trigger={
                <IconButton
                  ref={menuTrigger}
                  onFocus={() => {
                    menuTriggerFocused.current = true;
                  }}
                  aria-label="Tùy chọn khác"
                  variant="secondary"
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
              {canManageLive && liveUrl !== null ? <DropdownMenuSeparator /> : null}
              {canManageLive && live !== null ? (
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
              ) : null}
              {canManageLive ? (
                <DropdownMenuItem
                  tone="danger"
                  icon={<TrashIcon size={18} />}
                  disabled={!deletable(page)}
                  description={deletable(page) ? undefined : UNPUBLISH_BEFORE_DELETE}
                  onSelect={() => {
                    setDeleteOpen(true);
                  }}
                >
                  Xóa trang
                </DropdownMenuItem>
              ) : null}
            </DropdownMenu>
          )}
        </div>
      </div>
      {/* Without the editor and SEO, the history is the page's only view: no tabs to switch. */}
      {canEdit ? (
        <TabsNav
          aria-label="Mục của trang"
          as={LinkAs}
          items={pageTabs(siteId, page.id, current)}
        />
      ) : null}
      {unpublishTarget === null ? null : (
        <UnpublishDialog
          key={unpublishTarget.liveRelease.id}
          page={unpublishTarget}
          open={unpublishOpen}
          onOpenChange={setUnpublishOpen}
          onUnpublished={onUnpublished}
          onConflict={onPageConflict}
          fallbackFocusRef={editorLink}
        />
      )}
      {canManageLive ? (
        <DeletePageDialog
          page={page}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDeleted={() => {
            router.push(siteHref(siteId));
          }}
          onConflict={onPageConflict}
          fallbackFocusRef={editorLink}
        />
      ) : null}
    </header>
  );
}
