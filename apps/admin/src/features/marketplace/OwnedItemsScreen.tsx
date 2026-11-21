'use client';

import {
  type Access,
  can,
  DEFAULT_THEME_PRESET,
  type MarketplaceOwnedItem,
  type Membership,
  type Site,
} from '@plp/contracts';
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  ChevronLeftIcon,
  EmptyState,
  StoreIcon,
} from '@plp/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatDate } from '../../lib/format';
import { marketplaceHref, marketplaceItemHref, templateHref } from '../shell/navigation';
import { PageContainer } from '../shell/PageHeader';
import { CreateFromTemplateDialog } from '../templates/CreateFromTemplateDialog';
import { TemplateThumb } from '../templates/TemplateThumb';
import { dialogTemplateOf, hasUpdate, licenceSourceLabel } from './owned-items';
import { UpdateLicenceDialog } from './UpdateLicenceDialog';
import styles from './OwnedItemsScreen.module.css';

export interface OwnedItemsScreenProps {
  workspace: Membership['workspace'];
  role: Access;
  items: readonly MarketplaceOwnedItem[];
  /** The sites the user may open; creating a page needs `pages.edit` too. */
  sites: readonly Site[];
  /** The site "Tạo trang" suggests first: the one opened last. */
  initialSiteId: string | null;
}

/**
 * "Sản phẩm đã mua" (board 32, ADR-036): the marketplace items the workspace holds a licence of,
 * at the version new pages are made from. A licence covers every site of the workspace, so there
 * is no site count. "Cập nhật" moves it to the latest version; "Tạo trang" opens the dialog of
 * board 18 for the version it is at.
 */
export function OwnedItemsScreen({
  workspace,
  role,
  items,
  sites,
  initialSiteId,
}: OwnedItemsScreenProps) {
  const router = useRouter();
  const canUpdate = can(role, 'templates.manage');
  const targets = can(role, 'pages.edit') ? sites : [];
  const [updating, setUpdating] = useState<{ itemId: string; open: boolean } | null>(null);
  const [creating, setCreating] = useState<{ itemId: string; open: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Looked up on every render: after a refresh the dialogs show the row as it is now.
  const updatingItem = items.find((item) => item.itemId === updating?.itemId);
  const creatingItem = items.find((item) => item.itemId === creating?.itemId);
  const siteId = targets.some((site) => site.id === initialSiteId)
    ? initialSiteId
    : (targets[0]?.id ?? null);

  return (
    <PageContainer>
      <header className={styles.header}>
        <Link href={marketplaceHref(workspace.id)} className={styles.back}>
          <ChevronLeftIcon size={16} />
          Marketplace
        </Link>
        <h1 className={styles.title}>Sản phẩm đã mua</h1>
        <p className={styles.lead}>
          Template {workspace.name} đã nhận hoặc mua, cùng quyền sử dụng của từng mẫu.
        </p>
      </header>

      <div role="status" className={notice === null ? styles.srOnly : undefined}>
        {notice === null ? null : <Callout tone="info">{notice}</Callout>}
      </div>

      {items.length === 0 ? (
        <EmptyState
          className={styles.empty}
          icon={<StoreIcon size={24} />}
          title="Workspace chưa có mẫu nào từ Marketplace"
          description="Mẫu miễn phí và mẫu đã mua đều hiện ở đây, kèm phiên bản và quyền sử dụng."
          action={
            <ButtonLink as={Link} href={marketplaceHref(workspace.id)}>
              Khám phá Marketplace
            </ButtonLink>
          }
        />
      ) : (
        <section aria-label="Template đã sở hữu" className={styles.list}>
          <div className={styles.head} aria-hidden="true">
            <span>MẪU</span>
            <span>PHIÊN BẢN</span>
            <span>QUYỀN SỬ DỤNG</span>
            <span>NHẬN NGÀY</span>
            <span />
          </div>
          <ul className={styles.rows}>
            {items.map((item) => (
              <li key={item.itemId} className={styles.row}>
                <div className={styles.template}>
                  <span className={styles.thumb}>
                    <TemplateThumb
                      sections={item.sections}
                      themePresetId={DEFAULT_THEME_PRESET}
                      label={`Thu nhỏ: ${item.name}`}
                    />
                  </span>
                  <span className={styles.names}>
                    <Link
                      href={marketplaceItemHref(workspace.id, item.itemId)}
                      className={styles.name}
                    >
                      {item.name}
                    </Link>
                    <span className={styles.sub}>
                      {licenceSourceLabel(item.source)}
                      {item.withdrawn ? (
                        <>
                          {' '}
                          <Badge size="sm" tone="muted">
                            Đã ngừng bán
                          </Badge>
                        </>
                      ) : null}
                    </span>
                  </span>
                </div>
                <div className={styles.cell}>
                  <span className={styles.cellLabel}>Phiên bản</span>
                  <span className={styles.version}>v{item.version}</span>
                  {hasUpdate(item) ? (
                    <Badge size="sm" tone="primary">
                      CÓ BẢN v{item.latestVersion}
                    </Badge>
                  ) : null}
                </div>
                <div className={styles.cell}>
                  <span className={styles.cellLabel}>Quyền sử dụng</span>
                  <span className={styles.use}>Mọi site trong workspace</span>
                </div>
                <div className={styles.cell}>
                  <span className={styles.cellLabel}>Nhận ngày</span>
                  <span className={styles.date}>{formatDate(item.grantedAt)}</span>
                </div>
                <div className={styles.actions}>
                  {canUpdate && hasUpdate(item) ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setUpdating({ itemId: item.itemId, open: true });
                      }}
                    >
                      Cập nhật <span className={styles.srOnly}>{item.name}</span>
                    </Button>
                  ) : null}
                  {siteId === null ? (
                    <ButtonLink
                      as={Link}
                      href={templateHref(workspace.id, item.itemId)}
                      variant="secondary"
                      size="sm"
                    >
                      Xem mẫu <span className={styles.srOnly}>{item.name}</span>
                    </ButtonLink>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => {
                        setCreating({ itemId: item.itemId, open: true });
                      }}
                    >
                      Tạo trang <span className={styles.srOnly}>từ {item.name}</span>
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {updatingItem !== undefined && hasUpdate(updatingItem) ? (
        <UpdateLicenceDialog
          workspaceId={workspace.id}
          item={updatingItem}
          open={updating?.open === true}
          onOpenChange={(open) => {
            setUpdating((current) => (current === null ? null : { ...current, open }));
          }}
          onUpdated={() => {
            setNotice(null);
            router.refresh();
          }}
          onChangedMeanwhile={() => {
            setNotice(
              `Mẫu “${updatingItem.name}” vừa được cập nhật ở nơi khác. Đã tải lại danh sách.`,
            );
            router.refresh();
          }}
        />
      ) : null}

      {creatingItem !== undefined && siteId !== null ? (
        <CreateFromTemplateDialog
          workspaceId={workspace.id}
          template={dialogTemplateOf(creatingItem)}
          sites={targets}
          initialSiteId={siteId}
          role={role}
          open={creating?.open === true}
          onOpenChange={(open) => {
            setCreating((current) => (current === null ? null : { ...current, open }));
          }}
          onTemplateChanged={() => {
            setNotice(
              `Mẫu “${creatingItem.name}” vừa được cập nhật. Đã tải lại danh sách; bấm “Tạo trang” để dùng phiên bản mới.`,
            );
            setCreating(null);
            router.refresh();
          }}
        />
      ) : null}
    </PageContainer>
  );
}
