'use client';

import {
  ACCESS_REQUEST_NOTE_MAX,
  type AssignableRole,
  endpoints,
  roleLabels,
  type Access,
  accessLabel,
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
import { type SubmitEvent, useId, useState } from 'react';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { assignableRoles } from './member-presentation';
import { memberQueryKeys } from './queries';
import styles from './Members.module.css';

export interface AccessRequestDialogProps {
  workspaceId: string;
  /** The member's role now; they ask for another, or for it on every site. */
  role: Access;
  /** Kept to some sites: asking for the same role on the whole workspace makes sense. */
  siteLimited: boolean;
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
  siteLimited,
  open,
  onOpenChange,
}: AccessRequestDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [wanted, setWanted] = useState<AssignableRole | null>(null);
  const [wholeWorkspace, setWholeWorkspace] = useState(false);
  const [note, setNote] = useState('');
  const [roleError, setRoleError] = useState(false);
  const roleErrorId = useId();
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
    if (send.isPending) {
      return;
    }
    if (wanted === null) {
      setRoleError(true);
      return;
    }
    // Quản trị always works on every site; the same role is only worth asking for on every site.
    send.mutate({
      role: wanted,
      wholeWorkspace: wanted === 'admin' || wanted === role || wholeWorkspace,
      note,
    });
  }

  const options = assignableRoles.flatMap((option) =>
    option.value !== role
      ? [option]
      : siteLimited
        ? [{ ...option, description: 'Giữ vai trò này, trên toàn workspace.' }]
        : [],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A running save cannot be dismissed half-way: its answer shows here.
        if (!next && send.isPending) {
          return;
        }
        onOpenChange(next);
      }}
      title="Yêu cầu đổi quyền"
      description={`Bạn đang là ${accessLabel(role)}. Yêu cầu được gửi tới Chủ sở hữu qua email; quyền chỉ đổi khi họ chấp nhận.`}
      footer={
        pending === null ? (
          <>
            <Button
              variant="secondary"
              disabled={send.isPending}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              form="access-request"
              loading={send.isPending}
              disabled={mine.isError}
            >
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
      ) : mine.isError ? (
        // Without it the form could ask again while a request waits.
        <Callout
          tone="danger"
          role="alert"
          title="Chưa tải được yêu cầu của bạn"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void mine.refetch();
              }}
            >
              Thử lại
            </Button>
          }
        >
          {problemMessage(mine.error)}
        </Callout>
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
            onChange={(value) => {
              setWanted(value);
              setRoleError(false);
            }}
            minColumnWidth={200}
            invalid={roleError}
            describedBy={roleError ? roleErrorId : undefined}
          />
          {roleError ? (
            <p id={roleErrorId} className={styles.error} role="alert">
              Chọn vai trò bạn cần.
            </p>
          ) : null}
          {wanted === null || wanted === 'admin' || wanted === role ? null : (
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
