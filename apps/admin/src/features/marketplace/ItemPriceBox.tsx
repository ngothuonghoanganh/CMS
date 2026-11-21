'use client';

import {
  type Access,
  can,
  holdersOf,
  type MarketplaceItemDetail,
  type Membership,
  type MethodSetupResult,
} from '@plp/contracts';
import { Button, ButtonLink, Callout, Card, CheckIcon } from '@plp/ui';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { marketplaceItemHref, marketplaceOwnedHref, templateHref } from '../shell/navigation';
import { templateQueryKeys } from '../templates/queries';
import { ClaimDialog } from './ClaimDialog';
import { priceText } from './marketplace-filters';
import { PurchaseDialog } from './PurchaseDialog';
import { SuggestPurchase } from './SuggestPurchase';
import styles from './MarketplaceItemScreen.module.css';

export interface ItemPriceBoxProps {
  workspace: Membership['workspace'];
  role: Access;
  item: MarketplaceItemDetail;
  /** `?paymentMethod=` of the address the gateway led back to from "Đổi" or "Thêm thẻ". */
  returned?: MethodSetupResult | null;
}

/**
 * The price box of board 31 by what the viewer can do (ADR-036): "Nhận mẫu" for a free item and
 * who may claim, the licence the workspace holds, or, for a paid item not owned, "Mua mẫu" for
 * who pays (Chủ sở hữu) and "Đề xuất {owner} mua" for everyone else.
 */
export function ItemPriceBox({ workspace, role, item, returned = null }: ItemPriceBoxProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimKey, setClaimKey] = useState(0);
  const [claimed, setClaimed] = useState(false);
  const [changed, setChanged] = useState<string | null>(null);
  // Claimed, "Nhận mẫu" gives way to "Tạo trang từ mẫu": focus goes there, not to the page.
  const createLink = useRef<HTMLAnchorElement>(null);
  const { licence } = item;
  // Back from the gateway's card page, the owner is in the middle of buying: the dialog is open.
  const buyer = can(role, 'billing.manage') && item.price > 0;
  const [buyOpen, setBuyOpen] = useState(returned !== null && buyer && licence === null);
  const [buyKey, setBuyKey] = useState(0);
  const [bought, setBought] = useState(false);
  useEffect(() => {
    // The address the gateway led back to is not kept: a reload does not say it twice.
    if (returned !== null) {
      window.history.replaceState(
        window.history.state,
        '',
        marketplaceItemHref(workspace.id, item.id),
      );
    }
  }, [returned, workspace.id, item.id]);
  const hasNewer = licence !== null && item.version > licence.version;

  return (
    <Card className={styles.priceBox}>
      <p className={styles.price}>{licence === null ? priceText(item.price) : 'Đã sở hữu'}</p>
      {/*
       * What is paid, or was paid for the licence held, as the board draws it under "Đã sở hữu" too.
       * A free item, or one received free, has no VAT to include and nothing to refund.
       */}
      {(licence === null ? item.price > 0 : licence.source === 'purchase') ? (
        <p className={styles.priceNote}>Một lần · Đã gồm VAT · {item.terms.refund}</p>
      ) : null}

      <div role="status" className={styles.statuses}>
        {claimed ? (
          <Callout tone="success">
            Đã nhận “{item.name}”. Mọi site trong workspace dùng được mẫu này.
          </Callout>
        ) : null}
        {bought ? (
          <Callout tone="success">
            Đã mua “{item.name}”. Mọi site trong workspace dùng được mẫu này.
          </Callout>
        ) : null}
        {changed === null ? null : <Callout tone="warning">{changed}</Callout>}
      </div>

      {licence !== null ? (
        <>
          <p className={styles.owned}>
            <CheckIcon size={15} strokeWidth={2.4} />
            Workspace đã sở hữu · v{licence.version}
          </p>
          <ButtonLink
            as={Link}
            ref={createLink}
            href={templateHref(workspace.id, item.id)}
            fullWidth
          >
            Tạo trang từ mẫu
          </ButtonLink>
          {hasNewer ? (
            can(role, 'templates.manage') ? (
              <p className={styles.notice}>
                Có phiên bản mới v{item.version}.{' '}
                <Link href={marketplaceOwnedHref(workspace.id)} className={styles.inlineLink}>
                  Cập nhật
                </Link>{' '}
                ở Sản phẩm đã mua.
              </p>
            ) : (
              <p className={styles.notice}>
                Có phiên bản mới v{item.version}. Chỉ {holdersOf('templates.manage')} cập nhật được,
                ở{' '}
                <Link href={marketplaceOwnedHref(workspace.id)} className={styles.inlineLink}>
                  Sản phẩm đã mua
                </Link>
                .
              </p>
            )
          ) : null}
          {item.withdrawn ? (
            <p className={styles.notice}>Mẫu đã ngừng bán. Workspace vẫn dùng và cập nhật được.</p>
          ) : null}
        </>
      ) : item.price === 0 ? (
        can(role, 'templates.manage') ? (
          <>
            <Button
              fullWidth
              onClick={() => {
                setChanged(null);
                setClaimKey((key) => key + 1);
                setClaimOpen(true);
              }}
            >
              Nhận mẫu
            </Button>
            <ClaimDialog
              key={claimKey}
              workspaceId={workspace.id}
              item={item}
              open={claimOpen}
              onOpenChange={setClaimOpen}
              fallbackFocusRef={createLink}
              onClaimed={() => {
                setClaimed(true);
                // The library and the editor's "Áp dụng mẫu…" list the item from now on.
                void queryClient.invalidateQueries({
                  queryKey: templateQueryKeys.all(workspace.id),
                });
                router.refresh();
              }}
              onChanged={(message) => {
                setChanged(message);
                router.refresh();
              }}
            />
          </>
        ) : (
          <p className={styles.notice}>
            Chỉ {holdersOf('templates.manage')} nhận được mẫu miễn phí cho workspace.
          </p>
        )
      ) : buyer ? (
        <Button
          fullWidth
          onClick={() => {
            setChanged(null);
            setBuyKey((key) => key + 1);
            setBuyOpen(true);
          }}
        >
          Mua mẫu
        </Button>
      ) : (
        <SuggestPurchase
          workspaceId={workspace.id}
          item={item}
          onChanged={() => {
            router.refresh();
          }}
        />
      )}
      {/* Stays while it says what happened, after the licence took "Mua mẫu"'s place. */}
      {buyer && (licence === null || bought || buyOpen) ? (
        <PurchaseDialog
          key={buyKey}
          workspaceId={workspace.id}
          item={item}
          open={buyOpen}
          onOpenChange={setBuyOpen}
          returned={returned}
          fallbackFocusRef={createLink}
          onPurchased={() => {
            setBought(true);
            router.refresh();
          }}
          onChanged={(message) => {
            setChanged(message);
            router.refresh();
          }}
        />
      ) : null}
    </Card>
  );
}
