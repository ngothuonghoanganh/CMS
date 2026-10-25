'use client';

import {
  endpoints,
  LEAD_RECIPIENTS_MAX,
  type LeadRecipient,
  RECIPIENT_CONFIRMATION_DAYS,
} from '@plp/contracts';
import { Badge, Button, Callout, Dialog, Field, Input, Spinner, useToast } from '@plp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type SubmitEvent, useRef, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { recipientStatusLabels, recipientStatusTones } from './lead-presentation';
import { leadQueryKeys } from './queries';
import styles from './LeadInbox.module.css';

export interface LeadRecipientsDialogProps {
  siteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Only the workspace owner adds, removes and re-sends (ADR-018); editors see the list. */
  canManage: boolean;
}

/**
 * "Nơi nhận lead" (ADR-018): the addresses every new lead is emailed to. A new address receives a
 * confirmation link and gets nothing until it is opened.
 */
export function LeadRecipientsDialog({
  siteId,
  open,
  onOpenChange,
  canManage,
}: LeadRecipientsDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  // A refused address puts the cursor back in the field, where the reason is read out.
  const emailRef = useRef<HTMLInputElement>(null);
  const key = leadQueryKeys.recipients(siteId);
  const recipients = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api(endpoints.listLeadRecipients, [siteId], { signal }),
    enabled: open,
  });
  const items = recipients.data?.items ?? [];
  const full = items.length >= LEAD_RECIPIENTS_MAX;

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: key });
  }

  function invited(recipient: LeadRecipient) {
    toast(
      recipient.status === 'unsent'
        ? {
            tone: 'warning',
            title: `Chưa gửi được thư xác nhận tới ${recipient.email}`,
            description: 'Bấm "Gửi lại" khi máy chủ gửi thư hoạt động trở lại.',
          }
        : { tone: 'success', title: `Đã gửi thư xác nhận tới ${recipient.email}` },
    );
  }

  const add = useMutation({
    mutationFn: (address: string) =>
      api(endpoints.addLeadRecipient, [siteId], { body: { email: address } }),
    onSuccess: (recipient) => {
      setEmail('');
      setEmailError(null);
      refresh();
      invited(recipient);
    },
    onError: (error) => {
      reportUnexpected('Adding a lead recipient failed', error);
      setEmailError(
        error instanceof ApiError
          ? (error.fieldErrors()['email'] ?? error.problem.title)
          : problemMessage(error),
      );
      emailRef.current?.focus();
    },
  });

  const resend = useMutation({
    mutationFn: (recipientId: string) => api(endpoints.resendLeadRecipient, [siteId, recipientId]),
    onSuccess: (recipient) => {
      refresh();
      invited(recipient);
    },
    onError: (error) => {
      reportUnexpected('Re-sending a confirmation failed', error);
      refresh();
      toast({ tone: 'danger', title: 'Chưa gửi lại được', description: problemMessage(error) });
    },
  });

  const remove = useMutation({
    mutationFn: (recipient: LeadRecipient) =>
      api(endpoints.removeLeadRecipient, [siteId, recipient.id]),
    onSuccess: (_result, recipient) => {
      refresh();
      toast({ tone: 'success', title: `Đã bỏ ${recipient.email} khỏi nơi nhận lead` });
    },
    onError: (error) => {
      reportUnexpected('Removing a lead recipient failed', error);
      refresh();
      toast({ tone: 'danger', title: 'Chưa bỏ được địa chỉ', description: problemMessage(error) });
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim() === '') {
      setEmailError('Nhập email nhận lead');
      emailRef.current?.focus();
      return;
    }
    add.mutate(email);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nơi nhận lead"
      description={`Mỗi lead mới được gửi qua email tới các địa chỉ đã xác nhận, tối đa ${LEAD_RECIPIENTS_MAX} địa chỉ.`}
    >
      <div className={styles.recipients}>
        {recipients.isPending && open ? <Spinner label="Đang tải nơi nhận lead" /> : null}
        {recipients.isError ? (
          <Callout tone="danger" role="alert" title="Chưa tải được nơi nhận lead">
            {problemMessage(recipients.error)}
          </Callout>
        ) : null}
        {recipients.isSuccess && items.length === 0 ? (
          <p className={styles.recipientsEmpty}>
            Chưa có email nào. Khách gửi form sẽ không đến được ai cho tới khi có một email đã xác
            nhận.
          </p>
        ) : null}
        {items.length > 0 ? (
          <ul className={styles.recipientList} aria-label="Các email nhận lead">
            {items.map((recipient) => (
              <li key={recipient.id} className={styles.recipientRow}>
                <span className={styles.recipientEmail}>{recipient.email}</span>
                <Badge tone={recipientStatusTones[recipient.status]}>
                  {recipientStatusLabels[recipient.status]}
                </Badge>
                {canManage ? (
                  <span className={styles.recipientActions}>
                    {recipient.status === 'confirmed' ? null : (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={resend.isPending && resend.variables === recipient.id}
                        aria-label={`Gửi lại thư xác nhận tới ${recipient.email}`}
                        onClick={() => {
                          resend.mutate(recipient.id);
                        }}
                      >
                        Gửi lại
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={remove.isPending && remove.variables.id === recipient.id}
                      aria-label={`Bỏ ${recipient.email} khỏi nơi nhận lead`}
                      onClick={() => {
                        remove.mutate(recipient);
                      }}
                    >
                      Bỏ
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {canManage ? (
          <form className={styles.recipientForm} onSubmit={submit} noValidate>
            <Field
              label="Thêm email nhận lead"
              error={emailError ?? undefined}
              help={
                full ? `Đã đủ ${LEAD_RECIPIENTS_MAX} địa chỉ. Bỏ một địa chỉ để thêm.` : undefined
              }
              className={styles.recipientField}
            >
              <Input
                ref={emailRef}
                type="email"
                autoComplete="email"
                placeholder="ten@congty.vn"
                value={email}
                disabled={full}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setEmailError(null);
                }}
              />
            </Field>
            <Button type="submit" variant="secondary" loading={add.isPending} disabled={full}>
              Thêm
            </Button>
          </form>
        ) : (
          <Callout tone="info">Chỉ Owner của workspace được thay đổi nơi nhận lead.</Callout>
        )}
        <p className={styles.recipientsNote}>
          Mỗi địa chỉ mới nhận một thư xác nhận và chỉ nhận lead sau khi bấm xác nhận. Liên kết có
          hiệu lực {RECIPIENT_CONFIRMATION_DAYS} ngày.
        </p>
      </div>
    </Dialog>
  );
}
