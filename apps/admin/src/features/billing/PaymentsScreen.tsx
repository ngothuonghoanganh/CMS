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
import { MethodSetupNotice } from './MethodSetupNotice';
import { cardLabel, sameCard } from './payment-presentation';
import { paymentsMessage } from './payment-problem';
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
  // Kept in state: the address loses its parameter below. It goes once the owner acts again.
  const [notice, setNotice] = useState(returned);

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
  // The refusal was of the card saved now; one saved since has not been tried yet.
  const savedWasRefused =
    failed !== null && saved !== null && (failed.card === null || sameCard(failed.card, saved));
  const readFailed = invoices.isError || paymentMethod.isError || billingInfo.isError;

  function payInvoice(invoiceId: string) {
    setNotice(null);
    pay.mutate(invoiceId);
  }

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
                disabled={pay.isPending && pay.variables !== failed.id}
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
          {failed.card === null ? '' : ` •••• ${failed.card.last4}`}.{' '}
          {saved !== null && !savedWasRefused
            ? `Thẻ mới là ${cardLabel(saved)}: bấm "Thanh toán lại" để thanh toán bằng thẻ này.`
            : 'Bạn có thể đổi thẻ rồi thanh toán lại.'}
        </Callout>
      )}
      {setup.error === null ? null : (
        <Callout tone="danger" role="alert" title="Chưa mở được trang của cổng thanh toán">
          {paymentsMessage(setup.error)}
        </Callout>
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
