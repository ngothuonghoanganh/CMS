'use client';

import type { InvoiceSummary } from '@plp/contracts';
import { paymentDeclineLabels } from '@plp/contracts';
import { Badge, Button, ButtonLink, EmptyState, CreditCardIcon } from '@plp/ui';
import { cx } from '../shell/cx';
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

/**
 * "Lịch sử giao dịch" (board 29): invoices newest first, with the receipt and "Thanh toán lại".
 * On a phone each invoice is a block of its own, so its amount, status and action show without
 * scrolling sideways. The parts of the table then no longer display as one, and some browsers
 * drop its semantics for that: the explicit roles keep it a table for screen readers.
 */
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
          <table className={styles.table} role="table">
            <caption className={styles.srOnly}>Lịch sử giao dịch</caption>
            <thead className={styles.head} role="rowgroup">
              <tr role="row">
                <th scope="col" role="columnheader">
                  Ngày
                </th>
                <th scope="col" role="columnheader">
                  Nội dung
                </th>
                <th scope="col" role="columnheader">
                  Số tiền
                </th>
                <th scope="col" role="columnheader">
                  Trạng thái
                </th>
                <th scope="col" role="columnheader">
                  Hóa đơn
                </th>
              </tr>
            </thead>
            <tbody className={styles.body} role="rowgroup">
              {items.map((invoice) => {
                const status = invoiceStatusView(invoice.status);
                const note = failureNote(invoice);
                return (
                  <tr key={invoice.id} className={styles.row} role="row">
                    <td className={cx(styles.cellDate, styles.nowrap)} role="cell">
                      {invoiceDate(invoice)}
                    </td>
                    <td className={styles.cellDesc} role="cell">
                      <span className={styles.desc}>{invoiceDescription(invoice)}</span>
                      <span className={styles.ref}>{invoiceReference(invoice)}</span>
                    </td>
                    <td className={styles.amount} role="cell">
                      {invoiceAmount(invoice)}
                    </td>
                    <td className={styles.cellStatus} role="cell">
                      <Badge tone={status.tone} dot>
                        {status.label}
                      </Badge>
                      {note === null ? null : <span className={styles.statusNote}>{note}</span>}
                    </td>
                    <td className={styles.cellAction} role="cell">
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
