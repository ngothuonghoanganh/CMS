'use client';

import { Button, Callout } from '@plp/ui';
import { formatDate, formatVnd } from '../../lib/format';
import { type RenewalTransferNotice, renewalInvoiceTitle } from './renewal-presentation';
import { TRANSFER_DETAILS_ID } from './TransferInstructions';

export interface RenewalTransferCalloutProps {
  notice: RenewalTransferNotice;
  /** Pays the invoice with the saved card; null when no card is saved. */
  onPayWithCard: (() => void) | null;
  payingWithCard: boolean;
  /** Another payment of the screen is running. */
  busy: boolean;
}

/** Moves the reader to the bank details card below (board 29), whatever the viewport. */
function showTransferDetails() {
  const target = document.getElementById(TRANSFER_DETAILS_ID);
  if (target !== null) {
    target.scrollIntoView({ block: 'start' });
    target.focus({ preventScroll: true });
  }
}

/**
 * The invoice of a plan renewed by bank transfer (ADR-035, T4), in the three moments board 29 has
 * no drawing for: the early invoice waiting before the period ends, "Chờ chuyển khoản" inside the
 * grace once it has ended (not a failed payment: nothing is retried), and the next period paid.
 * It follows the failed-payment banner's frame: a Callout with the actions at its right.
 */
export function RenewalTransferCallout({
  notice,
  onPayWithCard,
  payingWithCard,
  busy,
}: RenewalTransferCalloutProps) {
  if (notice.kind === 'paid') {
    return (
      <Callout tone="success" role="status" title="Kỳ sau đã được thanh toán">
        {notice.invoice === null ? '' : `Hóa đơn ${notice.invoice.number}. `}Gói {notice.planName}{' '}
        kỳ mới bắt đầu {formatDate(notice.startsAt)}, không mất ngày nào và không bị trừ tiền lần
        nữa.
      </Callout>
    );
  }
  const awaiting = notice.kind === 'awaiting';
  const title = awaiting
    ? `Chờ chuyển khoản hóa đơn ${notice.invoice.number}`
    : renewalInvoiceTitle(notice.invoice, notice.dueAt);
  const amount = formatVnd(notice.invoice.amount);
  let body: string;
  if (awaiting) {
    body = notice.readOnly
      ? `Số tiền ${amount}. Workspace đang ở chế độ chỉ đọc; trang live và form vẫn chạy. Workspace mở lại khi nhận được chuyển khoản.`
      : `Số tiền ${amount}.${
          notice.deadline === null
            ? ''
            : ` Chuyển khoản trước ${formatDate(notice.deadline)}: workspace chuyển sang chỉ đọc từ ngày đó nếu chưa nhận được tiền.`
        } Trang live và form vẫn chạy.`;
  } else {
    body = `Chuyển khoản trước ngày đó để kỳ mới bắt đầu đúng ngày, không mất ngày nào.${
      notice.cardFallback
        ? ' Nếu chưa nhận được tiền, hệ thống trừ thẻ đã lưu cho hóa đơn này.'
        : ''
    }`;
  }
  return (
    <Callout
      tone={awaiting ? (notice.readOnly ? 'danger' : 'warning') : 'info'}
      role="status"
      title={title}
      action={
        <>
          <Button variant="secondary" size="sm" onClick={showTransferDetails}>
            Xem thông tin chuyển khoản
          </Button>
          {onPayWithCard === null ? null : (
            <Button
              variant="secondary"
              size="sm"
              loading={payingWithCard}
              disabled={busy}
              aria-describedby="renewal-card-warning"
              onClick={onPayWithCard}
            >
              Thanh toán bằng thẻ thay thế
            </Button>
          )}
        </>
      }
    >
      {body}
      {onPayWithCard === null ? null : (
        // A transfer that arrives after the card paid is not applied, and not refunded by itself.
        <span id="renewal-card-warning">
          {' '}
          Đã chuyển khoản rồi thì đừng thanh toán bằng thẻ: khoản chuyển khoản tới sau không được tự
          hoàn lại.
        </span>
      )}
    </Callout>
  );
}
