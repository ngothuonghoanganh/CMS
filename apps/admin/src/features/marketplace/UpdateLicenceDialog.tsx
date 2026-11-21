'use client';

import {
  endpoints,
  type MarketplaceOwnedItem,
  updateMarketplaceLicenceVersionRequestSchema,
} from '@plp/contracts';
import { Button, Dialog } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { reportUnexpected } from '../shell/problem-message';
import { DialogFailure } from './DialogFailure';
import { updateSentence } from './owned-items';
import styles from './UpdateLicenceDialog.module.css';

export interface UpdateLicenceDialogProps {
  workspaceId: string;
  item: MarketplaceOwnedItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The licence moved to the latest version: the screen reads its list again. */
  onUpdated: () => void;
  /** Another member moved it meanwhile (409 `template_changed`): read again and say so. */
  onChangedMeanwhile: () => void;
}

/**
 * "Cập nhật “…” lên vM?" (board 32): the notes of the versions released after the licence's, and
 * what the update does not touch. Only pages made from now take the new version (ADR-036). The
 * screen gives it a new `key` for every opening, so it never shows an earlier opening's failure.
 */
export function UpdateLicenceDialog({
  workspaceId,
  item,
  open,
  onOpenChange,
  onUpdated,
  onChangedMeanwhile,
}: UpdateLicenceDialogProps) {
  const [failure, setFailure] = useState<unknown>(null);
  // `isPending` turns true a tick after `mutate`: a double click would update twice before it.
  const sending = useRef(false);
  const update = useMutation({
    mutationFn: () =>
      api(endpoints.updateMarketplaceLicenceVersion, [workspaceId, item.itemId], {
        body: updateMarketplaceLicenceVersionRequestSchema.parse({ baseVersion: item.version }),
      }),
    onSuccess: () => {
      onOpenChange(false);
      onUpdated();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'template_changed') {
        onOpenChange(false);
        onChangedMeanwhile();
        return;
      }
      reportUnexpected('Updating a marketplace licence failed', error);
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
        // The update being written cannot be dismissed: its answer shows here.
        if (!next && update.isPending) {
          return;
        }
        onOpenChange(next);
      }}
      title={`Cập nhật “${item.name}” lên v${item.latestVersion}?`}
      footer={
        <>
          <Button
            variant="secondary"
            disabled={update.isPending}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Để sau
          </Button>
          <Button
            loading={update.isPending}
            onClick={() => {
              if (sending.current) {
                return;
              }
              sending.current = true;
              setFailure(null);
              update.mutate();
            }}
          >
            Cập nhật mẫu
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <ul className={styles.notes} aria-label="Có gì mới">
          {item.newVersions.map((entry) => (
            <li key={entry.version}>
              <strong>v{entry.version}</strong> · {formatDate(entry.releasedOn)}
              <span className={styles.note}>{entry.note}</span>
            </li>
          ))}
        </ul>
        <p className={styles.unchanged}>{updateSentence(item.usedCount, item.latestVersion)}</p>
        <DialogFailure error={failure} workspaceId={workspaceId} />
      </div>
    </Dialog>
  );
}
