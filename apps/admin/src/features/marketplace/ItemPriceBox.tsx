'use client';

import {
  type Access,
  can,
  holdersOf,
  type MarketplaceItemDetail,
  type Membership,
} from '@plp/contracts';
import { Button, ButtonLink, Callout, Card, CheckIcon } from '@plp/ui';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { marketplaceOwnedHref, templateHref } from '../shell/navigation';
import { templateQueryKeys } from '../templates/queries';
import { ClaimDialog } from './ClaimDialog';
import { priceText } from './marketplace-filters';
import styles from './MarketplaceItemScreen.module.css';

export interface ItemPriceBoxProps {
  workspace: Membership['workspace'];
  role: Access;
  item: MarketplaceItemDetail;
}

/**
 * The price box of board 31 by what the viewer can do (ADR-036): "Nhận mẫu" for a free item and
 * who may claim, the licence the workspace holds, or, for a paid item not owned, a neutral note
 * until buying comes (MP3).
 */
export function ItemPriceBox({ workspace, role, item }: ItemPriceBoxProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimKey, setClaimKey] = useState(0);
  const [claimed, setClaimed] = useState(false);
  const [changed, setChanged] = useState<string | null>(null);
  // Claimed, "Nhận mẫu" gives way to "Tạo trang từ mẫu": focus goes there, not to the page.
  const createLink = useRef<HTMLAnchorElement>(null);
  const { licence } = item;
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
      ) : (
        // Buying comes with the payment (MP3): until then there is no button that does nothing.
        <p className={styles.notice}>
          Bạn xem được toàn bộ mẫu và điều khoản ở đây. Mua mẫu chưa mở trong bản này.
        </p>
      )}
    </Card>
  );
}
