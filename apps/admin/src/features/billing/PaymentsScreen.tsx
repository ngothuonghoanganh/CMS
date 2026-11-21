'use client';

import { type MethodSetupResult, paymentDeclineLabels } from '@plp/contracts';
import { Button, ButtonLink, Callout } from '@plp/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDate, formatDayMonth } from '../../lib/format';
import { fetchNextPageAfterRead } from '../shell/fetch-next-page';
import { billingHref, paymentsHref } from '../shell/navigation';
import { PageContainer, PageHeader } from '../shell/PageHeader';
import { BillingInfoCard } from './BillingInfoCard';
import { BillingTabs } from './BillingTabs';
import { InvoiceHistory } from './InvoiceHistory';
import { MethodSetupNotice } from './MethodSetupNotice';
import { cardLabel, sameCard } from './payment-presentation';
import { paymentsMessage } from './payment-problem';
import { PaymentMethodCard } from './PaymentMethodCard';
import { readOnlyReason } from './plan-presentation';
import { type PaymentsInitial, useInvoiceDetail, usePaymentsData } from './queries';
import { TransferInstructions } from './TransferInstructions';
import { useMethodSetup } from './use-method-setup';
import { usePayInvoice } from './use-pay-invoice';
import { useStartTransfer } from './use-start-transfer';
import styles from './Payments.module.css';

export interface PaymentsScreenProps {
  workspaceId: string;
  workspaceName: string;
  initial: PaymentsInitial;
  /** `?paymentMethod=` of the address the gateway led back to. */
  returned: MethodSetupResult | null;
  /** `?transfer=received` of the address the gateway's transfer page led back to. */
  transferReceived?: boolean;
}

/**
 * Screen 29 "Thanh toán & hóa đơn" (ADR-035, T2, T3), for Chủ sở hữu: the saved card, the billing
 * info and the transaction history, with the banner of a failed payment (and when the system
 * tries again) and the bank details of an invoice that waits for its transfer. Nothing here depends on the workspace being read-only: paying
 * is how it stops being.
 */
