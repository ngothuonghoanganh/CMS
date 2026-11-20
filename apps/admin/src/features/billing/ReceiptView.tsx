'use client';

import type { InvoiceReceipt } from '@plp/contracts';
import { Button, ButtonLink } from '@plp/ui';
import Link from 'next/link';
import { formatDate, formatDateTime } from '../../lib/format';
import { paymentsHref } from '../shell/navigation';
import { cardLabel, invoiceAmount, invoiceDescription } from './payment-presentation';
import styles from './Receipt.module.css';

export interface ReceiptViewProps {
  workspaceId: string;
  receipt: InvoiceReceipt;
}

/**
 * The receipt of one paid invoice ("Tải hóa đơn"), a page of its own with no app chrome: the
 * browser's print dialog saves it as a PDF. It is a payment receipt, not an electronic VAT invoice.
 */
export function ReceiptView({ workspaceId, receipt }: ReceiptViewProps) {
  const { invoice, workspaceName } = receipt;
  const buyer = invoice.billingInfo;
  const method =
    invoice.method === 'transfer'
      ? 'Chuyển khoản'
      : invoice.card === null
        ? 'Thẻ'
        : cardLabel(invoice.card);
  return (
    <main id="main-content" className={styles.page}>
      <div className={styles.toolbar}>
        <ButtonLink as={Link} href={paymentsHref(workspaceId)} variant="ghost">
          Về thanh toán & hóa đơn
        </ButtonLink>
        <Button
          onClick={() => {
            window.print();
          }}
        >
          In hoặc lưu PDF
        </Button>
      </div>
      <article className={styles.sheet} aria-labelledby="receipt-title">
        <header className={styles.head}>
          <div>
            <h1 id="receipt-title" className={styles.title}>
              Biên nhận thanh toán
            </h1>
            <p className={styles.number}>{invoice.number}</p>
          </div>
          <dl className={styles.meta}>
            <dt>Ngày thanh toán</dt>
            <dd>{formatDateTime(invoice.paidAt ?? invoice.createdAt)}</dd>
            <dt>Phương thức</dt>
            <dd>{method}</dd>
          </dl>
        </header>

        <section className={styles.parties} aria-label="Các bên">
          <div>
            <h2 className={styles.label}>Đơn vị cung cấp</h2>
            <p className={styles.name}>Payload Landing Page</p>
          </div>
          <div>
            <h2 className={styles.label}>Đơn vị thanh toán</h2>
            <p className={styles.name}>{buyer?.companyName ?? workspaceName}</p>
            {buyer === null ? (
              <p className={styles.line}>Workspace {workspaceName}</p>
            ) : (
              <>
                <p className={styles.line}>Mã số thuế: {buyer.taxCode}</p>
                <p className={styles.line}>{buyer.address}</p>
                <p className={styles.line}>{buyer.email}</p>
              </>
            )}
          </div>
        </section>

        <table className={styles.items}>
          <thead>
            <tr>
              <th scope="col">Nội dung</th>
              <th scope="col" className={styles.right}>
                Số tiền
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {invoiceDescription(invoice)}
                <span className={styles.line}>
                  Chu kỳ {invoice.cycle === 'yearly' ? 'năm' : 'tháng'} · tạo ngày{' '}
                  {formatDate(invoice.createdAt)}
                </span>
              </td>
              <td className={styles.right}>{invoiceAmount(invoice)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Tổng thanh toán (đã gồm VAT)</th>
              <td className={styles.right}>{invoiceAmount(invoice)}</td>
            </tr>
          </tfoot>
        </table>

        <p className={styles.note}>
          Đây là biên nhận thanh toán, không phải hóa đơn điện tử. Hóa đơn điện tử (nếu có) được gửi
          tới email nhận hóa đơn riêng.
        </p>
      </article>
    </main>
  );
}
