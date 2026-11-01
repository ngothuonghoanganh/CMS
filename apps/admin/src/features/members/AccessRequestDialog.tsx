'use client';

import {
  ACCESS_REQUEST_NOTE_MAX,
  type AssignableRole,
  endpoints,
  type Role,
  roleLabels,
} from '@plp/contracts';
import {
  Button,
  Callout,
  Checkbox,
  Dialog,
  Field,
  RadioCardGroup,
  Spinner,
  Textarea,
  useToast,
} from '@plp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type SubmitEvent, useState } from 'react';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { assignableRoles } from './member-presentation';
import { memberQueryKeys } from './queries';
import styles from './Members.module.css';

export interface AccessRequestDialogProps {
  workspaceId: string;
  /** The member's role now; they ask for another. */
  role: Role;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Yêu cầu đổi quyền" (ADR-021): a member without `members.manage` asks Chủ sở hữu for another
 * role, who gets an email and decides on "Thành viên". One request waits at a time.
 */
export function AccessRequestDialog({
  workspaceId,
  role,
  open,
  onOpenChange,
}: AccessRequestDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [wanted, setWanted] = useState<AssignableRole | null>(null);
  const [wholeWorkspace, setWholeWorkspace] = useState(false);
  const [note, setNote] = useState('');
  const key = memberQueryKeys.myRequest(workspaceId);
  const mine = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api(endpoints.myAccessRequest, [workspaceId], { signal }),
    enabled: open,
  });
  const pending = mine.data?.request ?? null;

  const send = useMutation({
    mutationFn: (body: { role: AssignableRole; wholeWorkspace: boolean; note: string }) =>
      api(endpoints.createAccessRequest, [workspaceId], { body }),
    onSuccess: (result) => {
      queryClient.setQueryData(key, result);
      onOpenChange(false);
      toast({
        tone: 'success',
        title: 'Đã gửi yêu cầu tới Chủ sở hữu',
        description: 'Bạn sẽ nhận email khi yêu cầu được chấp nhận hoặc từ chối.',
      });
    },
    onError: (error) => {
      reportUnexpected('Sending an access request failed', error);
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (wanted === null || send.isPending) {
      return;
    }
    // Quản trị always works on every site.
    send.mutate({ role: wanted, wholeWorkspace: wanted === 'admin' || wholeWorkspace, note });
  }

  const options = assignableRoles.filter((option) => option.value !== role);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Yêu cầu đổi quyền"
      description={`Bạn đang là ${roleLabels[role]}. Yêu cầu được gửi tới Chủ sở hữu qua email; quyền chỉ đổi khi họ chấp nhận.`}
      footer={
        pending === null ? (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Hủy
            </Button>
            <Button type="submit" form="access-request" loading={send.isPending}>
              Gửi yêu cầu
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Đóng
          </Button>
        )
      }
    >
      {mine.isPending ? (
        <Spinner label="Đang tải yêu cầu của bạn" />
      ) : pending !== null ? (
        <Callout tone="info" title="Bạn đang có một yêu cầu chờ duyệt">
          Xin làm {roleLabels[pending.role]}
          {pending.wholeWorkspace ? ' trên toàn workspace' : ''}, gửi lúc{' '}
          {formatDateTime(pending.createdAt)}. Bạn sẽ nhận email khi có kết quả.
        </Callout>
      ) : (
        <form id="access-request" className={styles.form} onSubmit={submit} noValidate>
          <RadioCardGroup<AssignableRole>
            legend="Vai trò bạn cần"
            showLegend
            options={options}
            value={wanted}
            onChange={setWanted}
            minColumnWidth={200}
          />
          {wanted === null || wanted === 'admin' ? null : (
            <Checkbox
              label="Trên toàn workspace"
              description="Bỏ chọn để giữ các site bạn đang được vào."
              checked={wholeWorkspace}
              onChange={(event) => {
                setWholeWorkspace(event.target.checked);
              }}
            />
          )}
          <Field
            label="Lời nhắn cho Chủ sở hữu"
            id="access-request-note"
            counter={{ length: note.length, max: ACCESS_REQUEST_NOTE_MAX }}
          >
            <Textarea
              rows={3}
              maxLength={ACCESS_REQUEST_NOTE_MAX}
              placeholder="Ví dụ: cần sửa trang ưu đãi của Bếp Nhà Mây"
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
              }}
            />
          </Field>
          {send.isError ? (
            <Callout tone="danger" role="alert">
              {problemMessage(send.error)}
            </Callout>
          ) : null}
        </form>
      )}
    </Dialog>
  );
}
