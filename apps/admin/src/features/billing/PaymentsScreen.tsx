'use client';

import { type MethodSetupResult, paymentDeclineLabels } from '@plp/contracts';
import { Button, ButtonLink, Callout } from '@plp/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchNextPageAfterRead } from '../shell/fetch-next-page';
import { billingHref, paymentsHref } from '../shell/navigation';
import { PageContainer, PageHeader } from '../shell/PageHeader';
import { BillingInfoCard } from './BillingInfoCard';
import { BillingTabs } from './BillingTabs';
import { InvoiceHistory } from './InvoiceHistory';
import { cardLabel } from './payment-presentation';
import { PaymentMethodCard } from './PaymentMethodCard';
import { type PaymentsInitial, usePaymentsData } from './queries';
import { useMethodSetup } from './use-method-setup';
import { usePayInvoice } from './use-pay-invoice';
import styles from './Payments.module.css';

export interface PaymentsScreenProps {
  workspaceId: string;
  workspaceName: string;
  initial: PaymentsInitial;
  /** `?paymentMethod=` of the address the gateway led back to. */
  returned: MethodSetupResult | null;
}

/**
 * Screen 29 "Thanh toán & hóa đơn" (ADR-035, T2), for Chủ sở hữu: the saved card, the billing
 * info and the transaction history. Nothing here depends on the workspace being read-only: paying
 * is how it stops being.
 */
export function PaymentsScreen({
  workspaceId,
  workspaceName,
  initial,
  returned,
}: PaymentsScreenProps) {
  const { paymentMethod, billingInfo, invoices } = usePaymentsData(workspaceId, initial);
  const pay = usePayInvoice(workspaceId);
  const setup = useMethodSetup(workspaceId, 'payments');
  // Kept in state: the address loses its parameter below, the message stays until the next visit.
  const [notice] = useState(returned);

  // The address the gateway led back to is not kept: a reload says nothing of the card twice.
  useEffect(() => {
    if (returned !== null) {
      window.history.replaceState(window.history.state, '', paymentsHref(workspaceId));
    }
  }, [returned, workspaceId]);

  const items = invoices.data.pages.flatMap((page) => page.items);
  const method = paymentMethod.data;
  // The newest failed invoice that can still be paid: board 29's "paymentFailed" banner.
  const failed = items.find((invoice) => invoice.status === 'failed' && invoice.payable) ?? null;
  const failedCode = failed?.lastAttempt?.code ?? null;
  const saved = method.paymentMethod;

  return (
    <PageContainer>
      <PageHeader
        title="Gói dịch vụ"
        description={`Thanh toán và hóa đơn của workspace ${workspaceName}.`}
      />
      <BillingTabs workspaceId={workspaceId} current="payments" />

      {notice === 'canceled' ? (
        <Callout tone="info" role="status" title="Chưa thêm thẻ">
          Bạn đã rời trang của cổng thanh toán, nên thẻ chưa được lưu.
        </Callout>
      ) : null}
      {notice === 'saved' && saved !== null ? (
        <Callout tone="success" role="status" title="Đã lưu thẻ">
          {cardLabel(saved)} là phương thức thanh toán mặc định.
        </Callout>
      ) : null}
      {notice === 'saved' && saved === null ? (
        <Callout
          tone="warning"
          role="status"
          title="Đang chờ cổng thanh toán xác nhận thẻ"
          action={
            <Button
              variant="secondary"
              size="sm"
              loading={paymentMethod.isFetching}
              onClick={() => {
                void paymentMethod.refetch();
              }}
            >
              Tải lại
            </Button>
          }
        >
          Thẻ sẽ hiện ở đây khi cổng thanh toán báo về. Bạn chưa bị tính phí.
        </Callout>
      ) : null}

      {failed === null ? null : (
        <Callout
          tone="danger"
          role="alert"
          title={`Thanh toán hóa đơn ${failed.number} không thành công.`}
          action={
            <>
              <Button
                variant="secondary"
                size="sm"
                loading={setup.isPending}
                onClick={() => {
                  setup.mutate();
                }}
              >
                Đổi phương thức
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={pay.isPending && pay.variables === failed.id}
                disabled={pay.isPending && pay.variables !== failed.id}
                onClick={() => {
                  pay.mutate(failed.id);
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
          {failed.card === null ? '' : ` •••• ${failed.card.last4}`}. Bạn có thể đổi thẻ rồi thanh
          toán lại.
        </Callout>
      )}

      <div className={styles.cards}>
        <PaymentMethodCard workspaceId={workspaceId} method={method} declined={failed !== null} />
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
        onPay={(invoiceId) => {
          pay.mutate(invoiceId);
        }}
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
