'use client';

import { type ContactDeletionPreview, type ContactProfile, endpoints } from '@plp/contracts';
import { Callout, ConfirmDialog, Field, Select, Spinner } from '@plp/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { formatDayMonth } from '../../../lib/format';
import { problemMessage } from '../../shell/problem-message';
import { contactQueryKeys } from '../queries';
import styles from './ContactProfile.module.css';

const NO_REQUEST = '';

export interface DeletePersonDialogProps {
  siteId: string;
  contact: ContactProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The person is gone: how many leads went with the profile. */
  onDeleted: (deletedLeads: number) => void;
}

/** "2 lead và bằng chứng đồng ý, 1 ghi chú, 3 công việc, 1 lịch hẹn." */
export function deletionSummary(preview: ContactDeletionPreview): string {
  return [
    `${preview.leads} lead và bằng chứng đồng ý`,
    `${preview.notes} ghi chú`,
    `${preview.tasks} công việc`,
    `${preview.meetings} lịch hẹn`,
  ].join(', ');
}

/**
 * "Xóa dữ liệu của người này" (board 23, ADR-017, ADR-033): the profile with every lead, note,
 * task and meeting, counted when the dialog opens. A request to delete data picked here is
 * completed by the deletion.
 */
export function DeletePersonDialog({
  siteId,
  contact,
  open,
  onOpenChange,
  onDeleted,
}: DeletePersonDialogProps) {
  // Undefined until the member picks: the first open request is the default, as on the board.
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const preview = useQuery({
    queryKey: [...contactQueryKeys.profile(siteId, contact.id), 'deletion'],
    queryFn: ({ signal }) =>
      api(endpoints.contactDeletionPreview, [siteId, contact.id], { signal }),
    enabled: open,
    // Counted again each time the dialog opens.
    staleTime: 0,
    gcTime: 0,
  });
  const requestId = picked ?? preview.data?.requests[0]?.id ?? NO_REQUEST;

  const remove = useMutation({
    mutationFn: () =>
      api(endpoints.deleteContactPerson, [siteId, contact.id], {
        body: { requestId: requestId === NO_REQUEST ? null : requestId },
      }),
    onSuccess: (result) => {
      onDeleted(result.deletedLeads);
    },
  });

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPicked(undefined);
          remove.reset();
        }
        onOpenChange(next);
      }}
      tone="danger"
      title={`Xóa toàn bộ dữ liệu của ${contact.name}?`}
      description="Xóa thật, không khôi phục được. Thường dùng khi người này yêu cầu xóa dữ liệu."
      confirmLabel="Xóa dữ liệu"
      pending={remove.isPending}
      confirmDisabled={preview.data === undefined}
      error={remove.isError ? problemMessage(remove.error) : undefined}
      onConfirm={() => {
        remove.mutate();
      }}
    >
      {preview.isError ? (
        <Callout tone="danger" role="alert" title="Chưa đếm được dữ liệu sẽ xóa">
          {problemMessage(preview.error)}
        </Callout>
      ) : preview.data === undefined ? (
        <Spinner size={20} label="Đang đếm dữ liệu sẽ xóa" />
      ) : (
        <>
          <ul className={styles.consequences}>
            <li>{deletionSummary(preview.data)}.</li>
            <li>
              Thông báo đã gửi qua email và dữ liệu đã gửi qua webhook trước đó không bị xóa theo.
            </li>
            <li>Số liệu tổng ở màn Hiệu quả giảm {preview.data.leads} lead.</li>
          </ul>
          <Field label="Gắn với yêu cầu dữ liệu">
            <Select
              value={requestId}
              onChange={(event) => {
                setPicked(event.target.value);
              }}
            >
              {preview.data.requests.map((request) => (
                <option key={request.id} value={request.id}>
                  {`Yêu cầu xóa · nhận ${formatDayMonth(request.receivedAt)}, hạn ${formatDayMonth(request.completeBy)}`}
                </option>
              ))}
              <option value={NO_REQUEST}>Không có yêu cầu</option>
            </Select>
          </Field>
        </>
      )}
    </ConfirmDialog>
  );
}
