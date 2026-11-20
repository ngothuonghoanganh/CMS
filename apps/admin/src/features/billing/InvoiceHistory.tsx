'use client';

import type { InvoiceSummary } from '@plp/contracts';
import { paymentDeclineLabels } from '@plp/contracts';
import { Badge, Button, ButtonLink, EmptyState, CreditCardIcon } from '@plp/ui';
import { ScrollRegion } from '../shell/ScrollRegion';
import { receiptHref } from '../shell/navigation';
import {
  invoiceAmount,
  invoiceDate,
  invoiceDescription,
  invoiceReference,
  invoiceStatusView,
} from './payment-presentation';
import styles from './Payments.module.css';

export interface InvoiceHistoryProps {
  workspaceId: string;
  items: readonly InvoiceSummary[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** The invoice being charged now, if any. */
  payingId: string | null;
  onPay: (invoiceId: string) => void;
}

/** Why the last charge failed, under the status of a failed invoice. */
function failureNote(invoice: InvoiceSummary): string | null {
  const attempt = invoice.lastAttempt;
  if (invoice.status === 'failed' && attempt?.code != null) {
    return paymentDeclineLabels[attempt.code];
  }
  if (invoice.status === 'open' && attempt?.outcome === 'unknown') {
    return 'Chưa biết kết quả thanh toán';
  }
  return null;
}

/** "Lịch sử giao dịch" (board 29): invoices newest first, with the receipt and "Thanh toán lại". */
export function InvoiceHistory({
  workspaceId,
  items,
  hasMore,
  loadingMore,
  onLoadMore,
  payingId,
  onPay,
}: InvoiceHistoryProps) {
  return (
    <section aria-labelledby="invoice-history-title" className={styles.history}>
      <h2 id="invoice-history-title" className={styles.cardTitle}>
        Lịch sử giao dịch
      </h2>
      {items.length === 0 ? (
        <div className={styles.tableBox}>
          <EmptyState
            icon={<CreditCardIcon size={24} />}
            headingLevel={3}
            title="Chưa có giao dịch"
            description="Hóa đơn xuất hiện ở đây sau lần thanh toán đầu tiên."
          />
        </div>
      ) : (
        <ScrollRegion label="Lịch sử giao dịch">
          <table className={styles.table}>
            <caption className={styles.srOnly}>Lịch sử giao dịch</caption>
            <thead>
              <tr>
                <th scope="col">Ngày</th>
                <th scope="col">Nội dung</th>
                <th scope="col">Số tiền</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Hóa đơn</th>
              </tr>
            </thead>
            <tbody>
              {items.map((invoice) => {
                const status = invoiceStatusView(invoice.status);
                const note = failureNote(invoice);
                return (
                  <tr key={invoice.id}>
                    <td className={styles.nowrap}>{invoiceDate(invoice)}</td>
                    <td>
                      <span className={styles.desc}>{invoiceDescription(invoice)}</span>
                      <span className={styles.ref}>{invoiceReference(invoice)}</span>
                    </td>
                    <td className={styles.amount}>{invoiceAmount(invoice)}</td>
                    <td>
                      <Badge tone={status.tone} dot>
                        {status.label}
                      </Badge>
                      {note === null ? null : <span className={styles.statusNote}>{note}</span>}
                    </td>
                    <td>
                      {invoice.status === 'paid' ? (
                        <ButtonLink
                          href={receiptHref(workspaceId, invoice.id)}
                          target="_blank"
                          rel="noopener"
                          variant="ghost"
                          size="sm"
                          aria-label={`Tải hóa đơn ${invoice.number}`}
                        >
                          Tải hóa đơn
                        </ButtonLink>
                      ) : invoice.payable ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={payingId === invoice.id}
                          disabled={payingId !== null && payingId !== invoice.id}
                          aria-label={`Thanh toán lại hóa đơn ${invoice.number}`}
                          onClick={() => {
                            onPay(invoice.id);
                          }}
                        >
                          Thanh toán lại
                        </Button>
                      ) : (
                        <span className={styles.muted}>
                          {invoice.status === 'void' ? 'Đã hủy' : 'Chưa xuất'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollRegion>
      )}
      {hasMore ? (
        <div className={styles.more}>
          <Button variant="secondary" loading={loadingMore} onClick={onLoadMore}>
            Xem thêm
          </Button>
        </div>
      ) : null}
    </section>
  );
}
