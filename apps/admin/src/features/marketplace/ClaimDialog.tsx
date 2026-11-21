'use client';

import {
  claimMarketplaceItemRequestSchema,
  endpoints,
  type MarketplaceItemDetail,
} from '@plp/contracts';
import { Button, Checkbox, Dialog } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { reportUnexpected } from '../shell/problem-message';
import { DialogFailure } from './DialogFailure';
import styles from './ClaimDialog.module.css';

export interface ClaimDialogProps {
  workspaceId: string;
  item: Pick<MarketplaceItemDetail, 'id' | 'name' | 'version' | 'terms'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The licence is granted: the screen reads the item again and shows it owned. */
  onClaimed: () => void;
  /**
   * The version or the terms are not what the member saw (409 `item_changed`), or the item has a
   * price now (409 `item_not_free`): the screen reads the item again and asks again.
   */
  onChanged: (message: string) => void;
}

/**
 * "Nhận mẫu" of a free item (board 31, ADR-036): the name, the version and the terms the member
 * agrees to, unticked, readable here since the page behind is out of reach. Nothing is paid: no
 * invoice, no gateway, no email. The screen gives it a new `key` for every opening, so the box is
 * never ticked from an earlier one.
 */
export function ClaimDialog({
  workspaceId,
  item,
  open,
  onOpenChange,
  onClaimed,
  onChanged,
}: ClaimDialogProps) {
  const termsId = useId();
  const [agreed, setAgreed] = useState(false);
  const [termsShown, setTermsShown] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  // `isPending` turns true a tick after `mutate`: a double click would claim twice before it.
  const sending = useRef(false);
  const claim = useMutation({
    mutationFn: () =>
      api(endpoints.claimMarketplaceItem, [workspaceId, item.id], {
        body: claimMarketplaceItemRequestSchema.parse({
          version: item.version,
          termsVersion: item.terms.version,
        }),
      }),
    onSuccess: () => {
      onOpenChange(false);
      onClaimed();
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        (error.code === 'item_changed' || error.code === 'item_not_free')
      ) {
        onOpenChange(false);
        onChanged(
          error.code === 'item_changed'
            ? `Mẫu “${item.name}” vừa thay đổi. Đã tải lại; xem lại mẫu và điều khoản rồi nhận lại.`
            : `Mẫu “${item.name}” đã có giá. Đã tải lại trang.`,
        );
        return;
      }
      reportUnexpected('Claiming a marketplace item failed', error);
      setFailure(error);
    },
    onSettled: () => {
      sending.current = false;
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // The claim being written cannot be dismissed: its answer shows here.
        if (!next && claim.isPending) {
          return;
        }
        onOpenChange(next);
      }}
      title="Nhận mẫu"
      description="Mẫu miễn phí: không có hóa đơn và không bị trừ tiền."
      footer={
        <>
          <Button
            variant="secondary"
            disabled={claim.isPending}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Hủy
          </Button>
          <Button
            disabled={!agreed}
            loading={claim.isPending}
            onClick={() => {
              if (sending.current) {
                return;
              }
              sending.current = true;
              setFailure(null);
              claim.mutate();
            }}
          >
            Nhận mẫu
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <p className={styles.item}>
          {item.name} · v{item.version}
        </p>
        <p className={styles.note}>Giấy phép dùng cho mọi site trong workspace.</p>
        <div className={styles.terms}>
          <Button
            variant="ghost"
            size="sm"
            className={styles.termsToggle}
            aria-expanded={termsShown}
            aria-controls={termsId}
            onClick={() => {
              setTermsShown((shown) => !shown);
            }}
          >
            {termsShown ? 'Ẩn điều khoản giấy phép' : 'Đọc điều khoản giấy phép'}
          </Button>
          {/* Focusable so a keyboard scrolls the terms; the region names their version. */}
          <section
            id={termsId}
            hidden={!termsShown}
            aria-label={`Điều khoản giấy phép v${item.terms.version}`}
            tabIndex={0}
            className={styles.termsText}
          >
            <ol>
              {item.terms.licence.map((paragraph, index) => (
                <li key={index}>{paragraph}</li>
              ))}
            </ol>
          </section>
        </div>
        <Checkbox
          checked={agreed}
          onChange={(event) => {
            setAgreed(event.target.checked);
          }}
          label="Tôi đồng ý với điều khoản giấy phép"
        />
        <DialogFailure error={failure} workspaceId={workspaceId} />
      </div>
    </Dialog>
  );
}