export function PaymentsScreen({
  workspaceId,
  workspaceName,
  initial,
  returned,
  transferReceived = false,
}: PaymentsScreenProps) {
  const { summary, paymentMethod, billingInfo, invoices } = usePaymentsData(workspaceId, initial);
  const pay = usePayInvoice(workspaceId);
  const transfer = useStartTransfer(workspaceId);
  const setup = useMethodSetup(workspaceId, 'payments');
  // Kept in state: the address loses its parameter below. It goes once the owner acts again.
  const [notice, setNotice] = useState(returned);
  const [received, setReceived] = useState(transferReceived);

  // The address the gateway led back to is not kept: a reload says nothing of the card twice.
  useEffect(() => {
    if (returned !== null || transferReceived) {
      window.history.replaceState(window.history.state, '', paymentsHref(workspaceId));
    }
  }, [returned, transferReceived, workspaceId]);

  const items = invoices.data.pages.flatMap((page) => page.items);
  const method = paymentMethod.data;
  // The newest failed invoice of the plan that can still be paid: board 29's "paymentFailed"
  // banner, with the plan's retries and grace. A refused marketplace purchase changes nothing of
  // the plan (ADR-036): its row says so, with its own "Thanh toán lại".
  const failed =
    items.find(
      (invoice) => invoice.status === 'failed' && invoice.payable && invoice.kind !== 'marketplace',
    ) ?? null;
  // The invoice that waits for a bank transfer: its details sit above the history.
  const waiting =
    items.find((invoice) => invoice.status === 'pending' && invoice.method === 'transfer') ?? null;
  const waitingDetail = useInvoiceDetail(workspaceId, waiting?.id ?? null);
  const failedCode = failed?.lastAttempt?.code ?? null;
  const saved = method.paymentMethod;
  // The refusal was of the card saved now; one saved since has not been tried yet.
  const savedWasRefused =
    failed !== null && saved !== null && (failed.card === null || sameCard(failed.card, saved));
  const readFailed = invoices.isError || paymentMethod.isError || billingInfo.isError;

  function payInvoice(invoiceId: string) {
    setNotice(null);
    setReceived(false);
    pay.mutate(invoiceId);
  }

  function startTransfer(invoiceId: string) {
    setNotice(null);
    setReceived(false);
    transfer.mutate(invoiceId);
  }

  // "Hệ thống tự thử lại ngày 03/11": only for the invoice the job is retrying.
  const retrying = failed !== null && summary.dueInvoice?.id === failed.id;
  const retryLine = !retrying
    ? ''
    : summary.nextRetryAt === null
      ? ' Hệ thống đã hết lượt tự thử lại.'
      : ` Hệ thống tự thử lại ngày ${formatDayMonth(summary.nextRetryAt)}.`;
  // The shell's banner is not on this board (AppShell): the read-only state is said here.
  const graceLine = !retrying
    ? ''
    : summary.access === 'read_only'
      ? ' Workspace đang ở chế độ chỉ đọc; thanh toán để mở lại việc chỉnh sửa.'
      : summary.graceEndsAt === null
        ? ''
        : ` Workspace chuyển sang chỉ đọc từ ${formatDate(summary.graceEndsAt)} nếu chưa thanh toán.`;
  const readOnlyLine =
    summary.access !== 'read_only' || retrying
      ? null
      : `${readOnlyReason(summary.state)} Trang live và form vẫn chạy. ${
          waiting === null
            ? 'Chọn gói ở "Gói & mức dùng" để sửa và xuất bản lại.'
            : 'Workspace mở lại khi chuyển khoản được xác nhận.'
        }`;

  function readAgain() {
    if (invoices.isFetchNextPageError) {
      void fetchNextPageAfterRead(invoices);
    } else if (invoices.isError) {
      void invoices.refetch();
    }
    if (paymentMethod.isError) {
      void paymentMethod.refetch();
    }
    if (billingInfo.isError) {
      void billingInfo.refetch();
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Gói dịch vụ"
        description={`Thanh toán và hóa đơn của workspace ${workspaceName}.`}
      />
      <BillingTabs workspaceId={workspaceId} current="payments" />

      <MethodSetupNotice
        notice={notice}
        method={saved}
        error={null}
        reloading={paymentMethod.isFetching}
        onReload={() => {
          void paymentMethod.refetch();
        }}
      />
      {received ? (
        <Callout tone="success" role="status" title="Đã nhận được chuyển khoản">
          Cổng thanh toán đã xác nhận khoản chuyển khoản. Hóa đơn được cập nhật bên dưới.
        </Callout>
      ) : null}
      {readFailed ? (
        <Callout
          tone="danger"
          role="alert"
          title="Chưa tải được thông tin mới nhất"
          action={
            <Button
              variant="secondary"
              size="sm"
              loading={invoices.isFetching || paymentMethod.isFetching || billingInfo.isFetching}
              onClick={readAgain}
            >
              Thử lại
            </Button>
          }
        >
          {paymentsMessage(invoices.error ?? paymentMethod.error ?? billingInfo.error)} Thông tin
          bên dưới có thể chưa cập nhật.
        </Callout>
      ) : null}

      {readOnlyLine === null ? null : (
        <Callout tone="danger" role="status" title="Workspace đang ở chế độ chỉ đọc">
          {readOnlyLine}
        </Callout>
      )}
      {failed === null ? null : (
        <Callout
          tone="danger"
          role="alert"
          title={`Thanh toán hóa đơn ${failed.number} không thành công.`}
          action={
            <>
              {failed.kind === 'subscription' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={transfer.isPending && transfer.variables === failed.id}
                  disabled={transfer.isPending || pay.isPending}
                  onClick={() => {
                    startTransfer(failed.id);
                  }}
                >
                  Chuyển khoản
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                loading={setup.busy}
                onClick={() => {
                  setNotice(null);
                  setup.start();
                }}
              >
                Đổi phương thức
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={pay.isPending && pay.variables === failed.id}
                disabled={(pay.isPending && pay.variables !== failed.id) || transfer.isPending}
                onClick={() => {
                  payInvoice(failed.id);
                }}
              >
                Thanh toán lại
              </Button>
            </>
          }
        >
          {failedCode === null
            ? 'Cổng thanh toán từ chối giao dịch'
            : paymentDeclineLabels[failedCode]}
          {failed.card === null ? '' : ` •••• ${failed.card.last4}`}.{retryLine}
          {graceLine}{' '}
          {saved !== null && !savedWasRefused
            ? `Thẻ mới là ${cardLabel(saved)}: bấm "Thanh toán lại" để thanh toán bằng thẻ này.`
            : failed.kind === 'subscription'
              ? 'Bạn có thể đổi thẻ hoặc chuyển khoản ngay.'
              : 'Bạn có thể đổi thẻ rồi thanh toán lại.'}
        </Callout>
      )}
      {setup.error === null ? null : (
        <Callout tone="danger" role="alert" title="Chưa mở được trang của cổng thanh toán">
          {paymentsMessage(setup.error)}
        </Callout>
      )}

      {waiting === null ? null : (
        <TransferInstructions
          invoiceNumber={waiting.number}
          detail={waitingDetail.data}
          error={waitingDetail.error}
          loading={waitingDetail.isFetching}
          onRetry={() => {
            void waitingDetail.refetch();
          }}
          onPayWithCard={
            saved === null
              ? null
              : () => {
                  payInvoice(waiting.id);
                }
          }
          payingWithCard={pay.isPending && pay.variables === waiting.id}
        />
      )}

      <div className={styles.cards}>
        <PaymentMethodCard workspaceId={workspaceId} method={method} declined={savedWasRefused} />
        <BillingInfoCard workspaceId={workspaceId} info={billingInfo.data.billingInfo} />
      </div>

      <InvoiceHistory
        workspaceId={workspaceId}
        items={items}
        hasMore={invoices.hasNextPage}
        loadingMore={invoices.isFetchingNextPage}
        onLoadMore={() => {
          void fetchNextPageAfterRead(invoices);
        }}
        payingId={pay.isPending ? pay.variables : null}
        onPay={payInvoice}
      />
    </PageContainer>
  );
}

export interface PaymentsDeniedProps {
  workspaceId: string;
  /** The user's role, e.g. "Quản trị". */
  roleLabel: string;
  /** Who views payments, e.g. "Chủ sở hữu". */
  holders: string;
}

/** Board 29 "notOwner": Quản trị sees the plan, not the card and the invoices. */
export function PaymentsDenied({ workspaceId, roleLabel, holders }: PaymentsDeniedProps) {
  return (
    <PageContainer>
      <PageHeader title="Gói dịch vụ" />
      <BillingTabs workspaceId={workspaceId} current="payments" />
      <div className={styles.denied}>
        <h2 className={styles.deniedTitle}>Chỉ {holders} xem được thanh toán</h2>
        <p className={styles.deniedText}>
          Bạn là {roleLabel} nên vẫn xem được gói và mức sử dụng. Phương thức thanh toán và hóa đơn
          chỉ {holders} xem được.
        </p>
        <ButtonLink as={Link} href={billingHref(workspaceId)} variant="secondary">
          Xem gói & mức dùng
        </ButtonLink>
      </div>
    </PageContainer>
  );
}
