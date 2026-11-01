'use client';

import { endpoints, type Member, type MemberListResponse } from '@plp/contracts';
import { Button, Callout, Dialog, Field, Input, Select } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { type SubmitEvent, useState } from 'react';
import { api } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import styles from './Members.module.css';

export interface TransferOwnershipDialogProps {
  workspaceId: string;
  workspaceName: string;
  /** The Quản trị who may receive the ownership. */
  admins: readonly Member[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransferred: (members: MemberListResponse) => void;
}

/**
 * "Chuyển quyền sở hữu workspace" (board 15, ADR-021): Chủ sở hữu hands the workspace to a Quản
 * trị at once, typing its name to confirm, and becomes Quản trị.
 */
export function TransferOwnershipDialog({
  workspaceId,
  workspaceName,
  admins,
  open,
  onOpenChange,
  onTransferred,
}: TransferOwnershipDialogProps) {
  const [toUserId, setToUserId] = useState(admins[0]?.userId ?? '');
  const [confirmName, setConfirmName] = useState('');
  const receiver = admins.find((admin) => admin.userId === toUserId);
  const confirmed = confirmName.trim() === workspaceName.trim();

  const transfer = useMutation({
    mutationFn: () =>
      api(endpoints.transferOwnership, [workspaceId], {
        body: { toUserId, confirmName: confirmName.trim() },
      }),
    onSuccess: onTransferred,
    onError: (error) => {
      reportUnexpected('Transferring the ownership failed', error);
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (receiver !== undefined && confirmed && !transfer.isPending) {
      transfer.mutate();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Chuyển quyền sở hữu workspace"
      footer={
        <>
          <Button
            variant="secondary"
            disabled={transfer.isPending}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Hủy
          </Button>
          {admins.length === 0 ? null : (
            <Button
              type="submit"
              form="transfer-ownership"
              variant="danger"
              loading={transfer.isPending}
              disabled={!confirmed}
            >
              Chuyển quyền sở hữu
            </Button>
          )}
        </>
      }
    >
      {admins.length === 0 ? (
        <Callout tone="info">
          Chỉ Quản trị mới nhận được quyền sở hữu. Đổi vai trò của một thành viên thành Quản trị
          trước, rồi quay lại đây.
        </Callout>
      ) : (
        <form id="transfer-ownership" className={styles.form} onSubmit={submit} noValidate>
          <Field
            label="Chủ sở hữu mới"
            id="transfer-to"
            help="Chỉ Quản trị mới nhận được quyền sở hữu."
          >
            <Select
              value={toUserId}
              onChange={(event) => {
                setToUserId(event.target.value);
              }}
            >
              {admins.map((admin) => (
                <option key={admin.userId} value={admin.userId}>
                  {admin.name} · {admin.email}
                </option>
              ))}
            </Select>
          </Field>
          <ul className={styles.consequences}>
            <li>
              {receiver?.name ?? 'Người nhận'} quản lý workspace, duyệt yêu cầu đổi quyền và có thể
              gỡ bạn.
            </li>
            <li>Bạn trở thành Quản trị ngay khi chuyển.</li>
          </ul>
          <Field label="Nhập tên workspace để xác nhận" id="transfer-confirm">
            <Input
              type="text"
              autoComplete="off"
              placeholder={workspaceName}
              value={confirmName}
              onChange={(event) => {
                setConfirmName(event.target.value);
              }}
            />
          </Field>
          {transfer.isError ? (
            <Callout tone="danger" role="alert">
              {problemMessage(transfer.error)}
            </Callout>
          ) : null}
        </form>
      )}
    </Dialog>
  );
}
