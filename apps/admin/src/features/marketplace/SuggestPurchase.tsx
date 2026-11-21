'use client';

import { endpoints, type MarketplaceItemDetail } from '@plp/contracts';
import { Button, Callout } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import styles from './MarketplaceItemScreen.module.css';

export interface SuggestPurchaseProps {
  workspaceId: string;
  item: Pick<MarketplaceItemDetail, 'id' | 'name' | 'ownerName' | 'suggested'>;
  /** The owner changed it meanwhile (409 `item_owned` or `item_free`): the screen reads it again. */
  onChanged: () => void;
}

/**
 * "Đề xuất {ownerName} mua" (board 31, ADR-036): a member who cannot pay asks Chủ sở hữu, who gets
 * one email with the link. Once per member and item: the page says so from then on, and the API
 * answers a repeat without sending. Not an error when it was sent before.
 */
export function SuggestPurchase({ workspaceId, item, onChanged }: SuggestPurchaseProps) {
  const [sent, setSent] = useState(item.suggested);
  const [message, setMessage] = useState<string | null>(null);
  // The button goes once it is sent: focus moves to what took its place, not to the page.
  const sentNotice = useRef<HTMLDivElement>(null);
  const focusSent = useRef(false);
  useEffect(() => {
    if (sent && focusSent.current) {
      focusSent.current = false;
      sentNotice.current?.focus();
    }
  }, [sent]);
  const suggest = useMutation({
    mutationFn: () => api(endpoints.suggestMarketplaceItem, [workspaceId, item.id]),
    onSuccess: (result) => {
      focusSent.current = true;
      setSent(true);
      setMessage(result.message);
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        (error.code === 'item_owned' || error.code === 'item_free')
      ) {
        onChanged();
        return;
      }
      // A 503 `suggestion_not_sent` is the API saying so: the member may ask again.
      if (!(error instanceof ApiError) || error.status >= 500) {
        reportUnexpected('Suggesting a marketplace item failed', error);
      }
    },
  });

  return (
    <>
      {/* There before it is sent, so that the sentence that comes into it is announced. */}
      <div role="status" className={styles.suggestion}>
        {sent ? (
          <Callout
            ref={sentNotice}
            tabIndex={-1}
            tone="success"
            title={`Đã đề xuất ${item.ownerName} mua`}
          >
            {message ?? `${item.ownerName} đã nhận thông báo kèm link mẫu này.`}
          </Callout>
        ) : null}
      </div>
      {sent ? null : (
        <>
          <Button
            fullWidth
            loading={suggest.isPending}
            onClick={() => {
              suggest.mutate();
            }}
          >
            Đề xuất {item.ownerName} mua
          </Button>
          <p className={styles.notice}>
            Chỉ Chủ sở hữu workspace mua được. {item.ownerName} sẽ nhận một thông báo kèm link mẫu
            này.
          </p>
          {suggest.isError ? (
            <Callout tone="danger" role="alert">
              {problemMessage(suggest.error)}
            </Callout>
          ) : null}
        </>
      )}
    </>
  );
}
